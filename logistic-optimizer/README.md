# Logistic Optimizer

Electron desktop app for the Elwiz logistics dispatcher.

## Phase 1 — what works right now

This is the **first running build**. Only the **Connection tab** is functional.

- App opens to a window with two sidebar items: Orders and Mapping
- **Orders** screen shows a placeholder ("Configure mapping first")
- **Mapping** screen has 4 tabs; only **Connection** is wired
  - Type server, instance, username, password
  - Click **Test connection** → connects to SQL Server and reports success/failure
  - Click **Save** → persists settings (except password) to `%APPDATA%\logistic-optimizer\mapping.json`
  - **Export JSON** / **Import JSON** for sharing/backup

The other 3 tabs (Aluplast query, Whnet query, Variable mapping) are placeholders — they'll be filled in in Phase 2.

## Setup (one-time)

1. Open PowerShell or Command Prompt in this folder.
2. Run:
   ```
   npm install
   ```
   This downloads Electron and the `mssql` SQL Server driver. Takes ~2 minutes.

## Run

```
npm run dev
```

The app window opens. DevTools opens automatically alongside (for debugging during development).

## First test — what to do

1. Go to the **Mapping** tab.
2. Fill in:
   - Server: `192.168.10.8`
   - Instance name: `SQL_2019`
   - Database: `Aluplast`
   - Username: (your read-only SQL login)
   - Password: (your password)
   - Leave Encrypt + Trust certificate both checked.
3. Click **Test connection**.

**Expected:** Green text says "Connected to 192.168.10.8 / Aluplast — XX ms".

**If it fails:**
- "Login failed" → wrong username/password
- "Cannot connect" or timeout → network issue, server name wrong, or not on VPN
- "Certificate" error → uncheck Encrypt, or make sure Trust certificate is checked
- Any other error → screenshot the error message and send it back

## Where settings are saved

`C:\Users\<You>\AppData\Roaming\logistic-optimizer\mapping.json`

The exact path is shown in the app's Connection tab.

**Password is NEVER saved** — you re-enter it each session.

## File structure

```
logistic-optimizer/
├── electron/
│   ├── main.cjs              ← Node process: window + SQL IPC handlers
│   └── preload.cjs           ← contextBridge: exposes window.sqlAPI
├── public/
│   ├── index.html            ← The UI
│   ├── style.css             ← Styles
│   └── app.js                ← Renderer logic
├── package.json              ← Dependencies + build config
└── README.md                 ← This file
```

## Troubleshooting

### "node-gyp" errors during `npm install`

The `mssql` package is pure JavaScript (uses `tedious` under the hood) and should NOT need any native build tools on Windows. If you see `node-gyp` errors, your Node setup may have leftover native build attempts — they're harmless warnings as long as `mssql` itself installed.

### "Cannot find module 'mssql'"

Run `npm install` again. If it still fails, delete the `node_modules` folder and `package-lock.json`, then `npm install`.

### Symlink permission errors during `npm run dist:win`

Windows requires Developer Mode enabled for electron-builder to extract symlinked files. Go to **Settings → Update & Security → For developers → Developer Mode = On**, then retry.

### The app window is blank

DevTools opens automatically — check the Console tab for errors. Most common cause: a typo in `index.html` or `app.js`.

### "FATAL: This page must run inside Electron"

You opened `index.html` directly in a browser. That doesn't work. Always run via `npm run dev`.

## Next phases

- **Phase 2:** Aluplast query tab (CodeMirror editor, Run preview button)
- **Phase 3:** WHNet query tab (same)
- **Phase 4:** Variable mapping tab (assign result columns to wireframe variables)
- **Phase 5:** Orders screen wired to live data
- **Phase 6:** Operator notes + route assignments (localStorage for now)
- **Phase 7:** Packaging (`npm run dist:win` → installer.exe)
