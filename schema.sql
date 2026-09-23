-- ============================================================
-- Zarpe CI · Esquema de base de datos para Supabase
-- Correr UNA sola vez en: Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto;

-- Empresas (cada Comercializadora Internacional cliente)
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  creado timestamptz not null default now()
);

-- Perfil de cada usuario: rol y empresa a la que pertenece
create table if not exists public.usuarios_perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  rol text not null default 'operador' check (rol in ('admin','operador')),
  empresa_id uuid references public.empresas(id) on delete set null,
  creado timestamptz not null default now()
);

-- Certificados al Proveedor
create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero text not null,
  fecha_expedicion date not null,
  proveedor text not null,
  nit_proveedor text not null,
  factura text not null,
  producto text not null,
  subpartida text not null check (subpartida ~ '^\d{4}\.\d{2}\.\d{2}\.\d{2}$'),
  unidad text not null,
  cantidad numeric(16,3) not null check (cantidad > 0),
  valor numeric(18,2) not null check (valor > 0),
  creado_por uuid default auth.uid(),
  creado timestamptz not null default now(),
  unique (empresa_id, numero)
);

-- Exportaciones (DEX) que descargan saldo de un CP
create table if not exists public.exportaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  certificado_id uuid not null references public.certificados(id) on delete cascade,
  numero_dex text not null,
  fecha_embarque date not null,
  cantidad numeric(16,3) not null check (cantidad > 0),
  destino text not null,
  creado_por uuid default auth.uid(),
  creado timestamptz not null default now()
);

-- Preferencias de alertas por empresa
create table if not exists public.config_alertas (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  whatsapp boolean not null default true,
  correo boolean not null default true,
  aviso_60 boolean not null default false,
  aviso_30 boolean not null default true,
  aviso_15 boolean not null default true,
  aviso_7 boolean not null default true
);

create index if not exists certificados_empresa_idx on public.certificados(empresa_id, fecha_expedicion);
create index if not exists exportaciones_cp_idx on public.exportaciones(certificado_id);

-- ------------------------------------------------------------
-- Funciones de apoyo para las políticas de seguridad
-- ------------------------------------------------------------
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and rol = 'admin');
$$;

create or replace function public.mi_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_perfil where id = auth.uid();
$$;

-- Perfil automático al crear un usuario en Authentication
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios_perfil (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
for each row execute function public.crear_perfil();

-- Regla de negocio: una exportación no puede superar el saldo del CP
create or replace function public.validar_exportacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare cp record; exportado numeric;
begin
  select * into cp from certificados where id = new.certificado_id;
  if cp is null then raise exception 'El Certificado al Proveedor no existe.'; end if;
  if cp.empresa_id <> new.empresa_id then raise exception 'El CP pertenece a otra empresa.'; end if;
  select coalesce(sum(cantidad), 0) into exportado from exportaciones
   where certificado_id = new.certificado_id and id <> coalesce(new.id, gen_random_uuid());
  if exportado + new.cantidad > cp.cantidad then
    raise exception 'La cantidad supera el saldo del CP % (saldo: %).', cp.numero, cp.cantidad - exportado;
  end if;
  return new;
end $$;

drop trigger if exists antes_de_exportar on public.exportaciones;
create trigger antes_de_exportar before insert or update on public.exportaciones
for each row execute function public.validar_exportacion();

-- ------------------------------------------------------------
-- Seguridad por filas (RLS): cada usuario ve solo su empresa; admin ve todas
-- ------------------------------------------------------------
alter table public.empresas        enable row level security;
alter table public.usuarios_perfil enable row level security;
alter table public.certificados    enable row level security;
alter table public.exportaciones   enable row level security;
alter table public.config_alertas  enable row level security;

drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using (es_admin() or id = mi_empresa());
drop policy if exists empresas_admin on public.empresas;
create policy empresas_admin on public.empresas for all to authenticated
  using (es_admin()) with check (es_admin());

drop policy if exists perfil_ver on public.usuarios_perfil;
create policy perfil_ver on public.usuarios_perfil for select to authenticated
  using (id = auth.uid() or es_admin());
drop policy if exists perfil_admin on public.usuarios_perfil;
create policy perfil_admin on public.usuarios_perfil for update to authenticated
  using (es_admin()) with check (es_admin());

drop policy if exists cp_todo on public.certificados;
create policy cp_todo on public.certificados for all to authenticated
  using (es_admin() or empresa_id = mi_empresa())
  with check (es_admin() or empresa_id = mi_empresa());

drop policy if exists dex_todo on public.exportaciones;
create policy dex_todo on public.exportaciones for all to authenticated
  using (es_admin() or empresa_id = mi_empresa())
  with check (es_admin() or empresa_id = mi_empresa());

drop policy if exists alertas_todo on public.config_alertas;
create policy alertas_todo on public.config_alertas for all to authenticated
  using (es_admin() or empresa_id = mi_empresa())
  with check (es_admin() or empresa_id = mi_empresa());

-- ------------------------------------------------------------
-- DATOS DE EJEMPLO para la demostración
-- Las fechas se calculan desde el día en que corres este script,
-- así el ejemplo siempre muestra CP vigentes, por vencer y vencidos.
-- ------------------------------------------------------------
do $$
declare
  e uuid;
  y text := to_char(current_date, 'YYYY');
begin
  if exists (select 1 from empresas where nombre = 'C.I. Ejemplo Exportadora S.A.S.') then
    raise notice 'Los datos de ejemplo ya existen; no se vuelven a cargar.';
    return;
  end if;

  insert into empresas (nombre, nit) values ('C.I. Ejemplo Exportadora S.A.S.', '901.000.000-0') returning id into e;
  insert into config_alertas (empresa_id) values (e);

  insert into certificados (empresa_id, numero, fecha_expedicion, proveedor, nit_proveedor, factura, producto, subpartida, unidad, cantidad, valor) values
   (e, 'CP-'||y||'-0141', current_date - 189, 'Cultivos El Retiro S.A.S.',            '900.456.781-2', 'FE-88213', 'Rosas frescas cortadas',        '0603.11.00.00', 'tallos',   120000, 186000000),
   (e, 'CP-'||y||'-0152', current_date - 174, 'Trilladora Oriente Antioqueño S.A.S.', '901.223.114-7', 'FV-3321',  'Café verde sin tostar',         '0901.11.90.00', 'kg',        38400, 612000000),
   (e, 'CP-'||y||'-0158', current_date - 168, 'Flores de la Ceja S.A.S.',             '900.778.402-1', 'FE-12004', 'Crisantemos frescos',           '0603.14.00.00', 'tallos',    60000,  72000000),
   (e, 'CP-'||y||'-0167', current_date - 156, 'Aguacates del Tambo S.A.S.',           '901.334.908-5', 'FE-551',   'Aguacate Hass fresco',          '0804.40.00.00', 'kg',        52000, 338000000),
   (e, 'CP-'||y||'-0173', current_date - 140, 'Confecciones Marinilla S.A.S.',        '900.112.365-9', 'FE-7720',  'Camisetas de punto de algodón', '6109.10.00.00', 'unidades',   9000, 243000000),
   (e, 'CP-'||y||'-0188', current_date - 104, 'Cultivos El Retiro S.A.S.',            '900.456.781-2', 'FE-89410', 'Hortensias frescas',            '0603.19.90.00', 'tallos',    45000,  94500000),
   (e, 'CP-'||y||'-0194', current_date -  84, 'Trilladora Oriente Antioqueño S.A.S.', '901.223.114-7', 'FV-3398',  'Café verde sin tostar',         '0901.11.90.00', 'kg',        19200, 316800000),
   (e, 'CP-'||y||'-0205', current_date -  40, 'Trapiche La Esperanza S.A.S.',         '901.556.020-3', 'FE-2190',  'Panela pulverizada',            '1701.13.00.00', 'kg',        24000,  86400000),
   (e, 'CP-'||y||'-0211', current_date -  14, 'Aguacates del Tambo S.A.S.',           '901.334.908-5', 'FE-603',   'Aguacate Hass fresco',          '0804.40.00.00', 'kg',        40000, 268000000);

  insert into exportaciones (empresa_id, certificado_id, numero_dex, fecha_embarque, cantidad, destino)
  select e, c.id, v.dex, current_date + v.dias, v.cant, v.destino
  from (values
    ('0141', '6007512001845', -166, 50000, 'Miami, EE. UU.'),
    ('0141', '6007512002377', -113, 34000, 'Ámsterdam, Países Bajos'),
    ('0152', '6007512002012', -132, 19200, 'Hamburgo, Alemania'),
    ('0158', '6007512001990', -136, 30000, 'Miami, EE. UU.'),
    ('0167', '6007512002530',  -95, 30000, 'Róterdam, Países Bajos'),
    ('0152', '6007512002801',  -77, 19200, 'Amberes, Bélgica'),
    ('0173', '6007512003114',  -55,  6000, 'Ciudad de Panamá, Panamá'),
    ('0205', '6007512003402',  -21, 12000, 'Madrid, España')
  ) as v(cp, dex, dias, cant, destino)
  join certificados c on c.empresa_id = e and c.numero = 'CP-'||y||'-'||v.cp;
end $$;

-- ------------------------------------------------------------
-- DESPUÉS de crear los usuarios en Authentication → Users, corre esto
-- (cambia los correos por los reales):
--
-- update usuarios_perfil set rol = 'admin' where email = 'TU_CORREO@gmail.com';
-- update usuarios_perfil set empresa_id = (select id from empresas where nombre = 'C.I. Ejemplo Exportadora S.A.S.')
--   where email = 'demo@zarpe.co';
-- ------------------------------------------------------------
