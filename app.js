/* Zarpe CI — módulo Comercializadora Internacional
   Datos: Supabase (si config.js tiene llaves) o modo demostración en memoria. */

const CFG = window.ZARPE_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("PEGA_AQUI");
const sb = DEMO ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const IVA = 0.19;
const HOY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pd = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const off = n => { const d = new Date(HOY); d.setDate(d.getDate() + n); return iso(d); };
const addM = (s, n) => { const d = pd(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return d; };
const days = (a, b) => Math.round((b - a) / 86400000);
const fd = d => (typeof d === "string" ? pd(d) : d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const cop = n => "$ " + Math.round(n).toLocaleString("es-CO");
const copM = n => "$ " + (n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M";
const nf = n => Math.round(n).toLocaleString("es-CO");
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

/* ---------- datos de ejemplo (fechas relativas a hoy) ---------- */
function demoSeed() {
  const cps = [
    ["CP-0141", -189, "Cultivos El Retiro S.A.S.", "900.456.781-2", "FE-88213", "Rosas frescas cortadas", "0603.11.00.00", "tallos", 120000, 186000000],
    ["CP-0152", -174, "Trilladora Oriente Antioqueño S.A.S.", "901.223.114-7", "FV-3321", "Café verde sin tostar", "0901.11.90.00", "kg", 38400, 612000000],
    ["CP-0158", -168, "Flores de la Ceja S.A.S.", "900.778.402-1", "FE-12004", "Crisantemos frescos", "0603.14.00.00", "tallos", 60000, 72000000],
    ["CP-0167", -156, "Aguacates del Tambo S.A.S.", "901.334.908-5", "FE-551", "Aguacate Hass fresco", "0804.40.00.00", "kg", 52000, 338000000],
    ["CP-0173", -140, "Confecciones Marinilla S.A.S.", "900.112.365-9", "FE-7720", "Camisetas de punto de algodón", "6109.10.00.00", "unidades", 9000, 243000000],
    ["CP-0188", -104, "Cultivos El Retiro S.A.S.", "900.456.781-2", "FE-89410", "Hortensias frescas", "0603.19.90.00", "tallos", 45000, 94500000],
    ["CP-0194", -84, "Trilladora Oriente Antioqueño S.A.S.", "901.223.114-7", "FV-3398", "Café verde sin tostar", "0901.11.90.00", "kg", 19200, 316800000],
    ["CP-0205", -40, "Trapiche La Esperanza S.A.S.", "901.556.020-3", "FE-2190", "Panela pulverizada", "1701.13.00.00", "kg", 24000, 86400000],
    ["CP-0211", -14, "Aguacates del Tambo S.A.S.", "901.334.908-5", "FE-603", "Aguacate Hass fresco", "0804.40.00.00", "kg", 40000, 268000000]
  ].map(r => ({ id: r[0], numero: r[0].replace("CP-", "CP-" + pd(off(r[1])).getFullYear() + "-"), fecha: off(r[1]), prov: r[2], nit: r[3], fac: r[4], prod: r[5], sub: r[6], und: r[7], cant: r[8], valor: r[9] }));
  const dex = [
    ["6007512001845", "CP-0141", 50000, -166, "Miami, EE. UU."],
    ["6007512002377", "CP-0141", 34000, -113, "Ámsterdam, Países Bajos"],
    ["6007512002012", "CP-0152", 19200, -132, "Hamburgo, Alemania"],
    ["6007512001990", "CP-0158", 30000, -136, "Miami, EE. UU."],
    ["6007512002530", "CP-0167", 30000, -95, "Róterdam, Países Bajos"],
    ["6007512002801", "CP-0152", 19200, -77, "Amberes, Bélgica"],
    ["6007512003114", "CP-0173", 6000, -55, "Ciudad de Panamá, Panamá"],
    ["6007512003402", "CP-0205", 12000, -21, "Madrid, España"]
  ].map((r, i) => ({ id: "d" + i, n: r[0], cp: r[1], cant: r[2], emb: off(r[3]), dest: r[4] }));
  return {
    empresas: [{ id: "demo", nombre: "C.I. Ejemplo Exportadora S.A.S.", nit: "901.000.000-0" }],
    empresaId: "demo", cps, dex,
    canales: { wa: true, mail: true, d60: false, d30: true, d15: true, d7: true }
  };
}

let S = { empresas: [], empresaId: null, cps: [], dex: [], canales: {} };
let USER = null;
let ui = { filtro: "todos", q: "" };

/* ---------- capa de datos ---------- */
const db = {
  async cargar() {
    if (DEMO) { if (!S.empresas.length) S = demoSeed(); return; }
    const e0 = await sb.from("empresas").select("id,nombre,nit").order("nombre");
    if (e0.error) throw e0.error;
    S.empresas = e0.data;
    const guardada = lsGet("zarpe-empresa");
    if (!S.empresas.find(e => e.id === S.empresaId)) S.empresaId = (S.empresas.find(e => e.id === guardada) || S.empresas[0] || {}).id || null;
    if (!S.empresaId) { S.cps = []; S.dex = []; S.canales = {}; return; }
    const [c, d, a] = await Promise.all([
      sb.from("certificados").select("*").eq("empresa_id", S.empresaId).order("fecha_expedicion"),
      sb.from("exportaciones").select("*").eq("empresa_id", S.empresaId).order("fecha_embarque"),
      sb.from("config_alertas").select("*").eq("empresa_id", S.empresaId).maybeSingle()
    ]);
    for (const r of [c, d, a]) if (r.error) throw r.error;
    S.cps = c.data.map(r => ({ id: r.id, numero: r.numero, fecha: r.fecha_expedicion, prov: r.proveedor, nit: r.nit_proveedor, fac: r.factura, prod: r.producto, sub: r.subpartida, und: r.unidad, cant: +r.cantidad, valor: +r.valor }));
    S.dex = d.data.map(r => ({ id: r.id, n: r.numero_dex, cp: r.certificado_id, cant: +r.cantidad, emb: r.fecha_embarque, dest: r.destino }));
    const x = a.data || {};
    S.canales = { wa: x.whatsapp ?? true, mail: x.correo ?? true, d60: x.aviso_60 ?? false, d30: x.aviso_30 ?? true, d15: x.aviso_15 ?? true, d7: x.aviso_7 ?? true };
  },
  async crearCP(cp) {
    if (DEMO) { S.cps.push({ ...cp, id: cp.numero }); return; }
    const { error } = await sb.from("certificados").insert({
      empresa_id: S.empresaId, numero: cp.numero, fecha_expedicion: cp.fecha, proveedor: cp.prov, nit_proveedor: cp.nit,
      factura: cp.fac, producto: cp.prod, subpartida: cp.sub, unidad: cp.und, cantidad: cp.cant, valor: cp.valor
    });
    if (error) throw error;
    await db.cargar();
  },
  async crearDEX(x) {
    if (DEMO) { S.dex.push({ ...x, id: "d" + Date.now() }); return; }
    const { error } = await sb.from("exportaciones").insert({
      empresa_id: S.empresaId, certificado_id: x.cp, numero_dex: x.n, cantidad: x.cant, fecha_embarque: x.emb, destino: x.dest
    });
    if (error) throw error;
    await db.cargar();
  },
  async guardarCanales() {
    if (DEMO) return;
    const c = S.canales;
    const { error } = await sb.from("config_alertas").upsert({
      empresa_id: S.empresaId, whatsapp: c.wa, correo: c.mail, aviso_60: c.d60, aviso_30: c.d30, aviso_15: c.d15, aviso_7: c.d7
    });
    if (error) throw error;
  }
};
const msgError = e => e?.code === "23505" ? "Ya existe un registro con ese número." : (e?.message || "No se pudo guardar. Revisa la conexión e intenta de nuevo.");

/* ---------- cálculos ---------- */
function calc(cp) {
  const exp = S.dex.filter(d => d.cp === cp.id).reduce((a, d) => a + d.cant, 0);
  const saldo = cp.cant - exp;
  const lim = addM(cp.fecha, 6);
  const total = days(pd(cp.fecha), lim);
  const rest = days(HOY, lim);
  let est;
  if (saldo <= 0) est = { k: "ok", t: "Cumplido" };
  else if (rest < 0) est = { k: "crit", t: "Vencido" };
  else if (rest <= 30) est = { k: "warn", t: "Por vencer" };
  else est = { k: "info", t: "Vigente" };
  const ivaPend = cp.valor * IVA * (saldo / cp.cant);
  return { exp, saldo, lim, total, rest, est, ivaPend, pct: Math.min(1, Math.max(0, (total - rest) / total)) };
}
const all = () => S.cps.map(c => ({ ...c, ...calc(c) }));
const cpById = id => S.cps.find(c => c.id === id);
function alertas() {
  const out = [];
  all().forEach(c => {
    if (c.saldo <= 0) return;
    if (c.rest < 0) out.push({ k: "crit", c, t: `${c.numero} venció el ${fd(c.lim)} con ${nf(c.saldo)} ${c.und} sin exportar`, m: `Riesgo de sanción y de perder la exención de IVA sobre ${copM(c.ivaPend)}. Revisar con el asesor.` });
    else if (c.rest <= 45) out.push({ k: c.rest <= 30 ? "warn" : "info", c, t: `${c.numero} vence en ${c.rest} días (${fd(c.lim)})`, m: `Faltan ${nf(c.saldo)} ${c.und} de ${c.prod} por embarcar.` });
  });
  return out.sort((a, b) => a.c.rest - b.c.rest);
}
function clock(c) {
  const col = c.saldo <= 0 ? "var(--ok)" : c.rest < 0 ? "var(--crit)" : c.rest <= 30 ? "var(--warn)" : "var(--accent)";
  const lbl = c.saldo <= 0 ? "cumplido" : c.rest < 0 ? `${-c.rest} d vencido` : `${c.rest} d`;
  return `<div class="clock"><div class="bar"><i style="width:${(c.saldo <= 0 ? 1 : c.pct) * 100}%;background:${col}"></i></div><span class="num">${lbl}</span></div>`;
}
const pill = e => `<span class="pill p-${e.k}">${e.t}</span>`;
const empresaActual = () => S.empresas.find(e => e.id === S.empresaId);

/* ---------- vistas ---------- */
const V = {};
V.vacio = () => `<div class="head"><div><h1>Sin empresa asignada</h1><p class="sub">Tu usuario todavía no tiene una Comercializadora Internacional asignada. Pide al administrador que te la asigne en Supabase.</p></div></div>`;

V.panel = () => {
  const a = all(), act = a.filter(c => c.saldo > 0);
  const venc = act.filter(c => c.rest < 0), pv = act.filter(c => c.rest >= 0 && c.rest <= 30);
  const ivaEx = a.reduce((s, c) => s + c.valor * IVA, 0);
  const riesgo = venc.reduce((s, c) => s + c.ivaPend, 0);
  const al = alertas();
  const prox = act.slice().sort((x, y) => x.rest - y.rest).slice(0, 6);
  return `
  <div class="head"><div><h1>Panel de control</h1><p class="sub">Estado de los Certificados al Proveedor frente al plazo de seis meses para exportar (Decreto 1165 de 2019, art. 69 num. 6). Corte: ${fd(HOY)}.</p></div>
  <button class="btn primary" data-act="nuevo">Nuevo CP</button></div>
  <div class="kpis">
    <div class="kpi"><div class="l">CP con saldo abierto</div><div class="v">${act.length}</div><div class="h">de ${a.length} registrados</div></div>
    <div class="kpi warn"><div class="l">Por vencer · 30 días</div><div class="v">${pv.length}</div><div class="h">${nf(pv.reduce((s, c) => s + c.saldo, 0))} unidades por embarcar</div></div>
    <div class="kpi crit"><div class="l">Vencidos con saldo</div><div class="v">${venc.length}</div><div class="h">IVA en riesgo ${copM(riesgo)}</div></div>
    <div class="kpi"><div class="l">IVA exento en compras</div><div class="v">${copM(ivaEx)}</div><div class="h">19 % sobre ${copM(a.reduce((s, c) => s + c.valor, 0))} facturados</div></div>
  </div>
  <div class="grid2">
    <section class="panel"><h2>Reloj de exportación</h2>
      <div class="tablewrap"><table><thead><tr><th>CP</th><th>Producto</th><th class="r">Saldo</th><th>Plazo consumido</th><th>Estado</th></tr></thead><tbody>
      ${prox.map(c => `<tr class="click" data-cp="${c.id}"><td class="mono">${c.numero}</td><td>${esc(c.prod)}</td><td class="r num">${nf(c.saldo)} <span style="color:var(--muted)">${esc(c.und)}</span></td><td>${clock(c)}</td><td>${pill(c.est)}</td></tr>`).join("") || `<tr><td colspan="5" style="color:var(--muted)">No hay CP con saldo abierto.</td></tr>`}
      </tbody></table></div>
      <p class="note">Ordenado por fecha límite. Toca un CP para ver su historial.</p>
    </section>
    <section class="panel"><h2>Alertas activas</h2>
      ${al.length ? al.slice(0, 4).map(x => `<div class="alert"><span class="dot" style="background:var(--${x.k === "info" ? "accent" : x.k})"></span><p><b>${esc(x.t)}</b></p><div class="meta">${esc(x.m)}</div></div>`).join("") : `<p class="note">Sin alertas.</p>`}
      <p class="note"><a href="#alertas" style="color:var(--accent)">Configurar avisos por WhatsApp y correo</a></p>
    </section>
  </div>`;
};

V.certificados = () => {
  let a = all();
  if (ui.filtro !== "todos") a = a.filter(c => c.est.t === ui.filtro);
  if (ui.q) { const q = ui.q.toLowerCase(); a = a.filter(c => [c.numero, c.prov, c.prod, c.sub, c.fac, c.nit].join(" ").toLowerCase().includes(q)); }
  const fs = ["todos", "Vigente", "Por vencer", "Vencido", "Cumplido"];
  return `
  <div class="head"><div><h1>Certificados al Proveedor</h1><p class="sub">Cada CP respalda una compra nacional sin IVA. La fecha límite se calcula sola: seis meses después de la expedición.</p></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="xlsxcp">Exportar a Excel</button><button class="btn primary" data-act="nuevo">Nuevo CP</button></div></div>
  <div class="toolbar"><input id="q" type="search" placeholder="Buscar por CP, proveedor, NIT, subpartida o factura" value="${esc(ui.q)}">
  <div class="seg">${fs.map(f => `<button data-f="${f}" class="${ui.filtro === f ? "on" : ""}">${f === "todos" ? "Todos" : f}</button>`).join("")}</div></div>
  <section class="panel" style="padding:6px 8px"><div class="tablewrap"><table>
  <thead><tr><th>CP</th><th>Expedido</th><th>Proveedor</th><th>Producto · subpartida</th><th class="r">Cantidad</th><th class="r">Saldo</th><th class="r">IVA exento</th><th>Límite</th><th>Estado</th></tr></thead><tbody>
  ${a.map(c => `<tr class="click" data-cp="${c.id}"><td class="mono">${c.numero}</td><td class="num">${fd(c.fecha)}</td><td>${esc(c.prov)}<br><span class="mono" style="color:var(--muted)">${esc(c.nit)}</span></td><td>${esc(c.prod)}<br><span class="mono" style="color:var(--muted)">${esc(c.sub)}</span></td><td class="r num">${nf(c.cant)}</td><td class="r num">${nf(c.saldo)}</td><td class="r num">${cop(c.valor * IVA)}</td><td class="num">${fd(c.lim)}</td><td>${pill(c.est)}</td></tr>`).join("") || `<tr><td colspan="9" style="color:var(--muted)">Ningún CP coincide con la búsqueda.</td></tr>`}
  </tbody></table></div></section>`;
};

V.exportaciones = () => {
  const d = S.dex.slice().sort((a, b) => b.emb.localeCompare(a.emb));
  return `
  <div class="head"><div><h1>Exportaciones (DEX)</h1><p class="sub">Cada declaración de exportación descuenta saldo del CP que la respalda. La fecha que cuenta para el plazo es la del embarque.</p></div>
  <button class="btn primary" data-act="dex">Registrar exportación</button></div>
  <section class="panel" style="padding:6px 8px"><div class="tablewrap"><table>
  <thead><tr><th>DEX</th><th>Embarque</th><th>CP</th><th>Producto</th><th class="r">Cantidad</th><th>Destino</th><th>A tiempo</th></tr></thead><tbody>
  ${d.map(x => { const c = cpById(x.cp); if (!c) return ""; const ok = pd(x.emb) <= addM(c.fecha, 6); return `<tr class="click" data-cp="${c.id}"><td class="mono">${esc(x.n)}</td><td class="num">${fd(x.emb)}</td><td class="mono">${c.numero}</td><td>${esc(c.prod)}</td><td class="r num">${nf(x.cant)} <span style="color:var(--muted)">${esc(c.und)}</span></td><td>${esc(x.dest)}</td><td>${ok ? pill({ k: "ok", t: "Sí" }) : pill({ k: "crit", t: "Fuera de plazo" })}</td></tr>`; }).join("") || `<tr><td colspan="7" style="color:var(--muted)">Aún no hay exportaciones registradas.</td></tr>`}
  </tbody></table></div></section>`;
};

V.inventario = () => {
  const g = {};
  all().forEach(c => { const k = c.sub + "|" + c.und; g[k] = g[k] || { sub: c.sub, prod: c.prod, und: c.und, rec: 0, exp: 0, cps: 0, lim: null }; const o = g[k]; o.rec += c.cant; o.exp += c.exp; o.cps++; if (c.saldo > 0 && (!o.lim || c.lim < o.lim)) o.lim = c.lim; });
  const rows = Object.values(g).sort((a, b) => (b.rec - b.exp) - (a.rec - a.exp));
  return `
  <div class="head"><div><h1>Inventario exento</h1><p class="sub">Mercancía recibida con CP que todavía está en bodega, agrupada por subpartida arancelaria.</p></div></div>
  <section class="panel" style="padding:6px 8px"><div class="tablewrap"><table>
  <thead><tr><th>Subpartida</th><th>Producto</th><th class="r">Recibido</th><th class="r">Exportado</th><th class="r">En bodega</th><th>Unidad</th><th>CP</th><th>Primer vencimiento</th></tr></thead><tbody>
  ${rows.map(o => { const s = o.rec - o.exp; const r = o.lim ? days(HOY, o.lim) : null; return `<tr><td class="mono">${esc(o.sub)}</td><td>${esc(o.prod)}</td><td class="r num">${nf(o.rec)}</td><td class="r num">${nf(o.exp)}</td><td class="r num"><b>${nf(s)}</b></td><td>${esc(o.und)}</td><td class="num">${o.cps}</td><td>${o.lim ? `${fd(o.lim)} ${r < 0 ? pill({ k: "crit", t: "vencido" }) : r <= 30 ? pill({ k: "warn", t: r + " d" }) : ""}` : pill({ k: "ok", t: "sin saldo" })}</td></tr>`; }).join("") || `<tr><td colspan="8" style="color:var(--muted)">Sin inventario.</td></tr>`}
  </tbody></table></div></section>`;
};

V.alertas = () => {
  const al = alertas(), c = S.canales;
  const sw = (id, t, s) => `<label class="switch" for="${id}"><span>${t}<small>${s}</small></span><input type="checkbox" id="${id}" data-canal="${id}" ${c[id] ? "checked" : ""}></label>`;
  return `
  <div class="head"><div><h1>Alertas</h1><p class="sub">Avisos antes de que un CP se venza. La configuración se guarda; el envío automático por WhatsApp y correo es la siguiente fase.</p></div></div>
  <div class="grid2">
    <section class="panel"><h2>Pendientes (${al.length})</h2>
    ${al.map(x => `<div class="alert"><span class="dot" style="background:var(--${x.k === "info" ? "accent" : x.k})"></span><p><b>${esc(x.t)}</b></p><div class="meta">${esc(x.m)}</div><div class="chips">${c.wa ? `<span class="chip">WhatsApp</span>` : ""}${c.mail ? `<span class="chip">Correo</span>` : ""}<button class="btn sm" data-cp="${x.c.id}">Ver CP</button></div></div>`).join("") || `<p class="note">Sin alertas pendientes.</p>`}
    </section>
    <section class="panel"><h2>Canales y anticipación</h2>
      ${sw("wa", "WhatsApp", "Mensaje corto con el CP y los días restantes")}
      ${sw("mail", "Correo electrónico", "Resumen con saldo e IVA en riesgo")}
      ${sw("d60", "Avisar a 60 días", "Para planear producción y reservas de carga")}
      ${sw("d30", "Avisar a 30 días", "")}
      ${sw("d15", "Avisar a 15 días", "")}
      ${sw("d7", "Avisar a 7 días", "Aviso urgente, repite a diario")}
    </section>
  </div>`;
};

V.informe = () => {
  const a = all(); const prov = {};
  a.forEach(c => { const p = prov[c.nit] = prov[c.nit] || { prov: c.prov, nit: c.nit, n: 0, valor: 0, iva: 0, cumpl: 0 }; p.n++; p.valor += c.valor; p.iva += c.valor * IVA; if (c.saldo <= 0) p.cumpl++; });
  const tv = a.reduce((s, c) => s + c.valor, 0), te = a.reduce((s, c) => s + c.valor * (c.exp / c.cant), 0);
  return `
  <div class="head"><div><h1>Informe anual</h1><p class="sub">Borrador consolidado a ${fd(HOY)}. El formato oficial y los campos exigidos los valida el asesor en comercio exterior antes de presentarlo.</p></div>
  <button class="btn" data-act="xlsxinf">Exportar a Excel</button></div>
  <div class="kpis">
    <div class="kpi"><div class="l">CP registrados</div><div class="v">${a.length}</div><div class="h">${new Set(a.map(c => c.nit)).size} proveedores</div></div>
    <div class="kpi"><div class="l">Compras con CP</div><div class="v">${copM(tv)}</div><div class="h">valor antes de IVA</div></div>
    <div class="kpi"><div class="l">Exportado</div><div class="v">${tv ? Math.round(te / tv * 100) : 0} %</div><div class="h">${copM(te)} del valor comprado</div></div>
    <div class="kpi"><div class="l">DEX asociadas</div><div class="v">${S.dex.length}</div><div class="h">${new Set(S.dex.map(d => d.dest.split(", ").pop())).size} países destino</div></div>
  </div>
  <section class="panel" style="padding:6px 8px"><div class="tablewrap"><table>
  <thead><tr><th>Proveedor</th><th>NIT</th><th class="r">CP</th><th class="r">Valor compras</th><th class="r">IVA exento</th><th class="r">CP cumplidos</th></tr></thead><tbody>
  ${Object.values(prov).sort((x, y) => y.valor - x.valor).map(p => `<tr><td>${esc(p.prov)}</td><td class="mono">${esc(p.nit)}</td><td class="r num">${p.n}</td><td class="r num">${cop(p.valor)}</td><td class="r num">${cop(p.iva)}</td><td class="r num">${p.cumpl} de ${p.n}</td></tr>`).join("")}
  </tbody></table></div></section>`;
};

/* ---------- Excel ---------- */
function xlsx(nombre, filas) {
  if (!window.XLSX) { toast("No se pudo cargar el exportador de Excel."); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Datos");
  XLSX.writeFile(wb, nombre + ".xlsx");
}
const xlsxCP = () => xlsx("certificados-al-proveedor", all().map(c => ({
  "CP": c.numero, "Expedido": c.fecha, "Proveedor": c.prov, "NIT": c.nit, "Factura": c.fac, "Producto": c.prod,
  "Subpartida": c.sub, "Unidad": c.und, "Cantidad": c.cant, "Exportado": c.exp, "Saldo": c.saldo,
  "Valor": c.valor, "IVA exento": Math.round(c.valor * IVA), "Fecha límite": iso(c.lim), "Estado": c.est.t
})));
const xlsxInf = () => xlsx("informe-anual-borrador", all().map(c => ({
  "CP": c.numero, "Fecha CP": c.fecha, "NIT proveedor": c.nit, "Proveedor": c.prov, "Factura": c.fac, "Subpartida": c.sub,
  "Cantidad": c.cant, "Valor": c.valor, "IVA exento": Math.round(c.valor * IVA), "Cantidad exportada": c.exp,
  "DEX": S.dex.filter(d => d.cp === c.id).map(d => d.n).join(", "), "Saldo": c.saldo, "Estado": c.est.t
})));

/* ---------- lectura de factura electrónica DIAN (UBL 2.1) ---------- */
const FACTURA_EJEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>FE-90177</cbc:ID><cbc:IssueDate>${off(0)}</cbc:IssueDate>
<cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>Cultivos El Retiro S.A.S.</cbc:RegistrationName><cbc:CompanyID schemeID="2" schemeName="31">900456781</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="COP">128000000.00</cbc:LineExtensionAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">80000</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">128000000.00</cbc:LineExtensionAmount><cac:Item><cbc:Description>Rosas frescas cortadas tipo exportación</cbc:Description></cac:Item></cac:InvoiceLine>
</Invoice>`;

function leerFactura(txt) {
  const P = s => new DOMParser().parseFromString(s, "application/xml");
  let doc = P(txt);
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El archivo no es un XML válido.");
  const q = (el, n) => el ? el.getElementsByTagNameNS("*", n)[0] : null;
  if (doc.documentElement.localName === "AttachedDocument") {
    const inner = [...doc.getElementsByTagNameNS("*", "Description")].map(d => d.textContent).find(t => t.includes("Invoice"));
    if (inner) doc = P(inner.trim());
  }
  const inv = doc.documentElement;
  if (inv.localName !== "Invoice") throw new Error("El XML no parece una factura electrónica de la DIAN (UBL 2.1).");
  const hijo = (el, n) => [...el.children].find(c => c.localName === n);
  const sup = q(inv, "AccountingSupplierParty");
  const nitEl = q(sup, "CompanyID");
  const digits = (nitEl?.textContent || "").replace(/\D/g, "");
  const nit = digits ? Number(digits).toLocaleString("es-CO") + (nitEl.getAttribute("schemeID") ? "-" + nitEl.getAttribute("schemeID") : "") : "";
  const lineas = [...inv.getElementsByTagNameNS("*", "InvoiceLine")];
  const l = lineas[0];
  const qty = q(l, "InvoicedQuantity");
  const uc = (qty?.getAttribute("unitCode") || "").toUpperCase();
  const und = uc === "KGM" ? "kg" : ["NIU", "94", "EA", "C62", "UN"].includes(uc) ? "unidades" : "";
  return {
    prov: (q(sup, "RegistrationName")?.textContent || "").trim(),
    nit, fac: (hijo(inv, "ID")?.textContent || "").trim(),
    prod: (q(q(l, "Item"), "Description")?.textContent || "").trim(),
    cant: qty ? +qty.textContent : "",
    valor: l ? +(hijo(l, "LineExtensionAmount")?.textContent || 0) : +(q(q(inv, "LegalMonetaryTotal"), "LineExtensionAmount")?.textContent || 0),
    und, lineas: lineas.length
  };
}

/* ---------- cajones ---------- */
function drawer(title, body, foot) {
  $("#layer").innerHTML = `<div class="scrim" data-act="cerrar"></div><div class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dhead"><h2>${esc(title)}</h2><button class="btn sm" data-act="cerrar">Cerrar</button></div><div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ""}</div>`;
}
const close = () => $("#layer").innerHTML = "";

function verCP(id) {
  const c = all().find(x => x.id === id); if (!c) return;
  const ev = [{ d: c.fecha, t: `CP expedido a ${c.prov}`, s: `Factura ${c.fac} · ${nf(c.cant)} ${c.und}`, cl: "done" }]
    .concat(S.dex.filter(d => d.cp === id).map(d => ({ d: d.emb, t: `Embarque DEX ${d.n}`, s: `${nf(d.cant)} ${c.und} a ${d.dest}`, cl: "done" })))
    .concat([{ d: iso(c.lim), t: "Fecha límite para exportar", s: c.saldo > 0 ? `Saldo pendiente: ${nf(c.saldo)} ${c.und}` : "Saldo en cero", cl: "lim" }])
    .sort((a, b) => a.d.localeCompare(b.d));
  drawer(c.numero, `
    <p style="margin:0 0 14px">${pill(c.est)}</p>
    <dl class="dl"><dt>Proveedor</dt><dd>${esc(c.prov)} · <span class="mono">${esc(c.nit)}</span></dd>
    <dt>Factura</dt><dd class="mono">${esc(c.fac)}</dd><dt>Producto</dt><dd>${esc(c.prod)}</dd>
    <dt>Subpartida</dt><dd class="mono">${esc(c.sub)}</dd><dt>Valor</dt><dd class="num">${cop(c.valor)} · IVA exento ${cop(c.valor * IVA)}</dd>
    <dt>Exportado</dt><dd class="num">${nf(c.exp)} de ${nf(c.cant)} ${esc(c.und)}</dd><dt>Plazo</dt><dd>${clock(c)}</dd></dl>
    <h2>Historial</h2>
    <ul class="tl">${ev.map(e => `<li class="${e.cl}"><div class="d">${fd(e.d)}</div><b>${esc(e.t)}</b><div class="d">${esc(e.s)}</div></li>`).join("")}</ul>`,
    c.saldo > 0 ? `<button class="btn primary" data-act="dex" data-for="${c.id}">Registrar exportación</button>` : "");
}

const nextNum = () => {
  const y = HOY.getFullYear();
  const n = S.cps.filter(c => c.numero.startsWith(`CP-${y}-`)).map(c => +c.numero.split("-").pop() || 0);
  return `CP-${y}-` + String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0");
};

function nuevoCP() {
  const f = (id, l, t = "text", full = "") => `<div class="field ${full}"><label for="${id}">${l}</label><input id="${id}" type="${t}" ${t === "number" ? 'min="0" step="any"' : ""}></div>`;
  drawer("Nuevo Certificado al Proveedor", `
    <div class="aibox"><p><b>Leer factura electrónica.</b> Sube el XML de la factura del proveedor (el que envía la DIAN) y los datos se llenan solos. La subpartida la completas tú.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn sm" for="fxml">Subir XML</label><input class="filein" id="fxml" type="file" accept=".xml,text/xml"><button class="btn sm" type="button" data-act="xmlej">Probar con factura de ejemplo</button></div>
    <div id="xmlmsg" style="width:100%"></div></div>
    <form id="fcp" class="form" novalidate>
      ${f("prov", "Proveedor", "text", "full")}${f("nit", "NIT")}${f("fac", "Número de factura")}
      ${f("prod", "Producto", "text", "full")}${f("sub", "Subpartida arancelaria")}
      <div class="field"><label for="und">Unidad</label><select id="und"><option>kg</option><option>tallos</option><option>unidades</option><option>cajas</option></select></div>
      ${f("cant", "Cantidad", "number")}${f("valor", "Valor antes de IVA (COP)", "number")}
      <div class="field"><label for="fecha">Fecha de expedición del CP</label><input id="fecha" type="date" value="${iso(HOY)}"></div>
      <div class="calc" id="calc"></div>
      <div class="err" id="e1" style="grid-column:1/-1"></div>
    </form>`,
    `<button class="btn" data-act="cerrar">Cancelar</button><button class="btn primary" data-act="guardarcp" id="bcp">Expedir CP</button>`);
  const upd = () => { const fe = $("#fecha").value || iso(HOY); const v = +$("#valor").value || 0; $("#calc").innerHTML = `<span>Exportar a más tardar: <b>${fd(addM(fe, 6))}</b></span><span>IVA exento: <b>${cop(v * IVA)}</b></span><span>Número asignado: <b>${nextNum()}</b></span>`; };
  $("#fcp").addEventListener("input", upd); upd();
  $("#fxml").addEventListener("change", e => { const file = e.target.files[0]; if (!file) return; file.text().then(aplicarFactura); });
}
function aplicarFactura(txt) {
  const box = $("#xmlmsg");
  try {
    const d = leerFactura(txt);
    ["prov", "nit", "fac", "prod", "cant", "valor"].forEach(k => { const el = $("#" + k); if (d[k] !== "" && d[k] != null) { el.value = d[k]; el.classList.add("ai"); } });
    if (d.und) $("#und").value = d.und;
    $("#fcp").dispatchEvent(new Event("input"));
    box.innerHTML = `<span class="ok">Factura ${esc(d.fac)} leída.${d.lineas > 1 ? ` Tiene ${d.lineas} líneas: se tomó la primera; crea un CP por cada producto.` : ""} Completa la subpartida y revisa antes de expedir.</span>`;
    $("#sub").focus();
  } catch (e) { box.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}

async function guardarCP() {
  const g = id => $("#" + id).value.trim();
  const falta = ["prov", "nit", "fac", "prod", "sub", "cant", "valor", "fecha"].filter(k => !g(k));
  if (falta.length) { $("#e1").textContent = "Completa todos los campos para expedir el CP."; return; }
  if (!/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(g("sub"))) { $("#e1").textContent = "La subpartida debe tener 10 dígitos con el formato 0000.00.00.00."; return; }
  if (+g("cant") <= 0 || +g("valor") <= 0) { $("#e1").textContent = "La cantidad y el valor deben ser mayores que cero."; return; }
  const numero = nextNum();
  const b = $("#bcp"); b.disabled = true; b.textContent = "Guardando…";
  try {
    const fecha = g("fecha");
    await db.crearCP({ numero, fecha, prov: g("prov"), nit: g("nit"), fac: g("fac"), prod: g("prod"), sub: g("sub"), und: g("und"), cant: +g("cant"), valor: +g("valor") });
    close(); render(); toast(`${numero} expedido. Vence el ${fd(addM(fecha, 6))}.`);
  } catch (e) { $("#e1").textContent = msgError(e); b.disabled = false; b.textContent = "Expedir CP"; }
}

function nuevoDEX(pre) {
  const op = all().filter(c => c.saldo > 0).sort((a, b) => a.rest - b.rest);
  if (!op.length) { toast("No hay CP con saldo para exportar."); return; }
  drawer("Registrar exportación", `
    <form id="fdex" class="form" novalidate>
      <div class="field full"><label for="dcp">Certificado al Proveedor</label><select id="dcp">${op.map(c => `<option value="${c.id}" ${c.id === pre ? "selected" : ""}>${c.numero} · ${esc(c.prod)} · saldo ${nf(c.saldo)} ${esc(c.und)}</option>`).join("")}</select></div>
      <div class="field"><label for="dn">Número de DEX</label><input id="dn" class="mono" inputmode="numeric" placeholder="Número del formulario"></div>
      <div class="field"><label for="dc">Cantidad exportada</label><input id="dc" type="number" min="0"></div>
      <div class="field"><label for="de">Fecha de embarque</label><input id="de" type="date" value="${iso(HOY)}"></div>
      <div class="field"><label for="dd">Destino</label><input id="dd" placeholder="Ciudad, país"></div>
      <div class="calc" id="dcalc"></div>
      <div class="err" id="e2" style="grid-column:1/-1"></div>
    </form>`,
    `<button class="btn" data-act="cerrar">Cancelar</button><button class="btn primary" data-act="guardardex" id="bdex">Registrar</button>`);
  const upd = () => {
    const c = all().find(x => x.id === $("#dcp").value); if (!c) return; const q = +$("#dc").value || 0; const e = $("#de").value;
    const tarde = e && pd(e) > c.lim;
    $("#dcalc").innerHTML = `<span>Límite: <b>${fd(c.lim)}</b></span><span>Saldo después: <b>${nf(c.saldo - q)} ${esc(c.und)}</b></span>${tarde ? `<span style="color:var(--crit)">El embarque queda fuera del plazo de seis meses.</span>` : ""}`;
  };
  $("#fdex").addEventListener("input", upd); upd();
}
async function guardarDEX() {
  const cp = $("#dcp").value, n = $("#dn").value.trim(), q = +$("#dc").value, e = $("#de").value, d = $("#dd").value.trim();
  const c = all().find(x => x.id === cp);
  if (!n || !q || !e || !d) { $("#e2").textContent = "Completa número de DEX, cantidad, fecha y destino."; return; }
  if (q <= 0) { $("#e2").textContent = "La cantidad debe ser mayor que cero."; return; }
  if (q > c.saldo) { $("#e2").textContent = `La cantidad supera el saldo del CP (${nf(c.saldo)} ${c.und}).`; return; }
  const b = $("#bdex"); b.disabled = true; b.textContent = "Guardando…";
  try {
    await db.crearDEX({ n, cp, cant: q, emb: e, dest: d });
    close(); render(); toast(`Exportación registrada. Saldo de ${c.numero}: ${nf(c.saldo - q)} ${c.und}.`);
  } catch (err) { $("#e2").textContent = msgError(err); b.disabled = false; b.textContent = "Registrar"; }
}

let tt; function toast(m) { clearTimeout(tt); let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; tt = setTimeout(() => t.hidden = true, 3500); }

/* ---------- render ---------- */
function view() { const v = (location.hash || "#panel").slice(1); return V[v] && v !== "vacio" ? v : "panel"; }
function renderCompany() {
  const e = empresaActual();
  let h = e ? `${esc(e.nombre)}${e.nit ? `<br>NIT ${esc(e.nit)}` : ""}` : "Sin empresa";
  if (S.empresas.length > 1) h += `<select id="selemp" aria-label="Cambiar de empresa">${S.empresas.map(x => `<option value="${x.id}" ${x.id === S.empresaId ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>`;
  if (USER) h += `<br><span style="opacity:.8">${esc(USER.email)}</span><br><button class="salir" data-act="salir">Cerrar sesión</button>`;
  $("#company").innerHTML = h;
}
function render() {
  const v = view();
  const banner = DEMO
    ? `<div class="demo"><span><b>Modo demostración.</b> Datos de ejemplo guardados solo en este navegador; se reinician al recargar.</span><button class="btn sm" data-act="reset">Restablecer ejemplo</button></div>`
    : "";
  $("#main").innerHTML = banner + (S.empresaId ? V[v]() : V.vacio());
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === v));
  const n = alertas().filter(a => a.k !== "info").length; $("#nb").textContent = n; $("#nb").hidden = !n;
  renderCompany();
  const q = $("#q"); if (q) q.addEventListener("input", e => { ui.q = e.target.value; const p = e.target.selectionStart; render(); const nq = $("#q"); nq.focus(); nq.setSelectionRange(p, p); });
}

async function mostrarApp(user) {
  USER = user || null;
  $("#login").hidden = true; $("#app").hidden = false;
  $("#main").innerHTML = `<p class="note"><span class="spin"></span>Cargando datos…</p>`;
  try { await db.cargar(); render(); }
  catch (e) { $("#main").innerHTML = `<div class="head"><div><h1>No se pudieron cargar los datos</h1><p class="sub">${esc(msgError(e))}</p></div><button class="btn" data-act="recargar">Intentar de nuevo</button></div>`; }
}
function mostrarLogin() { USER = null; $("#app").hidden = true; $("#login").hidden = false; $("#lemail").focus(); }

$("#flogin").addEventListener("submit", async e => {
  e.preventDefault();
  const b = $("#lbtn"); b.disabled = true; b.textContent = "Entrando…"; $("#lerr").textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpass").value });
  b.disabled = false; b.textContent = "Entrar";
  if (error) { $("#lerr").textContent = "Correo o contraseña incorrectos."; return; }
  mostrarApp(data.user);
});

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act],[data-cp],[data-f]"); if (!t) return;
  if (t.dataset.f) { ui.filtro = t.dataset.f; render(); return; }
  const a = t.dataset.act;
  if (!a && t.dataset.cp) { verCP(t.dataset.cp); return; }
  const acciones = {
    cerrar: close, nuevo: nuevoCP, guardarcp: guardarCP, dex: () => nuevoDEX(t.dataset.for), guardardex: guardarDEX,
    xmlej: () => aplicarFactura(FACTURA_EJEMPLO), xlsxcp: xlsxCP, xlsxinf: xlsxInf,
    reset: () => { S = demoSeed(); ui = { filtro: "todos", q: "" }; render(); toast("Datos de ejemplo restablecidos."); },
    recargar: () => mostrarApp(USER),
    salir: async () => { await sb.auth.signOut(); S = { empresas: [], empresaId: null, cps: [], dex: [], canales: {} }; mostrarLogin(); }
  };
  if (acciones[a]) acciones[a]();
});
document.addEventListener("change", async e => {
  if (e.target.dataset.canal) {
    S.canales[e.target.dataset.canal] = e.target.checked;
    try { await db.guardarCanales(); toast("Preferencias de alerta guardadas."); } catch (err) { toast(msgError(err)); }
    render();
  }
  if (e.target.id === "selemp") { S.empresaId = e.target.value; lsSet("zarpe-empresa", S.empresaId); mostrarApp(USER); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
window.addEventListener("hashchange", () => { close(); if (!$("#app").hidden) render(); window.scrollTo(0, 0); });

(async function iniciar() {
  if (DEMO) { mostrarApp(null); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (session) mostrarApp(session.user); else mostrarLogin();
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") mostrarLogin(); });
})();
