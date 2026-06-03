/*
 * planner.js — the Planner screen (forward-planning brain).
 *
 * Self-contained module mirroring the Production pattern. Exposes
 *   window.Planner = { init, onShow, refresh, refreshFromCache }.
 * Reads the shared cache via window.PlannerAdapter (which maps live rows into
 * the engine contracts) and renders engine output as plain DOM — no React.
 *
 * Tabs are built in the agreed order; Orchestrator is live, the rest are
 * stubbed (disabled in the header) and fill in next.
 */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  let activeProduct = 'PVC';
  let activeTab = 'orchestrator';
  let wired = false;
  let shownOnce = false;
  let lastFetchAt = null;

  // ---- helpers --------------------------------------------------------------
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const w = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return String(d.getFullYear()).slice(2) + '_' + String(w).padStart(2, '0');
  }
  function fmtDate(d) { return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear(); }
  function haveSpineCache() {
    try {
      const A = window.PlannerAdapter; if (!A) return false;
      const b = A.build();   // cheap; returns ok flag
      return b && b.ok;
    } catch (e) { return false; }
  }
  function banner(msg) {
    const b = $('#planBanner'); if (!b) return;
    if (!msg) { b.hidden = true; b.textContent = ''; return; }
    b.hidden = false; b.textContent = msg;
  }

  const STATUS_CLS = { LATE:'plan-st-late', BLOCKED:'plan-st-blocked', RISK:'plan-st-risk', OK:'plan-st-ok' };
  const SEV = { 0:{ k:'crit', t:'CRITICAL' }, 1:{ k:'act', t:'ACTION' }, 2:{ k:'rev', t:'REVIEW' } };

  // ---- render ---------------------------------------------------------------
  function pset() {
    if (typeof currentMapping !== 'object' || !currentMapping) return {};
    if (!currentMapping.planner) currentMapping.planner = {};
    return currentMapping.planner;
  }
  function saveSettings() { if (typeof scheduleAutoSave === 'function') try { scheduleAutoSave(); } catch (e) {} }

  function render() {
    const now = new Date();
    const td = $('#planTodayDate'); if (td) td.textContent = fmtDate(now);
    const tw = $('#planTodayWeek'); if (tw) tw.textContent = isoWeek(now);

    const inner = $('#planListInner'); if (!inner) return;
    const A = window.PlannerAdapter;
    if (!A) { banner('Planner adapter not loaded.'); return; }

    if (activeTab === 'orchestrator') return renderOrchestrator(inner);
    if (activeTab === 'wfl')          return renderWfl(inner);
    if (activeTab === 'layout')       return renderLayout(inner);
    inner.innerHTML = `<div class="orders-empty"><p>${esc(activeTab)} — coming next.</p></div>`;
  }

  // ---- Tab: Layout modeler -------------------------------------------------
  const HALL_D = 30, SNAP = 0.5;
  let layoutZoom = 13;            // px per metre
  let layoutSel = null;          // selected object id
  function seedLayout() {
    const zones = [
      { id:'z1', label:'1 · Profile Warehouse', color:'#c2ad7e', w:8 },
      { id:'z2', label:'2 · Schirmer Cutting', color:'#94a3b8', w:10 },
      { id:'z3', label:'3 · Reinforcement Prep', color:'#60a5fa', w:5 },
      { id:'z4', label:'4 · 3× Welding (Fimtec)', color:'#4ade80', w:15 },
      { id:'z5', label:'5 · Corner Cleaning', color:'#7dd3fc', w:6 },
      { id:'z6', label:'6 · Hardware Assembly', color:'#fbbf24', w:8 },
      { id:'z7', label:'7 · Glazing Station', color:'#cbd5e1', w:9 },
      { id:'z8', label:'8 · QC & Repair', color:'#c4b5fd', w:6 },
      { id:'z9', label:'9 · Packing', color:'#fde047', w:5 },
      { id:'z10', label:'10 · Expedition & Loading', color:'#9ca3af', w:8 },
    ];
    const objs = [
      { id:'rack1', zone:0, kind:'rack', color:'#c2ad7e', label:'Profile rack', rx:0.6, y:2.5, w:2.6, h:11 },
      { id:'rack2', zone:0, kind:'rack', color:'#c2ad7e', label:'Profile rack', rx:0.6, y:16, w:2.6, h:11 },
      { id:'fork1', zone:0, kind:'fork', color:'#f59e0b', label:'Forklift', rx:4.6, y:23, w:2.4, h:4 },
      { id:'cut', zone:1, kind:'machine', color:'#64748b', label:'Schirmer C&M', type:'Cutting center', rx:1, y:10, w:8, h:9, workers:1 },
      { id:'rein1', zone:2, kind:'machine', color:'#3b82f6', label:'Reinf. bench', type:'Reinforcement', rx:0.8, y:5, w:3.2, h:5, workers:1 },
      { id:'rein2', zone:2, kind:'machine', color:'#3b82f6', label:'Reinf. bench', type:'Reinforcement', rx:0.8, y:18, w:3.2, h:5 },
      { id:'weld0', zone:3, kind:'machine', color:'#22c55e', label:'Welding line 1', type:'Welding line', rx:3, y:4, w:9, h:6, workers:1 },
      { id:'weld1', zone:3, kind:'machine', color:'#22c55e', label:'Welding line 2', type:'Welding line', rx:3, y:13, w:9, h:6, workers:1 },
      { id:'weld2', zone:3, kind:'machine', color:'#22c55e', label:'Welding line 3', type:'Welding line', rx:3, y:22, w:9, h:6, workers:1 },
      { id:'clean0', zone:4, kind:'machine', color:'#0ea5e9', label:'Corner cleaner', type:'Corner cleaner', rx:1, y:4, w:4, h:6 },
      { id:'clean1', zone:4, kind:'machine', color:'#0ea5e9', label:'Corner cleaner', type:'Corner cleaner', rx:1, y:13, w:4, h:6 },
      { id:'clean2', zone:4, kind:'machine', color:'#0ea5e9', label:'Corner cleaner', type:'Corner cleaner', rx:1, y:22, w:4, h:6 },
      { id:'hw0', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:0.8, y:4, w:3.2, h:6, workers:1 },
      { id:'hw1', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:4.4, y:4, w:3.2, h:6 },
      { id:'hw2', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:0.8, y:13, w:3.2, h:6, workers:1 },
      { id:'hw3', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:4.4, y:13, w:3.2, h:6 },
      { id:'hw4', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:0.8, y:22, w:3.2, h:6, workers:1 },
      { id:'hw5', zone:5, kind:'machine', color:'#f59e0b', label:'HW station', type:'Hardware station', rx:4.4, y:22, w:3.2, h:6 },
      { id:'glz1', zone:6, kind:'machine', color:'#94a3b8', label:'Glazing table', type:'Glazing table', rx:1, y:4, w:6, h:7, workers:1 },
      { id:'glz2', zone:6, kind:'machine', color:'#94a3b8', label:'Glazing table', type:'Glazing table', rx:1, y:18, w:6, h:7, workers:1 },
      { id:'glass', zone:6, kind:'rack', color:'#2563eb', label:'Glass racks', rx:7.4, y:8, w:1.2, h:14 },
      { id:'qc1', zone:7, kind:'machine', color:'#8b5cf6', label:'QC / repair', type:'QC/Repair', rx:1, y:7, w:4, h:6, workers:1 },
      { id:'qc2', zone:7, kind:'machine', color:'#8b5cf6', label:'QC / repair', type:'QC/Repair', rx:1, y:18, w:4, h:6 },
      { id:'pk1', zone:8, kind:'machine', color:'#eab308', label:'Packing', type:'Packing table', rx:0.7, y:6, w:3.4, h:6, workers:1 },
      { id:'pk2', zone:8, kind:'machine', color:'#eab308', label:'Packing', type:'Packing table', rx:0.7, y:17, w:3.4, h:6 },
      { id:'dock', zone:9, kind:'dock', color:'#475569', label:'Loading dock', rx:4, y:2, w:4, h:26 },
      { id:'stl', zone:9, kind:'stillage', color:'#22c55e', label:'Finished goods', rx:0.5, y:11, w:3, h:8 },
    ];
    return { zones, objs };
  }
  function getLayout() {
    const p = pset();
    if (!p.layout || !Array.isArray(p.layout.zones) || !Array.isArray(p.layout.objs)) p.layout = seedLayout();
    return p.layout;
  }
  function zoneStarts(zones) { const s = []; let a = 0; for (const z of zones) { s.push(a); a += z.w; } return s; }
  const KIND_FILL = { machine:0.16, rack:0.22, stillage:0.22, dock:0.18, fork:0.0, person:0.9 };

  function renderLayout(inner) {
    banner('');
    const L = getLayout();
    const hallW = L.zones.reduce((a, z) => a + z.w, 0);
    inner.innerHTML =
      `<div class="plan-layout">
        <div class="plan-floor-wrap">
          <div class="plan-floor-bar">
            <button class="plan-btn plan-btn-ghost" id="plLzOut">−</button>
            <button class="plan-btn plan-btn-ghost" id="plLzIn">+</button>
            <span class="muted">${Math.round(hallW)} × ${HALL_D} m · ${Math.round(hallW*HALL_D)} m² · drag boxes to move</span>
            <span class="spacer" style="flex:1"></span>
            <button class="plan-btn plan-btn-ghost" id="plLadd-machine">+ Machine</button>
            <button class="plan-btn plan-btn-ghost" id="plLadd-rack">+ Rack</button>
            <button class="plan-btn plan-btn-ghost" id="plLadd-person">+ Person</button>
          </div>
          <div class="plan-floor-scroll" id="plFloorScroll"></div>
        </div>
        <div class="plan-layout-side" id="plLayoutSide"></div>
      </div>`;
    drawFloor();
    drawSidePanel();
    $('#plLzOut').onclick = () => { layoutZoom = Math.max(6, layoutZoom - 2); drawFloor(); };
    $('#plLzIn').onclick  = () => { layoutZoom = Math.min(40, layoutZoom + 2); drawFloor(); };
    ['machine','rack','person'].forEach(k => { const b = $('#plLadd-' + k); if (b) b.onclick = () => addObj(k); });
    setInfo();
  }

  function svgEl(name, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

  function drawFloor() {
    const host = $('#plFloorScroll'); if (!host) return;
    const L = getLayout(); const PX = layoutZoom;
    const hallW = L.zones.reduce((a, z) => a + z.w, 0);
    const starts = zoneStarts(L.zones);
    const W = hallW * PX, H = HALL_D * PX;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${hallW} ${HALL_D}`, class: 'plan-floor' });
    // zones
    L.zones.forEach((z, i) => {
      svg.appendChild(svgEl('rect', { x: starts[i], y: 0, width: z.w, height: HALL_D, fill: hexA(z.color, 0.10), stroke: hexA(z.color, 0.5), 'stroke-width': 0.06 }));
      const t = svgEl('text', { x: starts[i] + 0.3, y: 1.1, 'font-size': 0.8, fill: '#475569', 'font-weight': 600 }); t.textContent = z.label; svg.appendChild(t);
    });
    // objects
    L.objs.forEach(o => {
      const ax = starts[o.zone] + o.rx;
      const g = svgEl('g', { class: 'plan-obj' + (o.id === layoutSel ? ' sel' : ''), 'data-id': o.id });
      const fillA = KIND_FILL[o.kind] != null ? KIND_FILL[o.kind] : 0.16;
      g.appendChild(svgEl('rect', { x: ax, y: o.y, width: o.w, height: o.h, rx: 0.25, fill: hexA(o.color, fillA), stroke: o.color, 'stroke-width': o.id === layoutSel ? 0.18 : 0.08 }));
      const lab = svgEl('text', { x: ax + o.w / 2, y: o.y + o.h / 2, 'font-size': 0.7, fill: '#1c2230', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }); lab.textContent = o.label; g.appendChild(lab);
      for (let i = 0; i < (o.workers || 0); i++) {
        const below = o.y + o.h < HALL_D - 2.5; const wy = below ? o.y + o.h + 0.9 : o.y - 0.9;
        g.appendChild(svgEl('circle', { cx: ax + (o.w * (i + 1)) / ((o.workers || 0) + 1), cy: wy, r: 0.5, fill: '#1c2230' }));
      }
      g.addEventListener('pointerdown', (e) => startDrag(e, o.id, svg, PX, starts));
      svg.appendChild(g);
    });
    host.innerHTML = ''; host.appendChild(svg);
  }

  function startDrag(e, id, svg, PX, starts) {
    e.preventDefault();
    layoutSel = id; drawSidePanel();
    const L = getLayout(); const o = L.objs.find(x => x.id === id); if (!o) return;
    const rect = svg.getBoundingClientRect();
    const toM = (ev) => ({ x: (ev.clientX - rect.left) / PX, y: (ev.clientY - rect.top) / PX });
    const p0 = toM(e); const gx = p0.x - (starts[o.zone] + o.rx), gy = p0.y - o.y;
    const g = svg.querySelector(`[data-id="${id}"]`);
    const hallW = L.zones.reduce((a, z) => a + z.w, 0);
    const snap = (v) => Math.round(v / SNAP) * SNAP;
    const move = (ev) => {
      const p = toM(ev);
      let ax = Math.min(Math.max(snap(p.x - gx), 0), hallW - o.w);
      let y = Math.min(Math.max(snap(p.y - gy), 0), HALL_D - o.h);
      g.setAttribute('transform', `translate(${ax - (starts[o.zone] + o.rx)},${y - o.y})`);
      g._ax = ax; g._y = y;
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      if (g._ax != null) {
        let z = 0; for (let i = 0; i < starts.length; i++) if (g._ax >= starts[i]) z = i;
        o.zone = z; o.rx = Math.max(0, Math.min(g._ax - starts[z], L.zones[z].w - o.w)); o.y = g._y;
      }
      saveSettings(); drawFloor(); drawSidePanel();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  }

  function addObj(kind) {
    const L = getLayout();
    const base = { machine:{ w:5, h:6, workers:1, color:'#22c55e', type:'Machine' }, rack:{ w:2.5, h:10, color:'#c2ad7e' }, person:{ w:1.6, h:1.6, color:'#1c2230', label:'Operator' } }[kind] || { w:3, h:3, color:'#64748b' };
    const id = kind + Math.random().toString(36).slice(2, 5);
    L.objs.push(Object.assign({ id, zone:0, kind, rx:1, y:12, label:kind }, base));
    layoutSel = id; saveSettings(); drawFloor(); drawSidePanel();
  }

  function drawSidePanel() {
    const side = $('#plLayoutSide'); if (!side) return;
    const L = getLayout();
    const o = L.objs.find(x => x.id === layoutSel);
    const machines = L.objs.filter(x => x.kind === 'machine');
    const workers = L.objs.reduce((a, x) => a + (x.workers || 0), 0);
    const selHTML = o ? `
      <div class="plan-card">
        <h2>Selected</h2>
        <label class="plan-f">Label <input id="plf-label" value="${esc(o.label || '')}"></label>
        ${o.type != null ? `<label class="plan-f">Type <input id="plf-type" value="${esc(o.type)}"></label>` : ''}
        <div class="plan-f-row">
          <label class="plan-f">X <input id="plf-rx" type="number" step="0.5" value="${o.rx}"></label>
          <label class="plan-f">Y <input id="plf-y" type="number" step="0.5" value="${o.y}"></label>
        </div>
        <div class="plan-f-row">
          <label class="plan-f">W <input id="plf-w" type="number" step="0.5" value="${o.w}"></label>
          <label class="plan-f">H <input id="plf-h" type="number" step="0.5" value="${o.h}"></label>
        </div>
        <div class="plan-f-row">
          <label class="plan-f">Workers <input id="plf-workers" type="number" min="0" step="1" value="${o.workers || 0}"></label>
          <label class="plan-f">Colour <input id="plf-color" type="color" value="${esc(o.color || '#64748b')}"></label>
        </div>
        <button class="plan-btn plan-btn-ghost" id="plf-del">Delete</button>
      </div>` : `<div class="plan-card"><h2>Selected</h2><p class="muted">Click a box on the floor to edit it.</p></div>`;
    side.innerHTML = `
      <div class="plan-card"><h2>Summary</h2>
        <div class="plan-sum"><span>${machines.length}</span> machines · <span>${workers}</span> operators · <span>${L.objs.length}</span> objects</div>
      </div>
      ${selHTML}
      <div class="plan-card"><h2>Layout JSON</h2>
        <textarea class="plan-wfl-src" id="plLjson" style="min-height:160px" spellcheck="false"></textarea>
        <div class="plan-f-row"><button class="plan-btn plan-btn-ghost" id="plLexp">Export</button><button class="plan-btn plan-btn-ghost" id="plLimp">Import</button><button class="plan-btn plan-btn-ghost" id="plLreset">Reset floor</button></div>
      </div>`;
    if (o) {
      const upd = (k, v) => { o[k] = v; saveSettings(); drawFloor(); };
      const num = (id, k) => { const el = $('#' + id); if (el) el.onchange = () => upd(k, Number(el.value)); };
      const txt = (id, k) => { const el = $('#' + id); if (el) el.onchange = () => upd(k, el.value); };
      txt('plf-label', 'label'); txt('plf-type', 'type'); txt('plf-color', 'color');
      num('plf-rx', 'rx'); num('plf-y', 'y'); num('plf-w', 'w'); num('plf-h', 'h'); num('plf-workers', 'workers');
      const del = $('#plf-del'); if (del) del.onclick = () => { const i = L.objs.findIndex(x => x.id === o.id); if (i >= 0) L.objs.splice(i, 1); layoutSel = null; saveSettings(); drawFloor(); drawSidePanel(); };
    }
    $('#plLexp').onclick = () => { $('#plLjson').value = JSON.stringify(L, null, 2); };
    $('#plLimp').onclick = () => { try { const v = JSON.parse($('#plLjson').value); if (v && Array.isArray(v.zones) && Array.isArray(v.objs)) { pset().layout = v; layoutSel = null; saveSettings(); drawFloor(); drawSidePanel(); banner(''); } else banner('Layout JSON must have zones[] and objs[].'); } catch (e) { banner('Invalid layout JSON: ' + e.message); } };
    $('#plLreset').onclick = () => { pset().layout = seedLayout(); layoutSel = null; saveSettings(); drawFloor(); drawSidePanel(); };
  }
  function hexA(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#888888');
    if (!m) return hex;
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
  }

  // ---- Tab: WFL (Window Flow Language) -------------------------------------
  const WFL_DEFAULT =
`# WFL — editable planning rules over the active product's orders.
# Columns available per order: id, dest, pcs, stage_index, stages_total,
# materials_in (h), loading_in (h), product, prodWeek, elementCount, doneCount.
const truck_cap = 80

let remaining = stages_total - stage_index
let mat_ready = max(0, materials_in)
let earliest  = mat_ready + remaining
let slack     = loading_in - earliest

kpi "Orders"        = @count()
kpi "Avg slack (h)" = round(@avg(slack))
kpi "At risk (<8h)" = @count(where slack < 8)
kpi "Pieces"        = @sum(pcs)
kpi "Blocked"       = @count(where materials_in > 0)

rule "late"    when slack < 0        => action(critical, id + " late by " + abs(slack) + "h")
rule "blocked" when materials_in > 0 => action(critical, "Expedite materials for " + id)
rule "push"    when slack >= 0 and slack < 8 and materials_in <= 0 => action(action, "Push " + id + " — " + slack + "h slack")
`;

  function renderWfl(inner) {
    const prog = (typeof pset().wfl === 'string') ? pset().wfl : WFL_DEFAULT;
    inner.innerHTML =
      `<div class="plan-wfl">
        <div class="plan-wfl-edit">
          <div class="plan-wfl-bar">
            <button class="plan-btn" id="planWflRun">▶ Run</button>
            <button class="plan-btn plan-btn-ghost" id="planWflReset">Reset to default</button>
            <span class="muted" id="planWflHint">⌘/Ctrl+Enter to run · saved automatically</span>
          </div>
          <textarea class="plan-wfl-src" id="planWflSrc" spellcheck="false">${esc(prog)}</textarea>
        </div>
        <div class="plan-wfl-out" id="planWflOut"><p class="muted">Run to see KPIs and calls to action.</p></div>
      </div>`;
    const src = $('#planWflSrc');
    const runIt = () => { pset().wfl = src.value; saveSettings(); runWfl(src.value, $('#planWflOut')); };
    $('#planWflRun').addEventListener('click', runIt);
    $('#planWflReset').addEventListener('click', () => { src.value = WFL_DEFAULT; pset().wfl = WFL_DEFAULT; saveSettings(); runWfl(WFL_DEFAULT, $('#planWflOut')); });
    src.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runIt(); } });
    src.addEventListener('change', () => { pset().wfl = src.value; saveSettings(); });
    // auto-run once if data present
    const built = window.PlannerAdapter.build();
    if (built.ok) runWfl(prog, $('#planWflOut'));
    setInfo();
  }

  function runWfl(text, out) {
    const E = window.PlannerEngine, A = window.PlannerAdapter;
    if (!out) return;
    let rows = [];
    try { const b = A.build(); rows = b.ok ? b.orders.filter(o => o.product === activeProduct) : []; } catch (e) {}
    if (!rows.length) { out.innerHTML = `<p class="muted">No ${esc(activeProduct)} orders loaded — click Refresh.</p>`; return; }
    let res;
    try { res = E.run(E.parse(text), rows); }
    catch (err) { out.innerHTML = `<div class="plan-wfl-err"><b>WFL error</b><div>${esc(err && err.message || err)}</div></div>`; return; }
    const kpis = res.kpis || [], ctas = res.ctas || [];
    const kpiHTML = `<div class="plan-kpis">${kpis.map(c =>
      `<div class="plan-kpi"><div class="plan-kpi-v">${esc(fmtNum(c.value))}</div><div class="plan-kpi-k">${esc(c.label)}</div></div>`).join('')}</div>`;
    const ctaHTML = `<section class="plan-card"><h2>Rule output <span class="plan-count">${ctas.length}</span></h2>` +
      (ctas.length ? `<ul class="plan-actions">${ctas.map(a => {
        const s = SEV[a.sev] || SEV[2];
        return `<li class="plan-act plan-act-${s.k}"><span class="plan-sev">${s.t}</span><div class="plan-act-body"><div class="plan-act-title">${esc(a.msg)}</div></div></li>`;
      }).join('')}</ul>` : `<p class="muted">No rules fired.</p>`) + `</section>`;
    out.innerHTML = kpiHTML + ctaHTML;
  }
  function fmtNum(v) { return (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 100) / 100 : v; }

  function renderOrchestrator(inner) {
    const A = window.PlannerAdapter;
    const live = A.orchestrateLive(activeProduct, {});
    if (!live.ok) {
      const reason = live.reason === 'no-spine-rows' || live.reason === 'no-cache'
        ? 'No data loaded — click Refresh in the ribbon.'
        : (live.reason === 'engine-missing' ? 'Planner engine missing.' : 'Could not build plan: ' + live.reason);
      banner(reason);
      inner.innerHTML = `<div class="orders-empty"><p>${esc(reason)}</p></div>`;
      setInfo();
      return;
    }
    banner('');
    const { result } = live;
    const k = result.kpis;
    const computed = result.computed;
    const actions = result.actions;
    const trucks = result.trucks;

    // totals
    const totals = $('#planTotals');
    if (totals) totals.innerHTML =
      `<b>${k.orders}</b> orders · <b class="${k.offTrack ? 'prod-stuck-num' : ''}">${k.offTrack}</b> off-track · ` +
      `<b class="${k.critical ? 'prod-stuck-num' : ''}">${k.critical}</b> critical · <b>${k.trucksReady}</b> trucks ready`;

    // KPI ribbon
    const kpis = [
      { label:'Orders', val:k.orders },
      { label:'Off-track', val:k.offTrack, warn:k.offTrack>0 },
      { label:'Critical', val:k.critical, warn:k.critical>0 },
      { label:'Trucks ready', val:k.trucksReady },
    ];
    const kpiHTML = `<div class="plan-kpis">${kpis.map(c =>
      `<div class="plan-kpi${c.warn ? ' warn' : ''}"><div class="plan-kpi-v">${c.val}</div><div class="plan-kpi-k">${esc(c.label)}</div></div>`
    ).join('')}</div>`;

    // actions
    const actHTML = `<section class="plan-card"><h2>Calls to action <span class="plan-count">${actions.length}</span></h2>` +
      (actions.length ? `<ul class="plan-actions">${actions.map(a => {
        const s = SEV[a.sev] || SEV[2];
        return `<li class="plan-act plan-act-${s.k}"><span class="plan-sev">${s.t}</span>` +
          `<div class="plan-act-body"><div class="plan-act-title">${esc(a.title)}</div>` +
          (a.why ? `<div class="plan-act-why">${esc(a.why)}</div>` : '') + `</div></li>`;
      }).join('')}</ul>` : `<p class="muted">Nothing urgent — all orders on track.</p>`) + `</section>`;

    // trucks
    const truckHTML = `<section class="plan-card"><h2>Trucks <span class="plan-count">${trucks.length}</span></h2>` +
      (trucks.length ? `<div class="plan-trucks">${trucks.map(t => {
        const fill = Math.min(100, t.fill);
        const cls = t.ready ? 'ready' : 'short';
        return `<div class="plan-truck plan-truck-${cls}"><div class="plan-truck-top"><b>${esc(t.dest)}</b>` +
          `<span>${t.pcs} pcs ${t.ready ? '· READY' : '· short ' + t.short}</span></div>` +
          `<div class="plan-truck-bar"><span style="width:${fill}%"></span></div>` +
          `<div class="plan-truck-sub muted">${t.orders.length} order${t.orders.length===1?'':'s'} · ${t.fill}% of 80</div></div>`;
      }).join('')}</div>` : `<p class="muted">No feasible orders to consolidate yet.</p>`) + `</section>`;

    // feasibility table
    const rows = [...computed].sort((a,b)=> (a.slack ?? 0) - (b.slack ?? 0));
    const tableHTML = `<section class="plan-card"><h2>Feasibility <span class="plan-count">${rows.length}</span></h2>` +
      `<div class="plan-table"><div class="plan-trow plan-thead">` +
      `<span>Order</span><span>Status</span><span class="num">pcs</span><span>Dest</span>` +
      `<span>Deadline</span><span>Slowest station</span><span class="num">el D/T</span><span>Blocking</span></div>` +
      rows.map(o => {
        const stCls = STATUS_CLS[o.status] || '';
        const dl = o.deadline || {};
        const blocking = (o.components && o.components.length)
          ? o.components.map(c => esc(c.kind) + '·' + c.eta_h + 'h').join(' ')
          : (o.status === 'BLOCKED' ? esc(o.bindingComponent || 'materials') : '—');
        return `<div class="plan-trow">` +
          `<span class="plan-ono">${esc(o.id)}</span>` +
          `<span><span class="plan-pill ${stCls}">${esc(o.status)}</span></span>` +
          `<span class="num">${o.pcs}</span>` +
          `<span>${esc(o.dest)}</span>` +
          `<span class="${dl.overdue ? 'plan-overdue' : ''}">${esc(dl.label || '—')}</span>` +
          `<span>${esc(o.slowestStation || '—')}</span>` +
          `<span class="num">${o.doneCount}/${o.elementCount}</span>` +
          `<span class="plan-block">${blocking}</span>` +
          `</div>`;
      }).join('') + `</div></section>`;

    inner.innerHTML = kpiHTML + `<div class="plan-grid2">${actHTML}${truckHTML}</div>` + tableHTML;
    lastFetchAt = new Date();
    setInfo();
  }

  function setInfo() {
    const info = $('#planRefreshInfo');
    if (info) info.textContent = lastFetchAt ? ('Updated ' + lastFetchAt.toLocaleTimeString()) : 'Not loaded yet.';
  }

  // ---- wiring ---------------------------------------------------------------
  function wire() {
    if (wired) return;
    const pt = $('#planProductTabs'), vt = $('#planViewTabs');
    if (!pt || !vt) return;        // shell not in DOM yet
    wired = true;
    pt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-product]'); if (!b) return;
      activeProduct = b.dataset.product;
      pt.querySelectorAll('.prod-tab').forEach(x => x.classList.toggle('active', x === b));
      render();
    });
    vt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]'); if (!b || b.disabled) return;
      activeTab = b.dataset.tab;
      vt.querySelectorAll('.prod-view').forEach(x => x.classList.toggle('active', x === b));
      render();
    });
  }

  // ---- public API -----------------------------------------------------------
  window.Planner = {
    init() { wire(); },
    onShow() {
      wire();
      if (haveSpineCache()) { render(); }
      else if (!shownOnce && typeof window.refreshOrders === 'function') {
        shownOnce = true;
        window.refreshOrders();   // first open with empty cache → unified load
      }
      shownOnce = true;
    },
    refresh() { if (typeof window.refreshOrders === 'function') window.refreshOrders(); },
    refreshFromCache() {
      try { wire(); if (haveSpineCache()) render(); }
      catch (e) { console.error('Planner.refreshFromCache failed:', e); }
    },
  };
})();
