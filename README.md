# Zarpe CI

Software para **Comercializadoras Internacionales** (Colombia): control de Certificados al Proveedor (CP), plazo de seis meses para exportar (Decreto 1165 de 2019, art. 69 num. 6), exportaciones (DEX), inventario exento, alertas e informe anual.

Hecho con HTML/CSS/JS sin compilar + **Supabase** (base de datos y usuarios) + **GitHub Pages** (hosting).

## Qué hace

- **Panel**: reloj de exportación por CP (vigente, por vencer, vencido, cumplido) e IVA en riesgo.
- **Certificados al Proveedor**: alta de CP con fecha límite e IVA exento calculados. Lee el **XML de la factura electrónica DIAN** (UBL 2.1, también dentro de AttachedDocument) y llena el formulario.
- **Exportaciones (DEX)**: descuentan saldo del CP. La base de datos impide exportar más del saldo.
- **Inventario exento** por subpartida arancelaria.
- **Alertas**: configuración de canales y anticipación (el envío automático es la siguiente fase).
- **Informe anual**: borrador consolidado y exportación a Excel.
- **Multiempresa**: cada usuario ve solo su C.I.; el administrador ve todas.

## Dos modos

1. **Modo demostración** (por defecto): si `config.js` tiene los textos `PEGA_AQUI`, la app abre sin login con datos de ejemplo en el navegador.
2. **Modo real**: con las llaves de Supabase en `config.js`, pide login y guarda todo en la base de datos.

## Puesta en marcha

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratis).
2. Ve a **SQL Editor → New query**, pega todo `schema.sql` y dale **Run**. Crea las tablas, la seguridad y los datos de ejemplo.
3. Ve a **Project Settings → API** y copia `Project URL` y la llave `anon public`. Pégalas en `config.js`.
4. En **Authentication → Users → Add user** crea tu usuario y uno de demostración (por ejemplo `demo@zarpe.co`). Marca *Auto Confirm User*.
5. Vuelve al **SQL Editor** y corre las dos líneas `update ...` que están al final de `schema.sql`, con los correos reales.
6. En GitHub: **Settings → Pages → Branch: main / root → Save**. En un par de minutos la app queda en `https://zanetti10.github.io/ZARPECI/`.

> La llave `anon` de Supabase es pública por diseño. La protección real la dan las políticas RLS de `schema.sql`: sin usuario válido no se lee ni se escribe nada.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Login y estructura de la app |
| `app.js` | Lógica, cálculos, lectura de factura XML, Excel |
| `style.css` | Estilos (modo claro y oscuro) |
| `config.js` | Llaves de Supabase |
| `schema.sql` | Tablas, seguridad y datos de ejemplo |
| `ejemplos/factura-ejemplo.xml` | Factura electrónica de prueba para el lector |

## Pendiente de validar con el asesor en comercio exterior

- Campos y formato oficial del informe anual.
- Casos especiales del plazo (suspensiones por decreto, garantía vencida, devoluciones y anulación de CP).
- Numeración oficial del CP.
