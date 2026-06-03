/* ===========================================================================
 * production.js — Production view module (Phase 5.17)
 *
 * SELF-CONTAINED. The host (app.js) calls only:
 *     window.Production.init()      once at boot
 *     window.Production.onShow()    when the Production screen opens
 *
 * Reads from host globals (shared <script> scope, NOT ES modules):
 *     currentMapping          - for queries[sql_05].sql, statusMapping (read), production settings
 *     lastResultRows          - cache of query rows (we also write sql_05 here, harmless)
 *     getConnectionConfig()   - connection for runQuery
 *     scheduleAutoSave()      - persist currentMapping.production
 *     escapeHTML / escapeAttr - shared helpers
 *     window.sqlAPI.runQuery  - fetch
 *
 * Writes only: currentMapping.production (own settings) + its own DOM.
 * Never touches lastOrders, Orders DOM, variableMappings, etc.
 * =========================================================================== */
(function () {
  'use strict';

  // ====== COLUMN RESOLUTION (Phase 5.19) ===================================
  // The hardcoded defaults below are the FALLBACK. Actual lookup at runtime
  // goes through getCol(varName), which prefers the user's mapping in
  //   currentMapping.variableMappings.production[varName].column
  // and falls back to COL_DEFAULTS otherwise.
  //
  // On first refresh after install/upgrade, seedProductionDefaults() writes
  // these defaults into currentMapping.variableMappings.production so the
  // Mapping → Variable mapping → Production sub-tab shows pre-filled rows.
  const COL_DEFAULTS = {
    orderNo:        'orderNo',
    product:        'OrderProductFromOferty',
    prodWeek:       'DD-1',
    orderStatus:    'OrderStatus',
    statusDate:     'Date_OrderStatus',
    promisedDeliv:  'promisedDeliveryDate',
    srcdoc:         'Srcdoc',
    pos:            'Pos',
    oscRaw:         'OscRaw',
    osc:            'Osc',
    skr:            'Skr',
    piece:          'Piece',
    keyFrame:       'key_Frame',
    keyElement:     'key_Element',
    fs:             'F/S',
    optym:          'Optym',
    zakonczone:     'Zakonczone',
    color:          'Color',
    frameW:         'FrameWidth',
    frameH:         'FrameHeight',
    sashW:          'SashWidth',
    sashH:          'SashHeight',
    termRealizacjiOferty: 'TermRealizacji_oferty',
    whnetZleceniaIndeks:  'WHNet_Zlecenia_Indeks',
    optymalizacja:        'Optymalizacja',
    typ:                  'Typ',
    idxTypu:              'Idx_typu',
    iloscJedn:            'IloscJedn',
    iloscJednPoz:         'IloscJednPoz',
    liczbaSzklen:         'LiczbaSzklen',
    lastStanowisko:       'LastStanowisko',
    lastStanowiskoOpis:   'LastStanowiskoOpis',
    lastNo:               'Last_No',
    lastScanData:         'LastScanData',
    lastProdStatus:       'LastPROD_Status',
    lastEnglish:          'LastEnglishTranslation',
    lastNextStep:         'LastWorkStationNextStep',
    stanowiskoPoprzednie: 'StanowiskoPoprzednie',
    firstStanowisko:      'FirstStanowisko',
    dataWejscia:          'DataWejscia',
    dataZakonczenia:      'DataZakonczenia',
    terminRealizacji:     'TerminRealizacji',
    paczka:               'Paczka',
    scanData:           'ScanData',
    scanStanowisko:     'ScanStanowisko',
    scanStanowiskoOpis: 'ScanStanowiskoOpis',
    scanNo:             'No',
    scanProdStatus:     'PROD_Status',
    scanEnglish:        'EnglishTranslation',
    scanNextStep:       'WorkStationNextStep',
    unmappedCount:            'UnmappedScanCountForElement',
    unmappedScans:            'UnmappedScansForElement',
    elementMatchStatus:       'ElementMatchStatus',
    scanMatchStatus:          'ScanMatchStatus',
    workstationMappingStatus: 'WorkstationMappingStatus',

    // Phase 5.30 (S3): order-grain fields pulled from the order-join query
    // (sql_01) by orderNo. Materials use the *confirmed* date as the chip
    // "promised" slot and *actual* as delivered. matX_orderNo (PO number) is
    // intentionally NOT mapped — it is not used by the chip logic.
    matP_promised: 'matP_confirmed',  matP_actual: 'matP_actual',
    matF_promised: 'matF_confirmed',  matF_actual: 'matF_actual',
    matA_promised: 'matA_confirmed',  matA_actual: 'matA_actual',
    matG_promised: 'matG_confirmed',  matG_actual: 'matG_actual',
    matR_promised: 'matR_confirmed',  matR_actual: 'matR_actual',
    matD_promised: 'matD_confirmed',  matD_actual: 'matD_actual',
    matO_promised: 'matO_confirmed',  matO_actual: 'matO_actual',
    loading:       'Loading',
    dd:            'dd',
    termRe:        'termRe',
  };

  // Phase 5.30 (S3): which COL_DEFAULTS vars are order-grain (join from the
  // order-join query, not the element spine). Used by by-role auto-seed.
  const ORDER_GRAIN_VARS = new Set([
    'matP_promised','matP_actual','matF_promised','matF_actual',
    'matA_promised','matA_actual','matG_promised','matG_actual',
    'matR_promised','matR_actual','matD_promised','matD_actual',
    'matO_promised','matO_actual','loading','dd','termRe',
  ]);
  const MATERIAL_LETTERS = ['P','F','A','G','R','D','O'];

  // Runtime column lookup. User mapping wins; defaults fall back.
  function getCol(varName) {
    const userVm = currentMapping?.variableMappings?.production?.[varName];
    if (userVm && typeof userVm === 'object' && userVm.column) return userVm.column;
    return COL_DEFAULTS[varName];
  }

  // Phase 5.29 (S2): the source query id a production variable reads from.
  // User mapping wins; falls back to the spine id so single-source installs
  // (everything on sql_05) keep working unchanged.
  function getVarSource(varName) {
    const userVm = currentMapping?.variableMappings?.production?.[varName];
    if (userVm && typeof userVm === 'object' && userVm.source) return userVm.source;
    return spineId();
  }

  // Resolve all column names once per refresh into a flat object for buildModel.
  function resolveCols() {
    const col = {};
    for (const k of Object.keys(COL_DEFAULTS)) col[k] = getCol(k);
    return col;
  }

  // Phase 5.29 (S2): resolve per-variable { column, source } once per build.
  function resolveColsAndSources() {
    const map = {};
    const sp = spineId();
    for (const k of Object.keys(COL_DEFAULTS)) {
      map[k] = { column: getCol(k), source: getVarSource(k) };
    }
    map.__spine__ = sp;
    return map;
  }

  // ---- Query role helpers (Production multi-query engine) -------------------
  function queryById(id) {
    return (currentMapping?.queries || []).find(q => q && q.id === id) || null;
  }
  function roleOf(id) {
    const q = queryById(id);
    return q ? (q.role || null) : null;
  }
  // The element-grain spine: the query the core element key reads from when it
  // is tagged spine; else the first query with role 'spine'; else legacy sql_05.
  function spineId() {
    const queries = currentMapping?.queries || [];
    // 1. Honor an explicit spine assigned to the keyElement variable's source.
    const keySrc = currentMapping?.variableMappings?.production?.keyElement?.source;
    if (keySrc && roleOf(keySrc) === 'spine') return keySrc;
    // 2. First query tagged spine.
    const sp = queries.find(q => q && q.role === 'spine');
    if (sp) return sp.id;
    // 3. Legacy fallback.
    if (queryById(QUERY_ID)) return QUERY_ID;
    return queries[0] ? queries[0].id : null;
  }

  // Phase 5.30 (S3): the order-join query id (the single query tagged
  // 'order-join'), or null if none. Materials/loading seed their source here.
  function orderJoinId() {
    const queries = currentMapping?.queries || [];
    const oj = queries.find(q => q && q.role === 'order-join');
    return oj ? oj.id : null;
  }

  // Auto-seed the Production variable mapping namespace on first use. If a
  // variable is already user-set we leave it alone. Operates on currentMapping
  // directly; relies on the host's scheduleAutoSave to persist.
  function seedProductionDefaults() {
    if (!currentMapping) return;
    if (!currentMapping.variableMappings) currentMapping.variableMappings = { orders: {}, production: {} };
    if (!currentMapping.variableMappings.production) currentMapping.variableMappings.production = {};
    const vm = currentMapping.variableMappings.production;
    const spineSource = spineId();
    const orderSource = orderJoinId();      // by role; null if no order-join query yet
    let changed = false;
    for (const [varName, colName] of Object.entries(COL_DEFAULTS)) {
      if (!vm[varName] || (!vm[varName].source && !vm[varName].column)) {
        // Order-grain vars (materials, loading) seed to the order-join query
        // resolved by role — NOT a hardcoded id. If none exists yet, leave the
        // source null (chips render empty until an order-join query is added).
        const src = ORDER_GRAIN_VARS.has(varName) ? orderSource : spineSource;
        vm[varName] = { source: src, column: colName, auto: true };
        changed = true;
      }
    }
    if (changed && typeof scheduleAutoSave === 'function') scheduleAutoSave();
  }


  const QUERY_ID = 'sql_05';


  // ====== WORKSTATION FLOW TABLE (client copy) ==============================
  // Reduced to distinct (product, No) → section metadata. Mirrors the SQL
  // VALUES list. Drives queue section + max station + chip colors.
  // sortKey is the leading integer of PROD_Status for ordering sections.
  const FLOW = {
    PVC: [
      { no: 1,  prodStatus: '1_PROFILES_READY',     english: 'MaterialPreparation' },
      { no: 2,  prodStatus: '2_CUTTING_PVC',        english: 'CuttingPVC' },
      { no: 3,  prodStatus: '3_CUTTING_STEEL',      english: 'CuttingSteel' },
      { no: 4,  prodStatus: '4_SCREWING',           english: 'Screwing' },
      { no: 5,  prodStatus: '4_SCREWING',           english: 'Mullions' },
      { no: 6,  prodStatus: '5_WELDING',            english: 'Welding' },
      { no: 7,  prodStatus: '6_FITTINGS_FRAME',     english: 'FittingsFrames' },
      { no: 8,  prodStatus: '6_FITTINGS_SASH',      english: 'InstMullionsSashes' },
      { no: 9,  prodStatus: '6_FITTINGS_SASH',      english: 'FittingsSashes' },
      { no: 10, prodStatus: '7_PAIRING',            english: 'PairingFramesSashes' },
      { no: 11, prodStatus: '8_FITTINGS_F_SpConstr',english: 'Doors/SpElemFrames' },
      { no: 12, prodStatus: '8_FITTINGS_S_SpConstr',english: 'Doors/SpElemSashes' },
      { no: 13, prodStatus: '9_PAIRING_SpConstr',   english: 'Doors/SpElemPairing' },
      { no: 14, prodStatus: '10_RS',                english: 'RollerShutters' },
      { no: 15, prodStatus: '11_GLAZING',           english: 'Glazing' },
      { no: 16, prodStatus: '12_SPROSSEN',          english: 'SprossenInstallation' },
      { no: 17, prodStatus: '13_QC',                english: 'QualityControl' },
      { no: 18, prodStatus: '14_MG',                english: 'FinishedGoods' },
    ],
    ALU: [
      { no: 2,  prodStatus: '2_CUTTING_ALU',        english: 'CuttingALU' },
      { no: 3,  prodStatus: '3_CRIMPING_FRAME',     english: 'ALU_frameCrimping' },
      { no: 4,  prodStatus: '4_CRIMPING_SASH',      english: 'ALU_sashCrimping' },
      { no: 5,  prodStatus: '5_GASKET_FRAME',       english: 'ALU_frameGasket' },
      { no: 6,  prodStatus: '6_GASKET_SASH',        english: 'ALU_sashGasket' },
      { no: 7,  prodStatus: '7_FITTINGS_FRAME',     english: 'ALU_frameFittings' },
      { no: 8,  prodStatus: '8_FITTINGS_SASH',      english: 'ALU_sashFittings' },
      { no: 9,  prodStatus: '9_FITTINGS_F_SpConstr',english: 'ALU_F_SpConstr' },
      { no: 10, prodStatus: '10_FITTINGS_S_SpConstr',english: 'ALU_S_SpConstr' },
      { no: 11, prodStatus: '11_PAIRING',           english: 'ALU_doorsPairing' },
      { no: 12, prodStatus: '14_MG',                english: 'FinishedGoods' },
    ],
  };

  // Build lookup helpers from FLOW
  const FLOW_BY_NO = { PVC: {}, ALU: {} };
  const MAX_NO = { PVC: 0, ALU: 0 };
  for (const product of ['PVC', 'ALU']) {
    for (const s of FLOW[product]) {
      FLOW_BY_NO[product][s.no] = s;
      if (s.no > MAX_NO[product]) MAX_NO[product] = s.no;
    }
  }
  // Ordered distinct No list per product (the pipeline strip)
  const PIPELINE = {
    PVC: FLOW.PVC.map(s => s.no),
    ALU: FLOW.ALU.map(s => s.no),
  };

  // Section sort key = leading integer of prodStatus
  function sectionSortKey(prodStatus) {
    const m = /^(\d+)/.exec(prodStatus || '');
    return m ? Number(m[1]) : 999;
  }

  // ====== PHASE COLOR PALETTE ===============================================
  // Color a chip / section by the leading phase number of its PROD_Status.
  const PHASE_COLORS = {
    1:  '#dbe7ff', 2:  '#cfe0f5', 3:  '#e8def9', 4:  '#ffe8c2',
    5:  '#ffe0b0', 6:  '#d4f0df', 7:  '#cdeede', 8:  '#cfe7f7',
    9:  '#e3d4f5', 10: '#f5d4e0', 11: '#d4ecf5', 12: '#f0e0c0',
    13: '#fcd8cc', 14: '#cfeede',
  };
  function phaseColor(prodStatus) {
    return PHASE_COLORS[sectionSortKey(prodStatus)] || '#eeeeee';
  }

  // ====== MODULE STATE ======================================================
  let activeProduct = 'PVC';
  let activeView = 'order';            // order | element | section
  let model = null;                    // { orders, elements, sections } per product, built on refresh
  let lastFetchAt = null;
  let wired = false;
  let elementOnlyStuck = false;        // "show only stuck" toggle in By element

  // ====== SETTINGS (currentMapping.production) ==============================
  function settings() {
    if (!currentMapping) return { stuckThresholdPVC: 1, stuckThresholdALU: 1, holidays: [] };
    if (!currentMapping.production) {
      currentMapping.production = { stuckThresholdPVC: 1, stuckThresholdALU: 1, holidays: [] };
    }
    const p = currentMapping.production;
    if (typeof p.stuckThresholdPVC !== 'number') p.stuckThresholdPVC = 1;
    if (typeof p.stuckThresholdALU !== 'number') p.stuckThresholdALU = 1;
    if (!Array.isArray(p.holidays)) p.holidays = [];
    return p;
  }

  // ====== WORKING-DAY ENGINE ================================================
  function holidaySet() {
    return new Set(settings().holidays || []);
  }
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function isWorkingDay(d, hol) {
    const dow = d.getDay();           // 0 Sun .. 6 Sat
    if (dow === 0 || dow === 6) return false;
    if (hol.has(ymd(d))) return false;
    return true;
  }
  // Working milliseconds between two datetimes (only Mon–Fri non-holiday time).
  function workingMsBetween(a, b, hol) {
    if (!a || !b) return 0;
    let start = new Date(a), end = new Date(b);
    if (end <= start) return 0;
    let ms = 0;
    const cur = new Date(start);
    while (cur < end) {
      // end of current day
      const dayEnd = new Date(cur); dayEnd.setHours(23, 59, 59, 999);
      const segEnd = (dayEnd < end) ? dayEnd : end;
      if (isWorkingDay(cur, hol)) {
        ms += segEnd - cur;
      }
      // jump to next midnight
      cur.setHours(24, 0, 0, 0);
    }
    return ms;
  }
  // Whole working days between two dates (date-level, for deadline countdown).
  function workingDaysBetween(a, b, hol) {
    if (!a || !b) return 0;
    let start = new Date(a); start.setHours(0, 0, 0, 0);
    let end = new Date(b);   end.setHours(0, 0, 0, 0);
    if (end <= start) return 0;
    let days = 0;
    const cur = new Date(start);
    while (cur < end) {
      if (isWorkingDay(cur, hol)) days++;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }
  const MS_PER_WORKDAY = 8 * 60 * 60 * 1000;  // treat a "working day" threshold as 8h of working time
  // NOTE: stuck threshold is in working DAYS; we convert to ms using a 24h
  // wall day of working time is awkward. Simpler + matches intuition: measure
  // stuck in CALENDAR working days elapsed. We compute working days between
  // stuckFrom and now, and compare to the threshold integer.

  // ====== DATE PARSING ======================================================
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function fmtDM(d) {
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // ISO week Friday for a 'yy_ww' prod week label.
  function fridayOfProdWeek(prodWeek) {
    if (!prodWeek || !/^\d{2}_\d{2}$/.test(prodWeek)) return null;
    const [yy, ww] = prodWeek.split('_').map(Number);
    const year = 2000 + yy;
    // ISO week: week 1 contains Jan 4. Find Monday of ISO week ww.
    const jan4 = new Date(year, 0, 4);
    const jan4Dow = (jan4.getDay() + 6) % 7;        // 0=Mon
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Dow);
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (ww - 1) * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);
    return friday;
  }

  // ====== STATUS-TAG COLOR (optional read-only tie to Status mapping) =======
  function getBucketColorForStatus(orderStatus) {
    try {
      const buckets = currentMapping?.statusMapping?.buckets;
      if (!Array.isArray(buckets) || !orderStatus) return null;
      const lower = String(orderStatus).trim().toLowerCase();
      for (const b of buckets) {
        if (b.erpValue && String(b.erpValue).trim().toLowerCase() === lower) return b.color || null;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ====== MATERIALS CHIPS (S3) ==============================================
  // Mirror of the Orders-screen chip logic, fed by the element's order-join
  // materials object. For each of the 7 letters:
  //   actual present                  -> delivered    e.g. Px
  //   promised(=confirmed), no actual:
  //       promised >= today           -> ordered      e.g. F20 (ISO week)
  //       promised <  today           -> overdue       e.g. F!
  //   neither                         -> blank          e.g. A_
  function isoWeekNum(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }
  function materialLetterChips(elm) {
    const now = new Date();
    const m = elm.materials || {};
    return MATERIAL_LETTERS.map(L => {
      const cell = m[L] || {};
      const promised = cell.promised, actual = cell.actual;
      if (actual) return { code: L + 'x', cls: 'x' };
      if (promised) {
        const pd = (promised instanceof Date) ? promised : new Date(promised);
        if (!isNaN(pd.getTime())) {
          if (pd >= now) return { code: L + String(isoWeekNum(pd)).padStart(2, '0'), cls: 'wk' };
          return { code: L + '!', cls: 'miss' };
        }
      }
      return { code: L + '_', cls: 'blank' };
    });
  }
  function materialDateChips(elm) {
    const m = elm.materials || {};
    return MATERIAL_LETTERS.map(L => {
      const cell = m[L] || {};
      const promised = cell.promised, actual = cell.actual;
      if (!promised && !actual) return { cls: 'blank', label: '—' };
      if (actual) {
        const ad = new Date(actual);
        const pd = promised ? new Date(promised) : null;
        if (pd && !isNaN(pd.getTime()) && !isNaN(ad.getTime()) && ad > pd) return { cls: 'overdue', label: fmtDM(ad) };
        return { cls: 'delivered', label: isNaN(ad.getTime()) ? '—' : fmtDM(ad) };
      }
      const pd = new Date(promised);
      if (!isNaN(pd.getTime())) return { cls: 'promised', label: fmtDM(pd) };
      return { cls: 'blank', label: '—' };
    });
  }
  function matLettersHTML(elm) {
    return `<span class="prod-mat">${materialLetterChips(elm).map(c =>
      `<span class="${c.cls}">${escapeHTML(c.code)}</span>`).join('')}</span>`;
  }
  function matDatesHTML(elm) {
    return `<span class="prod-mat-dates">${materialDateChips(elm).map(c =>
      `<span class="${c.cls}">${escapeHTML(c.label)}</span>`).join('')}</span>`;
  }
  function loadingHTML(elm) {
    return elm.loading
      ? `<span class="prod-loading">${escapeHTML(String(elm.loading))}</span>`
      : `<span class="prod-empty">—</span>`;
  }
  // An order's materials/loading = those of any of its elements (order-grain,
  // identical across the order). Use the first element.
  function orderProxyElement(o) { return (o.elements && o.elements[0]) || { materials: {}, loading: '' }; }


  // ====== DATA MODEL: collapse rows → Elements → Orders → Sections =========
  function buildModel(rows) {
    const hol = holidaySet();
    const now = new Date();
    const cs = resolveColsAndSources();   // Phase 5.29: per-var {column, source}
    const sp = cs.__spine__;

    // --- Phase 5.29 (S2): build join lookups for non-spine sources ----------
    // Any production variable whose source ≠ spine is a join. We index that
    // source's cached rows by its join key (orderNo for order-join, keyElement
    // for element-join), first-wins. The orderNo / keyElement columns used for
    // indexing a join source are that source's own mapped columns where set,
    // else the spine's column names (a reasonable default).
    const joinRoles = {};   // source id -> 'order-join' | 'element-join'
    const joinSources = new Set();
    for (const k of Object.keys(COL_DEFAULTS)) {
      const src = cs[k].source;
      if (src && src !== sp) joinSources.add(src);
    }
    const orderLookup = new Map();    // source id -> Map(orderNo -> row)
    const elemLookup = new Map();     // source id -> Map(keyElement -> row)
    for (const src of joinSources) {
      const role = roleOf(src) || 'order-join';   // default order-join if untagged
      joinRoles[src] = role;
      const srcRows = (typeof lastResultRows === 'object' && lastResultRows[src]) ? lastResultRows[src] : [];
      if (role === 'element-join') {
        const m = new Map();
        const kc = cs.keyElement.column;
        for (const rr of srcRows) {
          const kk = rr[kc];
          if (kk == null || kk === '') continue;
          if (!m.has(kk)) m.set(kk, rr);   // first-wins
        }
        elemLookup.set(src, m);
      } else {
        const m = new Map();
        const oc = cs.orderNo.column;
        for (const rr of srcRows) {
          const ok = rr[oc];
          if (ok == null || ok === '') continue;
          const key = String(ok).trim();
          if (!m.has(key)) m.set(key, rr);   // first-wins
        }
        orderLookup.set(src, m);
      }
    }

    // Field accessor: read variable `vn` for a given spine row `r`.
    // spine var → r[column]; order-join → orderLookup by r's orderNo;
    // element-join → elemLookup by r's keyElement.
    const spineOrderCol = cs.orderNo.column;
    const spineKeyCol = cs.keyElement.column;
    function f(r, vn) {
      const spec = cs[vn];
      if (!spec) return undefined;
      const src = spec.source;
      if (!src || src === sp) return r[spec.column];
      if (joinRoles[src] === 'element-join') {
        const m = elemLookup.get(src);
        const jr = m ? m.get(r[spineKeyCol]) : null;
        return jr ? jr[spec.column] : null;
      }
      // order-join
      const m = orderLookup.get(src);
      const ok = r[spineOrderCol];
      const jr = (m && ok != null) ? m.get(String(ok).trim()) : null;
      return jr ? jr[spec.column] : null;
    }

    // --- 1. group rows by key_Element ---
    const elementMap = new Map();
    for (const r of rows) {
      const key = f(r, 'keyElement');
      if (!key) continue;                       // skip orders with no WHNet element
      let el = elementMap.get(key);
      if (!el) {
        const product = f(r, 'product') || 'PVC';
        const lastNoRaw = f(r, 'lastNo');
        const lastNo = (lastNoRaw == null || lastNoRaw === '') ? null : Number(lastNoRaw);
        el = {
          key,
          keyFrame: f(r, 'keyFrame') || null,
          orderNo: f(r, 'orderNo'),
          product,
          prodWeek: f(r, 'prodWeek') || null,
          orderStatus: f(r, 'orderStatus') || '',
          statusDate: parseDate(f(r, 'statusDate')),
          promisedDeliv: f(r, 'promisedDeliv') || null,
          fs: f(r, 'fs') || '',
          color: f(r, 'color') || '',
          dims: buildDims(r, f, f(r, 'fs') || ''),
          optym: f(r, 'optym') || '',
          zakonczone: String(f(r, 'zakonczone')) === '1' || f(r, 'zakonczone') === 1 || f(r, 'zakonczone') === true,
          lastNo,
          lastScanData: parseDate(f(r, 'lastScanData')),
          lastStationName: f(r, 'lastEnglish') || '',
          lastProdStatus: f(r, 'lastProdStatus') || '',
          lastNextStep: f(r, 'lastNextStep') || '',
          scansByNo: new Map(),                 // no → earliest ScanData
          unmappedCount: Number(f(r, 'unmappedCount') || 0),
          _row: r,                              // keep spine row for late field reads
          // Phase 5.30 (S3): order-grain materials (confirmed→promised slot,
          // actual→delivered) + loading, resolved via order-join by orderNo.
          materials: {
            P: { promised: f(r, 'matP_promised'), actual: f(r, 'matP_actual') },
            F: { promised: f(r, 'matF_promised'), actual: f(r, 'matF_actual') },
            A: { promised: f(r, 'matA_promised'), actual: f(r, 'matA_actual') },
            G: { promised: f(r, 'matG_promised'), actual: f(r, 'matG_actual') },
            R: { promised: f(r, 'matR_promised'), actual: f(r, 'matR_actual') },
            D: { promised: f(r, 'matD_promised'), actual: f(r, 'matD_actual') },
            O: { promised: f(r, 'matO_promised'), actual: f(r, 'matO_actual') },
          },
          loading: f(r, 'loading') || '',
          ddDate: f(r, 'dd') || '',
          termReDate: f(r, 'termRe') || '',
        };
        elementMap.set(key, el);
      }
      // accumulate this row's scan into scansByNo (keep earliest date per No)
      const scanNoRaw = f(r, 'scanNo');
      const scanNo = (scanNoRaw == null || scanNoRaw === '') ? null : Number(scanNoRaw);
      const scanDate = parseDate(f(r, 'scanData'));
      if (scanNo != null && scanDate) {
        const prev = el.scansByNo.get(scanNo);
        if (!prev || scanDate < prev) el.scansByNo.set(scanNo, scanDate);
      }
    }

    // --- 2. finalize each element: scan trail, queueNo, stuck ---
    const elements = [];
    for (const el of elementMap.values()) {
      const product = (el.product === 'ALU') ? 'ALU' : 'PVC';
      el.product = product;

      // scan trail sorted by No
      el.scans = [...el.scansByNo.entries()]
        .map(([no, data]) => ({ no, data, prodStatus: FLOW_BY_NO[product][no]?.prodStatus || '' }))
        .sort((a, b) => a.no - b.no);
      delete el.scansByNo;

      const maxNo = MAX_NO[product];
      const isDone = el.zakonczone || (el.lastNo != null && el.lastNo >= maxNo);
      el.isDone = isDone;

      // queueNo: the step this element is waiting FOR.
      // never scanned (lastNo null) → queued at first station of the product.
      const firstNo = PIPELINE[product][0];
      if (el.lastNo == null) {
        el.queueNo = firstNo;
      } else {
        // next consecutive No above lastNo in the pipeline
        const idx = PIPELINE[product].indexOf(el.lastNo);
        el.queueNo = (idx >= 0 && idx + 1 < PIPELINE[product].length)
          ? PIPELINE[product][idx + 1]
          : null;                               // null = already at/after last station
      }

      // stuck calc
      const stuckFrom = el.lastScanData || el.statusDate || null;
      el.stuckFrom = stuckFrom;
      if (isDone) {
        el.isStuck = false;
        el.stuckWorkingDays = 0;
      } else if (!stuckFrom) {
        el.isStuck = true;                       // NULL date → late by rule
        el.stuckWorkingDays = Infinity;
      } else {
        const wd = workingDaysBetween(stuckFrom, now, hol);
        el.stuckWorkingDays = wd;
        const threshold = (product === 'PVC') ? settings().stuckThresholdPVC : settings().stuckThresholdALU;
        el.isStuck = wd > threshold;
      }
      elements.push(el);
    }

    // --- 3. group elements → orders ---
    const orderMap = new Map();
    for (const el of elements) {
      let o = orderMap.get(el.orderNo);
      if (!o) {
        o = {
          orderNo: el.orderNo,
          product: el.product,
          prodWeek: el.prodWeek,
          orderStatus: el.orderStatus,
          promisedDeliv: el.promisedDeliv,
          fridayDeadline: fridayOfProdWeek(el.prodWeek),
          elements: [],
        };
        orderMap.set(el.orderNo, o);
      }
      o.elements.push(el);
    }

    // --- 4. order aggregates + pressure ---
    const now2 = new Date();
    for (const o of orderMap.values()) {
      o.elementCount = o.elements.length;
      o.doneCount = o.elements.filter(e => e.isDone).length;
      o.stuckCount = o.elements.filter(e => e.isStuck).length;
      // slowest = least-advanced element (lastNo null counts as 0)
      o.slowestNo = Math.min(...o.elements.map(e => (e.lastNo == null ? 0 : e.lastNo)));
      o.pressure = computePressure(o, now2, hol);
      o.slowestStation = slowestStationLabel(o);

      // Phase 5.39: piece-level counts.
      //   pcs_T = distinct physical pieces in the order. A piece = key_Frame
      //           when present, else the element's own key (sash-only pieces).
      //   pcs_R = pieces where ALL elements of the piece are done.
      const pieceMap = new Map();   // pieceId -> { total, done }
      for (const e of o.elements) {
        const pieceId = e.keyFrame || e.key;
        let p = pieceMap.get(pieceId);
        if (!p) { p = { total: 0, done: 0 }; pieceMap.set(pieceId, p); }
        p.total++;
        if (e.isDone) p.done++;
      }
      o.pcsT = pieceMap.size;
      o.pcsR = [...pieceMap.values()].filter(p => p.total > 0 && p.done === p.total).length;
    }

    // --- 5. sections (per product, queue by destination section) ---
    // built lazily per active product in renderSection()

    return {
      elements,
      orders: [...orderMap.values()],
    };
  }

  function buildDims(r, f, fs) {
    const fw = f(r, 'frameW'), fh = f(r, 'frameH'), sw = f(r, 'sashW'), sh = f(r, 'sashH');
    // Each sql_05 row carries BOTH frame and sash dims; choose the pair that
    // matches this element's type. Frames use frame dims, sashes use sash dims.
    if (String(fs).toUpperCase() === 'S') {
      if (sw && sh) return `${sw}×${sh}`;
      if (fw && fh) return `${fw}×${fh}`;   // fallback if sash dims missing
      return '';
    }
    // Frame (or unknown): prefer frame dims.
    if (fw && fh) return `${fw}×${fh}`;
    if (sw && sh) return `${sw}×${sh}`;
    return '';
  }

  function slowestStationLabel(o) {
    const slow = o.elements.reduce((acc, e) => {
      const n = (e.lastNo == null) ? 0 : e.lastNo;
      return (acc == null || n < acc.n) ? { n, e } : acc;
    }, null);
    if (!slow) return '—';
    if (slow.n === 0) return 'not started';
    const meta = FLOW_BY_NO[o.product][slow.n];
    return `${slow.n} · ${meta ? meta.english : ''}`;
  }

  const GREEN_MAX = 2.0;
  const AMBER_MAX = 3.5;
  function computePressure(o, now, hol) {
    if (!o.fridayDeadline) return 'red';            // no week → late by rule
    const maxNo = MAX_NO[o.product];
    const stepsRemaining = Math.max(0, maxNo - o.slowestNo);
    if (stepsRemaining === 0) return 'green';        // everything at/after last station
    const workingDaysLeft = workingDaysBetween(now, o.fridayDeadline, hol);
    if (workingDaysLeft <= 0) return 'red';          // deadline passed, work remains
    const ratio = stepsRemaining / workingDaysLeft;
    if (ratio <= GREEN_MAX) return 'green';
    if (ratio <= AMBER_MAX) return 'amber';
    return 'red';
  }

  const PRESSURE_BG = { green: '#e6f7ee', amber: '#fff4e0', red: '#fce6e6' };
  const PRESSURE_BAR = { green: '#0a9e54', amber: '#e08a00', red: '#d23030' };

  // ====== DOM helpers =======================================================
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const collapsed = new Set();         // collapse-keys for prod-week groups / orders

  // ====== RENDER DISPATCH ===================================================
  function updateToggleAllLabel() {
    const lbl = $('#prodToggleLabel');
    const btn = $('#prodToggleAll');
    if (!lbl || !btn) return;
    const keys = [...document.querySelectorAll('#prodListInner [data-collapse]')]
      .map(el => el.dataset.collapse).filter(Boolean);
    const allCollapsed = keys.length > 0 && keys.every(k => collapsed.has(k));
    lbl.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    const svg = btn.querySelector('svg polyline');
    if (svg) svg.setAttribute('points', allCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15');
  }

  function render() {
    const inner = $('#prodListInner');
    if (!inner) return;
    if (!model) {
      inner.innerHTML = `<div class="orders-empty"><p>No production data loaded.</p>
        <p class="muted">Click <b>Refresh</b> to load.</p></div>`;
      updateTotals();
      return;
    }
    const productEls = model.elements.filter(e => e.product === activeProduct);
    const productOrders = model.orders.filter(o => o.product === activeProduct);

    if (productEls.length === 0) {
      inner.innerHTML = `<div class="orders-empty"><p>No ${activeProduct} elements in the current data.</p></div>`;
      updateTotals();
      return;
    }

    if (activeView === 'order')        renderByOrder(inner, productOrders);
    else if (activeView === 'element') renderByElement(inner, productEls);
    else                               renderBySection(inner, productEls);

    updateTotals();
    updateToggleAllLabel();
  }

  function updateTotals() {
    const t = $('#prodTotals');
    if (!t) return;
    if (!model) { t.innerHTML = '<span class="muted">No data loaded</span>'; return; }
    const els = model.elements.filter(e => e.product === activeProduct);
    const stuck = els.filter(e => e.isStuck).length;
    const orders = new Set(els.map(e => e.orderNo)).size;
    t.innerHTML = `<b>${orders}</b> ord · <b>${els.length}</b> elements · <b class="${stuck ? 'prod-stuck-num' : ''}">${stuck}</b> pcs`;
  }

  // ---- pipeline strip (shared by order-expand + element views) ------------
  function pipelineStripHTML(elm) {
    const pipe = PIPELINE[elm.product];
    const scanByNo = new Map(elm.scans.map(s => [s.no, s.data]));
    // Phase 5.33: the "current" marker (black border) goes on the furthest
    // REACHED station — i.e. the highest No that is either scanned or ≤ lastNo —
    // so it lands on the last dated chip even when scan history advances past
    // the element's Last_No.
    let furthestReached = null;
    for (const no of pipe) {
      const reached = scanByNo.has(no) || (elm.lastNo != null && no <= elm.lastNo);
      if (reached) furthestReached = no;
    }
    let chips = '';
    for (const no of pipe) {
      const meta = FLOW_BY_NO[elm.product][no];
      const reached = scanByNo.has(no) || (elm.lastNo != null && no <= elm.lastNo);
      const isCurrent = (no === furthestReached);
      const isStuckChip = isCurrent && elm.isStuck;
      const date = scanByNo.get(no);
      let cls = 'pchip';
      let style = '';
      if (reached) {
        style = `background:${phaseColor(meta?.prodStatus)}`;
      } else {
        cls += ' pchip-todo';
      }
      if (isCurrent) cls += ' pchip-current';
      if (isStuckChip) cls += ' pchip-stuck';
      const label = date ? fmtDM(date) : no;
      chips += `<span class="${cls}" style="${style}" title="${escapeAttr((meta?.english || '') + (date ? ' · ' + fmtDM(date) : ''))}">${escapeHTML(String(label))}</span>`;
    }
    return `<span class="pstrip">${chips}</span>`;
  }

  // ====== VIEW 1: BY ORDER ==================================================
  function renderByOrder(inner, orders) {
    // group by prodWeek
    const byWeek = new Map();
    for (const o of orders) {
      const k = o.prodWeek || '(no week)';
      if (!byWeek.has(k)) byWeek.set(k, []);
      byWeek.get(k).push(o);
    }
    const weeks = [...byWeek.keys()].sort((a, b) => {
      if (a === '(no week)') return 1;
      if (b === '(no week)') return -1;
      return a.localeCompare(b);
    });

    let html = '';
    for (const wk of weeks) {
      const list = byWeek.get(wk).sort((a, b) => a.orderNo.localeCompare(b.orderNo));
      const friday = fridayOfProdWeek(wk);
      const stuckSum = list.reduce((s, o) => s + o.stuckCount, 0);
      const wkKey = 'pwk:' + wk;
      const wkCollapsed = collapsed.has(wkKey);
      html += `<section class="prod-grp${wkCollapsed ? ' collapsed' : ''}" data-collapse="${escapeAttr(wkKey)}">
        <div class="prod-grp-hdr">
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="prod-grp-name">${escapeHTML(wk)}</span>
          <span class="prod-grp-meta">${friday ? 'Fri ' + fmtDM(friday) + ' · ' : ''}<b>${list.length}</b> ord${stuckSum ? ` · <b class="prod-stuck-num">${stuckSum}</b> pcs` : ''}</span>
        </div>
        <div class="prod-grp-body">
          ${renderOrderHeaderRow()}
          ${list.map(renderOrderRow).join('')}
        </div>
      </section>`;
    }
    inner.innerHTML = html;
  }

  // Phase 5.39: permanent order columns. Order:
  // caret · order · status · DD · TermRe · el_T · el_D · pcs_T · pcs_R · stuck ·
  // slowest · materials · mat-dates · route · loading · PRESSURE (last).
  const ORDER_GRID_TEMPLATE = '28px 140px 150px 60px 60px 50px 50px 54px 54px 54px 160px 150px 230px 90px 130px 120px';
  function orderGridStyle() { return `grid-template-columns:${ORDER_GRID_TEMPLATE}`; }
  function fmtDateCell(v) {
    if (!v) return '<span class="prod-empty">—</span>';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '<span class="prod-empty">—</span>' : escapeHTML(fmtDM(d));
  }

  function optHeaderCells() {
    return `<span class="opt-col"><span class="prod-mat-hdr"><span>P</span><span>F</span><span>A</span><span>G</span><span>R</span><span>D</span><span>O</span></span></span>`
      + `<span class="opt-col"><span class="prod-mat-hdr"><span>P</span><span>F</span><span>A</span><span>G</span><span>R</span><span>D</span><span>O</span></span></span>`
      + `<span class="opt-col">Route</span>`
      + `<span class="opt-col">Loading</span>`;
  }
  function optRowCells(elmProxy) {
    return `<span class="opt-col">${matLettersHTML(elmProxy)}</span>`
      + `<span class="opt-col">${matDatesHTML(elmProxy)}</span>`
      + `<span class="opt-col"><span class="prod-empty">—</span></span>`
      + `<span class="opt-col">${loadingHTML(elmProxy)}</span>`;
  }

  function renderOrderHeaderRow() {
    return `<div class="prod-orow prod-orow-hdr" style="${orderGridStyle()}">
      <span></span><span>Order no</span><span>Status</span><span>DD</span><span>TermRe</span><span class="num">el_T</span>
      <span class="num">el_D</span><span class="num">pcs_T</span><span class="num">pcs_R</span><span class="num">Stuck</span><span>Slowest</span>
      ${optHeaderCells()}
      <span>Pressure</span>
    </div>`;
  }

  function renderOrderRow(o) {
    const tagColor = getBucketColorForStatus(o.orderStatus);
    const tagStyle = tagColor ? `style="background:${tagColor}"` : '';
    const open = expandedOrders.has(o.orderNo);
    const bg = PRESSURE_BG[o.pressure] || '#fff';
    const barPct = pressureBarPct(o);
    const barColor = PRESSURE_BAR[o.pressure];
    const proxy = orderProxyElement(o);
    let html = `<div class="prod-orow${open ? ' open' : ''}" data-order="${escapeAttr(o.orderNo)}" style="background:${bg};${orderGridStyle()}">
      <span class="prod-ocaret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
      <span class="prod-ono">${escapeHTML(o.orderNo)}</span>
      <span class="prod-otag" ${tagStyle}>${escapeHTML(o.orderStatus)}</span>
      <span class="prod-odate">${fmtDateCell(proxy.ddDate)}</span>
      <span class="prod-odate">${fmtDateCell(proxy.termReDate)}</span>
      <span class="num">${o.elementCount}</span>
      <span class="num">${o.doneCount}</span>
      <span class="num">${o.pcsT}</span>
      <span class="num">${o.pcsR}</span>
      <span class="num">${o.stuckCount ? `<b class="prod-stuck-num">${o.stuckCount}</b>` : '0'}</span>
      <span class="prod-oslow">${escapeHTML(o.slowestStation)}</span>
      ${optRowCells(proxy)}
      <span class="prod-obar"><span class="prod-obar-fill" style="width:${barPct}%;background:${barColor}"></span></span>
    </div>`;
    if (open) {
      html += `<div class="prod-oelements">
        ${renderElementHeaderRow()}
        ${o.elements.slice().sort((a, b) => a.key.localeCompare(b.key)).map(renderElementStripRow).join('')}
      </div>`;
    }
    return html;
  }

  function pressureBarPct(o) {
    // % of the order's elements that are done. Color (set elsewhere) still
    // encodes deadline pressure; the bar's length encodes finished progress.
    if (!o.elementCount) return 4;
    const pct = Math.round((o.doneCount / o.elementCount) * 100);
    return Math.max(4, Math.min(100, pct));
  }

  function renderElementHeaderRow() {
    return `<div class="prod-erow prod-erow-hdr">
      <span>Element</span><span>F/S</span><span>Color</span><span>Dim</span><span>Pipeline</span>
    </div>`;
  }
  function renderElementStripRow(e) {
    const stuckCls = e.isStuck ? ' prod-erow-stuck' : (e.isDone ? ' prod-erow-done' : '');
    return `<div class="prod-erow${stuckCls}">
      <span class="prod-ekey">${escapeHTML(e.key)}</span>
      <span>${escapeHTML(e.fs)}</span>
      <span>${escapeHTML(e.color)}</span>
      <span>${escapeHTML(e.dims)}</span>
      ${pipelineStripHTML(e)}
    </div>`;
  }

  const expandedOrders = new Set();

  // ====== VIEW 2: BY ELEMENT ================================================
  function renderByElement(inner, els) {
    let list = els.slice();
    if (elementOnlyStuck) list = list.filter(e => e.isStuck);
    list.sort((a, b) => {
      const av = (a.stuckWorkingDays === Infinity) ? 1e9 : a.stuckWorkingDays;
      const bv = (b.stuckWorkingDays === Infinity) ? 1e9 : b.stuckWorkingDays;
      return bv - av;
    });

    const rows = list.map(e => {
      const stuckTxt = (e.stuckWorkingDays === Infinity) ? '⚠ ?' : (e.isStuck ? `⚠ ${e.stuckWorkingDays}d` : `${e.stuckWorkingDays}d`);
      const cls = e.isStuck ? (e.stuckWorkingDays === Infinity || e.stuckWorkingDays >= 2 ? ' prod-erow-stuck' : ' prod-erow-amber') : '';
      const station = (e.lastNo == null) ? 'not started' : `${e.lastNo} · ${escapeHTML(e.lastStationName)}`;
      return `<div class="prod-elrow${cls}">
        <span class="prod-elstuck">${stuckTxt}</span>
        <span class="prod-ekey">${escapeHTML(e.key)}</span>
        <span>${escapeHTML(e.orderNo)}</span>
        <span>${escapeHTML(e.prodWeek || '—')}</span>
        <span>${station}</span>
        <span>${e.lastScanData ? fmtDM(e.lastScanData) : '—'}</span>
        <span>${escapeHTML(e.fs)}</span>
        <span>${escapeHTML(e.dims)}</span>
        <span>${escapeHTML(e.color)}</span>
      </div>`;
    }).join('');

    inner.innerHTML = `
      <div class="prod-elhdr-bar">
        <label class="prod-onlystuck"><input type="checkbox" id="prodOnlyStuck" ${elementOnlyStuck ? 'checked' : ''}> Show only stuck</label>
        <span class="muted">${list.length} elements${elementOnlyStuck ? ' (stuck only)' : ''}, sorted by stuck time</span>
      </div>
      <div class="prod-eltable">
        <div class="prod-elrow prod-elrow-hdr">
          <span>Stuck</span><span>Element</span><span>Order</span><span>Wk</span>
          <span>Current station</span><span>Last scan</span><span>F/S</span><span>Dim</span><span>Color</span>
        </div>
        ${rows}
      </div>`;

    const cb = $('#prodOnlyStuck');
    if (cb) cb.addEventListener('change', () => { elementOnlyStuck = cb.checked; render(); });
  }

  // ====== VIEW 3: BY SECTION ================================================
  function renderBySection(inner, els) {
    // Phase 5.28: By section now mirrors Orders · By status —
    //   section band (sticky, collapsible)
    //     └ column-header row (sticky)
    //         └ order rows (8 cols, aggregates scoped to elements queued here)
    //             └ element rows (Element · F/S · Color · Dim · since · stuck)
    //
    // Pre-populate a section per distinct PROD_Status in the active product's
    // pipeline so every section is visible — even sections with 0 queued
    // elements. Then bucket elements by their queueNo's PROD_Status.
    const secMap = new Map();
    const seenProdStatus = new Set();
    for (const meta of FLOW[activeProduct]) {
      if (seenProdStatus.has(meta.prodStatus)) continue;
      seenProdStatus.add(meta.prodStatus);
      secMap.set(meta.prodStatus, {
        prodStatus: meta.prodStatus,
        sortKey: sectionSortKey(meta.prodStatus),
        elements: [],
      });
    }
    for (const e of els) {
      if (e.isDone || e.queueNo == null) continue;     // finished elements aren't queued anywhere
      const meta = FLOW_BY_NO[e.product][e.queueNo];
      if (!meta) continue;
      const key = meta.prodStatus;
      let sec = secMap.get(key);
      if (!sec) { sec = { prodStatus: key, sortKey: sectionSortKey(key), elements: [] }; secMap.set(key, sec); }
      sec.elements.push(e);
    }
    const sections = [...secMap.values()].sort((a, b) => a.sortKey - b.sortKey);
    const maxQueue = Math.max(1, ...sections.map(s => s.elements.length));

    let html = '';
    for (const sec of sections) {
      const stuck = sec.elements.filter(e => e.isStuck).length;
      const pct = Math.round((sec.elements.length / maxQueue) * 100);
      const secKey = 'psec:' + sec.prodStatus;
      const secCollapsed = collapsed.has(secKey);

      // Group this section's queued elements by order.
      const ordMap = new Map();
      for (const e of sec.elements) {
        let g = ordMap.get(e.orderNo);
        if (!g) { g = []; ordMap.set(e.orderNo, g); }
        g.push(e);
      }
      const sectionOrders = [...ordMap.entries()]
        .map(([orderNo, elements]) => ({ orderNo, elements }))
        .sort((a, b) => {
          // stuck orders first, then by orderNo
          const as = a.elements.some(x => x.isStuck) ? 0 : 1;
          const bs = b.elements.some(x => x.isStuck) ? 0 : 1;
          if (as !== bs) return as - bs;
          return a.orderNo.localeCompare(b.orderNo);
        });

      html += `<section class="prod-grp${secCollapsed ? ' collapsed' : ''}" data-collapse="${escapeAttr(secKey)}">
        <div class="prod-grp-hdr prod-sechdr">
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="prod-grp-name">${escapeHTML(sec.prodStatus)}</span>
          <span class="prod-grp-meta">queued <b>${sec.elements.length}</b>${stuck ? ` · stuck <b class="prod-stuck-num">${stuck}</b>` : ''}</span>
          <span class="prod-sechdr-bar"><span class="prod-secbar-fill" style="width:${pct}%;background:${phaseColor(sec.prodStatus)}"></span></span>
        </div>
        <div class="prod-grp-body">
          ${renderOrderHeaderRow()}
          ${sectionOrders.map(g => renderSectionOrderRow(sec.prodStatus, g)).join('')
            || `<div class="prod-secempty">No orders queued in this section.</div>`}
        </div>
      </section>`;
    }
    inner.innerHTML = html || `<div class="orders-empty"><p>No ${activeProduct} pipeline configured.</p></div>`;
  }

  // One order row inside a section. Aggregates (Elem/Done/Stuck) are scoped to
  // the elements of this order that are queued in THIS section; Slowest and
  // Pressure remain order-level (pulled from the full order model).
  function renderSectionOrderRow(prodStatus, g) {
    const fullOrder = (model?.orders || []).find(o => o.orderNo === g.orderNo);
    const orderStatus = fullOrder?.orderStatus || g.elements[0].orderStatus || '';
    const pressure = fullOrder?.pressure || 'red';
    const slowest = fullOrder ? fullOrder.slowestStation : '—';

    const elemCount = g.elements.length;
    const doneCount = g.elements.filter(e => e.isDone).length;   // ~0 here (queued = not done)
    const stuckCount = g.elements.filter(e => e.isStuck).length;

    const tagColor = getBucketColorForStatus(orderStatus);
    const tagStyle = tagColor ? `style="background:${tagColor}"` : '';
    const bg = PRESSURE_BG[pressure] || '#fff';
    const barColor = PRESSURE_BAR[pressure];
    const barPct = elemCount ? Math.max(4, Math.min(100, Math.round((doneCount / elemCount) * 100))) : 4;
    const proxy = g.elements[0] || { materials: {}, loading: '' };

    // pcs_T / pcs_R scoped to this section's elements of the order.
    const pieceMap = new Map();
    for (const e of g.elements) {
      const pieceId = e.keyFrame || e.key;
      let p = pieceMap.get(pieceId);
      if (!p) { p = { total: 0, done: 0 }; pieceMap.set(pieceId, p); }
      p.total++; if (e.isDone) p.done++;
    }
    const pcsT = pieceMap.size;
    const pcsR = [...pieceMap.values()].filter(p => p.total > 0 && p.done === p.total).length;

    const okey = 'osec:' + prodStatus + ':' + g.orderNo;
    const open = expandedOrders.has(okey);

    let html = `<div class="prod-orow${open ? ' open' : ''}" data-osec="${escapeAttr(okey)}" style="background:${bg};${orderGridStyle()}">
      <span class="prod-ocaret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></span>
      <span class="prod-ono">${escapeHTML(g.orderNo)}</span>
      <span class="prod-otag" ${tagStyle}>${escapeHTML(orderStatus)}</span>
      <span class="prod-odate">${fmtDateCell(proxy.ddDate)}</span>
      <span class="prod-odate">${fmtDateCell(proxy.termReDate)}</span>
      <span class="num">${elemCount}</span>
      <span class="num">${doneCount}</span>
      <span class="num">${pcsT}</span>
      <span class="num">${pcsR}</span>
      <span class="num">${stuckCount ? `<b class="prod-stuck-num">${stuckCount}</b>` : '0'}</span>
      <span class="prod-oslow">${escapeHTML(slowest)}</span>
      ${optRowCells(proxy)}
      <span class="prod-obar"><span class="prod-obar-fill" style="width:${barPct}%;background:${barColor}"></span></span>
    </div>`;

    if (open) {
      const list = g.elements.slice().sort((a, b) => {
        const av = (a.stuckWorkingDays === Infinity) ? 1e9 : a.stuckWorkingDays;
        const bv = (b.stuckWorkingDays === Infinity) ? 1e9 : b.stuckWorkingDays;
        return bv - av;
      });
      html += `<div class="prod-oelements">
        ${renderSectionElementHeaderRow()}
        ${list.map(renderSectionElementRow).join('')}
      </div>`;
    }
    return html;
  }

  function renderSectionElementHeaderRow() {
    return `<div class="prod-secerow prod-secerow-hdr">
      <span>Element</span><span>F/S</span><span>Color</span><span>Dim</span><span>Since</span><span class="num">Stuck</span>
    </div>`;
  }
  function renderSectionElementRow(e) {
    const stuckCls = e.isStuck ? ' prod-erow-stuck' : (e.isDone ? ' prod-erow-done' : '');
    const since = e.lastScanData ? fmtDM(e.lastScanData) : (e.stuckFrom ? fmtDM(e.stuckFrom) : 'never');
    const stuckTxt = (e.stuckWorkingDays === Infinity) ? '⚠ ?' : e.stuckWorkingDays + 'd';
    return `<div class="prod-secerow${stuckCls}">
      <span class="prod-ekey">${escapeHTML(e.key)}</span>
      <span>${escapeHTML(e.fs)}</span>
      <span>${escapeHTML(e.color)}</span>
      <span>${escapeHTML(e.dims)}</span>
      <span>${escapeHTML(since)}</span>
      <span class="num">${stuckTxt}</span>
    </div>`;
  }

  // ====== REFRESH ===========================================================
  // Phase 5.29 (S2): fetch the spine query plus every distinct join source
  // referenced by the production variable mappings.
  function referencedSourceIds() {
    const sp = spineId();
    const ids = new Set();
    if (sp) ids.add(sp);
    const vm = currentMapping?.variableMappings?.production || {};
    for (const k of Object.keys(COL_DEFAULTS)) {
      const src = (vm[k] && vm[k].source) ? vm[k].source : sp;
      if (src) ids.add(src);
    }
    return [...ids];
  }
  function getSpineRows() {
    const sp = spineId();
    return (sp && typeof lastResultRows === 'object' && lastResultRows[sp]) ? lastResultRows[sp] : [];
  }
  function rebuildModel() {
    model = buildModel(getSpineRows());
  }

  async function refresh() {
    const btn = $('#prodRefreshBtn');
    const info = $('#prodRefreshInfo');
    const banner = $('#prodBanner');
    if (banner) { banner.hidden = true; banner.innerHTML = ''; }

    // Phase 5.19: ensure Production variable mapping has defaults seeded.
    seedProductionDefaults();

    const sp = spineId();
    const spineQuery = queryById(sp);
    if (!spineQuery) {
      if (banner) {
        banner.hidden = false;
        banner.innerHTML = `<b>No production spine query.</b> Assign a query the <code>spine</code> role (element grain) in the Mapping screen.`;
      }
      if (info) info.textContent = 'No spine query configured.';
      return;
    }
    if (typeof getConnectionConfig !== 'function') {
      if (banner) { banner.hidden = false; banner.innerHTML = '<b>Internal error:</b> connection helper unavailable.'; }
      return;
    }
    const conn = getConnectionConfig();
    if (!conn.server || !conn.user || !conn.password) {
      if (banner) { banner.hidden = false; banner.innerHTML = '<b>Connection not configured.</b> Fill in the Connection tab in Mapping first.'; }
      if (info) info.textContent = 'Connection not configured.';
      return;
    }
    if (!conn.database) conn.database = 'master';

    if (btn) btn.disabled = true;
    if (info) info.innerHTML = '<span class="run-indicator"><span class="dot"></span>Running…</span>';
    const t0 = performance.now();

    // Fetch spine + every referenced join source. Spine failure is fatal;
    // a join source failure is surfaced but non-fatal (its columns read null).
    const ids = referencedSourceIds();
    const failures = [];
    for (const id of ids) {
      const q = queryById(id);
      if (!q || !q.sql) { if (id !== sp) failures.push(`${id} (no SQL)`); continue; }
      let res;
      try {
        res = await window.sqlAPI.runQuery(conn, q.sql);
      } catch (err) {
        if (id === sp) {
          if (banner) { banner.hidden = false; banner.innerHTML = `<b>Refresh failed:</b> ${escapeHTML(err.message || String(err))}`; }
          if (info) info.textContent = 'Refresh failed.';
          if (btn) btn.disabled = false;
          return;
        }
        failures.push(`${id}: ${err.message || String(err)}`);
        continue;
      }
      if (!res || !res.ok) {
        if (id === sp) {
          if (banner) { banner.hidden = false; banner.innerHTML = `<b>Query failed:</b> ${escapeHTML((res && res.error) || 'unknown error')}`; }
          if (info) info.textContent = 'Query failed.';
          if (btn) btn.disabled = false;
          return;
        }
        failures.push(`${id}: ${(res && res.error) || 'unknown error'}`);
        if (typeof lastResultRows === 'object') lastResultRows[id] = [];
        continue;
      }
      if (typeof lastResultRows === 'object') lastResultRows[id] = res.rows || [];
    }

    if (failures.length && banner) {
      banner.hidden = false;
      banner.innerHTML = `<b>Some join sources failed:</b> ${escapeHTML(failures.join('; '))}. Their columns will show empty.`;
    }

    rebuildModel();
    lastFetchAt = new Date();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    if (info) info.textContent = `refreshed ${fmtTime(lastFetchAt)} · ${elapsed}s`;

    render();
    if (btn) btn.disabled = false;
  }

  function fmtTime(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  // ====== SETTINGS MODAL ====================================================
  function openSettings() {
    const s = settings();
    const overlay = el('div', 'prod-modal-overlay');
    overlay.innerHTML = `
      <div class="prod-modal">
        <div class="prod-modal-hdr">
          <h2>Production settings</h2>
          <button class="prod-modal-x" title="Close">×</button>
        </div>
        <div class="prod-modal-body">
          <div class="prod-set-row">
            <label>Stuck threshold — PVC (working days)</label>
            <input type="number" min="0" step="1" id="prodSetPVC" value="${s.stuckThresholdPVC}">
          </div>
          <div class="prod-set-row">
            <label>Stuck threshold — ALU (working days)</label>
            <input type="number" min="0" step="1" id="prodSetALU" value="${s.stuckThresholdALU}">
          </div>
          <div class="prod-set-holidays">
            <label>Holidays (excluded from working-day math)</label>
            <div class="prod-hol-add">
              <input type="date" id="prodHolDate">
              <button class="btn-secondary" id="prodHolAdd">Add</button>
            </div>
            <div class="prod-hol-list" id="prodHolList"></div>
          </div>
        </div>
        <div class="prod-modal-foot">
          <button class="btn-secondary" id="prodSetClose">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function renderHolidays() {
      const list = $('#prodHolList');
      const hols = settings().holidays.slice().sort();
      list.innerHTML = hols.length
        ? hols.map(h => `<span class="prod-hol-chip" data-h="${escapeAttr(h)}">${escapeHTML(h)}<button title="Remove">×</button></span>`).join('')
        : '<span class="muted">No holidays added.</span>';
      list.querySelectorAll('.prod-hol-chip button').forEach(b => {
        b.addEventListener('click', () => {
          const h = b.parentElement.dataset.h;
          settings().holidays = settings().holidays.filter(x => x !== h);
          if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
          renderHolidays();
          if (model) render();
        });
      });
    }
    renderHolidays();

    overlay.querySelector('#prodSetPVC').addEventListener('change', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      settings().stuckThresholdPVC = v;
      if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
      if (model) { rebuildModel(); render(); }
    });
    overlay.querySelector('#prodSetALU').addEventListener('change', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      settings().stuckThresholdALU = v;
      if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
      if (model) { rebuildModel(); render(); }
    });
    overlay.querySelector('#prodHolAdd').addEventListener('click', () => {
      const v = $('#prodHolDate').value;
      if (!v) return;
      if (!settings().holidays.includes(v)) settings().holidays.push(v);
      if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
      renderHolidays();
      if (model) { rebuildModel(); render(); }
    });

    function close() { overlay.remove(); }
    overlay.querySelector('.prod-modal-x').addEventListener('click', close);
    overlay.querySelector('#prodSetClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  // ====== EVENT WIRING ======================================================
  function wire() {
    if (wired) return;
    wired = true;

    // product tabs
    document.querySelectorAll('#prodProductTabs .prod-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeProduct = btn.dataset.product;
        document.querySelectorAll('#prodProductTabs .prod-tab').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });
    // view tabs
    document.querySelectorAll('#prodViewTabs .prod-view').forEach(btn => {
      btn.addEventListener('click', () => {
        activeView = btn.dataset.view;
        document.querySelectorAll('#prodViewTabs .prod-view').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });
    // Refresh moved to the left ribbon (#sbRefreshBtn) — a single unified
    // refresh for both screens. No per-screen refresh button anymore.
    // settings
    const sb = $('#prodSettingsBtn');
    if (sb) sb.addEventListener('click', openSettings);

    // Phase 5.34: Collapse all / Expand all for the current view's groups.
    const ta = $('#prodToggleAll');
    if (ta) ta.addEventListener('click', () => {
      const keys = [...document.querySelectorAll('#prodListInner [data-collapse]')]
        .map(el => el.dataset.collapse).filter(Boolean);
      const anyExpanded = keys.some(k => !collapsed.has(k));
      if (anyExpanded) { keys.forEach(k => collapsed.add(k)); }   // collapse all
      else { keys.forEach(k => collapsed.delete(k)); }            // expand all
      render();
      updateToggleAllLabel();
    });

    // delegated clicks inside the list: collapse week groups, expand orders, expand sections
    const list = $('#prodListInner');
    if (list) {
      list.addEventListener('click', (e) => {
        const grpHdr = e.target.closest('.prod-grp-hdr');
        if (grpHdr) {
          const sec = grpHdr.closest('.prod-grp');
          const key = sec?.dataset.collapse;
          if (key) {
            if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
            sec.classList.toggle('collapsed');
          }
          return;
        }
        const orow = e.target.closest('.prod-orow:not(.prod-orow-hdr)');
        if (orow && orow.dataset.order) {
          const on = orow.dataset.order;
          if (expandedOrders.has(on)) expandedOrders.delete(on); else expandedOrders.add(on);
          render();
          return;
        }
        // By section: order rows are namespaced per section (osec:<status>:<orderNo>)
        if (orow && orow.dataset.osec) {
          const k = orow.dataset.osec;
          if (expandedOrders.has(k)) expandedOrders.delete(k); else expandedOrders.add(k);
          render();
          return;
        }
      });
    }

    // today / week labels
    const today = new Date();
    const td = $('#prodTodayDate');
    if (td) td.textContent = today.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const tw = $('#prodTodayWeek');
    if (tw) {
      const yy = String(today.getFullYear()).slice(2);
      const ww = String(isoWeekNum(today)).padStart(2, '0');
      tw.textContent = `${yy}_${ww}`;
    }
  }

  // ====== PUBLIC API ========================================================
  let shownOnce = false;
  window.Production = {
    init() {
      wire();
      // Phase 5.19: pre-seed Production mapping defaults so the Variable
      // Mapping → Production sub-tab is pre-filled even before any refresh.
      seedProductionDefaults();
    },
    onShow() {
      wire();
      seedProductionDefaults();
      const sp = spineId();
      const haveCache = sp && typeof lastResultRows === 'object'
        && Array.isArray(lastResultRows[sp]) && lastResultRows[sp].length > 0;
      if (haveCache) {
        // Rebuild from the shared cache every time Production is shown, so a
        // prior Orders refresh (which repopulates lastResultRows) is reflected
        // here — the linked-refresh behavior that existed before the S2 change.
        rebuildModel();
        if (!lastFetchAt) lastFetchAt = new Date();
        render();
      } else if (!shownOnce && !model) {
        // First open with no cache yet: trigger the unified all-queries refresh
        // (same path as the Refresh button) so connection handling matches Orders
        // and we don't surface a separate Production connection banner.
        shownOnce = true;
        if (typeof window.refreshOrders === 'function') window.refreshOrders();
        else { const q = queryById(sp); if (q) refresh(); }
      }
      shownOnce = true;
    },
    refresh,
    // Phase 5.31: rebuild the Production model from the shared lastResultRows
    // cache WITHOUT re-running SQL. Called after an Orders refresh (which runs
    // all queries and repopulates the cache) so Production reflects fresh data
    // the way it did before the S2 multi-query change. Safe if nothing loaded.
    refreshFromCache() {
      try {
        const sp = spineId();
        const rows = (sp && typeof lastResultRows === 'object') ? lastResultRows[sp] : null;
        // Only rebuild when the spine query actually has fresh rows in the
        // cache. If it failed/aborted in the Orders batch (so the cache is
        // empty/missing), leave Production's current model untouched rather
        // than blanking it.
        if (!Array.isArray(rows) || rows.length === 0) return;
        const banner = $('#prodBanner');
        if (banner) { banner.hidden = true; banner.innerHTML = ''; }
        rebuildModel();
        lastFetchAt = new Date();
        const info = $('#prodRefreshInfo');
        if (info) info.textContent = `refreshed ${fmtTime(lastFetchAt)} · via Orders`;
        render();
      } catch (e) { console.error('Production.refreshFromCache failed:', e); }
    },
  };

})();
