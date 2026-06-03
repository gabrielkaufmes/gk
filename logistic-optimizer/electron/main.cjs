/*
 * Electron main process.
 *
 * Responsibilities:
 *  - Create the application window
 *  - Expose SQL bridge to renderer via IPC (sql:test, sql:query)
 *  - Persist user mapping/config to %APPDATA%\LogisticOptimizer\
 *
 * Security model:
 *  - contextIsolation: true, nodeIntegration: false, sandbox: true
 *  - Renderer only sees window.sqlAPI (defined in preload.cjs)
 *  - Credentials never leave main process memory
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');

// ----- Config persistence ---------------------------------------------------

function getUserDataPath() {
  return app.getPath('userData');
}

function getMappingFilePath() {
  return path.join(getUserDataPath(), 'mapping.json');
}

function readMapping() {
  try {
    const p = getMappingFilePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('[main] readMapping failed:', err.message);
    return null;
  }
}

function writeMapping(data) {
  try {
    const p = getMappingFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: p };
  } catch (err) {
    console.error('[main] writeMapping failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// ----- SQL config builder ---------------------------------------------------

function buildPoolConfig(c) {
  const cfg = {
    server: c.server,
    database: c.database,
    user: c.user,
    password: c.password,
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 5000 },
    options: {
      encrypt: c.encrypt !== false,
      trustServerCertificate: c.trustServerCertificate !== false,
    },
  };
  if (c.instanceName) cfg.options.instanceName = c.instanceName;
  if (c.port) cfg.port = Number(c.port);
  return cfg;
}

// ----- IPC handlers ---------------------------------------------------------

ipcMain.handle('sql:test', async (_evt, c) => {
  let pool;
  const started = Date.now();
  try {
    pool = await sql.connect(buildPoolConfig(c));
    await pool.request().query('SELECT 1 AS ok');
    return {
      ok: true,
      server: c.server,
      database: c.database,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
});

ipcMain.handle('sql:query', async (_evt, { config, query }) => {
  let pool;
  const started = Date.now();
  try {
    pool = await sql.connect(buildPoolConfig(config));
    const r = await pool.request().query(query);
    return {
      ok: true,
      rows: r.recordset || [],
      rowCount: (r.recordset || []).length,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
});

ipcMain.handle('config:read-mapping', async () => {
  return readMapping();
});

ipcMain.handle('config:write-mapping', async (_evt, data) => {
  return writeMapping(data);
});

ipcMain.handle('config:get-user-data-path', async () => {
  return getUserDataPath();
});

/**
 * Load a packaged default SQL file from the config/ folder.
 * @param {string} which - 'aluplast' | 'whnet'
 */
ipcMain.handle('config:load-default-sql', async (_evt, which) => {
  try {
    let filename;
    if (which === 'aluplast') filename = 'default-aluplast.sql';
    else if (which === 'whnet') filename = 'default-whnet.sql';
    else return { ok: false, error: 'Unknown default: ' + which };

    const p = path.join(__dirname, '..', 'config', filename);
    const sqlText = fs.readFileSync(p, 'utf8');
    return { ok: true, sql: sqlText };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ----- Window ---------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Logistic Optimizer',
    backgroundColor: '#f7f8fa',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  // For now, open devtools so you can see console errors during development.
  // Remove or comment out before packaging for production.
  win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
