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
    inner.innerHTML = `<div class="orders-empty"><p>${esc(activeTab)} — coming next.</p></div>`;
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
