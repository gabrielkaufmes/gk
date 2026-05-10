# Whokna Learning Helper — Product Requirements (v2, ID-based)

> Status: planning. Code lives on branch `claude/winkhaus-learning-helper-kh80n`.
> v1 (current shipped build) snapshot: `backups/whokna-helper-v1.html` / `.txt`.
> v2 will replace `whokna-helper.html` after explicit go-ahead. Migration: **fresh start (wipe & regenerate)**.

---

## 1. Purpose

A single-file, install-free **personal learning helper** for the Winkhaus *Whokna* course (window/door design + database admin). The user opens one local HTML file, picks a folder (desktop) or starts an in-browser sandbox (mobile), and curates lesson notes with paste-able screenshots, drag-drop audio/video/PDF/docs and a navigable App > Chapter > Sub-chapter tree.

v2 adds the ability to **link the same item under multiple chapters** — one canonical asset, many places it shows up — including whole sub-chapters.

## 2. Target user & platforms

- One person, one device at a time. No multi-user, no realtime sync.
- **Windows desktop**: Edge or Chrome, File System Access API, real folder on disk.
- **Android phone**: Chrome, no folder picker available, falls back to an in-browser sandbox stored in IndexedDB. Same code, responsive layout.
- Distribution: a single HTML file served from the GitHub repo via `rawcdn.githack.com` (pinned to a commit SHA so cache can never go stale).

## 3. Core architectural decision

Everything that can be linked into multiple chapters is referenced **by stable ID**, not by path. Renames never break links. The vault folder is split into:

- `_assets/` — every attachment file, named `<id>.<ext>`. Single canonical bytes per asset.
- `_notes/` — every note, named `<id>.md`. Single canonical text per note.
- `_subs/` — every sub-chapter, named `_subs/<id>/`. Each contains its own `_links.json` listing the IDs that belong to it (notes + attachments + nested entries if ever needed).
- `_index.json` — global registry, the source of truth for IDs:
  ```json
  {
    "schema": 2,
    "items": {
      "<id>": {
        "kind": "asset" | "note" | "sub" | "chapter" | "app",
        "displayName": "Demo Video",
        "originalName": "demo.mp4",       // optional, for assets
        "mime": "video/mp4",              // optional, for assets
        "createdAt": 1715350000000,
        "updatedAt": 1715350000000,
        "parents": ["<chapter-id>", "<sub-id>", ...]
      }
    }
  }
  ```
- Apps and chapters are also **ID-based** (kind `app` and `chapter`) so they can be linked too if needed and to keep one consistent model. The visible tree is built by walking from each app's `_links.json` downward.
- Per-container `_links.json` (in apps, chapters, subs):
  ```json
  {
    "schema": 2,
    "order": ["<id1>", "<id2>", "<id3>"]
  }
  ```
  The order *is* the tree order at this level (no separate `_meta.json` needed; ordering comes for free).
- ID format: `t-<base36 timestamp>-<6 char base36 random>` — sortable, unique enough, short (≈18 chars).

## 4. Tree model

```
Vault
├── App (id, displayName)
│   ├── Chapter (id, displayName)        ← _links.json lists children IDs
│   │   ├── Sub-chapter (id)             ← canonical or linked from elsewhere
│   │   │   ├── notes ref (id)           ← canonical or linked
│   │   │   ├── attachment ref (id)      ← canonical or linked
│   │   │   └── attachment ref (id)
│   │   └── attachment ref (id)          ← chapter-level attachment
│   └── Chapter
└── App
```

- A row in the tree is always `{id, kind}`.
- The displayName comes from `_index.json[id].displayName`.
- A row whose `_index.json[id].parents.length > 1` shows a small `🔗` badge and a tooltip `"linked in: A, B, C"`.
- An app/chapter/sub-chapter can host the same kinds of children: notes + attachments + (for app) chapters + (for chapter) sub-chapters.

## 5. Features — must-have for v2

### 5.1 Vault setup
- Desktop: pick a folder; remembered across sessions (handle persisted in IndexedDB).
- Android sandbox: created on demand from the **Test data…** modal; stored in IndexedDB; survives refresh on the same device.
- Empty vault is auto-seeded with two apps: **Whokna Design**, **Whokna Database**.

### 5.2 Navigation tree
- App > Chapter > Sub-chapter > (note + attachments).
- Each row: drag handle (`⋮⋮`), kind icon, displayName, link badge (if linked), inline actions.
- Mobile: master-detail. Tree fills the screen; tap a row to swap to editor view; sticky `← Tree` back button at the top.

### 5.3 Notes editor
- Per note, single source of truth in `_notes/<id>.md`.
- Tabs: **Edit / Preview / Split**.
- Autosave ~600 ms after the last keystroke. Status indicator: dirty / saving / saved.
- Markdown rendering: headings, bold/italic, code (inline + fenced), lists, blockquotes, images, links, audio/video/PDF auto-upgrade for `_assets/<id>.<ext>` references.
- "Linked to:" hint above the editor when a note has more than one parent.

### 5.4 Attachments
- Each attachment is canonical bytes in `_assets/<id>.<ext>`.
- Adding sources: paste from clipboard, drag-drop into the editor or attachments panel, **+ Add files** picker.
- Listed in the tree under the parent that hosts the link, AND in the bottom Attachments panel of the currently-open container.
- Tap → preview: image / video / audio in lightbox; PDF in a new tab; other types download.
- Inline-render in the markdown preview by ID-resolved blob URL.

### 5.5 Multi-parent linking (the v2 headliner)
- Drag-link gesture:
  - Desktop: hold **Alt** while dragging a row to another container → creates a link (does NOT remove from source).
  - Plain drag (no modifier) within the same parent → reorder.
  - Plain drag to a *different* parent → moves (removes from source, adds to destination).
  - Mobile: long-press (~400 ms) on the grip starts a "link drag"; default drag stays as reorder. A floating ghost row + a target highlight gives feedback.
- Drag-link works for **assets, notes, AND whole sub-chapters** (all three Q1=c phases).
- Editing a linked entity (renaming, editing notes, replacing an attachment) updates the canonical → all linked locations show the change.
- Visual: linked rows show `🔗`; tooltip lists every parent it's linked into; an **Unlink here** action exists on linked rows; **Open canonical location** menu jumps to the canonical-marked parent.

### 5.6 Rename
- Rename = edits `displayName` in `_index.json` and bumps `updatedAt`. No filesystem rename. Survives forever.

### 5.7 Delete
- **Delete here**: removes the ID from this parent's `_links.json` and from the item's `parents[]` in `_index.json`.
- If `parents.length === 0` after that → confirm dialog with three choices:
  - *Move to `_orphans/`* (stay in registry, recoverable from a hidden Orphans view).
  - *Hard delete* (remove from `_index.json`, delete bytes from `_assets/` / `_notes/` / `_subs/<id>/`).
  - *Cancel*.
- A hidden top-level **Orphans** entry in the tree shows recoverable items.

### 5.8 Search
- One search box. Debounced ~180 ms.
- Matches: displayName of every item (assets, notes, subs, chapters, apps) AND the full text of `_notes/<id>.md`.
- Tree filters down to ancestors of any matching node.
- A "Notes matches" panel below the tree shows highlighted snippets; tap to jump.

### 5.9 Test data sandbox
- **Test data…** modal. Test items are isolated by an **app-name prefix** `[TEST] ` *and* an `isTest: true` flag in `_index.json`.
- **Generate** populates `[TEST] Whokna Design`, `[TEST] Whokna Database`, `[TEST] Reference` with ~25 sub-chapters, each carrying:
  - A note populated from a live Wikipedia summary (with offline placeholder fallback).
  - A small SVG diagram attachment.
  - Cross-link demo: at least 2 sub-chapters where one attachment is linked into both, and one sub-chapter linked under two chapters — so the user can see `🔗` working out of the box.
- **Delete test data** removes only items where `isTest: true` AND name prefix matches. Real items can never be touched.
- Same modal hosts the **Android sandbox** controls (Start / Resume / Exit & wipe).

### 5.10 Import structure
- Markdown headings (`#` app, `##` chapter, `###` sub-chapter) or 3-column CSV.
- Creates app/chapter/sub IDs; adds them to the appropriate `_links.json`.

### 5.11 Export
- "Export tree" produces a Markdown outline of the full hierarchy with linked items marked.

### 5.12 Help / onboarding
- A Help modal explaining all gestures, including the Alt / long-press for linking and the difference between "delete here" and "hard delete".

### 5.13 Responsive layout
- ≥ 760 px: side-by-side (tree left, editor right).
- < 760 px: master-detail. Editor view uses sticky breadcrumb, fixed editor body height (~55vh), and natural-height attachments below; whole content pane is scrollable. Viewport uses `100dvh` to account for mobile URL bars.

## 6. Out of scope for v2

- Tags (a separate cross-cutting taxonomy). Hooks left in the data model so it can land later without migration.
- Cross-device sync.
- Versioning / undo history beyond "Move to orphans".
- Built-in screenshot / audio / screen recording (use OS tools: Win+Shift+S, voice recorder, etc.).
- Multi-user, sharing, comments.

## 7. Non-functional requirements

- **One file**, < 200 KB, no external runtime dependencies. CDN-cached, pinned to commit SHA.
- **Offline-capable** once loaded. Wikipedia fetches degrade to placeholder content.
- **Performance**: tree refresh under 200 ms for ~500 items. Search under 500 ms with cached note text.
- **Robustness**: every write goes through a single `idbSet` / `writableStream.close()` boundary. Sandbox saves are debounced (~350 ms) and flush on navigation.
- **No external network** beyond Wikipedia REST during test-data generation.

## 8. Data migration

Decision: **fresh start**. On first launch with v2:
- If an existing v1 vault is detected (presence of physical `notes.md` / `attachments/` inside chapter folders) → show a one-time modal: *"v2 uses a new layout. Start a new sandbox / pick a new folder. Your old folder is untouched on disk."*
- No automatic migration shipped. v1 build is preserved at `backups/whokna-helper-v1.html` for fallback access.

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| User opens vault folder in Explorer and sees no readable notes | Help modal explains the new layout. v1 build stays available as a backup link. |
| Cyclic linking (sub linked into itself, transitively) | On link-drag, walk the proposed parent chain; reject if `target` already in chain. |
| Orphaned bytes on hard delete failures | Idempotent: `_index.json` is the truth; orphan asset files without an entry are GC'd at boot. |
| ID collisions | Timestamp + 6-char base36 random → ~10⁻⁸ collision risk; reject and regenerate on conflict. |
| Large attachments in mobile sandbox blow IndexedDB quota | Show file-size warning at 10 MB, hard cap at 100 MB per file in sandbox mode. Desktop unaffected. |
| Drag-link gesture undiscoverable on mobile | Long-press starts a visible "Link mode" with a toast hint. Help modal demoes it. |

## 10. Acceptance criteria (v2 ship gate)

1. Vault picker (desktop) + Android sandbox both work; same feature surface.
2. App > Chapter > Sub > note + attachment all show in tree, all ID-based.
3. Drag-link with Alt (desktop) and long-press (mobile) creates a link, visible by `🔗` badge.
4. Editing a linked note/displayName/attachment is reflected in every linked location after refresh.
5. Plain drag within parent reorders; plain drag across parents moves; Alt/long-press creates link.
6. Delete-here vs hard-delete dialog appears on last-link removal; orphans are recoverable.
7. Search matches names + note content; jumps to result.
8. Test data generator includes a working linked-attachment example.
9. Mobile master-detail layout: attachments panel reachable; sticky breadcrumb; no clipped UI on a 360×640 viewport.
10. Backups (`whokna-helper-v1.html` and `.txt`) still openable from the repo.

## 11. Open questions for the next session

- Do you want a small **"Linked to:"** chip strip above the editor showing every parent of the open item? (Recommended yes.)
- On mobile, should reorder use a single short tap-and-hold and link use a *long* press, or invert? (Default proposal: short hold = reorder, long hold = link.)
- Should the **Orphans** drawer be visible by default, or hidden under a Help/Tools menu? (Default proposal: hidden behind a Tools menu.)

## 12. Implementation plan (handoff)

1. **Branch**: continue on `claude/winkhaus-learning-helper-kh80n` (history retained for rollback).
2. **Replace** `whokna-helper.html` with the v2 build in a single commit, after this PRD is approved. v1 stays at `backups/whokna-helper-v1.html`.
3. **Order of work**:
   1. Data layer: `_index.json`, ID generator, IDB serialization for sandbox, FS read/write helpers for desktop. Migrate the in-browser sandbox shim to operate on IDs.
   2. Tree model + render from `_links.json`.
   3. Selection + editor (notes by ID).
   4. Attachments by ID; paste/drop/+ Add wired.
   5. Drag-reorder, drag-move, drag-link (modifier / long-press).
   6. Search (names + note content cache).
   7. Test data generator + Android sandbox + responsive layout (carry over from v1).
   8. Help modal + acceptance walk-through.
4. **Test pass**: generate test data → verify each acceptance criterion → publish pinned URL.

---

*End of PRD v2.*
