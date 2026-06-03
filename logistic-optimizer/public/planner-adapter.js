/*
 * planner-adapter.js — live data → Production-Planner engine contracts.
 *
 * Pure, no DOM. Exposes window.PlannerAdapter. Consumed by planner.js (the
 * Planner tabs). Reads the same host globals production.js uses at call time:
 *   - currentMapping        (column mappings, queries, settings)
 *   - lastResultRows        (the shared per-query row cache)
 * and the engine global window.PlannerEngine (bundled from planner/src/engine).
 *
 * DESIGN / locked decisions (see planner/INTEGRATION_PLAN.md):
 *  - Element-grain planning, aggregated to the order at its SLOWEST element
 *    (min Last_No) — matches Production's slowestNo / pressure logic.
 *  - Time model: keep working-days + Friday-of-DD-week deadline; the engine is
 *    fed working-hours (workingMsBetween along the Mon–Fri/holiday calendar);
 *    the deadline is ALSO surfaced as "{workingDays}d {hours}h" for display.
 *  - pcs = real piece count (pcsT): one frame = one piece, else count sashes.
 *
 * The constants/helpers below are an INTENTIONAL MIRROR of production.js
 * (FLOW table, working-day engine, COL_DEFAULTS). They are small and stable;
 * mirroring keeps the planner fully independent of the Production module
 * (delete either and the other still runs). Keep them in sync if production.js
 * changes the line model.
 */
(function () {
  'use strict';

  // ---- column defaults (mirror of production.js COL_DEFAULTS subset) --------
  const COL_DEFAULTS = {
    orderNo: 'orderNo', product: 'OrderProductFromOferty', prodWeek: 'DD-1',
    orderStatus: 'OrderStatus', statusDate: 'Date_OrderStatus',
    promisedDeliv: 'promisedDeliveryDate',
    keyFrame: 'key_Frame', keyElement: 'key_Element', fs: 'F/S',
    zakonczone: 'Zakonczone', lastNo: 'Last_No', lastScanData: 'LastScanData',
    lastProdStatus: 'LastPROD_Status', scanData: 'ScanData', scanNo: 'No',
    matP_promised: 'matP_confirmed', matP_actual: 'matP_actual',
    matF_promised: 'matF_confirmed', matF_actual: 'matF_actual',
    matA_promised: 'matA_confirmed', matA_actual: 'matA_actual',
    matG_promised: 'matG_confirmed', matG_actual: 'matG_actual',
    matR_promised: 'matR_confirmed', matR_actual: 'matR_actual',
    matD_promised: 'matD_confirmed', matD_actual: 'matD_actual',
    matO_promised: 'matO_confirmed', matO_actual: 'matO_actual',
    loading: 'Loading', dd: 'dd', termRe: 'termRe',
    // dest sources — not in production.js's map; read raw from the order-join row
    deliveryCity: 'deliveryCity', customerCode: 'customerCode',
  };
  const ORDER_GRAIN_VARS = new Set([
    'matP_promised','matP_actual','matF_promised','matF_actual',
    'matA_promised','matA_actual','matG_promised','matG_actual',
    'matR_promised','matR_actual','matD_promised','matD_actual',
    'matO_promised','matO_actual','loading','dd','termRe',
    'deliveryCity','customerCode',
  ]);
  const MATERIAL_LETTERS = ['P','F','A','G','R','D','O'];

  // ---- factory line (mirror of production.js FLOW) --------------------------
  const FLOW = {
    PVC: [
      { no:1,prodStatus:'1_PROFILES_READY',english:'MaterialPreparation' },
      { no:2,prodStatus:'2_CUTTING_PVC',english:'CuttingPVC' },
      { no:3,prodStatus:'3_CUTTING_STEEL',english:'CuttingSteel' },
      { no:4,prodStatus:'4_SCREWING',english:'Screwing' },
      { no:5,prodStatus:'4_SCREWING',english:'Mullions' },
      { no:6,prodStatus:'5_WELDING',english:'Welding' },
      { no:7,prodStatus:'6_FITTINGS_FRAME',english:'FittingsFrames' },
      { no:8,prodStatus:'6_FITTINGS_SASH',english:'InstMullionsSashes' },
      { no:9,prodStatus:'6_FITTINGS_SASH',english:'FittingsSashes' },
      { no:10,prodStatus:'7_PAIRING',english:'PairingFramesSashes' },
      { no:11,prodStatus:'8_FITTINGS_F_SpConstr',english:'Doors/SpElemFrames' },
      { no:12,prodStatus:'8_FITTINGS_S_SpConstr',english:'Doors/SpElemSashes' },
      { no:13,prodStatus:'9_PAIRING_SpConstr',english:'Doors/SpElemPairing' },
      { no:14,prodStatus:'10_RS',english:'RollerShutters' },
      { no:15,prodStatus:'11_GLAZING',english:'Glazing' },
      { no:16,prodStatus:'12_SPROSSEN',english:'SprossenInstallation' },
      { no:17,prodStatus:'13_QC',english:'QualityControl' },
      { no:18,prodStatus:'14_MG',english:'FinishedGoods' },
    ],
    ALU: [
      { no:2,prodStatus:'2_CUTTING_ALU',english:'CuttingALU' },
      { no:3,prodStatus:'3_CRIMPING_FRAME',english:'ALU_frameCrimping' },
      { no:4,prodStatus:'4_CRIMPING_SASH',english:'ALU_sashCrimping' },
      { no:5,prodStatus:'5_GASKET_FRAME',english:'ALU_frameGasket' },
      { no:6,prodStatus:'6_GASKET_SASH',english:'ALU_sashGasket' },
      { no:7,prodStatus:'7_FITTINGS_FRAME',english:'ALU_frameFittings' },
      { no:8,prodStatus:'8_FITTINGS_SASH',english:'ALU_sashFittings' },
      { no:9,prodStatus:'9_FITTINGS_F_SpConstr',english:'ALU_F_SpConstr' },
      { no:10,prodStatus:'10_FITTINGS_S_SpConstr',english:'ALU_S_SpConstr' },
      { no:11,prodStatus:'11_PAIRING',english:'ALU_doorsPairing' },
      { no:12,prodStatus:'14_MG',english:'FinishedGoods' },
    ],
  };
  const MAX_NO = { PVC: 0, ALU: 0 };
  const FLOW_BY_NO = { PVC: {}, ALU: {} };
  const PIPELINE = { PVC: [], ALU: [] };
  for (const p of ['PVC','ALU']) for (const s of FLOW[p]) {
    FLOW_BY_NO[p][s.no] = s; PIPELINE[p].push(s.no); if (s.no > MAX_NO[p]) MAX_NO[p] = s.no;
  }
  // Ordered distinct sections (PROD_Status) per product — the flow-grid rows.
  function sectionsFor(product){
    const seen = new Set(), list = [];
    for (const s of (FLOW[product]||[])) if (!seen.has(s.prodStatus)) {
      seen.add(s.prodStatus);
      list.push({ key:s.prodStatus, no:s.no, label:s.prodStatus.replace(/^\d+_/,'').replace(/_/g,' ') });
    }
    return list;
  }

  // ---- working-day engine (mirror of production.js) -------------------------
  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function isWorkingDay(d, hol){ const w=d.getDay(); if(w===0||w===6) return false; if(hol.has(ymd(d))) return false; return true; }
  function workingMsBetween(a, b, hol){
    if(!a||!b) return 0; let start=new Date(a), end=new Date(b); if(end<=start) return 0;
    let ms=0; const cur=new Date(start);
    while(cur<end){ const de=new Date(cur); de.setHours(23,59,59,999); const segEnd=(de<end)?de:end;
      if(isWorkingDay(cur,hol)) ms+=segEnd-cur; cur.setHours(24,0,0,0); }
    return ms;
  }
  function workingDaysBetween(a, b, hol){
    if(!a||!b) return 0; let start=new Date(a); start.setHours(0,0,0,0); let end=new Date(b); end.setHours(0,0,0,0);
    if(end<=start) return 0; let days=0; const cur=new Date(start);
    while(cur<end){ if(isWorkingDay(cur,hol)) days++; cur.setDate(cur.getDate()+1); }
    return days;
  }
  function parseDate(v){ if(v==null||v==='') return null; if(v instanceof Date) return isNaN(v)?null:v; const d=new Date(v); return isNaN(d)?null:d; }
  function fridayOfProdWeek(prodWeek){
    if(!prodWeek||!/^\d{2}_\d{2}$/.test(prodWeek)) return null;
    const [yy,ww]=prodWeek.split('_').map(Number); const year=2000+yy;
    const jan4=new Date(year,0,4); const jan4Dow=(jan4.getDay()+6)%7;
    const w1m=new Date(jan4); w1m.setDate(jan4.getDate()-jan4Dow);
    const monday=new Date(w1m); monday.setDate(w1m.getDate()+(ww-1)*7);
    const friday=new Date(monday); friday.setDate(monday.getDate()+4); friday.setHours(23,59,59,999);
    return friday;
  }
  const HOUR_MS = 3600000;

  // ---- host-config helpers --------------------------------------------------
  function holidaySet(){
    const h = (typeof currentMapping==='object' && currentMapping && currentMapping.production && Array.isArray(currentMapping.production.holidays))
      ? currentMapping.production.holidays : [];
    return new Set(h);
  }
  function vmProd(){ return (currentMapping && currentMapping.variableMappings && currentMapping.variableMappings.production) || {}; }
  function colFor(varName){ const u=vmProd()[varName]; if(u&&typeof u==='object'&&u.column) return u.column; return COL_DEFAULTS[varName]; }
  function roleOf(srcId){ const q=(currentMapping&&currentMapping.queries||[]).find(x=>x&&x.id===srcId); return q?q.role:null; }
  function spineId(){
    const queries=(currentMapping&&currentMapping.queries)||[];
    const keySrc=vmProd().keyElement&&vmProd().keyElement.source;
    if(keySrc&&roleOf(keySrc)==='spine') return keySrc;
    const sp=queries.find(q=>q&&q.role==='spine'); if(sp) return sp.id;
    if(queries.find(q=>q&&q.id==='sql_05')) return 'sql_05';
    return queries[0]?queries[0].id:null;
  }
  function orderJoinId(){
    const oj=((currentMapping&&currentMapping.queries)||[]).find(q=>q&&q.role==='order-join');
    return oj?oj.id:null;
  }

  // Working-hours from now until a date (>0 future). Negative => already past.
  function workHoursUntil(date, now, hol){
    if(!date) return null;
    if(date<=now) return -(workingMsBetween(date, now, hol)/HOUR_MS);
    return workingMsBetween(now, date, hol)/HOUR_MS;
  }

  // Deadline surfaced for display: whole working days + hours of the partial day.
  function deadlineParts(friday, now, hol){
    if(!friday) return { workingDays:null, hours:null, totalHours:null, overdue:false, label:'—' };
    if(friday<=now){
      const over=workingMsBetween(friday, now, hol)/HOUR_MS;
      return { workingDays:0, hours:0, totalHours:-over, overdue:true, label:'late' };
    }
    const wd=workingDaysBetween(now, friday, hol);
    // hours of the current partial working day (now → end of today, if a workday)
    const todayEnd=new Date(now); todayEnd.setHours(23,59,59,999);
    const hrs=Math.round(workingMsBetween(now, todayEnd<friday?todayEnd:friday, hol)/HOUR_MS);
    const total=workingMsBetween(now, friday, hol)/HOUR_MS;
    return { workingDays:wd, hours:hrs, totalHours:total, overdue:false,
             label: wd>0 ? (wd+'d'+(hrs?(' '+hrs+'h'):'')) : (hrs+'h') };
  }

  /**
   * Build engine-ready structures from the live cache.
   * @returns {{ ok, reason?, orders, elements, meta }}
   *   orders   — orchestrator rows: { id, dest, pcs, stage_index, stages_total,
   *              materials_in, loading_in, components[], product, prodWeek,
   *              deadline:{label,...}, slowestStation, elementCount, doneCount }
   *   elements — per-element rows (for L2/L3 later): { id, orderNo, product,
   *              stageIdx, stagesTotal, isDone, fs }
   */
  function build(opts){
    opts = opts || {};
    const now = opts.now ? new Date(opts.now) : new Date();
    const hol = holidaySet();
    if (typeof lastResultRows !== 'object' || !lastResultRows) return { ok:false, reason:'no-cache', orders:[], elements:[], meta:{} };

    const sp = spineId();
    const spineRows = (sp && lastResultRows[sp]) ? lastResultRows[sp] : [];
    if (!spineRows.length) return { ok:false, reason:'no-spine-rows', orders:[], elements:[], meta:{ spine:sp } };

    // resolve spine columns
    const cOrderNo = colFor('orderNo'), cKeyEl = colFor('keyElement'), cKeyFr = colFor('keyFrame');
    const cProduct = colFor('product'), cProdWeek = colFor('prodWeek'), cFs = colFor('fs');
    const cLastNo = colFor('lastNo'), cZ = colFor('zakonczone'), cLastPS = colFor('lastProdStatus');

    // order-join lookup (materials / loading / dest) by orderNo, first-wins
    const ojId = orderJoinId();
    const ojRows = (ojId && lastResultRows[ojId]) ? lastResultRows[ojId] : [];
    const ojByOrder = new Map();
    if (ojRows.length){
      const ojOrderCol = colFor('orderNo');
      for (const r of ojRows){ const k=r[ojOrderCol]; if(k==null||k==='') continue; const kk=String(k).trim(); if(!ojByOrder.has(kk)) ojByOrder.set(kk, r); }
    }
    const oget = (orderNo, varName) => { const r=ojByOrder.get(String(orderNo).trim()); return r ? r[colFor(varName)] : null; };

    // 1. collapse spine rows → elements (first row per key_Element holds element fields)
    const elemMap = new Map();
    for (const r of spineRows){
      const key = r[cKeyEl]; if (key==null||key==='') continue;
      if (elemMap.has(key)) continue;
      const product = (String(r[cProduct]).toUpperCase()==='ALU') ? 'ALU' : 'PVC';
      const lastRaw = r[cLastNo];
      const lastNo = (lastRaw==null||lastRaw==='') ? null : Number(lastRaw);
      const zak = String(r[cZ])==='1' || r[cZ]===1 || r[cZ]===true;
      elemMap.set(key, {
        key, orderNo: r[cOrderNo], product,
        prodWeek: r[cProdWeek]||null, keyFrame: r[cKeyFr]||null,
        fs: r[cFs]||'', lastNo,
        isDone: zak || (lastNo!=null && lastNo>=MAX_NO[product]),
      });
    }

    // 2. group elements → orders, aggregate at slowest
    const orderMap = new Map();
    for (const el of elemMap.values()){
      const on = el.orderNo; if (on==null||on==='') continue;
      let o = orderMap.get(on);
      if (!o){ o = { orderNo:on, product:el.product, prodWeek:el.prodWeek, elements:[] }; orderMap.set(on, o); }
      o.elements.push(el);
    }

    const orders = [];
    const elements = [];
    for (const o of orderMap.values()){
      const product = o.product;
      const maxNo = MAX_NO[product];
      // slowest = least-advanced element (null → 0), matches Production
      let slowest = Infinity;
      const pieceMap = new Map();
      for (const el of o.elements){
        const adv = (el.lastNo==null) ? 0 : el.lastNo;
        if (adv < slowest) slowest = adv;
        const pid = el.keyFrame || el.key;
        const pm = pieceMap.get(pid) || { total:0, done:0 };
        pm.total++; if (el.isDone) pm.done++; pieceMap.set(pid, pm);
        elements.push({ id:el.key, orderNo:o.orderNo, product, stageIdx:adv, stagesTotal:maxNo, isDone:el.isDone, fs:el.fs });
      }
      if (slowest===Infinity) slowest = 0;
      const pcsT = pieceMap.size;
      const doneCount = o.elements.filter(e=>e.isDone).length;

      // deadline from Friday of prod week (working-day model)
      const friday = fridayOfProdWeek(o.prodWeek);
      const dl = deadlineParts(friday, now, hol);
      const loading_in = (dl.totalHours==null) ? 9999 : dl.totalHours;

      // materials → engine components[] (eta_h = working-hours until promised,
      // only those not yet actual; actual present = not blocking)
      const components = [];
      for (const L of MATERIAL_LETTERS){
        const actual = parseDate(oget(o.orderNo, 'mat'+L+'_actual'));
        if (actual) continue;                 // arrived
        const promised = parseDate(oget(o.orderNo, 'mat'+L+'_promised'));
        if (!promised) continue;              // unknown → don't block
        const eta = workHoursUntil(promised, now, hol);
        if (eta!=null && eta>0) components.push({ kind:L, eta_h: Math.round(eta) });
      }

      const slowStation = FLOW_BY_NO[product][slowest>0?slowest:(FLOW[product][0]||{}).no] || null;
      orders.push({
        // --- engine contract (orchestrator) ---
        id: o.orderNo,
        dest: oget(o.orderNo,'deliveryCity') || oget(o.orderNo,'customerCode') || '—',
        pcs: pcsT,
        stage_index: slowest,
        stages_total: maxNo,
        materials_in: components.length ? Math.max(...components.map(c=>c.eta_h)) : 0,
        loading_in: Math.round(loading_in),
        components,
        // --- extras for the UI (ignored by the engine) ---
        product, prodWeek: o.prodWeek, deadline: dl,
        slowestNo: slowest, slowestStation: slowStation ? (slowest+' · '+slowStation.english) : '—',
        elementCount: o.elements.length, doneCount, pcsT,
      });
    }

    orders.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
    return { ok:true, orders, elements, meta:{ spine:sp, orderJoin:ojId, now } };
  }

  // Convenience: run the engine on the active product's orders.
  function orchestrateLive(product, opts){
    const E = window.PlannerEngine;
    if (!E || !E.orchestrate) return { ok:false, reason:'engine-missing' };
    const built = build(opts);
    if (!built.ok) return built;
    const rows = product ? built.orders.filter(o=>o.product===product) : built.orders;
    const result = E.orchestrate(rows);
    return { ok:true, result, built, rows };
  }

  /**
   * Real station×day flow grid from the scan trail.
   * Past columns = completed pieces per section per day (from sql_05 scan events:
   * a scan at station No means that element cleared No that day). "Queue now" =
   * current backlog per section (elements waiting to enter it). 100% live data;
   * no simulation. @returns { ok, product, sections, dayLabels, scans[][],
   * backlog[], doneTotal[], todayIdx }
   */
  function flowGrid(opts){
    opts = opts || {};
    const product = (opts.product === 'ALU') ? 'ALU' : 'PVC';
    const pastDays = opts.pastDays || 10;
    const now = opts.now ? new Date(opts.now) : new Date();
    const origin = new Date(now); origin.setHours(0,0,0,0); origin.setDate(origin.getDate() - (pastDays - 1));
    if (typeof lastResultRows !== 'object' || !lastResultRows) return { ok:false, reason:'no-cache' };
    const sp = spineId();
    const rows = (sp && lastResultRows[sp]) ? lastResultRows[sp] : [];
    if (!rows.length) return { ok:false, reason:'no-spine-rows' };

    const cKeyEl = colFor('keyElement'), cProduct = colFor('product'), cLastNo = colFor('lastNo');
    const cZ = colFor('zakonczone'), cScanNo = colFor('scanNo'), cScanData = colFor('scanData');

    const sections = sectionsFor(product);
    const secIdx = new Map(sections.map((s,i)=>[s.key,i]));
    const scans = sections.map(()=> new Array(pastDays).fill(0));
    const doneTotal = sections.map(()=>0);
    const backlog = sections.map(()=>0);
    const pipe = PIPELINE[product];
    const seen = new Set();

    for (const r of rows){
      if (((String(r[cProduct]).toUpperCase()==='ALU')?'ALU':'PVC') !== product) continue;
      // scans: completed-per-section/day (every row that is a scan event)
      const noRaw = r[cScanNo];
      const no = (noRaw==null||noRaw==='') ? null : Number(noRaw);
      const sd = parseDate(r[cScanData]);
      if (no!=null && sd){
        const st = FLOW_BY_NO[product][no];
        if (st){
          const si = secIdx.get(st.prodStatus);
          if (si!=null){
            doneTotal[si]++;
            const dayIdx = Math.floor((new Date(sd.getFullYear(),sd.getMonth(),sd.getDate()) - origin)/86400000);
            if (dayIdx>=0 && dayIdx<pastDays) scans[si][dayIdx]++;
          }
        }
      }
      // backlog: one count per element (first row), by the section it waits to enter
      const key = r[cKeyEl]; if (key==null||key==='' || seen.has(key)) continue; seen.add(key);
      const lastRaw = r[cLastNo];
      const lastNo = (lastRaw==null||lastRaw==='') ? null : Number(lastRaw);
      const zak = String(r[cZ])==='1' || r[cZ]===1 || r[cZ]===true;
      const isDone = zak || (lastNo!=null && lastNo>=MAX_NO[product]);
      if (isDone) continue;
      let queueNo;
      if (lastNo==null) queueNo = pipe[0];
      else { const ix = pipe.indexOf(lastNo); queueNo = (ix>=0 && ix+1<pipe.length) ? pipe[ix+1] : null; }
      if (queueNo==null) continue;
      const st = FLOW_BY_NO[product][queueNo];
      const si = st ? secIdx.get(st.prodStatus) : null;
      if (si!=null) backlog[si]++;
    }

    const dayLabels = [];
    for (let i=0;i<pastDays;i++){ const d=new Date(origin); d.setDate(origin.getDate()+i); dayLabels.push(String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')); }
    return { ok:true, product, sections, dayLabels, scans, backlog, doneTotal, todayIdx: pastDays-1 };
  }

  /**
   * Learning / calibration stats from the scan trail (Layer 4, real-data view).
   * Per section: observed throughput (pieces/day), observed avg scan-to-scan dwell
   * (hours), current backlog, and days-to-clear at the observed pace. The section
   * with the most days-to-clear (and backlog) is the forecast bottleneck.
   * @returns { ok, product, rows:[{key,label,throughputPerDay,avgDwellH,backlog,daysToClear}], bottleneck }
   */
  function learningStats(opts){
    opts = opts || {};
    const product = (opts.product === 'ALU') ? 'ALU' : 'PVC';
    const pastDays = opts.pastDays || 20;
    const now = opts.now ? new Date(opts.now) : new Date();
    const windowStart = new Date(now); windowStart.setDate(now.getDate() - pastDays);
    if (typeof lastResultRows !== 'object' || !lastResultRows) return { ok:false, reason:'no-cache' };
    const sp = spineId();
    const rows = (sp && lastResultRows[sp]) ? lastResultRows[sp] : [];
    if (!rows.length) return { ok:false, reason:'no-spine-rows' };

    const cKeyEl = colFor('keyElement'), cProduct = colFor('product'), cLastNo = colFor('lastNo');
    const cZ = colFor('zakonczone'), cScanNo = colFor('scanNo'), cScanData = colFor('scanData');
    const sections = sectionsFor(product);
    const secIdx = new Map(sections.map((s,i)=>[s.key,i]));
    const completed = sections.map(()=>0), dwellSum = sections.map(()=>0), dwellN = sections.map(()=>0), backlog = sections.map(()=>0);
    const pipe = PIPELINE[product];

    // collect per-element scan trails + position
    const elems = new Map();
    for (const r of rows){
      if (((String(r[cProduct]).toUpperCase()==='ALU')?'ALU':'PVC') !== product) continue;
      const key = r[cKeyEl]; if (key==null||key==='') continue;
      let e = elems.get(key);
      if (!e){ const lr=r[cLastNo]; e = { lastNo:(lr==null||lr==='')?null:Number(lr), zak:(String(r[cZ])==='1'||r[cZ]===1||r[cZ]===true), scans:[] }; elems.set(key, e); }
      const noRaw=r[cScanNo], no=(noRaw==null||noRaw==='')?null:Number(noRaw); const sd=parseDate(r[cScanData]);
      if (no!=null && sd) e.scans.push({ no, t:sd });
    }
    for (const e of elems.values()){
      e.scans.sort((a,b)=>a.t-b.t);
      for (let i=0;i<e.scans.length;i++){
        const cur=e.scans[i]; const st=FLOW_BY_NO[product][cur.no]; if(!st) continue;
        const si=secIdx.get(st.prodStatus); if(si==null) continue;
        if (cur.t>=windowStart){ completed[si]++; }
        if (i>0){ const dh=(cur.t-e.scans[i-1].t)/HOUR_MS; if (dh>0 && dh<24*30){ dwellSum[si]+=dh; dwellN[si]++; } }
      }
      // backlog (not-done) by section it waits to enter
      const isDone = e.zak || (e.lastNo!=null && e.lastNo>=MAX_NO[product]);
      if (isDone) continue;
      let q; if (e.lastNo==null) q=pipe[0]; else { const ix=pipe.indexOf(e.lastNo); q=(ix>=0&&ix+1<pipe.length)?pipe[ix+1]:null; }
      if (q==null) continue; const st=FLOW_BY_NO[product][q]; const si=st?secIdx.get(st.prodStatus):null;
      if (si!=null) backlog[si]++;
    }

    const out = sections.map((s,i)=>{
      const thr = completed[i]/pastDays;
      const avgD = dwellN[i] ? dwellSum[i]/dwellN[i] : null;
      const dtc = backlog[i] > 0 ? (thr>0 ? backlog[i]/thr : Infinity) : 0;
      return { key:s.key, label:s.label, throughputPerDay:+thr.toFixed(2), avgDwellH: avgD==null?null:+avgD.toFixed(1), backlog:backlog[i], daysToClear: isFinite(dtc)?+dtc.toFixed(1):Infinity };
    });
    let bottleneck = null;
    for (const r of out){ if (r.backlog>0 && (bottleneck==null || r.daysToClear>bottleneck.daysToClear)) bottleneck=r; }
    return { ok:true, product, pastDays, rows:out, bottleneck };
  }

  // Self-test against the engine's regression baseline (no live data needed).
  function __baseline(){
    const E = window.PlannerEngine; if(!E) return 'engine-missing';
    const rows=[
      {id:'O24-501',dest:'Lyon',pcs:32,stage_index:4,stages_total:5,materials_in:-10,loading_in:6},
      {id:'O24-502',dest:'Lyon',pcs:28,stage_index:2,stages_total:5,materials_in:-5,loading_in:6},
      {id:'O24-503',dest:'Lyon',pcs:24,stage_index:1,stages_total:5,materials_in:-2,loading_in:6},
      {id:'O24-530',dest:'Paris',pcs:40,stage_index:3,stages_total:5,materials_in:-3,loading_in:10},
      {id:'O24-531',dest:'Paris',pcs:22,stage_index:0,stages_total:5,materials_in:4,loading_in:10},
      {id:'O24-540',dest:'Marseille',pcs:18,stage_index:2,stages_total:5,materials_in:-8,loading_in:2},
    ];
    return E.orchestrate(rows).kpis;
  }

  window.PlannerAdapter = {
    build, orchestrateLive, flowGrid, learningStats, deadlineParts, fridayOfProdWeek,
    FLOW, FLOW_BY_NO, MAX_NO, PIPELINE, MATERIAL_LETTERS, sectionsFor, __baseline,
  };
})();
