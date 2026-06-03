/*
 * Electron preload script.
 *
 * Runs in an isolated world before the renderer page.
 * Uses contextBridge to expose a SAFE, NARROW API to window.sqlAPI.
 *
 * The renderer code (index.html, app.js, mapping.js) calls
 * window.sqlAPI.runQuery(...), window.sqlAPI.testConnection(...), etc.
 * The renderer can NOT require Node modules, NOT access the file system,
 * and NOT see SQL credentials except as values it passes through.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sqlAPI', {
  /**
   * Test a SQL Server connection.
   * @param {object} config - { server, instanceName?, port?, database, user, password, encrypt?, trustServerCertificate? }
   * @returns {Promise<{ok: boolean, server?: string, database?: string, elapsedMs?: number, error?: string}>}
   */
  testConnection: (config) => ipcRenderer.invoke('sql:test', config),

  /**
   * Run an arbitrary SQL query and return the recordset.
   * @param {object} config - Same shape as testConnection
   * @param {string} query - SQL string
   * @returns {Promise<{ok: boolean, rows?: Array<object>, rowCount?: number, elapsedMs?: number, error?: string}>}
   */
  runQuery: (config, query) => ipcRenderer.invoke('sql:query', { config, query }),
});

contextBridge.exposeInMainWorld('configAPI', {
  /**
   * Read the mapping JSON from %APPDATA%\LogisticOptimizer\mapping.json.
   * Returns null if no mapping has been saved yet.
   */
  readMapping: () => ipcRenderer.invoke('config:read-mapping'),

  /**
   * Write the mapping JSON.
   * @param {object} data
   * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
   */
  writeMapping: (data) => ipcRenderer.invoke('config:write-mapping', data),

  /**
   * Returns the OS path where user data lives. Useful for the UI to show
   * "your mapping file lives at C:\Users\...\LogisticOptimizer\mapping.json".
   */
  getUserDataPath: () => ipcRenderer.invoke('config:get-user-data-path'),

  /**
   * Load the default SQL text shipped with the app.
   * @param {'aluplast'|'whnet'} which
   */
  loadDefaultSql: (which) => ipcRenderer.invoke('config:load-default-sql', which),
});
