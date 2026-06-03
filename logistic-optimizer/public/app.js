/*
 * Logistic Optimizer — Phase 1 renderer
 *
 * Responsibilities for Phase 1:
 *  - Switch between Orders and Mapping screens
 *  - Switch between Mapping tabs
 *  - Load any saved mapping from disk and pre-fill the Connection form
 *  - Test connection via window.sqlAPI.testConnection
 *  - Save mapping back to disk
 *
 * Later phases will add:
 *  - Query editors (Aluplast / WHNet tabs)
 *  - Variable mapping table
 *  - Wiring to populate the Orders screen
 */

'use strict';

// ====== Guards =============================================================

if (!window.sqlAPI || !window.configAPI) {
  alert('FATAL: This page must run inside the Electron app. Opening it in a regular browser does not work because the SQL bridge is unavailable.');
}

// ====== State ==============================================================

/** @type {object|null} The current mapping object loaded from disk (or null if none saved) */
let currentMapping = null;

/**
 * Phase 5.19: variable mappings are nested under sub-tabs.
 *   currentMapping.variableMappings = { orders: {...}, production: {...} }
 * vmGet/vmSet centralize the access so existing code stays readable.
 * 'orders' is the default sub-tab (preserves all pre-5.19 behavior).
 */
function vmGet(sub) {
  if (!currentMapping) return {};
  if (!currentMapping.variableMappings) currentMapping.variableMappings = { orders: {}, production: {} };
  const vm = currentMapping.variableMappings;
  if (!vm.orders)     vm.orders = {};
  if (!vm.production) vm.production = {};
  return vm[sub] || {};
}
function vmSet(sub, obj) {
  if (!currentMapping) return;
  if (!currentMapping.variableMappings) currentMapping.variableMappings = { orders: {}, production: {} };
  currentMapping.variableMappings[sub] = obj || {};
}

/**
 * Active sub-tab in the Variable Mapping panel. 'orders' | 'production'.
 */
let activeVmSubtab = 'orders';

/**
 * Editor instances keyed by query id (e.g. 'sql_01').
 * Created lazily when a query tab is opened.
 */
const editors = {};

/** Last-known result column lists, keyed by query id */
const lastResultColumns = {};

/** Last-known full result rows, keyed by query id */
const lastResultRows = {};

/**
 * Active query id (selected tab). null if Connection/Variables active.
 */
let activeQueryId = null;

// ====== DOM helpers ========================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ====== Modal helper (replaces native prompt/confirm) =====================
//
// Electron with sandbox: true makes window.prompt() and window.confirm()
// no-op (they return null/false silently). We provide our own in-DOM modal
// with three modes: confirm, prompt, picker.
//
// Usage:
//   await modal.confirm({ title, message }) -> bool
//   await modal.prompt({ title, message, defaultValue }) -> string | null
//   await modal.picker({ title, message, items }) -> item | null
// ---------------------------------------------------------------------------

const modal = (() => {
  const backdrop = () => $('#modalBackdrop');
  const titleEl = () => $('#modalTitle');
  const msgEl = () => $('#modalMessage');
  const inputWrap = () => $('#modalInputWrap');
  const inputEl = () => $('#modalInput');
  const listWrap = () => $('#modalListWrap');
  const okBtn = () => $('#modalOkBtn');
  const cancelBtn = () => $('#modalCancelBtn');

  let resolvePromise = null;

  function close(value) {
    if (resolvePromise) {
      const r = resolvePromise;
      resolvePromise = null;
      backdrop().hidden = true;
      // Remove handlers to avoid leaking
      okBtn().onclick = null;
      cancelBtn().onclick = null;
      backdrop().onkeydown = null;
      r(value);
    }
  }

  function open({ title, message, mode, defaultValue, items, okLabel = 'OK', cancelLabel = 'Cancel' }) {
    return new Promise((res) => {
      resolvePromise = res;
      titleEl().textContent = title || '';
      msgEl().textContent = message || '';
      msgEl().hidden = !message;

      // Reset
      inputWrap().hidden = true;
      listWrap().hidden = true;
      listWrap().innerHTML = '';
      okBtn().textContent = okLabel;
      okBtn().hidden = false;
      cancelBtn().textContent = cancelLabel;

      if (mode === 'prompt') {
        inputWrap().hidden = false;
        inputEl().value = defaultValue || '';
        setTimeout(() => { inputEl().focus(); inputEl().select(); }, 30);
        okBtn().onclick = () => close(inputEl().value);
      } else if (mode === 'picker') {
        listWrap().hidden = false;
        okBtn().hidden = true;
        for (const item of items) {
          const div = document.createElement('div');
          div.className = 'modal-list-item';
          div.innerHTML = `<span>${escapeHTML(item.label)}</span><span class="ml-id">${escapeHTML(item.sub || '')}</span>`;
          div.onclick = () => close(item);
          listWrap().appendChild(div);
        }
      } else { // confirm
        okBtn().onclick = () => close(true);
      }

      cancelBtn().onclick = () => close(mode === 'confirm' ? false : null);

      // Keyboard: Enter = ok (for confirm/prompt), Esc = cancel
      backdrop().onkeydown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(mode === 'confirm' ? false : null);
        } else if (e.key === 'Enter' && mode !== 'picker') {
          e.preventDefault();
          if (mode === 'prompt') close(inputEl().value);
          else close(true);
        }
      };

      backdrop().hidden = false;
      // Focus the backdrop so keydown works even if input isn't focused
      backdrop().tabIndex = -1;
      backdrop().focus();
    });
  }

  return {
    confirm: ({ title = 'Confirm', message }) => open({ title, message, mode: 'confirm' }),
    prompt:  ({ title = 'Input',   message, defaultValue = '' }) => open({ title, message, mode: 'prompt', defaultValue }),
    picker:  ({ title = 'Choose',  message, items }) => open({ title, message, mode: 'picker', items }),
    alert:   ({ title = 'Notice',  message }) => open({ title, message, mode: 'confirm', okLabel: 'OK', cancelLabel: '' }).then(() => null),
  };
})();

// ====== Screen routing =====================================================

function switchScreen(target) {
  $$('.nav .it').forEach(n => n.classList.toggle('active', n.dataset.screen === target));
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + target));
  if (target === 'production' && window.Production && typeof window.Production.onShow === 'function') {
    try { window.Production.onShow(); } catch (e) { console.error('Production.onShow failed:', e); }
  }
}

$$('.nav .it').forEach(it => {
  it.addEventListener('click', () => {
    const target = it.dataset.screen;
    if (target) switchScreen(target);
  });
});

// Unified refresh — single button in the left ribbon. Runs all mapping queries
// and updates BOTH Orders and Production (refreshOrders repopulates the shared
// cache and calls Production.refreshFromCache).
(function wireSidebarRefresh() {
  const b = $('#sbRefreshBtn');
  if (b) b.addEventListener('click', () => { refreshOrders(); });
})();

// ====== Mapping tab routing ================================================

function switchTab(target) {
  $$('.m-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === target));
  $$('.m-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));

  // Track active query for use by other parts (e.g. variable mapping source dropdown).
  const tabsRoot = $('#mappingTabs');
  if (tabsRoot && tabsRoot.querySelector(`.m-tab[data-tab="${target}"][data-query-id]`)) {
    activeQueryId = target;
  } else {
    activeQueryId = null;
  }

  // Lazy-init editor when a query tab opens (CodeMirror needs a visible host).
  if (target.startsWith('sql_')) {
    setTimeout(() => initEditor(target), 30);
  }

  // Lazy-render Variable Mapping tab.
  if (target === 'variables') {
    setTimeout(() => renderVariableMapping(), 30);
  }

  // Lazy-render Status Mapping tab.
  if (target === 'statusmap') {
    setTimeout(() => renderStatusMapping(), 30);
  }
}

// Event delegation: handle clicks on any .m-tab including dynamically added ones.
$('#mappingTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.m-tab');
  if (tab && tab.dataset.tab) {
    switchTab(tab.dataset.tab);
  }
});

// Double-click on a query tab to rename it.
$('#mappingTabs').addEventListener('dblclick', (e) => {
  const tab = e.target.closest('.m-tab');
  if (tab && tab.dataset.queryId) {
    renameQueryTab(tab.dataset.queryId);
  }
});

// ====== Connection form ====================================================

function getConnectionConfig() {
  const config = {
    server: $('#conn-server').value.trim(),
    instanceName: $('#conn-instance').value.trim() || undefined,
    port: $('#conn-port').value.trim() || undefined,
    database: $('#conn-database').value.trim() || 'master',
    user: $('#conn-user').value.trim(),
    password: $('#conn-password').value,
    encrypt: $('#conn-encrypt').checked,
    trustServerCertificate: $('#conn-trust').checked,
  };
  // Remove undefined fields
  Object.keys(config).forEach(k => config[k] === undefined && delete config[k]);
  return config;
}

function fillConnectionForm(saved) {
  if (!saved) return;
  if (saved.server) $('#conn-server').value = saved.server;
  if (saved.instanceName) $('#conn-instance').value = saved.instanceName;
  if (saved.port) $('#conn-port').value = saved.port;
  if (saved.database) $('#conn-database').value = saved.database;
  if (saved.user) $('#conn-user').value = saved.user;
  // Note: password is NEVER persisted to disk. User must re-enter each session.
  if (saved.encrypt !== undefined) $('#conn-encrypt').checked = !!saved.encrypt;
  if (saved.trustServerCertificate !== undefined) $('#conn-trust').checked = !!saved.trustServerCertificate;
}

function setConnStatus(state, message) {
  const el = $('#connStatus');
  el.className = 'conn-status ' + state;
  el.innerHTML = `<span class="dot"></span><span>${message}</span>`;
}

// ====== Test connection ====================================================

$('#testConnectionBtn').addEventListener('click', async () => {
  const config = getConnectionConfig();
  if (!config.server) {
    setConnStatus('error', 'Server is required.');
    return;
  }
  if (!config.user) {
    setConnStatus('error', 'Username is required.');
    return;
  }
  if (!config.password) {
    setConnStatus('error', 'Password is required.');
    return;
  }

  setConnStatus('testing', 'Connecting…');
  const btn = $('#testConnectionBtn');
  btn.disabled = true;

  try {
    const result = await window.sqlAPI.testConnection(config);
    if (result.ok) {
      setConnStatus('success', `Connected to ${result.server} / ${result.database} — ${result.elapsedMs}ms`);
    } else {
      setConnStatus('error', `Failed: ${result.error}`);
    }
  } catch (err) {
    setConnStatus('error', `Unexpected error: ${err.message || err}`);
  } finally {
    btn.disabled = false;
  }
});

// ====== Save / Export / Import mapping =====================================

function buildMappingFromUI() {
  const conn = getConnectionConfig();
  delete conn.password; // never persist password

  // Build queries array from in-memory definitions, picking up any unsaved
  // editor edits along the way.
  const queries = (currentMapping?.queries || []).map(q => ({
    id: q.id,
    name: q.name,
    sql: editors[q.id] ? editors[q.id].getValue() : (q.sql || ''),
    resultColumns: lastResultColumns[q.id] || q.resultColumns || [],
    previewLimit: q.previewLimit ?? 50,
    layout: q.layout || {},
  }));

  return {
    version: 2,
    savedAt: new Date().toISOString(),
    connection: conn,
    queries,
    variableMappings: currentMapping?.variableMappings || {},
    statusMapping: currentMapping?.statusMapping || null,
  };
}

$('#saveMappingBtn').addEventListener('click', async () => {
  // Cancel any pending auto-save (we're saving now anyway)
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  const data = buildMappingFromUI();
  const result = await window.configAPI.writeMapping(data);
  if (result.ok) {
    currentMapping = data;
    isDirty = false;
    updateDirtyIndicator();
    flashMessage(`Saved to ${result.path}`, 'success');
  } else {
    flashMessage(`Save failed: ${result.error}`, 'error');
  }
});

$('#exportMappingBtn').addEventListener('click', () => {
  const data = buildMappingFromUI();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logistic-optimizer-mapping-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

$('#importMappingBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        currentMapping = data;
        fillConnectionForm(data.connection);
        flashMessage(`Imported. Click "Save" to persist to disk.`, 'success');
      } catch (err) {
        flashMessage(`Failed to parse JSON: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// Simple flash via the connStatus area (since we don't have a real toast yet)
function flashMessage(msg, kind) {
  // Just borrow connStatus for now — Phase 1 minimal UI
  setConnStatus(kind === 'error' ? 'error' : 'success', msg);
}

// ====== Auto-save ==========================================================

/** Pending auto-save timer */
let autoSaveTimer = null;

/** Track unsaved state for the Save button indicator */
let isDirty = false;

/**
 * Mark the mapping as dirty and schedule an auto-save in 1 second.
 * Repeated calls reset the timer (debounce).
 */
function scheduleAutoSave() {
  isDirty = true;
  updateDirtyIndicator();

  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    autoSaveTimer = null;
    await doAutoSave();
  }, 1000);
}

async function doAutoSave() {
  try {
    const data = buildMappingFromUI();
    const result = await window.configAPI.writeMapping(data);
    if (result.ok) {
      currentMapping = data;
      isDirty = false;
      updateDirtyIndicator();
    } else {
      console.error('Auto-save failed:', result.error);
    }
  } catch (err) {
    console.error('Auto-save error:', err);
  }
}

function updateDirtyIndicator() {
  const btn = $('#saveMappingBtn');
  if (!btn) return;
  if (isDirty) {
    btn.classList.add('dirty');
  } else {
    btn.classList.remove('dirty');
  }
}

// Wire auto-save to all connection fields (changes save automatically).
// Password input is excluded — we never persist passwords.
['#conn-server', '#conn-instance', '#conn-port', '#conn-database', '#conn-user'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('input', scheduleAutoSave);
});
['#conn-encrypt', '#conn-trust'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('change', scheduleAutoSave);
});

// ====== Dynamic query tabs (Phase 4.3) =====================================
//
// Queries are an ordered list, each with an id (sql_01, sql_02, ...) that
// also doubles as the data-tab and data-panel string. Panels are cloned from
// a <template> in index.html. Editors are CodeMirror instances created lazily.
//
// Migration: legacy mappings used { aluplast, whnet } as an object. On load
// we transparently rewrap them into the new ordered array shape.
// ---------------------------------------------------------------------------

const QUERY_ID_PREFIX = 'sql_';
// Phase 5.29 (S2): the query id that defaults to the Production element-grain
// spine when roles haven't been explicitly assigned by the user.
const PRODUCTION_SPINE_DEFAULT_ID = 'sql_05';

/**
 * Generate the next available query id (sql_01, sql_02, ..., sql_08).
 * Returns null if cap (8) reached.
 */
function nextQueryId() {
  const existing = new Set((currentMapping?.queries || []).map(q => q.id));
  for (let i = 1; i <= 8; i++) {
    const id = QUERY_ID_PREFIX + String(i).padStart(2, '0');
    if (!existing.has(id)) return id;
  }
  return null;
}

/**
 * Migrate a legacy mapping (with queries: {aluplast, whnet}) to the new shape.
 * Idempotent: if already migrated, returns as-is.
 */
function migrateMapping(raw) {
  if (!raw) return raw;

  // Phase 5.29 (S2): seed a per-query `role` for the Production multi-query
  // engine. Roles: 'spine' (element grain, grouped by key_Element — exactly
  // one), 'element-join' (element grain, merged by key_Element), 'order-join'
  // (order grain, merged by orderNo). Idempotent: never overwrites a role the
  // user already set. Default heuristic: the known production element query
  // (sql_05) → spine; everything else → order-join. If somehow no query is the
  // spine but sql_05 exists, it's made spine. This only seeds defaults; the
  // user can re-assign roles in the Mapping UI.
  function seedQueryRoles(obj) {
    if (!obj || !Array.isArray(obj.queries)) return obj;
    const qs = obj.queries;
    let hasSpine = qs.some(q => q && q.role === 'spine');
    for (const q of qs) {
      if (!q || typeof q !== 'object') continue;
      if (q.role === 'spine' || q.role === 'element-join' || q.role === 'order-join') continue; // user-set, keep
      if (!hasSpine && q.id === PRODUCTION_SPINE_DEFAULT_ID) {
        q.role = 'spine';
        hasSpine = true;
      } else {
        q.role = 'order-join';
      }
    }
    // If no spine got assigned but the default spine query exists, promote it.
    if (!qs.some(q => q && q.role === 'spine')) {
      const sp = qs.find(q => q && q.id === PRODUCTION_SPINE_DEFAULT_ID);
      if (sp) sp.role = 'spine';
    }
    return obj;
  }

  // Phase 5.19: nest variableMappings into { orders, production } sub-trees.
  // Runs independently of the v1→v2 query migration below so it triggers for
  // existing 5.18 installs (which already have raw.queries as an array).
  function ensureNamespacedVM(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const vm = obj.variableMappings || {};
    if (vm && typeof vm === 'object' && (vm.orders || vm.production)) {
      // already namespaced; only ensure both sub-trees exist
      if (!vm.orders)     vm.orders = {};
      if (!vm.production) vm.production = {};
      obj.variableMappings = vm;
      return seedQueryRoles(obj);
    }
    // Old flat shape — every existing key belongs to orders.
    obj.variableMappings = { orders: vm || {}, production: {} };
    return seedQueryRoles(obj);
  }

  // Already migrated (v1→v2 queries)? Still need namespacing migration.
  if (Array.isArray(raw.queries)) {
    return ensureNamespacedVM(raw);
  }

  const queries = [];
  const legacy = raw.queries || {};
  const order = ['aluplast', 'whnet'];

  let idx = 0;
  for (const legacyKey of order) {
    if (!legacy[legacyKey]) continue;
    idx++;
    const id = QUERY_ID_PREFIX + String(idx).padStart(2, '0');
    queries.push({
      id,
      name: id,
      sql: legacy[legacyKey].sql || '',
      resultColumns: legacy[legacyKey].resultColumns || [],
      previewLimit: 50,
      layout: {},
      // Remember the legacy key so we can rewrite variableMappings below
      _legacyKey: legacyKey,
    });
  }

  // Rewrite variableMappings: source 'aluplast' -> 'sql_01', 'whnet' -> 'sql_02', etc.
  const legacyToId = {};
  for (const q of queries) {
    if (q._legacyKey) legacyToId[q._legacyKey] = q.id;
    delete q._legacyKey;
  }
  const vm = raw.variableMappings || {};
  for (const name of Object.keys(vm)) {
    const m = vm[name];
    if (m && typeof m === 'object' && m.source && legacyToId[m.source]) {
      m.source = legacyToId[m.source];
    }
  }

  return ensureNamespacedVM({
    ...raw,
    version: 2,
    queries,
    variableMappings: vm,
  });
}

/**
 * Ensure currentMapping has the default seed queries on first run.
 * Called after load + migration. If no queries exist yet, seeds sql_01.
 */
function ensureDefaultQueries() {
  if (!currentMapping) currentMapping = {};
  if (!Array.isArray(currentMapping.queries)) currentMapping.queries = [];
  if (currentMapping.queries.length === 0) {
    currentMapping.queries.push({
      id: 'sql_01',
      name: 'sql_01',
      sql: '',
      resultColumns: [],
      previewLimit: 50,
      layout: {},
    });
  }
}

/**
 * Reconcile the dynamic query tabs against currentMapping.queries.
 * - Adds tabs for new queries
 * - Removes tabs for queries that no longer exist
 * - Updates label of existing tabs whose name changed
 * - Leaves the active class alone (switchTab manages that)
 */
function renderQueryTabs() {
  const tabsRoot = $('#mappingTabs');
  if (!tabsRoot) return;

  const queries = currentMapping?.queries || [];
  const wantedIds = new Set(queries.map(q => q.id));
  const beforeNode = tabsRoot.querySelector('.m-tab-static');

  // Remove tabs whose query no longer exists.
  Array.from(tabsRoot.querySelectorAll('.m-tab[data-query-id]')).forEach(t => {
    if (!wantedIds.has(t.dataset.queryId)) t.remove();
  });

  // For each query, either create or update its tab.
  const existingById = new Map();
  Array.from(tabsRoot.querySelectorAll('.m-tab[data-query-id]')).forEach(t => {
    existingById.set(t.dataset.queryId, t);
  });

  for (const q of queries) {
    const label = q.name || q.id;
    if (existingById.has(q.id)) {
      // Update label if changed
      const tab = existingById.get(q.id);
      const labelEl = tab.querySelector('.m-tab-label');
      if (labelEl && labelEl.textContent !== label) {
        labelEl.textContent = label;
      }
    } else {
      // Create new tab — insert before the static "Variable mapping" tab so order is preserved
      const btn = document.createElement('button');
      btn.className = 'm-tab';
      btn.dataset.tab = q.id;
      btn.dataset.queryId = q.id;
      btn.title = 'Double-click to rename. Use "− Query" to remove.';
      btn.innerHTML = `<span class="m-tab-label">${escapeHTML(label)}</span>`;
      tabsRoot.insertBefore(btn, beforeNode);
    }
  }

  // Show/hide + Query button based on cap
  const addBtn = $('#addQueryTabBtn');
  if (addBtn) addBtn.disabled = (queries.length >= 8);
  const delBtn = $('#deleteQueryTabBtn');
  if (delBtn) delBtn.disabled = (queries.length === 0);
}

/**
 * Reconcile the dynamic query panels against currentMapping.queries.
 * - Adds panels for new queries
 * - Removes panels for queries that no longer exist
 * - Leaves existing panels (and their CodeMirror editors) untouched
 *
 * This is critical: a naive `container.innerHTML = ''` would destroy the
 * DOM hosts of live CodeMirror editors, causing their content to vanish
 * when the user clicks + Query. Reconciling preserves all editor state.
 */
function renderQueryPanels() {
  const container = $('#queryPanelsContainer');
  const template = $('#query-panel-template');
  if (!container || !template) return;

  const queries = currentMapping?.queries || [];
  const wantedIds = new Set(queries.map(q => q.id));

  // Remove panels whose query no longer exists.
  const existingPanels = Array.from(container.querySelectorAll('.m-panel[data-query-id]'));
  for (const panel of existingPanels) {
    const pid = panel.dataset.queryId;
    if (!wantedIds.has(pid)) {
      // Destroy editor cleanly before removing the DOM node
      if (editors[pid]) {
        try { editors[pid].view.destroy(); } catch (e) {}
        delete editors[pid];
      }
      panel.remove();
    }
  }

  // Add panels for queries that don't yet have one.
  const existingIds = new Set(
    Array.from(container.querySelectorAll('.m-panel[data-query-id]'))
      .map(p => p.dataset.queryId)
  );
  for (const q of queries) {
    if (existingIds.has(q.id)) continue;

    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.m-panel');
    panel.dataset.panel = q.id;
    panel.dataset.queryId = q.id;
    panel.querySelector('.query-title').textContent = q.name || q.id;

    wireQueryPanel(panel, q);
    container.appendChild(panel);
  }
}

/**
 * Wire all per-panel controls. Stores no references on globals beyond
 * editors[id] / lastResultColumns[id] / lastResultRows[id].
 */
function wireQueryPanel(panel, query) {
  const id = query.id;

  // Run preview button
  panel.querySelector('[data-role="run"]').addEventListener('click', () => {
    runQueryFor(id);
  });

  // Load default button (only meaningful for sql_01 / sql_02 — has packaged defaults).
  // Show only for first two queries since those have packaged SQL.
  const loadBtn = panel.querySelector('[data-role="load-default"]');
  const queryIndex = (currentMapping?.queries || []).findIndex(q => q.id === id);
  if (queryIndex < 2) {
    loadBtn.hidden = false;
    loadBtn.addEventListener('click', async () => {
      if (!editors[id]) initEditor(id);
      const which = queryIndex === 0 ? 'aluplast' : 'whnet';
      await loadDefaultSqlInto(id, which);
    });
  }

  // Preview-limit dropdown
  const limitSel = panel.querySelector('[data-role="preview-limit"]');
  limitSel.value = String(query.previewLimit ?? 50);
  limitSel.addEventListener('change', () => {
    const def = currentMapping.queries.find(q => q.id === id);
    if (def) def.previewLimit = limitSel.value === 'all' ? 'all' : Number(limitSel.value);
    scheduleAutoSave();
    if (lastResultRows[id] && lastResultColumns[id]) {
      renderPreviewTable(id, lastResultRows[id], lastResultColumns[id]);
    }
  });

  // Excel export button — disabled until a query has been run with rows
  const exportBtn = panel.querySelector('[data-role="export-xlsx"]');
  if (exportBtn) {
    // If we have cached results (from a prior session), enable immediately
    if ((lastResultRows[id]?.length || 0) > 0) {
      exportBtn.disabled = false;
      exportBtn.title = 'Export current preview to .xlsx';
    }
    exportBtn.addEventListener('click', () => exportResultsToXlsx(id));
  }

  // Splitters
  setupVerticalSplitter(panel, id);
  setupHorizontalSplitter(panel, id);

  // Apply saved layout
  applyPanelLayout(panel, query.layout);
}

/**
 * Initialize CodeMirror for a query (idempotent — safe to call multiple times).
 */
function initEditor(id) {
  if (editors[id]) return;
  if (typeof window.CMSQL === 'undefined') {
    console.error('CMSQL bundle did not load.');
    return;
  }
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  if (!panel) return;
  const host = panel.querySelector('[data-role="editor"]');
  if (!host) return;

  const def = currentMapping.queries.find(q => q.id === id);
  if (!def) return;

  const initial = def.sql || '';
  editors[id] = window.CMSQL.create(host, {
    initialValue: initial,
    onChange: () => {
      // Mirror back into the model immediately so buildMappingFromUI sees latest
      const q = currentMapping.queries.find(qq => qq.id === id);
      if (q) q.sql = editors[id].getValue();
      scheduleAutoSave();
    },
  });

  if (def.resultColumns?.length) {
    renderResultColumns(id, def.resultColumns);
  }

  // Auto-load packaged default for the first two queries if they are empty.
  if (!initial) {
    const idx = currentMapping.queries.findIndex(q => q.id === id);
    if (idx === 0) loadDefaultSqlInto(id, 'aluplast');
    else if (idx === 1) loadDefaultSqlInto(id, 'whnet');
  }
}

/**
 * Load the packaged SQL text into the given query's editor.
 */
async function loadDefaultSqlInto(id, which) {
  try {
    const result = await window.configAPI.loadDefaultSql(which);
    if (result.ok && editors[id]) {
      editors[id].setValue(result.sql);
    } else if (!result.ok) {
      console.error('Failed to load default SQL:', result.error);
    }
  } catch (err) {
    console.error('Failed to load default SQL:', err);
  }
}

/**
 * Render the "Result columns" panel for the given query.
 */
function renderResultColumns(id, cols) {
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  if (!panel) return;
  const listEl = panel.querySelector('[data-role="cols-list"]');
  const countEl = panel.querySelector('[data-role="cols-count"]');
  if (!listEl) return;

  if (!cols || cols.length === 0) {
    listEl.innerHTML = '<div class="result-columns-empty">No columns returned.</div>';
    if (countEl) countEl.textContent = '—';
    return;
  }
  if (countEl) countEl.textContent = cols.length + ' col' + (cols.length === 1 ? '' : 's');

  const rows = cols.map(c => `
    <div class="result-col-row" title="${escapeAttr(c.name)}">
      <span class="name">${escapeHTML(c.name)}</span>
      <span class="type">${escapeHTML(c.type || '')}</span>
    </div>
  `).join('');
  listEl.innerHTML = rows;
}

/**
 * Run the SQL for the given query.
 */
async function runQueryFor(id) {
  if (!editors[id]) {
    setQueryStatus(id, 'error', 'Editor not initialized.');
    return;
  }
  const config = getConnectionConfig();
  if (!config.server || !config.user || !config.password) {
    setQueryStatus(id, 'error', 'Fill in the Connection tab first (server, username, password).');
    return;
  }
  if (!config.database) config.database = 'master';

  const sqlText = editors[id].getValue().trim();
  if (!sqlText) {
    setQueryStatus(id, 'error', 'Query is empty.');
    return;
  }

  setQueryStatus(id, 'running', 'Running…');
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  const runBtn = panel.querySelector('[data-role="run"]');
  runBtn.disabled = true;

  try {
    const result = await window.sqlAPI.runQuery(config, sqlText);
    if (!result.ok) {
      setQueryStatus(id, 'error', `Failed in ${result.elapsedMs}ms`);
      renderSqlError(id, result.error);
      runBtn.disabled = false;
      return;
    }

    const rows = result.rows || [];
    lastResultRows[id] = rows;
    setQueryStatus(id, 'running', `Got ${result.rowCount} rows in ${result.elapsedMs}ms — rendering…`);

    setTimeout(() => {
      try {
        const cols = extractColumnsFromRows(rows);
        lastResultColumns[id] = cols;

        // Persist cols into the model
        const def = currentMapping.queries.find(q => q.id === id);
        if (def) def.resultColumns = cols;

        renderResultColumns(id, cols);

        setTimeout(() => {
          try {
            renderPreviewTable(id, rows, cols);
            setQueryStatus(id, 'success', `${result.rowCount} row${result.rowCount === 1 ? '' : 's'} · ${result.elapsedMs}ms`);
            // Enable Excel export button now that we have rows
            const xlsxBtn = panel.querySelector('[data-role="export-xlsx"]');
            if (xlsxBtn) {
              xlsxBtn.disabled = (rows.length === 0);
              xlsxBtn.title = rows.length === 0 ? 'No rows to export' : 'Export current preview to .xlsx';
            }
          } catch (renderErr) {
            console.error('renderPreviewTable error:', renderErr);
            setQueryStatus(id, 'error', 'Render failed — see console');
          } finally {
            runBtn.disabled = false;
            scheduleAutoSave();
          }
        }, 0);
      } catch (extractErr) {
        console.error('extractColumnsFromRows error:', extractErr);
        setQueryStatus(id, 'error', 'Column extraction failed — see console');
        runBtn.disabled = false;
      }
    }, 0);
  } catch (err) {
    setQueryStatus(id, 'error', `Unexpected error`);
    renderSqlError(id, err.message || String(err));
    runBtn.disabled = false;
  }
}

function extractColumnsFromRows(rows) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(name => {
    let type = 'unknown';
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const v = rows[i][name];
      if (v == null) continue;
      if (v instanceof Date) { type = 'date'; break; }
      if (typeof v === 'number') { type = Number.isInteger(v) ? 'int' : 'decimal'; break; }
      if (typeof v === 'boolean') { type = 'bool'; break; }
      if (typeof v === 'string') { type = 'string'; break; }
      type = typeof v;
      break;
    }
    return { name, type };
  });
}

const VROW_HEIGHT = 22;
const VBUFFER = 8;
const WIDTH_SAMPLE_SIZE = 10;

function renderPreviewTable(id, rows, cols) {
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  if (!panel) return;
  const previewEl = panel.querySelector('[data-role="preview"]');
  const infoEl = panel.querySelector('[data-role="preview-info"]');
  if (!previewEl) return;

  if (!rows || rows.length === 0) {
    previewEl.innerHTML = '<div class="preview-empty">Query returned 0 rows.</div>';
    if (infoEl) infoEl.textContent = '0 rows';
    return;
  }

  const def = currentMapping.queries.find(q => q.id === id);
  const limit = def?.previewLimit ?? 50;
  const displayRows = (limit === 'all') ? rows : rows.slice(0, limit);

  if (infoEl) {
    if (limit !== 'all' && rows.length > limit) {
      infoEl.textContent = `Showing first ${limit} of ${rows.length} rows · ${cols.length} cols`;
    } else {
      infoEl.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} · ${cols.length} cols`;
    }
  }

  renderPreviewVirtualized(previewEl, displayRows, cols);
}

function renderPreviewVirtualized(previewEl, rows, cols) {
  const t0 = performance.now();
  const colMeta = measureColumnWidths(rows, cols);
  const totalHeight = rows.length * VROW_HEIGHT;
  // Sum of all column widths — used to set explicit horizontal extent on the
  // vlist container, so its absolutely-positioned window doesn't collapse to
  // the visible body width (which caused header/row drift on horizontal scroll).
  const totalWidth = colMeta.reduce((sum, c) => sum + c.width, 0);

  const headerHTML = colMeta.map((c, i) =>
    `<span class="cell" style="width:${c.width}px"><span class="col-num">${i + 1}</span>${escapeHTML(c.name)}</span>`
  ).join('');

  previewEl.innerHTML = `
    <div class="preview-vlist-head" style="width:${totalWidth}px">${headerHTML}</div>
    <div class="preview-vlist" style="height:${totalHeight}px;width:${totalWidth}px">
      <div class="vlist-window" style="width:${totalWidth}px"></div>
    </div>
  `;

  const winEl = previewEl.querySelector('.vlist-window');
  let lastFirst = -1;

  function renderWindow() {
    const scrollTop = previewEl.scrollTop;
    const visibleHeight = previewEl.clientHeight;
    const first = Math.max(0, Math.floor(scrollTop / VROW_HEIGHT) - VBUFFER);
    const last = Math.min(rows.length, Math.ceil((scrollTop + visibleHeight) / VROW_HEIGHT) + VBUFFER);

    if (first === lastFirst) return;
    lastFirst = first;

    const lines = new Array(last - first);
    for (let i = first; i < last; i++) {
      lines[i - first] = buildVRow(rows[i], colMeta);
    }
    winEl.style.transform = `translateY(${first * VROW_HEIGHT}px)`;
    winEl.innerHTML = lines.join('');
  }

  // ----- Scroll listener with cleanup ---------------------------------------
  // Previous renders may have attached a listener. Remove it before re-attaching
  // so we never accumulate listeners across multiple Run preview clicks.
  if (previewEl._scrollHandler) {
    previewEl.removeEventListener('scroll', previewEl._scrollHandler);
  }
  let rafScheduled = false;
  const scrollHandler = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      renderWindow();
    });
  };
  previewEl._scrollHandler = scrollHandler;
  previewEl.addEventListener('scroll', scrollHandler, { passive: true });

  renderWindow();
  console.log(`[preview] virtualized render: ${rows.length} rows × ${cols.length} cols in ${(performance.now() - t0).toFixed(1)}ms`);
}

function measureColumnWidths(rows, cols) {
  const sampleSize = Math.min(rows.length, WIDTH_SAMPLE_SIZE);
  return cols.map((c, i) => {
    let maxLen = c.name.length;
    for (let row_i = 0; row_i < sampleSize; row_i++) {
      const v = rows[row_i][c.name];
      if (v == null) continue;
      let s = (v instanceof Date) ? formatDate(v) : String(v);
      if (s.length > maxLen) maxLen = s.length;
    }
    // Base width by content length + extra space for the col-num badge in the header.
    // Badge is ~20px (digits + padding + margin); we always reserve room for up to 3 digits.
    const colNumExtra = 24;
    const w = Math.max(70, Math.min(280, maxLen * 7 + 20 + colNumExtra));
    return { name: c.name, width: w };
  });
}

function buildVRow(row, colMeta) {
  let html = '<div class="preview-vlist-row">';
  for (let j = 0; j < colMeta.length; j++) {
    const c = colMeta[j];
    const v = row[c.name];
    if (v == null) {
      html += `<span class="cell is-null" style="width:${c.width}px">NULL</span>`;
    } else if (v instanceof Date) {
      html += `<span class="cell" style="width:${c.width}px">${escapeHTML(formatDate(v))}</span>`;
    } else {
      html += `<span class="cell" style="width:${c.width}px">${escapeHTML(String(v))}</span>`;
    }
  }
  html += '</div>';
  return html;
}

// ====== Excel export ======================================================

/**
 * Export the most recent preview results for a query as an .xlsx file.
 * Uses SheetJS (loaded as window.XLSX from vendor/sheetjs.js).
 */
function exportResultsToXlsx(id) {
  if (typeof window.XLSX === 'undefined') {
    console.error('SheetJS bundle did not load — check public/vendor/sheetjs.js');
    modal.alert({ title: 'Export failed', message: 'Excel export library did not load. Check the console.' });
    return;
  }

  const rows = lastResultRows[id];
  const cols = lastResultColumns[id];
  if (!rows || rows.length === 0 || !cols || cols.length === 0) {
    modal.alert({ title: 'Nothing to export', message: 'Run the query first.' });
    return;
  }

  // Build a 2D array: first row = headers, then data rows.
  // Using AoA (array of arrays) instead of json_to_sheet gives us full control
  // over column order and lets dates pass through cleanly.
  const colNames = cols.map(c => c.name);
  const aoa = [colNames];
  for (const row of rows) {
    const line = new Array(colNames.length);
    for (let j = 0; j < colNames.length; j++) {
      const v = row[colNames[j]];
      // Pass values through directly. SheetJS detects types:
      // - Date -> Excel date cell
      // - Number -> Excel number cell
      // - String -> text
      // - null/undefined -> empty cell
      line[j] = (v === undefined) ? null : v;
    }
    aoa.push(line);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths based on header text length (approximation)
  ws['!cols'] = cols.map(c => ({ wch: Math.max(10, Math.min(40, c.name.length + 4)) }));

  // Freeze the header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = window.XLSX.utils.book_new();
  const def = currentMapping?.queries?.find(q => q.id === id);
  const sheetName = (def?.name || id).substring(0, 31); // Excel sheet name max 31 chars
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Filename: <tabname>_<YYYYMMDD>_<HHMM>.xlsx
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  // Sanitize tabname for filename: remove anything not letter/digit/underscore/dash
  const cleanName = (def?.name || id).replace(/[^A-Za-z0-9_\-]/g, '_');
  const filename = `${cleanName}_${ts}.xlsx`;

  try {
    window.XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error('Excel export failed:', err);
    modal.alert({ title: 'Export failed', message: err.message || String(err) });
  }
}

/**
 * Export the Variable Mapping table as .xlsx.
 * Columns: Group | Variable | Source query | Source column | Auto | Sample | Notes
 */
function exportVariableMappingToXlsx() {
  if (typeof window.XLSX === 'undefined') {
    modal.alert({ title: 'Export failed', message: 'Excel export library did not load.' });
    return;
  }

  const queries = currentMapping?.queries || [];
  const queryNameById = new Map(queries.map(q => [q.id, q.name || q.id]));
  const vm = vmGet(activeVmSubtab);

  const header = ['Group', 'Variable', 'Source query', 'Source column', 'Auto', 'Sample', 'Notes'];
  const aoa = [header];

  // Walk groups in the same order as the screen
  for (const group of activeVariableGroups()) {
    for (const v of group.vars) {
      const m = vm[v.name];
      const isOperator = v.preferredSource === 'operator';

      let sourceLabel = '';
      let columnLabel = '';
      let autoFlag = '';
      let sample = '';
      let notes = '';

      if (isOperator) {
        sourceLabel = '(operator-only)';
        if (m && typeof m === 'object') notes = m.notes || '';
      } else if (m && typeof m === 'object') {
        sourceLabel = m.source ? (queryNameById.get(m.source) || m.source) : '';
        columnLabel = m.column || '';
        autoFlag = m.auto ? 'yes' : '';
        notes = m.notes || '';
        // Sample from row 0 of the source query's last result
        if (m.source && m.column) {
          const rows = lastResultRows[m.source];
          if (rows && rows.length > 0) {
            const v0 = rows[0][m.column];
            sample = (v0 == null) ? 'NULL' : (v0 instanceof Date ? formatDate(v0) : String(v0));
          }
        }
      }

      aoa.push([group.title, v.name, sourceLabel, columnLabel, autoFlag, sample, notes]);
    }
  }

  // Custom variables — those that aren't in VARIABLE_INDEX
  const customNames = Object.keys(vm).filter(n => !VARIABLE_INDEX.has(n));
  for (const name of customNames) {
    const m = vm[name];
    if (!m || typeof m !== 'object') continue;
    let sample = '';
    if (m.source && m.column) {
      const rows = lastResultRows[m.source];
      if (rows && rows.length > 0) {
        const v0 = rows[0][m.column];
        sample = (v0 == null) ? 'NULL' : (v0 instanceof Date ? formatDate(v0) : String(v0));
      }
    }
    aoa.push([
      'Custom',
      name,
      m.source ? (queryNameById.get(m.source) || m.source) : '',
      m.column || '',
      m.auto ? 'yes' : '',
      sample,
      m.notes || '',
    ]);
  }

  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 16 }, // Group
    { wch: 24 }, // Variable
    { wch: 20 }, // Source query
    { wch: 24 }, // Source column
    { wch: 6 },  // Auto
    { wch: 28 }, // Sample
    { wch: 40 }, // Notes
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Variable mapping');

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `variable_mapping_${ts}.xlsx`;

  try {
    window.XLSX.writeFile(wb, filename);
  } catch (err) {
    console.error('Excel export failed:', err);
    modal.alert({ title: 'Export failed', message: err.message || String(err) });
  }
}

function setQueryStatus(id, state, msg) {
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  if (!panel) return;
  const el = panel.querySelector('[data-role="status"]');
  if (!el) return;
  el.className = 'query-status ' + state;
  el.innerHTML = `<span class="dot"></span><span>${escapeHTML(msg)}</span>`;
}

function renderSqlError(id, errorText) {
  const panel = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"]`);
  if (!panel) return;
  const previewEl = panel.querySelector('[data-role="preview"]');
  if (!previewEl) return;
  previewEl.innerHTML = `<div class="sql-error-detail">${escapeHTML(errorText)}</div>`;
  const infoEl = panel.querySelector('[data-role="preview-info"]');
  if (infoEl) infoEl.textContent = '';
}

// ====== Small utilities ====================================================

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHTML(s); }
function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function cssEscapeId(s) {
  // For attribute selectors — escape quotes/backslashes
  return String(s).replace(/(["\\])/g, '\\$1');
}

// ====== + Add query / × Remove / Rename ====================================

$('#addQueryTabBtn').addEventListener('click', async () => {
  const newId = nextQueryId();
  if (!newId) {
    await modal.alert({ title: 'Limit reached', message: 'Maximum of 8 query tabs reached.' });
    return;
  }
  if (!currentMapping) currentMapping = {};
  if (!Array.isArray(currentMapping.queries)) currentMapping.queries = [];
  currentMapping.queries.push({
    id: newId,
    name: newId,
    sql: '',
    resultColumns: [],
    previewLimit: 50,
    layout: {},
  });
  renderQueryTabs();
  renderQueryPanels();
  scheduleAutoSave();
  switchTab(newId);
});

$('#deleteQueryTabBtn').addEventListener('click', async () => {
  const queries = currentMapping?.queries || [];
  if (queries.length === 0) {
    await modal.alert({ title: 'Nothing to delete', message: 'There are no query tabs.' });
    return;
  }
  // Use a picker — visual list, click to pick
  const items = queries.map(q => ({
    label: q.name || q.id,
    sub: q.id !== q.name ? q.id : '',
    id: q.id,
  }));
  const picked = await modal.picker({
    title: 'Delete a query tab',
    message: 'Click the tab you want to delete:',
    items,
  });
  if (!picked) return;

  const confirmed = await modal.confirm({
    title: 'Confirm delete',
    message: `Remove tab "${picked.label}" and its query? This cannot be undone.`,
  });
  if (!confirmed) return;

  removeQueryTab(picked.id);
});

async function removeQueryTab(id) {
  // Remove editor instance + result caches
  if (editors[id]) {
    try { editors[id].view.destroy(); } catch (e) {}
    delete editors[id];
  }
  delete lastResultColumns[id];
  delete lastResultRows[id];
  // Remove from model
  if (currentMapping?.queries) {
    currentMapping.queries = currentMapping.queries.filter(q => q.id !== id);
  }
  // Clean up variableMappings that pointed here — both sub-tabs
  for (const sub of ['orders', 'production']) {
    const vm = vmGet(sub);
    for (const name of Object.keys(vm)) {
      const m = vm[name];
      if (m && typeof m === 'object' && m.source === id) {
        vm[name] = { source: null, column: null };
      }
    }
  }
  renderQueryTabs();
  renderQueryPanels();
  if (activeQueryId === id) switchTab('connection');
  scheduleAutoSave();
}

async function renameQueryTab(id) {
  const def = currentMapping?.queries?.find(q => q.id === id);
  if (!def) return;
  const newName = await modal.prompt({
    title: 'Rename tab',
    message: `Enter a new name for "${def.name || id}":`,
    defaultValue: def.name || id,
  });
  if (!newName) return;
  const clean = newName.trim();
  if (!clean) return;
  def.name = clean;
  // Update label without full re-render
  const tab = document.querySelector(`.m-tab[data-query-id="${cssEscapeId(id)}"] .m-tab-label`);
  if (tab) tab.textContent = clean;
  const panelTitle = document.querySelector(`.m-panel[data-panel="${cssEscapeId(id)}"] .query-title`);
  if (panelTitle) panelTitle.textContent = clean;
  scheduleAutoSave();
}

// ====== Resizable splitters ================================================

/**
 * Vertical splitter between editor and result-columns panel (drag horizontally).
 * Persists width of result columns panel in query.layout.colsWidth.
 */
function setupVerticalSplitter(panel, id) {
  const handle = panel.querySelector('[data-role="split-v"]');
  const colsWrap = panel.querySelector('[data-role="cols-wrap"]');
  if (!handle || !colsWrap) return;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colsWrap.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const newW = Math.max(140, Math.min(600, startW - dx));
      colsWrap.style.width = newW + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist
      const def = currentMapping.queries.find(q => q.id === id);
      if (def) {
        def.layout = def.layout || {};
        def.layout.colsWidth = colsWrap.getBoundingClientRect().width;
      }
      scheduleAutoSave();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/**
 * Horizontal splitter between editor area and preview panel (drag vertically).
 */
function setupHorizontalSplitter(panel, id) {
  const handle = panel.querySelector('[data-role="split-h"]');
  const previewPanel = panel.querySelector('[data-role="preview-panel"]');
  if (!handle || !previewPanel) return;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = previewPanel.getBoundingClientRect().height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const dy = ev.clientY - startY;
      const newH = Math.max(80, Math.min(window.innerHeight - 300, startH - dy));
      previewPanel.style.height = newH + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const def = currentMapping.queries.find(q => q.id === id);
      if (def) {
        def.layout = def.layout || {};
        def.layout.previewHeight = previewPanel.getBoundingClientRect().height;
      }
      scheduleAutoSave();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function applyPanelLayout(panel, layout) {
  if (!layout) return;
  if (layout.colsWidth) {
    const w = panel.querySelector('[data-role="cols-wrap"]');
    if (w) w.style.width = layout.colsWidth + 'px';
  }
  if (layout.previewHeight) {
    const p = panel.querySelector('[data-role="preview-panel"]');
    if (p) p.style.height = layout.previewHeight + 'px';
  }
}


// ====== Variable Mapping (Phase 4) =========================================

/**
 * Master list of wireframe variables, grouped by category.
 * Order here = order on the screen.
 *
 * preferredSource: which source we expect by default (drives auto-mapping).
 *                  'operator' means this is operator-only (no DB source ever).
 */
const VARIABLE_GROUPS = [
  {
    title: 'Identification',
    vars: [
      { name: 'orderNo',      preferredSource: 'aluplast' },
      { name: 'customerCode', preferredSource: 'aluplast' },
      { name: 'pcs',          preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Classification',
    vars: [
      { name: 'orderType',        preferredSource: 'aluplast' },
      { name: 'STR_STI_STP_MRK',  preferredSource: 'aluplast' },
      { name: 'NoFr',             preferredSource: 'aluplast' },
      { name: 'orderTypeDetail',  preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Status',
    vars: [
      { name: 'status',       preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Dates',
    vars: [
      { name: 'finValid',     preferredSource: 'aluplast' },
      { name: 'dd',           preferredSource: 'aluplast' },
      { name: 'termRe',       preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Materials',
    vars: [
      { name: 'matP_promised', preferredSource: 'aluplast' },
      { name: 'matP_actual',   preferredSource: 'aluplast' },
      { name: 'matF_promised', preferredSource: 'aluplast' },
      { name: 'matF_actual',   preferredSource: 'aluplast' },
      { name: 'matA_promised', preferredSource: 'aluplast' },
      { name: 'matA_actual',   preferredSource: 'aluplast' },
      { name: 'matG_promised', preferredSource: 'aluplast' },
      { name: 'matG_actual',   preferredSource: 'aluplast' },
      { name: 'matR_promised', preferredSource: 'aluplast' },
      { name: 'matR_actual',   preferredSource: 'aluplast' },
      { name: 'matD_promised', preferredSource: 'aluplast' },
      { name: 'matD_actual',   preferredSource: 'aluplast' },
      { name: 'matO_promised', preferredSource: 'aluplast' },
      { name: 'matO_actual',   preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Production',
    vars: [
      { name: 'optiBatch',             preferredSource: 'whnet' },
      { name: 'lastScanStage',         preferredSource: 'whnet' },
      { name: 'lastScanWorkstation',   preferredSource: 'whnet' },
      { name: 'lastScanTime',          preferredSource: 'whnet' },
    ],
  },
  {
    title: 'Warehouse',
    vars: [
      { name: 'palletCount',   preferredSource: 'whnet' },
      { name: 'packedCount',   preferredSource: 'whnet' },
      { name: 'deliveryCity',  preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Routing & notes',
    vars: [
      { name: 'assignedRoute', preferredSource: 'operator' },
      { name: 'description',   preferredSource: 'operator' },
    ],
  },
];

/**
 * Flat lookup: variable name -> metadata
 */
const VARIABLE_INDEX = (() => {
  const map = new Map();
  for (const g of VARIABLE_GROUPS) {
    for (const v of g.vars) map.set(v.name, v);
  }
  return map;
})();

/**
 * Phase 5.19: Production sub-tab variable groups.
 * Mirrors VARIABLE_GROUPS in shape; consumed by production.js via mapping.json.
 * 'preferredSource: aluplast' resolves to the first query (typically sql_05).
 * All Production vars come from the production query but the source picker is
 * per-variable, matching the Orders UX (multiple-query possibility).
 */
const PRODUCTION_VARIABLE_GROUPS = [
  {
    title: 'Identification',
    vars: [
      { name: 'orderNo',   preferredSource: 'aluplast' },
      { name: 'product',   preferredSource: 'aluplast' },
      { name: 'prodWeek',  preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Order status',
    vars: [
      { name: 'orderStatus',    preferredSource: 'aluplast' },
      { name: 'statusDate',     preferredSource: 'aluplast' },
      { name: 'promisedDeliv',  preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Element address',
    vars: [
      { name: 'srcdoc',     preferredSource: 'aluplast' },
      { name: 'pos',        preferredSource: 'aluplast' },
      { name: 'oscRaw',     preferredSource: 'aluplast' },
      { name: 'osc',        preferredSource: 'aluplast' },
      { name: 'skr',        preferredSource: 'aluplast' },
      { name: 'piece',      preferredSource: 'aluplast' },
      { name: 'keyFrame',   preferredSource: 'aluplast' },
      { name: 'keyElement', preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Element identity',
    vars: [
      { name: 'fs',         preferredSource: 'aluplast' },
      { name: 'optym',      preferredSource: 'aluplast' },
      { name: 'zakonczone', preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Element dimensions',
    vars: [
      { name: 'color',  preferredSource: 'aluplast' },
      { name: 'frameW', preferredSource: 'aluplast' },
      { name: 'frameH', preferredSource: 'aluplast' },
      { name: 'sashW',  preferredSource: 'aluplast' },
      { name: 'sashH',  preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Element metadata',
    vars: [
      { name: 'termRealizacjiOferty', preferredSource: 'aluplast' },
      { name: 'whnetZleceniaIndeks',  preferredSource: 'aluplast' },
      { name: 'optymalizacja',        preferredSource: 'aluplast' },
      { name: 'typ',                  preferredSource: 'aluplast' },
      { name: 'idxTypu',              preferredSource: 'aluplast' },
      { name: 'iloscJedn',            preferredSource: 'aluplast' },
      { name: 'iloscJednPoz',         preferredSource: 'aluplast' },
      { name: 'liczbaSzklen',         preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Current position',
    vars: [
      { name: 'lastStanowisko',       preferredSource: 'aluplast' },
      { name: 'lastStanowiskoOpis',   preferredSource: 'aluplast' },
      { name: 'lastNo',               preferredSource: 'aluplast' },
      { name: 'lastScanData',         preferredSource: 'aluplast' },
      { name: 'lastProdStatus',       preferredSource: 'aluplast' },
      { name: 'lastEnglish',          preferredSource: 'aluplast' },
      { name: 'lastNextStep',         preferredSource: 'aluplast' },
      { name: 'stanowiskoPoprzednie', preferredSource: 'aluplast' },
      { name: 'firstStanowisko',      preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Element timing',
    vars: [
      { name: 'dataWejscia',     preferredSource: 'aluplast' },
      { name: 'dataZakonczenia', preferredSource: 'aluplast' },
      { name: 'terminRealizacji',preferredSource: 'aluplast' },
      { name: 'paczka',          preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Scan history',
    vars: [
      { name: 'scanData',           preferredSource: 'aluplast' },
      { name: 'scanStanowisko',     preferredSource: 'aluplast' },
      { name: 'scanStanowiskoOpis', preferredSource: 'aluplast' },
      { name: 'scanNo',             preferredSource: 'aluplast' },
      { name: 'scanProdStatus',     preferredSource: 'aluplast' },
      { name: 'scanEnglish',        preferredSource: 'aluplast' },
      { name: 'scanNextStep',       preferredSource: 'aluplast' },
    ],
  },
  {
    title: 'Diagnostics',
    vars: [
      { name: 'unmappedCount',            preferredSource: 'aluplast' },
      { name: 'unmappedScans',            preferredSource: 'aluplast' },
      { name: 'elementMatchStatus',       preferredSource: 'aluplast' },
      { name: 'scanMatchStatus',          preferredSource: 'aluplast' },
      { name: 'workstationMappingStatus', preferredSource: 'aluplast' },
    ],
  },
];

const PRODUCTION_VARIABLE_INDEX = (() => {
  const map = new Map();
  for (const g of PRODUCTION_VARIABLE_GROUPS) {
    for (const v of g.vars) map.set(v.name, v);
  }
  return map;
})();

const VARIABLE_GROUPS_BY_SUB   = { orders: VARIABLE_GROUPS,  production: PRODUCTION_VARIABLE_GROUPS };
const VARIABLE_INDEX_BY_SUB    = { orders: VARIABLE_INDEX,   production: PRODUCTION_VARIABLE_INDEX };

function activeVariableGroups() { return VARIABLE_GROUPS_BY_SUB[activeVmSubtab] || VARIABLE_GROUPS; }
function activeVariableIndex()  { return VARIABLE_INDEX_BY_SUB[activeVmSubtab]  || VARIABLE_INDEX; }

/**
 * Build the auto-mapping for a single variable.
 * Returns {source, column} or {source: null, column: null}.
 *
 * Algorithm:
 *  1. If preferredSource == 'operator', no mapping.
 *  2. Look in preferredSource's result columns for an exact name match.
 *  3. If not found, look in the other source's result columns.
 *  4. Fallback: case-insensitive match.
 */
/**
 * Look up result columns for a query by id.
 */
function getQueryById(id) {
  return (currentMapping?.queries || []).find(q => q.id === id) || null;
}
function getQueryColumns(id) {
  return getQueryById(id)?.resultColumns || [];
}

/**
 * Resolve a "semantic" source name (aluplast/whnet) to an actual query id.
 * Used by variable definitions in VARIABLE_GROUPS. 'aluplast' -> first query,
 * 'whnet' -> second query. Returns null if no such query exists.
 */
function resolveSemanticSource(semantic) {
  const queries = currentMapping?.queries || [];
  if (semantic === 'aluplast') return queries[0]?.id || null;
  if (semantic === 'whnet')    return queries[1]?.id || null;
  // If semantic is already a real id, just return it as-is
  if (queries.some(q => q.id === semantic)) return semantic;
  return null;
}

function autoMapVariable(varName, meta) {
  if (meta.preferredSource === 'operator') {
    return { source: null, column: null };
  }
  const preferredId = resolveSemanticSource(meta.preferredSource);
  const queries = currentMapping?.queries || [];

  // Build search order: preferred first, then everyone else
  const ordered = [];
  if (preferredId) ordered.push(preferredId);
  for (const q of queries) if (q.id !== preferredId) ordered.push(q.id);

  // Exact name match first
  for (const qid of ordered) {
    const cols = getQueryColumns(qid);
    if (cols.some(c => c.name === varName)) {
      return { source: qid, column: varName, auto: true };
    }
  }
  // Case-insensitive fallback
  const lc = varName.toLowerCase();
  for (const qid of ordered) {
    const cols = getQueryColumns(qid);
    const hit = cols.find(c => c.name.toLowerCase() === lc);
    if (hit) return { source: qid, column: hit.name, auto: true };
  }
  return { source: null, column: null };
}

/**
 * Apply auto-mapping to every variable that doesn't already have a user-chosen mapping.
 * Also clears any mapping whose column no longer exists in result columns.
 */
function applyAutoMappings({ force = false } = {}) {
  const vm = vmGet(activeVmSubtab);
  const queries = currentMapping?.queries || [];
  const validSourceIds = new Set(queries.map(q => q.id));

  for (const [name, meta] of activeVariableIndex()) {
    const existing = vm[name];

    // Operator-only: store explicit null (the JSON sentinel)
    if (meta.preferredSource === 'operator') {
      if (existing !== null) vm[name] = null;
      continue;
    }

    // Clear stale mappings whose source query no longer exists or whose target column disappeared
    if (existing && existing.source && existing.column) {
      if (!validSourceIds.has(existing.source)) {
        delete vm[name];
      } else {
        const cols = getQueryColumns(existing.source);
        if (!cols.some(c => c.name === existing.column)) {
          delete vm[name];
        }
      }
    }

    // Auto-map if forced or there's nothing user-chosen yet
    const fresh = vm[name];
    const isEmpty = !fresh || (!fresh.source && !fresh.column);
    if (force || isEmpty) {
      const guess = autoMapVariable(name, meta);
      vm[name] = guess;
    }
  }

  if (!currentMapping) currentMapping = {};
  vmSet(activeVmSubtab, vm);
}

/**
 * Render the variable mapping screen — all groups, all rows.
 */
function renderVariableMapping() {
  const groupsEl = $('#vm-groups');
  if (!groupsEl) return;

  const queries = currentMapping?.queries || [];
  const anyHaveColumns = queries.some(q => (q.resultColumns || []).length > 0);
  const hintEl = $('#vm-hint');
  if (hintEl) hintEl.hidden = anyHaveColumns;

  // Apply auto-mapping for any variables not yet mapped (active sub-tab only)
  applyAutoMappings();

  const vm = vmGet(activeVmSubtab);
  const customVars = collectCustomVariables();

  const groupsHTML = activeVariableGroups().map(g => renderGroup(g, vm, queries)).join('');
  const customHTML = customVars.length > 0
    ? renderGroup(
        { title: 'Custom variables', vars: customVars },
        vm, queries, { isCustom: true }
      )
    : '';

  groupsEl.innerHTML = groupsHTML + customHTML;

  wireRowEvents();
  renderUnmappedWarning();
}

/**
 * Return custom-added variables (anything in active sub-tab's variableMappings
 * that's not in that sub-tab's VARIABLE_INDEX).
 */
function collectCustomVariables() {
  const vm = vmGet(activeVmSubtab);
  const idx = activeVariableIndex();
  const customs = [];
  for (const name of Object.keys(vm)) {
    if (!idx.has(name)) {
      customs.push({ name, preferredSource: 'aluplast', isCustom: true });
    }
  }
  return customs;
}

function renderGroup(group, vm, queries, opts = {}) {
  const rows = group.vars.map(v => renderRow(v, vm[v.name] ?? null, queries, opts)).join('');
  return `
    <div class="vm-group" data-group="${escapeAttr(group.title)}">
      <div class="vm-group-header">
        <span>${escapeHTML(group.title)}</span>
        <span class="vm-group-count">${group.vars.length} var${group.vars.length === 1 ? '' : 's'}</span>
      </div>
      <table class="vm-table">
        <thead>
          <tr>
            <th class="vm-col-var">Variable</th>
            <th class="vm-col-source">Source</th>
            <th class="vm-col-column">Column</th>
            <th class="vm-col-sample">Sample</th>
            <th class="vm-col-notes">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(meta, mapping, queries, opts = {}) {
  const varName = meta.name;
  const isOperator = meta.preferredSource === 'operator';
  const isCustom = !!opts.isCustom;

  // Operator-only: just show a tag, no source/column controls
  if (isOperator) {
    return `
      <tr class="vm-row-operator" data-var="${escapeAttr(varName)}">
        <td>
          <div class="vm-var-name">
            <span>${escapeHTML(varName)}</span>
            <span class="vm-operator-tag" title="This field is filled by the operator at runtime — not from a DB column.">operator-only</span>
          </div>
        </td>
        <td><select class="vm-select" disabled><option>—</option></select></td>
        <td><select class="vm-select" disabled><option>—</option></select></td>
        <td><span class="vm-sample is-empty">—</span></td>
        <td><input type="text" class="vm-notes-input" data-notes-for="${escapeAttr(varName)}" value="${escapeAttr(getNotes(varName))}" placeholder="Notes…"></td>
      </tr>
    `;
  }

  const m = mapping || {};
  const isAuto = !!m.auto;
  const currentSource = m.source || '';
  const currentColumn = m.column || '';

  // Source dropdown: one option per query
  const sourceOptions = [
    `<option value="">(unmapped)</option>`,
    ...queries.map(q => {
      const label = q.name || q.id;
      return `<option value="${escapeAttr(q.id)}" ${currentSource === q.id ? 'selected' : ''}>${escapeHTML(label)}</option>`;
    }),
  ].join('');

  const colsForSource = currentSource ? getQueryColumns(currentSource) : [];

  const columnOptions = [
    `<option value="">${currentSource ? '(choose column)' : '(pick source first)'}</option>`,
    ...colsForSource.map(c =>
      `<option value="${escapeAttr(c.name)}" ${currentColumn === c.name ? 'selected' : ''}>${escapeHTML(c.name)}</option>`
    ),
  ].join('');

  const sample = formatSample(currentSource, currentColumn);
  const autoBadge = isAuto && currentSource ? '<span class="auto-badge" title="Auto-mapped by name match — change the dropdowns to override.">auto</span>' : '';
  const deleteBtn = isCustom
    ? `<button class="vm-custom-delete" title="Remove this custom variable" data-delete-var="${escapeAttr(varName)}">×</button>`
    : '';

  const unmappedClass = currentSource ? '' : 'unmapped';

  return `
    <tr data-var="${escapeAttr(varName)}">
      <td>
        <div class="vm-var-name">
          <span>${escapeHTML(varName)}</span>
          ${autoBadge}
          ${deleteBtn}
        </div>
      </td>
      <td>
        <select class="vm-select ${unmappedClass}" data-role="source" data-var="${escapeAttr(varName)}">
          ${sourceOptions}
        </select>
      </td>
      <td>
        <select class="vm-select ${unmappedClass}" data-role="column" data-var="${escapeAttr(varName)}" ${!currentSource ? 'disabled' : ''}>
          ${columnOptions}
        </select>
      </td>
      <td>${sample}</td>
      <td><input type="text" class="vm-notes-input" data-notes-for="${escapeAttr(varName)}" value="${escapeAttr(getNotes(varName))}" placeholder="Notes…"></td>
    </tr>
  `;
}

function getNotes(varName) {
  return vmGet(activeVmSubtab)?.[varName]?.notes || '';
}

function formatSample(source, column) {
  if (!source || !column) return '<span class="vm-sample is-empty">—</span>';
  const rows = lastResultRows[source];
  if (!rows || rows.length === 0) return '<span class="vm-sample is-empty">(no preview)</span>';
  const v = rows[0][column];
  if (v == null) return '<span class="vm-sample is-null">NULL</span>';
  if (v instanceof Date) return `<span class="vm-sample">${escapeHTML(formatDate(v))}</span>`;
  const s = String(v);
  return `<span class="vm-sample" title="${escapeAttr(s)}">${escapeHTML(s)}</span>`;
}

function renderUnmappedWarning() {
  const warnEl = $('#vm-warning');
  const textEl = $('#vm-warning-text');
  if (!warnEl) return;

  const vm = vmGet(activeVmSubtab);
  let unmapped = 0;
  for (const [name, meta] of activeVariableIndex()) {
    if (meta.preferredSource === 'operator') continue;
    const m = vm[name];
    if (!m || !m.source || !m.column) unmapped++;
  }

  if (unmapped === 0) {
    warnEl.hidden = true;
  } else {
    warnEl.hidden = false;
    const screenWord = activeVmSubtab === 'production' ? 'Production' : 'Orders';
    textEl.textContent = `${unmapped} variable${unmapped === 1 ? '' : 's'} unmapped. The ${screenWord} screen will show — for those fields. Map them above or run the queries first.`;
  }
}

function wireRowEvents() {
  // Source selects
  $$('select.vm-select[data-role="source"]').forEach(sel => {
    sel.addEventListener('change', e => onSourceChange(e.target.dataset.var, e.target.value));
  });
  // Column selects
  $$('select.vm-select[data-role="column"]').forEach(sel => {
    sel.addEventListener('change', e => onColumnChange(e.target.dataset.var, e.target.value));
  });
  // Notes inputs
  $$('input.vm-notes-input[data-notes-for]').forEach(inp => {
    inp.addEventListener('input', e => onNotesChange(e.target.dataset.notesFor, e.target.value));
  });
  // Custom-variable delete buttons
  $$('button.vm-custom-delete[data-delete-var]').forEach(btn => {
    btn.addEventListener('click', e => onDeleteCustomVar(e.currentTarget.dataset.deleteVar));
  });
}

function onSourceChange(varName, newSource) {
  if (!currentMapping) currentMapping = {};
  const vm = vmGet(activeVmSubtab);
  const existing = vm[varName] || {};
  // User-driven change: clear auto flag
  vm[varName] = {
    source: newSource || null,
    column: null,            // reset column when source changes
    auto: false,
    notes: existing.notes,
  };
  vmSet(activeVmSubtab, vm);
  renderVariableMapping();
  scheduleAutoSave();
}

function onColumnChange(varName, newColumn) {
  if (!currentMapping) currentMapping = {};
  const vm = vmGet(activeVmSubtab);
  const existing = vm[varName] || {};
  vm[varName] = {
    source: existing.source || null,
    column: newColumn || null,
    auto: false,
    notes: existing.notes,
  };
  vmSet(activeVmSubtab, vm);
  // Refresh sample cell + warning, but don't full re-render (preserves focus)
  refreshRowSample(varName);
  renderUnmappedWarning();
  scheduleAutoSave();
}

function refreshRowSample(varName) {
  const row = document.querySelector(`tr[data-var="${cssEscape(varName)}"]`);
  if (!row) return;
  const m = vmGet(activeVmSubtab)?.[varName] || {};
  const cells = row.children;
  if (cells.length >= 4) {
    cells[3].innerHTML = formatSample(m.source, m.column);
  }
}

function onNotesChange(varName, newNotes) {
  if (!currentMapping) currentMapping = {};
  const vm = vmGet(activeVmSubtab);
  const existing = vm[varName] || {};
  // Operator-only fields are stored as null per spec — but allow notes.
  // To keep the JSON shape consistent, wrap operator notes too.
  const meta = activeVariableIndex().get(varName);
  if (meta && meta.preferredSource === 'operator') {
    // Store as a tiny object with notes only — won't roundtrip as plain null.
    vm[varName] = newNotes
      ? { source: null, column: null, notes: newNotes }
      : null;
  } else {
    vm[varName] = {
      source: existing.source || null,
      column: existing.column || null,
      auto: !!existing.auto,
      notes: newNotes || undefined,
    };
  }
  vmSet(activeVmSubtab, vm);
  scheduleAutoSave();
}

async function onDeleteCustomVar(varName) {
  const vm = vmGet(activeVmSubtab);
  if (!vm[varName]) return;
  const confirmed = await modal.confirm({
    title: 'Confirm delete',
    message: `Remove custom variable "${varName}"?`,
  });
  if (!confirmed) return;
  delete vm[varName];
  vmSet(activeVmSubtab, vm);
  renderVariableMapping();
  scheduleAutoSave();
}

function cssEscape(s) {
  // minimal escape for attribute selectors
  return String(s).replace(/(["\\])/g, '\\$1');
}

// ====== Variable mapping: top action buttons ===============================

$('#vm-auto-remap').addEventListener('click', async () => {
  const confirmed = await modal.confirm({
    title: 'Re-run auto-mapping',
    message: 'Variables that were auto-mapped will be overwritten with fresh guesses. Variables you manually chose will be preserved.',
  });
  if (!confirmed) return;
  const vm = vmGet(activeVmSubtab);
  for (const [name, meta] of activeVariableIndex()) {
    if (meta.preferredSource === 'operator') continue;
    const m = vm[name];
    const wasAuto = m && m.auto;
    const isEmpty = !m || (!m.source && !m.column);
    if (wasAuto || isEmpty) {
      vm[name] = autoMapVariable(name, meta);
    }
  }
  vmSet(activeVmSubtab, vm);
  renderVariableMapping();
  scheduleAutoSave();
});

$('#vm-add-custom').addEventListener('click', async () => {
  const name = await modal.prompt({
    title: 'Add custom variable',
    message: 'New variable name (letters, numbers, underscore only):',
  });
  if (!name) return;
  const clean = name.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(clean)) {
    await modal.alert({ title: 'Invalid name', message: 'Must start with a letter and contain only letters, numbers, underscores.' });
    return;
  }
  if (activeVariableIndex().has(clean) || vmGet(activeVmSubtab)[clean] !== undefined) {
    await modal.alert({ title: 'Duplicate', message: 'That variable name already exists.' });
    return;
  }
  const vm = vmGet(activeVmSubtab);
  vm[clean] = autoMapVariable(clean, { preferredSource: 'aluplast' });
  vmSet(activeVmSubtab, vm);
  renderVariableMapping();
  scheduleAutoSave();
});

$('#vm-export-xlsx').addEventListener('click', () => {
  exportVariableMappingToXlsx();
});

// Phase 5.19: Variable Mapping sub-tabs (Orders / Production).
// Switches activeVmSubtab and re-renders the table.
document.querySelectorAll('#vm-subtabs .vm-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    const sub = btn.dataset.vmSubtab;
    if (!sub || sub === activeVmSubtab) return;
    activeVmSubtab = sub;
    document.querySelectorAll('#vm-subtabs .vm-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.vmSubtab === sub);
    });
    renderVariableMapping();
  });
});

// ====== Orders screen (Phase 5.1 — full wireframe port) ===================
//
// The Orders screen is wired to live data fetched from the configured
// queries. The structure follows the original design wireframe:
//
//   header.hdr
//     ├── header-left (Today pill, Prod-week pill, totals)
//     ├── title-block (Orders + last-refreshed)
//     ├── view-switch (By status | By prod week)
//     ├── toggle-all (collapse/expand all groups)
//     ├── search box
//     ├── customer-filter dropdown
//     └── refresh button
//   list > list-inner
//     ├── #viewByStatus  (8 buckets, each a <section.grp>)
//     │     and inside each: col-hdr + wk-blocks (week sub-groups)
//     └── #viewByWeek    (weeks, each a <section.wk-block>)
//
// Data flow on Refresh:
//   1. Fire all configured queries in parallel
//   2. For each query, find the column mapped to `orderNo`
//   3. Build merged orders by orderNo (union across queries)
//   4. Apply variable mappings → fill each variable on each order
//   5. Apply operator overlay from localStorage
//   6. Compute derived fields (status bucket, ISO week, time-in-status,
//      materials chips)
//   7. Render the active view
//
// Search and customer-filter operate on the cached `lastOrders` array — no
// re-fetch. Collapsed-group state is persisted to localStorage.
// ---------------------------------------------------------------------------

const MATERIAL_LETTERS = ['P', 'F', 'A', 'G', 'R', 'D', 'O'];

/** Hardcoded 8-position pipeline. Acts as the default seed for the Status
 *  mapping tab (used when statusMapping is missing or empty in mapping.json).
 *  The user can rename the Optimizer label, change the SQL value, and pick
 *  a different color, but the 8 flow positions are fixed — no add/remove.
 *
 *  Materials display is hardcoded by flow # (not user-configurable):
 *    flow #1, #2  → no materials shown (centered "—" in letters + dates cells)
 *    flow #3..#8  → letters cell + dates cell both shown
 *
 *  See SHOWS_MATERIALS below for the rule.
 */
const STATUS_BUCKETS = [
  { id: 1, defaultLabel: 'Akceptacja finansowa',     defaultErp: 'Akceptacja finansowa',     defaultColor: '#dbe7ff', sla: 'until validated',  note: 'Awaiting financial validation' },
  { id: 2, defaultLabel: 'Waiting ordering',         defaultErp: 'Waiting ordering',         defaultColor: '#dee4ec', sla: 'transit (parser)', note: 'External parser running — should be quick' },
  { id: 3, defaultLabel: 'Planowanie',               defaultErp: 'Planowanie',               defaultColor: '#e8def9', sla: 'ordering materials', note: 'Operator orders materials, fills delivery dates' },
  { id: 4, defaultLabel: 'Waiting for Comarch',      defaultErp: 'Waiting for Comarch',      defaultColor: '#ede1cb', sla: 'transit (~5 min)', note: 'External ERP processing — visibility only' },
  { id: 5, defaultLabel: 'Mat_zam',                  defaultErp: 'Mat_zam',                  defaultColor: '#ffe8c2', sla: 'until materials',    note: 'All materials ordered, awaiting delivery' },
  { id: 6, defaultLabel: 'Planowanie do OPT',        defaultErp: 'Planowanie do OPT',        defaultColor: '#d4f0df', sla: 'optimizing',         note: 'Materials in, optimization in progress' },
  { id: 7, defaultLabel: 'Do produkcji',             defaultErp: 'Do produkcji',             defaultColor: '#fcd8cc', sla: 'in production',      note: 'Manufacturing — pieces tracked via WHNet scans' },
  { id: 8, defaultLabel: 'Magazyn wyrobów gotowych', defaultErp: 'Magazyn wyrobów gotowych', defaultColor: '#cfe7f7', sla: 'ready for dispatch', note: 'All pieces packed, ready to ship' },
];

/** Whether each bucket id shows the Materials column content (letters + dates).
 *  Hardcoded by flow #: positions 1 and 2 are pre-materials states, the rest
 *  show both cells. Position-based, not user-configurable. */
const SHOWS_MATERIALS = { 1: false, 2: false, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true };



// ---- State -----------------------------------------------------------------
let lastOrders = [];                        // merged + enriched
let lastFetchAt = null;                     // Date
let currentView = 'status';                 // 'status' | 'week'
let operatorNotes = loadOperatorNotes();    // {orderNo: {assignedRoute, description}}
let collapsedGroups = loadCollapsedGroups();// Set<string>  ("bucket:1", "week:W21", ...)
let searchTerm = '';                        // filter text
let customerFilter = '';                    // selected customer code
// Phase 5.5 classification filters (persisted)
let classFilters = loadClassFilters();      // {orderType:Set, strStp:'', noFr:'all', orderTypeDetail:''}

// ---- localStorage helpers --------------------------------------------------
function loadOperatorNotes() {
  try { return JSON.parse(localStorage.getItem('operatorNotes') || '{}'); }
  catch (e) { console.error('operatorNotes parse failed:', e); return {}; }
}
function saveOperatorNotes() {
  try { localStorage.setItem('operatorNotes', JSON.stringify(operatorNotes)); }
  catch (e) { console.error('operatorNotes save failed:', e); }
}
function loadCollapsedGroups() {
  try { return new Set(JSON.parse(localStorage.getItem('collapsedGroups') || '[]')); }
  catch (e) { return new Set(); }
}
function saveCollapsedGroups() {
  try { localStorage.setItem('collapsedGroups', JSON.stringify([...collapsedGroups])); }
  catch (e) { console.error('collapsedGroups save failed:', e); }
}

// Phase 5.5: classification filter state
// {
//   orderType: Set<'ALU'|'PVC'>,    -- if empty set, show NOTHING (intentional); if missing, show ALL
//   strStp: '' | <value> | '__null__',
//   noFr: 'all' | 'only' | 'not',
//   orderTypeDetail: '' | <value>,
// }
function loadClassFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem('classFilters') || '{}');
    return {
      orderType:       new Set(Array.isArray(raw.orderType) ? raw.orderType : []),
      strStp:          raw.strStp || '',
      noFr:            raw.noFr || 'all',
      orderTypeDetail: new Set(Array.isArray(raw.orderTypeDetail) ? raw.orderTypeDetail : []),
    };
  } catch (e) {
    return { orderType: new Set(), strStp: '', noFr: 'all', orderTypeDetail: new Set() };
  }
}
function saveClassFilters() {
  try {
    localStorage.setItem('classFilters', JSON.stringify({
      orderType:       [...classFilters.orderType],
      strStp:          classFilters.strStp,
      noFr:            classFilters.noFr,
      orderTypeDetail: [...classFilters.orderTypeDetail],
    }));
  } catch (e) { console.error('classFilters save failed:', e); }
}

// ---- Init ------------------------------------------------------------------
function initOrdersScreen() {
  // Initial body class for the view CSS
  document.body.classList.add('view-status');

  // Today + current week pills
  const today = new Date();
  $('#todayDate').textContent = formatWeekday(today) + ' ' + formatDateLong(today);
  $('#todayWeek').textContent = formatProdWeek(today);

  // Refresh button moved to the left ribbon (#sbRefreshBtn) — wired in initSidebarRefresh().

  // View toggle
  $('#viewSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('.vs-btn');
    if (!btn || btn.classList.contains('active')) return;
    currentView = btn.dataset.view;
    $$('.vs-btn', $('#viewSwitch')).forEach(b =>
      b.classList.toggle('active', b.dataset.view === currentView)
    );
    renderOrders();
  });

  // Toggle all (collapse/expand)
  $('#toggleAll').addEventListener('click', () => {
    const btn = $('#toggleAll');
    const isCollapsed = btn.classList.toggle('collapsed');
    $('#toggleLabel').textContent = isCollapsed ? 'Expand all' : 'Collapse all';
    // Apply to currently-rendered groups
    const visible = currentView === 'status' ? $('#viewByStatus') : $('#viewByWeek');
    $$('.grp, .wk-block', visible).forEach(g => {
      g.classList.toggle('collapsed', isCollapsed);
      const key = g.dataset.collapseKey;
      if (key) {
        if (isCollapsed) collapsedGroups.add(key); else collapsedGroups.delete(key);
      }
    });
    saveCollapsedGroups();
  });

  // Search box
  $('#searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderOrders();
  });

  // Customer filter
  $('#customerSelect').addEventListener('change', (e) => {
    customerFilter = e.target.value;
    renderOrders();
  });

  // Phase 5.5: Classification filters
  // orderType — multi-select dropdown. Empty Set = show all (not show none).
  // Built via JS to support multi-checkbox + Select all / Clear actions.
  setupMultiSelect({
    rootSel: '#orderTypeFilter',
    toggleSel: '#orderTypeToggle',
    panelSel: '#orderTypePanel',
    summarySel: '#orderTypeSummary',
    set: classFilters.orderType,
    label: 'OrderType',
    onChange: () => { saveClassFilters(); renderOrders(); },
  });

  // STR_STI_STP_MRK — single-select dropdown
  $('#strStiStpMrkSelect').addEventListener('change', (e) => {
    classFilters.strStp = e.target.value;
    saveClassFilters();
    renderOrders();
  });

  // NoFr — tri-state (all / only / not)
  $('#noFrFilter').addEventListener('click', (e) => {
    const chip = e.target.closest('.cls-chip');
    if (!chip) return;
    classFilters.noFr = chip.dataset.val;
    $$('.cls-chip', $('#noFrFilter')).forEach(c =>
      c.classList.toggle('active', c.dataset.val === classFilters.noFr)
    );
    saveClassFilters();
    renderOrders();
  });

  // orderTypeDetail — multi-select dropdown. Empty Set = show all.
  setupMultiSelect({
    rootSel: '#orderTypeDetailFilter',
    toggleSel: '#orderTypeDetailToggle',
    panelSel: '#orderTypeDetailPanel',
    summarySel: '#orderTypeDetailSummary',
    set: classFilters.orderTypeDetail,
    label: 'orderTypeDetail',
    onChange: () => { saveClassFilters(); renderOrders(); },
  });

  // Phase 5.7: Reset-filters button — clears all class-filters AND customer/search
  $('#resetFiltersBtn').addEventListener('click', () => {
    classFilters = {
      orderType: new Set(),
      strStp: '',
      noFr: 'all',
      orderTypeDetail: new Set(),
    };
    customerFilter = '';
    searchTerm = '';
    $('#searchInput').value = '';
    $('#customerSelect').value = '';
    saveClassFilters();
    populateClassFilterDropdowns();
    applyClassFiltersToUI();
    renderOrders();
  });

  // Reflect persisted state into the UI
  applyClassFiltersToUI();

  // Operator inputs (delegated on body, capture-phase for blur)
  const body = $('.list-inner', $('#screen-orders'));
  body.addEventListener('blur', (e) => {
    const t = e.target;
    if (!t.matches || !(t.matches('.rt-input') || t.matches('.desc-input'))) return;
    const row = t.closest('.row');
    if (!row) return;
    const ono = row.dataset.ono;
    const field = t.dataset.field;
    const value = t.value.trim();
    if (!operatorNotes[ono]) operatorNotes[ono] = {};
    operatorNotes[ono][field] = value || null;
    if (!operatorNotes[ono].assignedRoute && !operatorNotes[ono].description) {
      delete operatorNotes[ono];
    }
    saveOperatorNotes();
    // Reflect into the in-memory order so re-renders show the saved value
    const ord = lastOrders.find(o => o.orderNo === ono);
    if (ord) ord[field] = value || null;
  }, true);

  // Group header click → toggle collapse for THIS group.
  // Click targets: .grp-hdr (status groups + outer week-view group), or
  // .wk-rail (left rail on a per-week wk-block in the week view).
  body.addEventListener('click', (e) => {
    if (e.target.closest('input, button')) return;
    // Try wk-rail first (inside a wk-block in the week view)
    const rail = e.target.closest('.wk-block > .wk-rail');
    if (rail) {
      const wk = rail.closest('.wk-block');
      if (wk && wk.dataset.collapseKey) {
        wk.classList.toggle('collapsed');
        const key = wk.dataset.collapseKey;
        if (wk.classList.contains('collapsed')) collapsedGroups.add(key);
        else collapsedGroups.delete(key);
        saveCollapsedGroups();
      }
      return;
    }
    // Fall back to .grp-hdr
    const hdr = e.target.closest('.grp-hdr');
    if (!hdr) return;
    const grp = hdr.closest('.grp, .wk-block');
    if (!grp) return;
    grp.classList.toggle('collapsed');
    const key = grp.dataset.collapseKey;
    if (key) {
      if (grp.classList.contains('collapsed')) collapsedGroups.add(key);
      else collapsedGroups.delete(key);
      saveCollapsedGroups();
    }
  });

  // Column-resize: load saved widths and wire the drag handles.
  loadColWidths();
  initColResize();

  // Reset cols button (in the Orders top header)
  const resetBtn = $('#resetColsBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetColWidths);
}

// ===========================================================================
// Column resize — drag-to-resize for all Orders-screen columns. Widths live
// in CSS custom properties (--col-<key>) on document.documentElement, so a
// single var change instantly re-flows every row + every column header that
// references it. Widths persist to localStorage and are shared across the
// two views (status / week).
// ===========================================================================

const COL_DEFS = [
  { key: 'status',   def: 90,  min: 60 },   // week view only
  { key: 'cust',     def: 40,  min: 32 },
  { key: 'ord',      def: 120, min: 80 },
  { key: 'pcs',      def: 36,  min: 32 },
  { key: 'finvalid', def: 54,  min: 40 },
  { key: 'dd',       def: 54,  min: 40 },
  { key: 'termre',   def: 54,  min: 40 },
  { key: 'matlet',   def: 140, min: 80 },
  { key: 'matdat',   def: 140, min: 80 },
  { key: 'time',     def: 66,  min: 40 },
  { key: 'lastscan', def: 130, min: 80 },
  { key: 'addr',     def: 130, min: 80 },
  { key: 'opti',     def: 110, min: 60 },
  { key: 'ready',    def: 80,  min: 50 },
  { key: 'route',    def: 100, min: 60 },
  { key: 'desc',     def: 130, min: 80 },
];
const COL_BY_KEY = Object.fromEntries(COL_DEFS.map(c => [c.key, c]));
const COL_STORAGE_KEY = 'logopt.colWidths';

function loadColWidths() {
  let saved = {};
  try {
    const raw = localStorage.getItem(COL_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (e) { saved = {}; }
  for (const c of COL_DEFS) {
    const saved_w = Number(saved[c.key]);
    const w = (Number.isFinite(saved_w) && saved_w >= c.min) ? saved_w : c.def;
    document.documentElement.style.setProperty('--col-' + c.key, w + 'px');
  }
}

function saveColWidths() {
  const out = {};
  for (const c of COL_DEFS) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--col-' + c.key).trim();
    const n = parseFloat(raw);
    if (Number.isFinite(n)) out[c.key] = n;
  }
  try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(out)); } catch (e) {}
}

function resetColWidths() {
  for (const c of COL_DEFS) {
    document.documentElement.style.setProperty('--col-' + c.key, c.def + 'px');
  }
  try { localStorage.removeItem(COL_STORAGE_KEY); } catch (e) {}
}

let _colDragState = null;

function initColResize() {
  // One global mousedown listener — picks up clicks on any .col-resize-handle
  // no matter how many column-header strips are on screen (one per group).
  document.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.col-resize-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();

    const key = handle.dataset.colKey;
    const def = COL_BY_KEY[key];
    if (!def) return;

    const startX = e.clientX;
    const cssVar = '--col-' + key;
    const startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar)) || def.def;

    _colDragState = { key, startX, startW, min: def.min };
    handle.classList.add('dragging');
    document.body.classList.add('col-resizing');
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!_colDragState) return;
    const dx = e.clientX - _colDragState.startX;
    const w = Math.max(_colDragState.min, Math.round(_colDragState.startW + dx));
    document.documentElement.style.setProperty('--col-' + _colDragState.key, w + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!_colDragState) return;
    document.querySelectorAll('.col-resize-handle.dragging').forEach(h => h.classList.remove('dragging'));
    document.body.classList.remove('col-resizing');
    _colDragState = null;
    saveColWidths();
  });
}

// ---- Refresh: fetch all queries, merge, render -----------------------------
async function refreshOrders() {
  const btn = $('#sbRefreshBtn');
  const info = $('#ordersRefreshInfo');
  const banner = $('#ordersBanner');
  banner.hidden = true;
  banner.innerHTML = '';

  const queries = currentMapping?.queries || [];
  if (queries.length === 0) {
    info.textContent = 'No queries configured.';
    renderOrdersEmpty('Configure at least one query in the Mapping screen.');
    return;
  }
  const conn = getConnectionConfig();
  if (!conn.server || !conn.user || !conn.password) {
    info.textContent = 'Connection not configured.';
    renderOrdersEmpty('Fill in the Connection tab (server, username, password) first.');
    return;
  }
  if (!conn.database) conn.database = 'master';

  btn.disabled = true;
  btn.classList.add('refreshing');
  info.innerHTML = '<span class="run-indicator"><span class="dot"></span>Running…</span>';

  const t0 = performance.now();
  let results;
  try {
    results = await Promise.all(queries.map(q =>
      window.sqlAPI.runQuery(conn, q.sql).then(r => ({ q, r }))
    ));
  } catch (err) {
    info.textContent = 'Refresh failed.';
    banner.hidden = false;
    banner.innerHTML = `<b>Refresh failed:</b> ${escapeHTML(err.message || String(err))}`;
    btn.disabled = false; btn.classList.remove('refreshing');
    return;
  }

  const failures = results.filter(x => !x.r.ok);
  const successes = results.filter(x => x.r.ok);

  if (failures.length > 0) {
    const lines = failures.map(f => `${f.q.name || f.q.id}: ${f.r.error}`);
    banner.hidden = false;
    banner.innerHTML = `<b>Some queries failed:</b><br>${escapeHTML(lines.join('\n')).replace(/\n/g, '<br>')}`;
  }
  if (successes.length === 0) {
    info.textContent = 'All queries failed.';
    renderOrdersEmpty('Check the banner above for errors. Verify connection and SQL.');
    btn.disabled = false; btn.classList.remove('refreshing');
    return;
  }

  // Update lastResultRows cache so Variable Mapping samples stay fresh
  for (const { q, r } of successes) lastResultRows[q.id] = r.rows || [];

  lastOrders = mergeAndEnrich(successes);
  lastFetchAt = new Date();
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  info.textContent = `refreshed ${formatTime(lastFetchAt)} · ${elapsed}s`;

  // Update customer-filter dropdown with seen customer codes
  populateCustomerFilter();

  renderOrders();
  renderAppSpec(); // re-render App Spec to pick up live counts

  // Phase 5.31: Orders refresh runs all queries (incl. Production's spine +
  // order-join) and repopulates lastResultRows. Rebuild Production from that
  // fresh cache so a single Orders refresh updates both screens, as before.
  if (window.Production && typeof window.Production.refreshFromCache === 'function') {
    try { window.Production.refreshFromCache(); } catch (e) { console.error(e); }
  }

  btn.disabled = false; btn.classList.remove('refreshing');
}
// Phase 5.36: expose the full all-queries refresh so Production's Refresh
// button can trigger the same unified refresh (updates BOTH screens).
window.refreshOrders = refreshOrders;

// ---- Merge + enrich --------------------------------------------------------
function mergeAndEnrich(successes) {
  const vm = vmGet('orders');

  // ----- Determine the orderNo merge key for each query --------------------
  // Priority:
  //   1. The column the user mapped the `orderNo` variable to, if that query
  //      matches.
  //   2. Any result column named "orderNo" (case-insensitive).
  //   3. Any result column matching common Polish/English aliases (Zlecenie /
  //      Order No / OrderNo / orderno).
  // If none found, the query cannot contribute to the merge; we record this
  // so the user sees a clear diagnostic.
  const orderNoColByQuery = new Map();
  const unmergeable = [];

  // Look up the variable-level orderNo mapping
  const vmOrderNo = (vm.orderNo && typeof vm.orderNo === 'object') ? vm.orderNo : null;

  for (const { q, r } of successes) {
    // The result column names available in this query's first row
    const sampleRow = (r.rows && r.rows[0]) ? r.rows[0] : null;
    const cols = sampleRow ? Object.keys(sampleRow) : [];

    let pickedCol = null;
    // 1. Variable mapping points to this query
    if (vmOrderNo && vmOrderNo.source === q.id && vmOrderNo.column) {
      if (cols.includes(vmOrderNo.column)) pickedCol = vmOrderNo.column;
    }
    // 2. Exact "orderNo" column (case-insensitive)
    if (!pickedCol) {
      pickedCol = cols.find(c => c.toLowerCase() === 'orderno') || null;
    }
    // 3. Common aliases
    if (!pickedCol) {
      pickedCol = cols.find(c => /^(order ?no|zlecenie|zlecenie_t)$/i.test(c)) || null;
    }

    if (pickedCol) {
      orderNoColByQuery.set(q.id, pickedCol);
    } else if (cols.length > 0) {
      unmergeable.push({ id: q.id, name: q.name || q.id });
    }
  }

  // Surface unmergeable queries to the user via the banner.
  if (unmergeable.length > 0) {
    const banner = $('#ordersBanner');
    if (banner) {
      const list = unmergeable.map(u => `${u.name} (${u.id})`).join(', ');
      const cur = banner.innerHTML || '';
      const msg = `<b>Skipped (no orderNo merge key):</b> ${escapeHTML(list)}. Add <code>AS orderNo</code> in the SELECT to include these.`;
      banner.innerHTML = cur ? cur + '<br>' + msg : msg;
      banner.hidden = false;
    }
  }

  // ----- Build per-query lookup orderNo -> row -----------------------------
  // Keys are normalized (trimmed + stringified) so trailing whitespace or
  // type differences (number vs string) don't break the cross-query JOIN.
  const byQuery = new Map();
  for (const { q, r } of successes) {
    const col = orderNoColByQuery.get(q.id);
    if (!col) continue;
    const lookup = new Map();
    for (const row of (r.rows || [])) {
      const raw = row[col];
      if (raw == null) continue;
      const key = String(raw).trim();
      if (!key) continue;
      if (!lookup.has(key)) lookup.set(key, row); // first wins on dupe
    }
    byQuery.set(q.id, lookup);
  }

  // ----- Union of all orderNos across all participating queries ------------
  const allOnos = new Set();
  for (const lookup of byQuery.values()) for (const o of lookup.keys()) allOnos.add(o);

  // ----- Build merged orders -----------------------------------------------
  const orders = [];
  for (const ono of allOnos) {
    const order = { orderNo: ono };
    for (const [v, m] of Object.entries(vm)) {
      if (v === 'orderNo') continue;
      if (!m || !m.source || !m.column) { order[v] = null; continue; }
      const lookup = byQuery.get(m.source);
      if (!lookup) { order[v] = null; continue; }
      const row = lookup.get(ono);
      order[v] = row ? row[m.column] : null;
    }

    // Operator overlay
    const note = operatorNotes[ono];
    if (note) {
      if (note.assignedRoute != null) order.assignedRoute = note.assignedRoute;
      if (note.description != null) order.description = note.description;
    }

    // Derived
    order._bucket = computeStatusBucket(order.status);
    order._week = computeIsoWeek(order.dd);
    order._weekLabel = order._week ? formatProdWeekFromIso(order.dd) : null;
    order._timeInStatus = computeTimeInStatus(order.finValid);
    order._materialChips = computeMaterialChips(order);
    order._materialDateChips = computeMaterialDateChips(order);

    orders.push(order);
  }

  // Sort by dd descending, NULLs last
  orders.sort((a, b) => {
    if (a.dd == null && b.dd == null) return String(a.orderNo).localeCompare(String(b.orderNo));
    if (a.dd == null) return 1;
    if (b.dd == null) return -1;
    return new Date(b.dd) - new Date(a.dd);
  });

  return orders;
}

// ---- Derived field computations --------------------------------------------
/** Map a raw ERP status value to a bucket id by finding the single bucket
 *  whose `erpValue` matches (case-insensitive, trimmed). If statusMapping
 *  hasn't been configured yet, fall back to matching against each bucket's
 *  `defaultErp`. NULL/empty → 'unknown'.
 */
function computeStatusBucket(stanValue) {
  if (stanValue == null) return 'unknown';
  const raw = String(stanValue).trim();
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();

  const buckets = currentMapping?.statusMapping?.buckets;
  if (Array.isArray(buckets)) {
    for (const b of buckets) {
      const v = b.erpValue;
      if (v == null) continue;
      if (String(v).trim().toLowerCase() === lower) return b.id;
    }
    return 'unknown';
  }

  // No user mapping yet — fall back to STATUS_BUCKETS defaultErp
  for (const b of STATUS_BUCKETS) {
    if (!b.defaultErp) continue;
    if (b.defaultErp.toLowerCase() === lower) return b.id;
  }
  return 'unknown';
}

function computeIsoWeek(d) {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return 'W' + String(weekNo).padStart(2, '0');
}

/** Format like "26_19" (year suffix + week) — matches wireframe. */
function formatProdWeekFromIso(d) {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  const yr = String(t.getUTCFullYear()).slice(-2);
  return `${yr}_${String(week).padStart(2, '0')}`;
}
function formatProdWeek(d) { return formatProdWeekFromIso(d); }

function computeTimeInStatus(finValid) {
  if (!finValid) return null;
  const fv = (finValid instanceof Date) ? finValid : new Date(finValid);
  if (isNaN(fv.getTime())) return null;
  const ms = Date.now() - fv.getTime();
  if (ms < 0) {
    // finValid is in the future — the order hasn't entered the pipeline yet.
    // Return a sentinel so renderOrderRow can show "—" instead of a negative duration.
    return { text: '—', cls: 'future' };
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const days = Math.floor(hours / 24);
  let text, cls;
  if (days >= 2)       { text = `${days}d ${hours % 24}h`; cls = 'over'; }
  else if (hours >= 8) { text = `${hours}h ${mins}m`;       cls = 'warn'; }
  else                 { text = `${hours}h ${mins}m`;       cls = 'ok'; }
  return { text, cls };
}

function computeMaterialChips(order) {
  // Returns array of 7 objects:
  //   { code: 'Px'|'F20'|'A_'|'O!', cls: 'x'|'wk'|'blank'|'miss' }
  // For each material letter we look at promised + actual:
  //   actual present                      -> 'x'   (delivered)  e.g. Px
  //   promised present, no actual:
  //       promised >= today               -> 'wk'  (ordered)    e.g. F20 (week number)
  //       promised < today                -> 'miss'(overdue)    e.g. F!
  //   neither                             -> 'blank'(nothing)   e.g. A_
  const now = new Date();
  return MATERIAL_LETTERS.map(L => {
    const promised = order['mat' + L + '_promised'];
    const actual = order['mat' + L + '_actual'];

    if (actual) {
      return { code: L + 'x', cls: 'x' };
    }
    if (promised) {
      const pd = (promised instanceof Date) ? promised : new Date(promised);
      if (!isNaN(pd.getTime())) {
        if (pd >= now) {
          // Ordered, awaiting — show week number e.g. F20
          const wk = computeIsoWeekNum(pd);
          return { code: L + String(wk).padStart(2, '0'), cls: 'wk' };
        }
        // Past-due, no actual
        return { code: L + '!', cls: 'miss' };
      }
    }
    return { code: L + '_', cls: 'blank' };
  });
}

/** Bare ISO week number (no year prefix). */
function computeIsoWeekNum(d) {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

/** For Mat_zam-status rows we use the date-style chips. */
function computeMaterialDateChips(order) {
  return MATERIAL_LETTERS.map(L => {
    const promised = order['mat' + L + '_promised'];
    const actual = order['mat' + L + '_actual'];
    if (!promised && !actual) return { cls: 'blank', label: '—' };
    if (actual) {
      const pd = promised ? new Date(promised) : null;
      const ad = new Date(actual);
      if (pd && !isNaN(pd.getTime()) && ad > pd) return { cls: 'overdue', label: formatDateShort(ad) };
      return { cls: 'delivered', label: formatDateShort(ad) };
    }
    if (promised) {
      const pd = new Date(promised);
      if (!isNaN(pd.getTime())) return { cls: 'promised', label: formatDateShort(pd) };
    }
    return { cls: 'blank', label: '—' };
  });
}

// ---- Formatting helpers ----------------------------------------------------
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekday(d) { return WEEKDAYS[d.getDay()]; }
function formatDateLong(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateShort(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
function formatTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- Customer filter dropdown ----------------------------------------------
function populateCustomerFilter() {
  const sel = $('#customerSelect');
  const current = sel.value;
  const codes = new Set();
  for (const o of lastOrders) {
    if (o.customerCode) codes.add(String(o.customerCode));
  }
  const sortedCodes = [...codes].sort();
  sel.innerHTML = '<option value="">Customer · all</option>' +
    sortedCodes.map(c => `<option value="${escapeAttr(c)}">${escapeHTML(c)}</option>`).join('');
  // Restore selection if still valid
  if (current && codes.has(current)) sel.value = current;
  else { sel.value = ''; customerFilter = ''; }

  // Phase 5.5: also populate the two dynamic-value dropdowns
  populateClassFilterDropdowns();
}

/** Populate STR_STI_STP_MRK and orderTypeDetail dropdowns from loaded data.
 *  Special entry "__null__" for explicit NULL filtering.
 */
function populateClassFilterDropdowns() {
  // STR_STI_STP_MRK — single-select native dropdown (unchanged)
  {
    const sel = $('#strStiStpMrkSelect');
    if (sel) {
      const values = new Set();
      let hasNull = false;
      for (const o of lastOrders) {
        const v = o['STR_STI_STP_MRK'];
        if (v == null || v === '') hasNull = true;
        else values.add(String(v));
      }
      const sorted = [...values].sort();
      const opts = ['<option value="">STR_STI_STP_MRK · all</option>'];
      for (const v of sorted) opts.push(`<option value="${escapeAttr(v)}">${escapeHTML(v)}</option>`);
      if (hasNull) opts.push('<option value="__null__">(NULL)</option>');
      sel.innerHTML = opts.join('');
      if (classFilters.strStp && (sorted.includes(classFilters.strStp) || classFilters.strStp === '__null__')) {
        sel.value = classFilters.strStp;
      } else {
        sel.value = '';
        classFilters.strStp = '';
      }
    }
  }

  // OrderType — collect distinct values, render multi-select panel
  {
    const values = new Set();
    let hasNull = false;
    for (const o of lastOrders) {
      const v = o['orderType'];
      if (v == null || String(v).trim() === '') hasNull = true;
      else values.add(String(v).trim().toUpperCase());
    }
    // Always offer ALU and PVC as known values even if data doesn't yet have them
    values.add('ALU'); values.add('PVC');
    const sorted = [...values].sort();
    renderMultiSelectPanel('#orderTypePanel', sorted, hasNull, classFilters.orderType,
      () => { saveClassFilters(); renderOrders(); });
    // Prune stale entries from saved state that aren't in current data (other than known ALU/PVC)
    for (const v of [...classFilters.orderType]) {
      if (v === '__null__') { if (!hasNull) classFilters.orderType.delete(v); }
      else if (!values.has(v)) classFilters.orderType.delete(v);
    }
  }

  // orderTypeDetail — collect distinct values, render multi-select panel
  {
    const values = new Set();
    let hasNull = false;
    for (const o of lastOrders) {
      const v = o['orderTypeDetail'];
      if (v == null || String(v).trim() === '') hasNull = true;
      else values.add(String(v));
    }
    const sorted = [...values].sort();
    renderMultiSelectPanel('#orderTypeDetailPanel', sorted, hasNull, classFilters.orderTypeDetail,
      () => { saveClassFilters(); renderOrders(); });
    // Prune stale entries
    for (const v of [...classFilters.orderTypeDetail]) {
      if (v === '__null__') { if (!hasNull) classFilters.orderTypeDetail.delete(v); }
      else if (!values.has(v)) classFilters.orderTypeDetail.delete(v);
    }
  }
}

/** Render checkbox options into a multi-select panel. The Set is mutated
 *  in-place when checkboxes change; onChange runs after each change. */
function renderMultiSelectPanel(panelSel, sortedValues, hasNull, set, onChange) {
  const panel = $(panelSel);
  if (!panel) return;
  const items = [];
  items.push(`<div class="ms-panel-head"><span>${sortedValues.length}${hasNull ? '+1' : ''} values</span><a data-act="clear">Clear</a> · <a data-act="all">All</a></div>`);
  for (const v of sortedValues) {
    const checked = set.has(v) ? 'checked' : '';
    items.push(`<label class="ms-opt"><input type="checkbox" data-val="${escapeAttr(v)}" ${checked}><span class="ms-opt-label">${escapeHTML(v)}</span></label>`);
  }
  if (hasNull) {
    const checked = set.has('__null__') ? 'checked' : '';
    items.push(`<label class="ms-opt"><input type="checkbox" data-val="__null__" ${checked}><span class="ms-opt-label"><i>(NULL)</i></span></label>`);
  }
  panel.innerHTML = items.join('');

  // Reattach handlers fresh (innerHTML cleared previous ones)
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const val = cb.dataset.val;
      if (cb.checked) set.add(val); else set.delete(val);
      onChange();
    });
  });
  panel.querySelectorAll('.ms-panel-head a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.act === 'clear') set.clear();
      else { // 'all' — select every option visible
        set.clear();
        for (const v of sortedValues) set.add(v);
        if (hasNull) set.add('__null__');
      }
      // Update checkboxes
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = set.has(cb.dataset.val);
      });
      onChange();
    });
  });
}

/** Open/close behavior for a multi-select panel — toggle on click, close on outside click. */
function setupMultiSelect({ rootSel, toggleSel, panelSel }) {
  const root = $(rootSel);
  const toggle = $(toggleSel);
  const panel = $(panelSel);
  if (!root || !toggle || !panel) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = panel.hidden;
    // Close any other open panels
    $$('.ms-filter.open').forEach(f => {
      if (f !== root) {
        f.classList.remove('open');
        const p = f.querySelector('.ms-panel');
        if (p) p.hidden = true;
      }
    });
    panel.hidden = !opening;
    root.classList.toggle('open', opening);
  });
  // Outside-click closes
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) {
      panel.hidden = true;
      root.classList.remove('open');
    }
  });
  // Prevent panel clicks from bubbling up to outside-click handler
  panel.addEventListener('click', (e) => e.stopPropagation());
}

/** Push current classFilters state into the chip UI (orderType + NoFr). */
function applyClassFiltersToUI() {
  const cf = classFilters;

  // ---- OrderType (multi-select dropdown) --------------------------------
  // "default" / "all" = empty Set OR Set containing both ALU and PVC.
  const otSummary = $('#orderTypeSummary');
  if (otSummary) {
    if (cf.orderType.size === 0) otSummary.textContent = 'all';
    else otSummary.textContent = [...cf.orderType].join(', ');
  }
  const otIsDefault = (cf.orderType.size === 0);
  $('#orderTypeFilter').classList.toggle('filter-active', !otIsDefault);

  // ---- NoFr chips -------------------------------------------------------
  $$('.cls-chip', $('#noFrFilter')).forEach(c =>
    c.classList.toggle('active', c.dataset.val === cf.noFr)
  );
  $('#noFrFilter').classList.toggle('filter-active', cf.noFr !== 'all');

  // ---- STR_STI_STP_MRK dropdown -----------------------------------------
  $('#strStiStpMrkSelect').classList.toggle('filter-active', !!cf.strStp);

  // ---- orderTypeDetail (multi-select dropdown) --------------------------
  const otdSummary = $('#orderTypeDetailSummary');
  if (otdSummary) {
    if (cf.orderTypeDetail.size === 0) otdSummary.textContent = 'all';
    else if (cf.orderTypeDetail.size <= 2) otdSummary.textContent = [...cf.orderTypeDetail].join(', ');
    else otdSummary.textContent = `${cf.orderTypeDetail.size} selected`;
  }
  $('#orderTypeDetailFilter').classList.toggle('filter-active', cf.orderTypeDetail.size > 0);

  // ---- Reset button visibility ------------------------------------------
  const anyActive =
    !otIsDefault ||
    cf.noFr !== 'all' ||
    !!cf.strStp ||
    cf.orderTypeDetail.size > 0 ||
    !!customerFilter ||
    !!searchTerm;
  const btn = $('#resetFiltersBtn');
  if (btn) btn.hidden = !anyActive;
}

// ---- Filtering -------------------------------------------------------------
//
// Search syntax:
//   - bare text: substring match (case-insensitive)
//   - "%" acts as a wildcard like SQL LIKE / Excel:
//       "F24%"     -> starts with "F24"
//       "%180%"    -> contains "180"  (same result as plain "180")
//       "F24%X"    -> starts with F24 and ends with X
//       "%F24_%"   -> contains "F24_" (the underscore is a literal character)
// Tested against: orderNo, customerCode, description.

/** Compile the search term into a tester function. Returns null when input
 *  is empty. Anchors only when the input contains a "%"; otherwise falls
 *  back to a plain substring test (faster, same behavior as before).
 */
function compileSearch(term) {
  if (!term) return null;
  const t = term.toLowerCase();
  if (!t.includes('%')) {
    return (s) => s.includes(t);
  }
  // Wildcard mode: anchor at both ends, replace % with .*, escape everything else.
  const esc = t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  const re = new RegExp('^' + esc + '$');
  return (s) => re.test(s);
}

function applyFilters(orders) {
  // Quick exit when everything is at default
  const cf = classFilters;
  const classAtDefault =
    cf.orderType.size === 0 &&
    cf.strStp === '' && cf.noFr === 'all' && cf.orderTypeDetail.size === 0;

  if (!searchTerm && !customerFilter && classAtDefault) return orders;

  const searchTester = compileSearch(searchTerm);

  return orders.filter(o => {
    if (customerFilter && String(o.customerCode || '') !== customerFilter) return false;

    // OrderType (multi-select). Empty set = show all. Non-empty = show only those.
    // "__null__" is a special selectable value for NULL/empty orderType.
    if (cf.orderType.size > 0) {
      const raw = o.orderType;
      const isNull = (raw == null || String(raw).trim() === '');
      if (isNull) {
        if (!cf.orderType.has('__null__')) return false;
      } else {
        const norm = String(raw).trim().toUpperCase();
        if (!cf.orderType.has(norm)) return false;
      }
    }

    // STR_STI_STP_MRK
    if (cf.strStp) {
      const v = o['STR_STI_STP_MRK'];
      const isNull = (v == null || v === '');
      if (cf.strStp === '__null__') { if (!isNull) return false; }
      else { if (isNull || String(v) !== cf.strStp) return false; }
    }

    // NoFr
    if (cf.noFr === 'only') {
      const v = o['NoFr'];
      if (v == null || String(v).trim() === '') return false;
    } else if (cf.noFr === 'not') {
      const v = o['NoFr'];
      if (v != null && String(v).trim() !== '') return false;
    }

    // orderTypeDetail (multi-select). Empty set = show all.
    if (cf.orderTypeDetail.size > 0) {
      const raw = o['orderTypeDetail'];
      const isNull = (raw == null || String(raw).trim() === '');
      if (isNull) {
        if (!cf.orderTypeDetail.has('__null__')) return false;
      } else {
        if (!cf.orderTypeDetail.has(String(raw))) return false;
      }
    }

    // Free-text search — supports "%" wildcards
    if (searchTester) {
      const ono = String(o.orderNo || '').toLowerCase();
      const cust = String(o.customerCode || '').toLowerCase();
      const desc = String(o.description || '').toLowerCase();
      if (!searchTester(ono) && !searchTester(cust) && !searchTester(desc)) return false;
    }
    return true;
  });
}

// ---- Render dispatcher -----------------------------------------------------
function renderOrders() {
  document.body.classList.toggle('view-week', currentView === 'week');
  document.body.classList.toggle('view-status', currentView === 'status');

  applyClassFiltersToUI();

  // Gate: Orders is blocked until a SQL column is picked in Status mapping.
  // Without a column, the bucket classification can't run — every order would
  // be Unknown. Show a placeholder pointing the user at the right tab.
  const sm = currentMapping?.statusMapping;
  if (!sm || !sm.column || String(sm.column).trim() === '') {
    renderOrdersEmpty('Pick a SQL column in Mapping → Status mapping before opening Orders. Until you do, orders can\'t be classified into the 8 flow positions.');
    updateHeaderTotals();
    return;
  }

  updateHeaderTotals();

  const filtered = applyFilters(lastOrders);
  if (filtered.length === 0) {
    if (lastOrders.length === 0) {
      renderOrdersEmpty('No orders loaded. Click Refresh.');
    } else {
      renderOrdersEmpty('No orders match the current filter.');
    }
    return;
  }
  if (currentView === 'status') renderOrdersByStatus(filtered);
  else renderOrdersByWeek(filtered);
}

function renderOrdersEmpty(msg) {
  const target = currentView === 'status' ? $('#viewByStatus') : $('#viewByWeek');
  target.innerHTML = `<div class="orders-empty"><p>${escapeHTML(msg)}</p></div>`;
}

function updateHeaderTotals() {
  const el = $('#ordersTotals');
  if (lastOrders.length === 0) {
    el.innerHTML = '<span class="muted">No data loaded</span>';
    return;
  }
  const filtered = applyFilters(lastOrders);
  const ordCount = filtered.length;
  const pcsTotal = filtered.reduce((s, o) => s + (Number(o.pcs) || 0), 0);
  const filtNote = (filtered.length !== lastOrders.length)
    ? ` <span class="muted">(of ${lastOrders.length})</span>`
    : '';
  el.innerHTML = `<b>${formatNumber(ordCount)}</b> ord · <b>${formatNumber(pcsTotal)}</b> pcs${filtNote}`;
}

function formatNumber(n) {
  // 1042 -> "1 042"
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ---- View: By status -------------------------------------------------------
function renderOrdersByStatus(orders) {
  // Group by bucket
  const byBucket = new Map();
  for (const o of orders) {
    if (!byBucket.has(o._bucket)) byBucket.set(o._bucket, []);
    byBucket.get(o._bucket).push(o);
  }

  const html = [];
  for (const bucket of STATUS_BUCKETS) {
    const list = byBucket.get(bucket.id) || [];
    html.push(renderBucketGroup(bucket, list));
  }
  // Unknown bucket
  const unknownList = byBucket.get('unknown') || [];
  if (unknownList.length > 0) {
    html.push(renderUnknownBucket(unknownList));
  }

  $('#viewByStatus').innerHTML = html.join('');
}

function renderBucketGroup(bucket, orders) {
  const key = 'bucket:' + bucket.id;
  const isCollapsed = collapsedGroups.has(key);
  const isEmpty = orders.length === 0;
  const emptyClass = isEmpty ? ' empty' : '';
  const pcsTotal = orders.reduce((s, o) => s + (Number(o.pcs) || 0), 0);

  // Get user-configured bucket settings (label + band color)
  const cfg = getBucketConfig(bucket.id);
  const label = cfg ? cfg.optimizerValue : `Bucket ${bucket.id}`;
  const bandColor = cfg ? cfg.color : '#eeeeee';

  // Week range for the meta line
  let weekRange = '';
  const weeks = [...new Set(orders.map(o => o._weekLabel).filter(Boolean))].sort();
  if (weeks.length === 1) weekRange = `week <b>${escapeHTML(weeks[0])}</b>`;
  else if (weeks.length > 1) weekRange = `weeks <b>${escapeHTML(weeks[0])} → ${escapeHTML(weeks[weeks.length - 1])}</b>`;
  else weekRange = '<span class="muted">no week data</span>';

  const byWeek = groupByWeek(orders);
  const wkBlocksHTML = renderWkBlocksInBucket(byWeek);

  return `
    <section class="grp${emptyClass}${isCollapsed ? ' collapsed' : ''}" data-collapse-key="${escapeAttr(key)}">
      <div class="grp-hdr" style="background:${bandColor}">
        <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="grp-num">${bucket.id}</span>
        <span class="name">${escapeHTML(label)}</span>
        <span class="meta"><b>${orders.length}</b> ord · <b>${formatNumber(pcsTotal)}</b> pcs · ${weekRange} · SLA <b>${escapeHTML(bucket.sla || '')}</b></span>
      </div>
      <div class="grp-body">
        ${renderColumnHeader('status')}
        ${wkBlocksHTML}
      </div>
    </section>
  `;
}

/** Return the user-configured bucket entry for a flow #, falling back to
 *  the STATUS_BUCKETS defaults when statusMapping isn't set up yet. */
function getBucketConfig(bucketId) {
  if (bucketId == null || bucketId === 'unknown') return null;
  const defaults = STATUS_BUCKETS.find(b => b.id === bucketId);
  const user = currentMapping?.statusMapping?.buckets?.find(b => b.id === bucketId);
  const showsMaterials = (SHOWS_MATERIALS[bucketId] === true);
  if (user) {
    return {
      id: bucketId,
      optimizerValue: user.optimizerValue || defaults?.defaultLabel || `Bucket ${bucketId}`,
      erpValue: user.erpValue ?? null,
      color: user.color || defaults?.defaultColor || '#eeeeee',
      showsMaterials,
    };
  }
  if (defaults) {
    return {
      id: bucketId,
      optimizerValue: defaults.defaultLabel,
      erpValue: defaults.defaultErp || null,
      color: defaults.defaultColor,
      showsMaterials,
    };
  }
  return null;
}

/** Short-cut: just the Optimizer label. */
function getOptimizerLabel(bucketId) {
  return getBucketConfig(bucketId)?.optimizerValue || null;
}

function renderUnknownBucket(orders) {
  const key = 'bucket:unknown';
  const isCollapsed = collapsedGroups.has(key);
  const pcsTotal = orders.reduce((s, o) => s + (Number(o.pcs) || 0), 0);
  // Show distinct stan values found
  const stans = [...new Set(orders.map(o => o.status).filter(s => s != null))].slice(0, 5);
  const stanList = stans.length > 0
    ? `seen: ${stans.map(s => `<code>${escapeHTML(String(s))}</code>`).join(', ')}${stans.length === 5 ? ', …' : ''}`
    : 'all NULL';

  return `
    <section class="grp unknown${isCollapsed ? ' collapsed' : ''}" data-collapse-key="${escapeAttr(key)}">
      <div class="grp-hdr">
        <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="grp-num">?</span>
        <span class="name">Unknown / unmapped status</span>
        <span class="meta"><b>${orders.length}</b> ord · <b>${formatNumber(pcsTotal)}</b> pcs · ${stanList}</span>
      </div>
      <div class="grp-body">
        ${renderColumnHeader('status')}
        ${renderWkBlocksInBucket(groupByWeek(orders))}
      </div>
    </section>
  `;
}

function groupByWeek(orders) {
  const m = new Map();
  for (const o of orders) {
    const key = o._weekLabel || 'NoWeek';
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(o);
  }
  // Sort weeks ascending (chronological) — NoWeek last
  return new Map([...m.entries()].sort((a, b) => {
    if (a[0] === 'NoWeek') return 1;
    if (b[0] === 'NoWeek') return -1;
    return a[0].localeCompare(b[0]);
  }));
}

function renderWkBlocksInBucket(byWeek) {
  const html = [];
  for (const [wkLabel, list] of byWeek.entries()) {
    const pcsTotal = list.reduce((s, o) => s + (Number(o.pcs) || 0), 0);
    const isNoWeek = wkLabel === 'NoWeek';
    html.push(`
      <div class="wk-block${isNoWeek ? ' nowk' : ''}">
        <div class="wk-rail">
          <div class="wk-num">${escapeHTML(isNoWeek ? '—' : wkLabel)}</div>
          <div class="wk-sum"><b>${list.length}</b> ord · <b>${formatNumber(pcsTotal)}</b> pcs</div>
        </div>
        <div class="wk-rows">
          ${list.map(renderOrderRow).join('')}
        </div>
      </div>
    `);
  }
  return html.join('');
}

// ---- View: By prod week ----------------------------------------------------
// The wireframe structures this view as ONE outer .grp ("All open orders")
// containing ONE col-hdr-block, then a series of sibling .wk-block elements,
// each with its own left rail (wk-rail) and a wk-rows container of rows.
//
// We don't nest the column header inside each week — only one header at top.
function renderOrdersByWeek(orders) {
  // Group by week
  const byWeek = new Map();
  for (const o of orders) {
    const k = o._weekLabel || 'NoWeek';
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(o);
  }
  // Sort: latest week first, NoWeek last
  const keys = [...byWeek.keys()].sort((a, b) => {
    if (a === 'NoWeek') return 1;
    if (b === 'NoWeek') return -1;
    return b.localeCompare(a);
  });

  if (keys.length === 0) {
    $('#viewByWeek').innerHTML = `<div class="orders-empty"><p>No orders.</p></div>`;
    return;
  }

  // Outer group meta — week range, total ord, total pcs
  const totalOrd = orders.length;
  const totalPcs = orders.reduce((s, o) => s + (Number(o.pcs) || 0), 0);
  const realWeeks = keys.filter(k => k !== 'NoWeek');
  let weekRange = '';
  if (realWeeks.length === 1) weekRange = `1 week · <b>${escapeHTML(realWeeks[0])}</b>`;
  else if (realWeeks.length > 1) {
    // Sorted ascending for the range label
    const asc = [...realWeeks].sort();
    weekRange = `${realWeeks.length} weeks · <b>${escapeHTML(asc[0])} → ${escapeHTML(asc[asc.length-1])}</b>`;
  }

  const outerKey = 'week-outer';
  const outerCollapsed = collapsedGroups.has(outerKey);

  // Build each wk-block (one per week)
  const wkBlocksHTML = keys.map(wk => {
    const list = byWeek.get(wk);
    const key = 'week:' + wk;
    const isCollapsed = collapsedGroups.has(key);
    const isNoWeek = wk === 'NoWeek';
    const pcsTotal = list.reduce((s, o) => s + (Number(o.pcs) || 0), 0);
    // Are any rows overdue (a dt in the past)?
    const today = new Date(); today.setHours(0,0,0,0);
    const hasOverdue = list.some(o => o.dd && new Date(o.dd) < today);
    const overdueBadge = hasOverdue ? '<div class="overdue">overdue</div>' : '';
    return `
      <div class="wk-block wk-collapsible${isNoWeek ? ' nowk' : ''}${isCollapsed ? ' collapsed' : ''}" data-collapse-key="${escapeAttr(key)}">
        <div class="wk-rail">
          <svg class="wk-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <div class="wk-num">${escapeHTML(isNoWeek ? '—' : wk)}</div>
          <div class="wk-sum"><b>${list.length}</b> ord</div>
          <div class="wk-sum"><b>${formatNumber(pcsTotal)}</b> pcs</div>
          ${overdueBadge}
        </div>
        <div class="wk-rows">
          ${list.map(renderOrderRow).join('')}
        </div>
      </div>
    `;
  }).join('');

  $('#viewByWeek').innerHTML = `
    <section class="grp${outerCollapsed ? ' collapsed' : ''}" data-collapse-key="${escapeAttr(outerKey)}">
      <div class="grp-hdr">
        <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="name">All open orders</span>
        <span class="meta"><b>${formatNumber(totalOrd)}</b> ord · <b>${formatNumber(totalPcs)}</b> pcs · ${weekRange}</span>
      </div>
      <div class="grp-body">
        ${renderColumnHeader('week')}
        ${wkBlocksHTML}
      </div>
    </section>
  `;
}

// ---- Column header strip (rendered inside each group) ----------------------
// Each cell carries `data-col-key` matching its CSS variable name. The right
// edge has an invisible `.col-resize-handle` that drives the drag-to-resize
// behavior wired in initColResize().
function renderColumnHeader(view) {
  const gridClass = view === 'status' ? 'grid-status' : 'grid-week';
  const cell = (key, label, extraCls = '') => `
    <div class="col-hdr-cell${extraCls ? ' ' + extraCls : ''}" data-col-key="${key}">
      <span>${label}</span>
      <span class="col-resize-handle" data-col-key="${key}" title="Drag to resize column"></span>
    </div>
  `;
  const statusHdr = (view === 'week') ? cell('status', 'Status') : '';
  return `
    <div class="col-hdr-block">
      <div class="col-hdr-rail">Prod wk</div>
      <div class="col-hdr-cols ${gridClass}">
        ${statusHdr}
        ${cell('cust', 'Cust')}
        ${cell('ord', 'Order no')}
        ${cell('pcs', 'Pcs', 'num')}
        ${cell('finvalid', 'FinValid')}
        ${cell('dd', 'DD')}
        ${cell('termre', 'TermRe')}
        <div class="col-hdr-cell" data-col-key="matlet">
          <div class="mat-hdr"><span>P</span><span>F</span><span>A</span><span>G</span><span>R</span><span>D</span><span>O</span></div>
          <span class="col-resize-handle" data-col-key="matlet" title="Drag to resize column"></span>
        </div>
        <div class="col-hdr-cell" data-col-key="matdat">
          <div class="mat-hdr"><span>P</span><span>F</span><span>A</span><span>G</span><span>R</span><span>D</span><span>O</span></div>
          <span class="col-resize-handle" data-col-key="matdat" title="Drag to resize column"></span>
        </div>
        ${cell('time', 'Time')}
        ${cell('lastscan', 'Last scan')}
        ${cell('addr', 'Addr')}
        ${cell('opti', 'Opti batch')}
        ${cell('ready', 'Ready')}
        ${cell('route', 'Route')}
        ${cell('desc', 'Description')}
      </div>
    </div>
  `;
}

// ---- Single row ------------------------------------------------------------
function renderOrderRow(order) {
  const isWeekView = currentView === 'week';
  const gridClass = isWeekView ? 'grid-week' : 'grid-status';

  // Pull bucket config (Optimizer label, band color, showsMaterials flag).
  // If unknown / unmapped, use a neutral red wash so it's visibly an outlier.
  const cfg = getBucketConfig(order._bucket);
  const showsMaterials = cfg ? cfg.showsMaterials : false;
  const bandColor      = cfg ? cfg.color          : '#fce6e6';   // soft red for unknown
  const statusLabel    = cfg ? cfg.optimizerValue : 'Unknown';

  const cust = order.customerCode || '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Materials zone — TWO cells side-by-side:
  //   left  : 7 letter chips (Px, F20, A_, ...) — material STATE
  //   right : 7 date chips   (13/05, —, ...)    — material delivery DATES
  // Both shown for flow #3..#8; both empty ("—") for flow #1 and #2 to keep
  // the column structure consistent.
  let matsLettersCell, matsDatesCell;
  if (showsMaterials) {
    const lettersHTML = order._materialChips.map(c =>
      `<span class="${c.cls}">${escapeHTML(c.code)}</span>`
    ).join('');
    matsLettersCell = `<span class="mat">${lettersHTML}</span>`;
    const datesHTML = order._materialDateChips.map(c =>
      `<span class="${c.cls}">${escapeHTML(c.label)}</span>`
    ).join('');
    matsDatesCell = `<span class="mat-dates">${datesHTML}</span>`;
  } else {
    matsLettersCell = `<span class="mat-empty">—</span>`;
    matsDatesCell   = `<span class="mat-empty">—</span>`;
  }

  // Time-in-status: only show when meaningful (positive duration). For future-dated
  // finValid (which is common — finValid IS a future planning date for many orders),
  // the duration is negative; show — instead.
  const tm = (order._timeInStatus && order._timeInStatus.cls !== 'future')
    ? `<span class="tm ${order._timeInStatus.cls}">${escapeHTML(order._timeInStatus.text)}</span>`
    : `<span class="empty-cell">—</span>`;

  // Last scan: <b>stage</b> · workstation when both present
  let lastScan;
  if (order.lastScanStage && order.lastScanWorkstation) {
    lastScan = `<span class="scan"><b>${escapeHTML(String(order.lastScanStage))}</b> · ${escapeHTML(String(order.lastScanWorkstation))}</span>`;
  } else if (order.lastScanStage) {
    lastScan = `<span class="scan"><b>${escapeHTML(String(order.lastScanStage))}</b></span>`;
  } else {
    lastScan = `<span class="empty-cell">—</span>`;
  }

  const addr = order.deliveryCity
    ? `<span class="addr">${escapeHTML(String(order.deliveryCity))}</span>`
    : `<span class="empty-cell">—</span>`;

  const optiBatch = order.optiBatch
    ? `<span class="batch">${escapeHTML(String(order.optiBatch))}</span>`
    : `<span class="empty-cell">—</span>`;

  // Readiness column — render as <div class="rd">: percentage + count + progress bar
  // Inputs: packedCount (variable), pcs (variable)
  let readyCell;
  const total = Number(order.pcs);
  const packed = Number(order.packedCount);
  if (isFinite(packed) && isFinite(total) && total > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((packed / total) * 100)));
    let cls = 'f';
    if (pct === 0) cls = 'f zero';
    else if (pct < 50) cls = 'f lo';
    else if (pct < 90) cls = 'f mid';
    readyCell = `
      <div class="rd">
        <div class="top">
          <span class="pct">${pct}%</span>
          <span class="cnt">${packed}/${total}</span>
        </div>
        <div class="bar"><div class="${cls}" style="width:${pct}%"></div></div>
      </div>
    `.trim();
  } else if (isFinite(packed)) {
    // No pcs to divide by — show the count alone
    readyCell = `<span class="rd-simple">${packed}</span>`;
  } else {
    readyCell = `<span class="empty-cell">—</span>`;
  }

  const ono = order.orderNo;
  const route = order.assignedRoute || '';
  const desc = order.description || '';

  // Continuous band: cells 1..6 (status view) or 1..7 (week view) get the
  // bucket's color as background. Plain text inside — no pills, no chips,
  // no rounded edges. Applied via inline style so each bucket's user-picked
  // color works without CSS gymnastics.
  const bandStyle = `style="background:${bandColor}"`;

  // Status text cell (week view only). Plain text on the band.
  let statusCell = '';
  if (isWeekView) {
    statusCell = `<span class="band-cell band-status" ${bandStyle}>${escapeHTML(statusLabel)}</span>`;
  }

  return `
    <div class="row ${gridClass}" data-ono="${escapeAttr(String(ono))}" data-bucket="${escapeAttr(String(order._bucket))}">
      ${statusCell}<span class="band-cell band-cust" ${bandStyle}>${escapeHTML(cust || '—')}</span>
      <span class="band-cell band-ord" ${bandStyle}>${escapeHTML(String(ono))}</span>
      <span class="band-cell band-num num" ${bandStyle}>${order.pcs != null ? escapeHTML(String(order.pcs)) : '—'}</span>
      <span class="band-cell band-dt" ${bandStyle}>${dtInner(order.finValid, today)}</span>
      <span class="band-cell band-dt" ${bandStyle}>${dtInner(order.dd, today)}</span>
      <span class="band-cell band-dt" ${bandStyle}>${dtInner(order.termRe, today)}</span>
      ${matsLettersCell}
      ${matsDatesCell}
      ${tm}
      ${lastScan}
      ${addr}
      ${optiBatch}
      ${readyCell}
      <span class="rt-cell" data-field="assignedRoute" title="${escapeAttr(route)}">${route ? escapeHTML(route) : '<span class="empty-cell">—</span>'}</span>
      <span class="desc-cell" data-field="description" title="${escapeAttr(desc)}">${desc ? escapeHTML(desc) : '<span class="empty-cell">—</span>'}</span>
    </div>
  `;
}

/** Render the inner text of a date cell. The wrapping `band-cell` span gets
 *  the band background; the inner span only carries the slip-color class. */
function dtInner(val, today) {
  if (!val) return `<span class="empty-cell">—</span>`;
  const d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return `<span class="empty-cell">—</span>`;
  const slipCls = (d < today) ? ' slip' : '';
  return `<span class="dt${slipCls}">${formatDateShort(d)}</span>`;
}

function sanitizeClass(s) {
  // Lowercase, strip non-alnum — for the customer-badge color class
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ===========================================================================
// Status Mapping tab — user-driven mapping from stan values -> bucket IDs.
// Lives in currentMapping.statusMapping (persists to mapping.json).
// Shape:
//   statusMapping: {
//     source: 'sql_01',
//     column: 'status',
//     values: { '<rawValue>': 1..8 | 'unknown', '__null__': 1..8 | 'unknown' }
//   }
// ===========================================================================

/** Return the values map, creating + seeding it from defaults on first use. */
// ===========================================================================
// Status Mapping — bucket-first model.
//
// mapping.json shape:
//   statusMapping: {
//     source: 'sql_01',
//     column: 'status',
//     buckets: [
//       { id: 1, optimizerValue: 'Planowanie FV',     erpValues: ['Planowanie'] },
//       { id: 2, optimizerValue: 'Waiting planowanie',erpValues: ['Waiting planowanie'] },
//       ...
//       { id: 8, optimizerValue: 'Warehouse ready',   erpValues: ['Magazyn wyrobów gotowych', 'MWG'] }
//     ]
//   }
//
// Each raw ERP status value belongs to AT MOST ONE bucket. Values not in any
// bucket land in the Unknown pool (rendered as the "Unassigned values" list
// at the bottom of the tab).
//
// The "Optimizer value" column is an editable human-readable label per
// bucket. It does not feed the merge — it's just for the dispatcher's
// vocabulary. The bucket id (1–8) is what computeStatusBucket returns.
// ===========================================================================

/** Return the statusMapping object, creating + migrating as needed. */
// ===========================================================================
// Status Mapping — singular erpValue per bucket, color picker, mat-dates flag.
//
// mapping.json shape:
//   statusMapping: {
//     source: 'sql_01',
//     column: 'status',
//     buckets: [
//       { id: 1, optimizerValue: 'Planowanie FV', erpValue: 'Planowanie',
//         color: '#dbe7ff', showMatDates: false },
//       ...
//     ]
//   }
//
// Each bucket has exactly ONE erpValue (singular). Multiple ERP synonyms
// per bucket are not supported — fix the synonyms in the SQL.
// ===========================================================================

/** Return statusMapping, migrating any legacy shape and seeding defaults.
 *  Bumps schemaVersion to force a label/ERP reset on upgrade — the 8 statuses
 *  are part of the app spec, not editable defaults that the user might have
 *  already changed. After the reset, user edits persist normally. */
function ensureStatusMapping() {
  if (!currentMapping.statusMapping) currentMapping.statusMapping = {};
  const sm = currentMapping.statusMapping;
  const CURRENT_SCHEMA = 3;

  // Migrate legacy { values: {raw: bucketId} } → buckets[]
  if (sm.values && !sm.buckets) {
    sm.buckets = STATUS_BUCKETS.map(b => ({
      id: b.id,
      optimizerValue: b.defaultLabel,
      erpValue: b.defaultErp || null,
      color: b.defaultColor,
    }));
    delete sm.values;
  }

  // One-time reset on schema upgrade: any pre-existing buckets carry old
  // labels (Planowanie FV, Waiting ordering, …) from earlier phases. The new
  // 8-status spec is authoritative — overwrite labels + ERP + color, but
  // preserve the user's source query and column selection.
  if ((sm.schemaVersion || 0) < CURRENT_SCHEMA) {
    sm.buckets = STATUS_BUCKETS.map(b => ({
      id: b.id,
      optimizerValue: b.defaultLabel,
      erpValue: b.defaultErp || null,
      color: b.defaultColor,
    }));
    sm.schemaVersion = CURRENT_SCHEMA;
    saveMappingDebounced();
  }

  // Strip legacy fields and backfill missing ones
  if (Array.isArray(sm.buckets)) {
    let changed = false;
    for (const b of sm.buckets) {
      if (Array.isArray(b.erpValues)) {
        b.erpValue = (b.erpValues.length > 0) ? b.erpValues[0] : null;
        delete b.erpValues;
        changed = true;
      }
      if (b.showMatDates !== undefined) {
        delete b.showMatDates;
        changed = true;
      }
      const seed = STATUS_BUCKETS.find(x => x.id === b.id);
      if (b.color == null && seed) { b.color = seed.defaultColor; changed = true; }
      if (b.erpValue === undefined) { b.erpValue = null; changed = true; }
    }
    if (changed) saveMappingDebounced();
  }

  // Fresh install fallback
  if (!Array.isArray(sm.buckets) || sm.buckets.length === 0) {
    sm.buckets = STATUS_BUCKETS.map(b => ({
      id: b.id,
      optimizerValue: b.defaultLabel,
      erpValue: b.defaultErp || null,
      color: b.defaultColor,
    }));
  }

  // Defensive: ensure every canonical bucket exists
  for (const b of STATUS_BUCKETS) {
    if (!sm.buckets.find(x => x.id === b.id)) {
      sm.buckets.push({
        id: b.id,
        optimizerValue: b.defaultLabel,
        erpValue: b.defaultErp || null,
        color: b.defaultColor,
      });
    }
  }
  sm.buckets.sort((a, b) => a.id - b.id);

  return sm;
}

function renderStatusMapping() {
  const sm = ensureStatusMapping();

  if (!sm.source || !sm.column) {
    const vmStatus = vmGet('orders')?.status;
    if (vmStatus && vmStatus.source && vmStatus.column) {
      if (!sm.source) sm.source = vmStatus.source;
      if (!sm.column) sm.column = vmStatus.column;
    }
  }

  const queries = currentMapping?.queries || [];
  const sourceSel = $('#sm-source-query');
  sourceSel.innerHTML = queries.map(q =>
    `<option value="${escapeAttr(q.id)}">${escapeHTML(q.name || q.id)}</option>`
  ).join('') || '<option value="">(no queries)</option>';
  if (sm.source && queries.some(q => q.id === sm.source)) sourceSel.value = sm.source;
  else if (queries[0]) { sm.source = queries[0].id; sourceSel.value = sm.source; }

  renderSmColumnOptions();
  updateSmNote();
  renderSmBucketsTable();

  if (!renderStatusMapping._wired) {
    renderStatusMapping._wired = true;
    document.getElementById('sm-source-query').addEventListener('change', () => {
      sm.source = $('#sm-source-query').value;
      sm.column = '';
      renderSmColumnOptions();
      updateSmNote();
      renderSmBucketsTable();
      saveMappingDebounced();
    });
    document.getElementById('sm-source-column').addEventListener('change', () => {
      sm.column = $('#sm-source-column').value;
      updateSmNote();
      renderSmBucketsTable();
      saveMappingDebounced();
    });
    document.getElementById('sm-rescan').addEventListener('click', () => {
      renderSmBucketsTable();
    });
    document.getElementById('sm-restore-defaults').addEventListener('click', () => {
      modal.confirm({
        title: 'Restore built-in defaults?',
        message: 'This replaces every bucket\'s label, ERP value, color, and mat-dates flag with the built-in defaults. Custom assignments will be lost.',
        okLabel: 'Restore',
      }).then(ok => {
        if (!ok) return;
        sm.buckets = STATUS_BUCKETS.map(b => ({
          id: b.id,
          optimizerValue: b.defaultLabel,
          erpValue: b.defaultErp || null,
          color: b.defaultColor,
        }));
        saveMappingDebounced();
        renderSmBucketsTable();
      });
    });
  }
}

function renderSmColumnOptions() {
  const sm = ensureStatusMapping();
  const colSel = $('#sm-source-column');
  if (!colSel) return;
  const rows = (sm.source && lastResultRows[sm.source]) ? lastResultRows[sm.source] : [];
  const cols = (rows[0]) ? Object.keys(rows[0]) : [];
  if (cols.length === 0) {
    colSel.innerHTML = '<option value="">(run preview on this query first)</option>';
    return;
  }
  colSel.innerHTML = cols.map(c =>
    `<option value="${escapeAttr(c)}">${escapeHTML(c)}</option>`
  ).join('');
  if (sm.column && cols.includes(sm.column)) {
    colSel.value = sm.column;
  } else {
    const guess = cols.find(c => /^(status|stan|workflowstate)$/i.test(c)) || cols[0];
    sm.column = guess;
    colSel.value = guess;
  }
}

function updateSmNote() {
  const sm = ensureStatusMapping();
  const note = $('#sm-source-note');
  const warn = $('#sm-warning');
  if (!note || !warn) return;
  const rows = (sm.source && lastResultRows[sm.source]) ? lastResultRows[sm.source] : [];
  if (rows.length === 0) {
    note.textContent = '';
    warn.hidden = false;
    warn.textContent = `No preview rows for query "${sm.source || '(none)'}". Open that tab and click Run preview, then come back to this tab.`;
  } else {
    note.textContent = `${rows.length} preview rows · column "${sm.column}"`;
    warn.hidden = true;
  }
}

function computeSmValueCounts() {
  const sm = ensureStatusMapping();
  const rows = (sm.source && lastResultRows[sm.source]) ? lastResultRows[sm.source] : [];
  if (rows.length === 0 || !sm.column) return [];
  const counts = new Map();
  for (const r of rows) {
    const v = r[sm.column];
    if (v == null || String(v).trim() === '') continue;
    const k = String(v).trim();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function renderSmBucketsTable() {
  const sm = ensureStatusMapping();
  const tbody = $('#sm-buckets-tbody');
  if (!tbody) return;

  const valueCounts = computeSmValueCounts();
  const baseOpts = ['<option value="">— (none)</option>'].concat(
    valueCounts.map(v => `<option value="${escapeAttr(v.value)}">${escapeHTML(v.value)}  (${v.count})</option>`)
  ).join('');

  tbody.innerHTML = sm.buckets.map(b => {
    const erpVal = b.erpValue || '';
    const inList = valueCounts.some(x => x.value === erpVal);
    const extraOpt = (erpVal && !inList)
      ? `<option value="${escapeAttr(erpVal)}">${escapeHTML(erpVal)}  (not in preview)</option>`
      : '';
    return `
      <tr data-bid="${b.id}">
        <td class="sm-flow">${b.id}</td>
        <td><input class="sm-opt-input" data-bid="${b.id}" value="${escapeAttr(b.optimizerValue || '')}"></td>
        <td><select class="sm-erp-sel" data-bid="${b.id}">${baseOpts}${extraOpt}</select></td>
        <td><input class="sm-color" type="color" data-bid="${b.id}" value="${escapeAttr(b.color || '#eeeeee')}"></td>
      </tr>
    `;
  }).join('');

  // Set <select> values (innerHTML reset them)
  tbody.querySelectorAll('.sm-erp-sel').forEach(sel => {
    const bid = Number(sel.dataset.bid);
    const bucket = sm.buckets.find(x => x.id === bid);
    sel.value = bucket?.erpValue || '';
  });

  // Wire change handlers
  tbody.querySelectorAll('.sm-opt-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      const bid = Number(inp.dataset.bid);
      const bucket = sm.buckets.find(x => x.id === bid);
      if (!bucket) return;
      bucket.optimizerValue = inp.value.trim() ||
        STATUS_BUCKETS.find(b => b.id === bid)?.defaultLabel || `Bucket ${bid}`;
      saveMappingDebounced();
    });
  });
  tbody.querySelectorAll('.sm-erp-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const bid = Number(sel.dataset.bid);
      const bucket = sm.buckets.find(x => x.id === bid);
      if (!bucket) return;
      bucket.erpValue = sel.value || null;
      saveMappingDebounced();
    });
  });
  tbody.querySelectorAll('.sm-color').forEach(inp => {
    inp.addEventListener('change', () => {
      const bid = Number(inp.dataset.bid);
      const bucket = sm.buckets.find(x => x.id === bid);
      if (!bucket) return;
      bucket.color = inp.value;
      saveMappingDebounced();
    });
  });
}

function saveMappingDebounced() {
  if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
}



// ===========================================================================
// App Spec screen — full port (mostly static, with live counts on pipeline)
// ===========================================================================

const APP_SPEC_SECTIONS = [
  {
    id: 'order-header',
    title: 'Order header',
    body: `
      <p>Top of each order row: <b>customer code badge</b> · <b>order number</b> · <b>pcs</b>.</p>
      <p>Customer codes are configurable in the SELECT query (column <code>customerCode</code>). Common ones (F24, STR, ELI, USA, TPZ) have brand-colored badges; others use the generic gray badge.</p>
    `,
  },
  {
    id: 'search-syntax',
    title: 'Search box (Orders header)',
    body: `
      <p>The search box at the top of the Orders screen filters rows live as you type. It matches against <b>orderNo</b>, <b>customerCode</b>, and <b>description</b>.</p>
      <p>Syntax:</p>
      <ul>
        <li><b>Plain text</b> — substring match (case-insensitive). Example: <code>5180</code> matches any order containing "5180".</li>
        <li><b><code>%</code> wildcard</b> — Excel / SQL <code>LIKE</code> style. Match zero or more characters.
          <ul>
            <li><code>F24%</code> — starts with "F24"</li>
            <li><code>%5180%</code> — contains "5180" (same as plain "5180")</li>
            <li><code>F24%X</code> — starts with F24 and ends with X</li>
            <li><code>%_5180A</code> — contains "_5180A" (the underscore is literal — not a wildcard)</li>
          </ul>
        </li>
      </ul>
      <p>When a <code>%</code> is present anywhere in the input, the whole expression is anchored at both ends (start &amp; end of the field). Without any <code>%</code>, it's a plain substring match.</p>
      <p>The search is purely client-side — no re-fetch from the database is triggered. Filter state is not persisted, search clears on app restart.</p>
    `,
  },
  {
    id: 'status-mapping',
    title: 'Status mapping (Mapping screen → Status mapping tab)',
    body: `
      <p>The pipeline has 8 fixed flow positions matching the Elwiz workflow. They are hardcoded — you cannot add or remove rows. You can edit each row's label, pick the SQL value that classifies into it, and choose a band color.</p>
      <p><b>The 8 statuses, in flow order:</b></p>
      <ol>
        <li><b>Akceptacja finansowa</b> — orders awaiting financial validation. One operator reviews and marks them paid.</li>
        <li><b>Waiting ordering</b> — transitory. External parser is processing. Should be quick; visible so stuck orders can be unstuck.</li>
        <li><b>Planowanie</b> — operator orders materials and fills delivery dates as suppliers confirm.</li>
        <li><b>Waiting for Comarch</b> — transitory. External ERP processing (~5 minutes). Visible only so errors can be caught.</li>
        <li><b>Mat_zam</b> — all materials ordered, awaiting delivery. This is where the material delivery dates matter most.</li>
        <li><b>Planowanie do OPT</b> — materials in, optimization in progress. Some orders have an Optimization batch assigned, others not yet.</li>
        <li><b>Do produkcji</b> — manufacturing. WHNet scans track pieces as they complete. The order stays here until all pieces are done.</li>
        <li><b>Magazyn wyrobów gotowych</b> — all pieces packed, ready for dispatch.</li>
      </ol>
      <p><b>Source query + Column</b> at the top of the tab: pick which query and which column to read distinct status values from. Defaults to whichever query your <code>status</code> variable points to in Variable mapping. Run a preview on the source query first so the dropdowns populate.</p>
      <p><b>Four editable columns in the buckets table:</b></p>
      <ol>
        <li><b>Flow #</b> — fixed position 1..8.</li>
        <li><b>Optimizer value</b> — the label you choose. Shown in the Orders screen group headers, status cell, and App Spec pipeline.</li>
        <li><b>Mapped SQL value</b> — dropdown of the distinct values found in the chosen column. Pick exactly one per bucket.</li>
        <li><b>Color</b> — color picker. Drives the continuous background band across the Cust → TermRe cells and the group header in By status view.</li>
      </ol>
      <p><b>Materials column rule (hardcoded by position):</b></p>
      <ul>
        <li>Flow #1 and #2 — materials zone shows a centered "—" in both letters and dates cells (these are pre-materials states).</li>
        <li>Flow #3 through #8 — materials zone shows two cells side by side: <b>letters</b> on the left (Px, F20, A_, …) and <b>delivery dates</b> on the right (13/05, —, …).</li>
      </ul>
      <p><b>Lookup rule:</b> a raw status value matches a bucket if its trimmed lowercase form equals that bucket's <code>erpValue</code>. Each value can match only one bucket. Values not picked anywhere go to Unknown (a 9th bucket appears at the bottom of the By status view listing the unmatched values inline).</p>
      <p><b>Gate:</b> the Orders screen shows a placeholder until you've picked a Column in Status mapping. Once a column is selected, classification runs.</p>
      <p><b>Re-scan values</b> — re-reads the preview rows after running a fresh preview on the source query.</p>
      <p><b>Restore built-in defaults</b> — wipes all 8 buckets and re-seeds with the hardcoded Elwiz defaults (labels, SQL values, colors).</p>
      <p><b>Persistence:</b> stored in <code>mapping.json</code> under <code>statusMapping.buckets</code> as <code>{ id, optimizerValue, erpValue, color }[]</code>. Auto-saved on every change.</p>
    `,
  },
  {
    id: 'classification',
    title: 'Classification (orderType, STR_STI_STP_MRK, NoFr, orderTypeDetail)',
    body: `
      <p>Four classification variables drive the header filters on the Orders screen. They are populated from <code>sql_01</code> by default and have no special rendering in the row — they live in the filter bar at the top of Orders.</p>
      <ul>
        <li><b>orderType</b> — Top-level material family. Two known values: <code>ALU</code> (aluminium) and <code>PVC</code> (vinyl). The filter is a two-chip multi-select; both selected by default.</li>
        <li><b>STR_STI_STP_MRK</b> — Sub-classification marker. Values seen include <code>STR</code>, <code>STI</code>, <code>STP</code>, <code>MRK</code> — many orders are NULL. Filter is a single-select dropdown with an explicit <code>(NULL)</code> option for orders without a marker.</li>
        <li><b>NoFr</b> — A flag. Tri-state filter: <b>All</b> (default), <b>NoFr</b> (only orders flagged), <b>Not</b> (only orders without the flag). Source column treated as truthy/falsy on string content.</li>
        <li><b>orderTypeDetail</b> — Fine-grained classification, e.g. <code>ALU_STR_NoFr</code>, <code>PVC_NoFr</code>. Filter is a single-select dropdown auto-populated from currently loaded data, plus an explicit <code>(NULL)</code> option.</li>
      </ul>
      <p>All four filters operate on the in-memory <code>lastOrders</code> cache — changes apply instantly without a re-fetch. Filter state is persisted in browser localStorage so it survives app restarts.</p>
    `,
  },
  {
    id: 'dates',
    title: 'Dates',
    body: `
      <p>Three date columns shown left-to-right:</p>
      <ul>
        <li><b>FinValid</b> — financial validation date (<code>datafin</code>). The order becomes active in our pipeline once this is set.</li>
        <li><b>DD</b> — delivery date (<code>realizacja</code>). The dispatch target.</li>
        <li><b>TermRe</b> — re-confirmation deadline. TBD — currently same source as DD until disambiguated.</li>
      </ul>
      <p>Dates render <b>DD/MM</b>. Dates in the past (relative to today, where meaningful) are highlighted red.</p>
    `,
  },
  {
    id: 'materials',
    title: 'Materials (P F A G R D O chips)',
    body: `
      <p>Seven small chips per row, one per material category:</p>
      <ul>
        <li><b>P</b> Profiles</li>
        <li><b>F</b> Reinforcements / stalowanie <i>(source columns TBD)</i></li>
        <li><b>A</b> Additional profiles</li>
        <li><b>G</b> Glass / szyby</li>
        <li><b>R</b> Rolety / shutters</li>
        <li><b>D</b> Dekoracje / door fillings</li>
        <li><b>O</b> Okucia / hardware</li>
      </ul>
      <p>Each chip is computed from two variables: <code>matX_promised</code> and <code>matX_actual</code>:</p>
      <ul>
        <li><span class="legend delivered">green</span> — actual delivery date ≤ promised (delivered on time)</li>
        <li><span class="legend overdue">red</span> — actual &gt; promised (delivered late)</li>
        <li><span class="legend empty">gray</span> — no actual date yet, or no data</li>
      </ul>
    `,
  },
  {
    id: 'status-pipeline',
    title: 'Status pipeline',
    body: '__PIPELINE_BODY__', // marker — JS replaces this with the live pipeline
  },
  {
    id: 'time-tracking',
    title: 'Time tracking (TIME column)',
    body: `
      <p>The TIME column shows how long an order has been in its current bucket. Computed as <code>now − finValid</code> (placeholder; ideally would use the last status-change timestamp).</p>
      <p>Color encoding:</p>
      <ul>
        <li><span class="tm ok">green</span> — under 8 hours</li>
        <li><span class="tm warn">amber</span> — 8 hours to 2 days</li>
        <li><span class="tm over">red</span> — over 2 days</li>
      </ul>
    `,
  },
  {
    id: 'production-tracking',
    title: 'Production tracking',
    body: `
      <p>Three production-related variables, all sourced from WHNet scan events:</p>
      <ul>
        <li><b>optiBatch</b> — the optimization batch this order rolled into (TBD — source column not yet identified)</li>
        <li><b>lastScanStage</b> — the production step on the most recent scan (e.g. "06_GLAZE")</li>
        <li><b>lastScanWorkstation</b> — the workstation where the most recent scan happened (e.g. "WS-038")</li>
        <li><b>lastScanTime</b> — timestamp of the most recent scan (used for sorting; not displayed)</li>
      </ul>
      <p>The "Last scan" column on each row shows <b>stage</b> · <b>workstation</b> together.</p>
    `,
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    body: `
      <p>Two warehouse columns:</p>
      <ul>
        <li><b>Opti batch</b> — see Production tracking</li>
        <li><b>Ready</b> — count of pieces packed (variable <code>packedCount</code>, derived from a count of scans with ActionName <code>FINISHED</code> or <code>PACK</code> — heuristic, may need refinement)</li>
      </ul>
    `,
  },
  {
    id: 'delivery-routing',
    title: 'Delivery routing',
    body: `
      <p><b>Addr</b> (variable <code>deliveryCity</code>) comes from the SQL waterfall on Aluplast's three address fields. See sql_01 default for the COALESCE logic.</p>
      <p><b>Route</b> (variable <code>assignedRoute</code>) is operator-only — typed by the dispatcher and saved in the browser's localStorage. It survives refreshes and app restarts. To move it to a real database, see the Decisions section.</p>
    `,
  },
  {
    id: 'description-notes',
    title: 'Description / operator notes',
    body: `
      <p>The <b>Description</b> column on each row is editable. Click into it, type, and click elsewhere to save. Notes are stored in localStorage keyed by <code>orderNo</code>.</p>
      <p>Orphaned notes (orders that disappear from the SQL result on subsequent refreshes) are <b>kept</b>, not deleted. They re-appear if the order ever returns.</p>
    `,
  },
];

function renderAppSpec() {
  const body = $('#appspecBody');
  if (!body) return;

  const html = APP_SPEC_SECTIONS.map(section => {
    const isCollapsed = collapsedGroups.has('appspec:' + section.id);
    let inner = section.body;
    if (inner === '__PIPELINE_BODY__') inner = renderAppSpecPipelineHTML();
    return `
      <section class="as-panel${isCollapsed ? ' collapsed' : ''}" data-collapse-key="appspec:${section.id}">
        <div class="grp-hdr">
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="name">${escapeHTML(section.title)}</span>
        </div>
        <div class="grp-body as-intro">${inner}</div>
      </section>
    `;
  }).join('');

  body.innerHTML = html;
}

function renderAppSpecPipelineHTML() {
  // Counts from lastOrders
  const counts = new Map();
  for (const o of lastOrders) counts.set(o._bucket, (counts.get(o._bucket) || 0) + 1);
  const unknownCount = counts.get('unknown') || 0;

  const items = STATUS_BUCKETS.map(b => {
    const cfg = getBucketConfig(b.id);
    const c = counts.get(b.id) || 0;
    const cntZero = c === 0 ? ' zero' : '';
    const note = b.note ? `<div class="pipe-meta"><b>Note:</b> ${escapeHTML(b.note)}</div>` : '';
    const label = cfg ? cfg.optimizerValue : b.defaultLabel;
    const erp = cfg && cfg.erpValue ? cfg.erpValue : '—';
    const bandStyle = cfg ? `style="background:${cfg.color}"` : '';
    return `
      <div class="pipe-step" data-bucket="${b.id}" ${bandStyle}>
        <div class="pipe-num">${b.id}</div>
        <div class="pipe-content">
          <div class="pipe-name"><b>${escapeHTML(label)}</b> <span class="pipe-stan">SQL: ${escapeHTML(erp)}</span></div>
          <div class="pipe-meta"><b>SLA:</b> ${escapeHTML(b.sla || '—')}</div>
          ${note}
        </div>
        <div class="pipe-count${cntZero}">${c}</div>
      </div>
    `;
  }).join('');
  const unknownItem = unknownCount > 0 ? `
    <div class="pipe-step unknown">
      <div class="pipe-num">?</div>
      <div class="pipe-content">
        <div class="pipe-name"><b>Unknown / unmapped status</b></div>
        <div class="pipe-meta">Orders whose <code>status</code> doesn't match any bucket's Mapped SQL value.</div>
      </div>
      <div class="pipe-count">${unknownCount}</div>
    </div>
  ` : '';

  return `<div class="pipe-list">${items}${unknownItem}</div>`;
}

// Click handler for App Spec section headers — toggle collapse
document.addEventListener('click', (e) => {
  const hdr = e.target.closest('#appspecBody .grp-hdr');
  if (!hdr) return;
  const panel = hdr.closest('.as-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  const key = panel.dataset.collapseKey;
  if (key) {
    if (panel.classList.contains('collapsed')) collapsedGroups.add(key);
    else collapsedGroups.delete(key);
    saveCollapsedGroups();
  }
});

// ====== Boot ===============================================================

async function boot() {
  // Show the user-data path for transparency
  try {
    const userDataPath = await window.configAPI.getUserDataPath();
    $('#mappingFilePath').textContent = userDataPath + '\\mapping.json';
  } catch (e) {
    $('#mappingFilePath').textContent = '(unavailable)';
  }

  // Load existing mapping if any
  try {
    const saved = await window.configAPI.readMapping();
    if (saved) {
      currentMapping = migrateMapping(saved);
      if (currentMapping.connection) fillConnectionForm(currentMapping.connection);
    }
  } catch (err) {
    console.error('Failed to load mapping:', err);
  }

  // Always ensure there is at least one query so the UI has something to show
  ensureDefaultQueries();

  // Render dynamic query tabs + panels
  renderQueryTabs();
  renderQueryPanels();

  // Phase 5: Orders screen
  initOrdersScreen();
  renderAppSpec(); // initial render with zero counts

  // Phase 5.17: Production module (self-contained; see production.js).
  // The host only calls init() once; the module wires its own DOM + refresh.
  if (window.Production && typeof window.Production.init === 'function') {
    try { window.Production.init(); } catch (e) { console.error('Production.init failed:', e); }
  }
}

boot();
