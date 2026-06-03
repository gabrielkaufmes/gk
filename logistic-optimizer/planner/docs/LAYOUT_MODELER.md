# Layout modeler

`src/components/LayoutModeler.jsx` — a data-driven, drag-editable top-down floor
plan of the hall, modeled on a real 10-zone PVC line. Renders from a `{zones, objs}`
structure; everything you see is editable and exportable.

## Tabs

- **Layout** — the floor, the configurable production info boxes, and the build panel.
- **Statistics** — today's pace per hour vs target & historic, recent-shift
  comparison, and a recent-shifts table.

## Modes (Layout tab)

| Mode | What it does |
|------|--------------|
| **View** | Look only. Tap to inspect, can't move anything. Best on mobile. |
| **Edit** | Drag to move; drag the corner handle to resize; add/delete via build panel. |
| **Live** | Element dots flow along the line, colored by the zone they pass through. |

## Navigation

- **Zoom**: `−` / `+` buttons, or **Ctrl/⌘ + scroll**. Range 40–600%.
- **⊙ fit**: frames the currently selected zone or object (great on a phone —
  tap a zone, hit fit).
- **⤢**: reset to the whole floor.
- **Pan**: drag empty floor (or drag a zone band) to move around.

## Objects

Zones tile left→right; each has a label, width (m, shown in mm on the plan),
colour, and a computed m². Objects are placed **relative to their zone**
(`zone` index + `rx` metres from the zone's left edge).

| Kind | Notes |
|------|-------|
| `machine` | Has `workers` and a `type` (counted in the equipment summary). Operators render *outside* the box edge. |
| `rack` | Cantilever profile racks / glass A-frames. |
| `stillage` | Wheeled finished-goods trolley (leaning windows). |
| `dock` | Loading dock with bay doors. |
| `fork` | Forklift glyph. |
| `person` | Standalone, configurable operator — drop anywhere, rename its role. |

## Configurable info boxes

On the Layout tab, **⚙ configure** lets you:

- set the **shift target** (recomputes pace targets, % complete, projections,
  and all on-track colours everywhere);
- pick the **metric for each box** from: output today, this shift, pace/hour,
  avg pace/h today, historic avg/h, vs historic, projected shift, shift complete %,
  workers on floor, shift target;
- **add/remove** boxes (1–6).

Persist the `{ target, boxes: [...] }` per user/screen.

## Build panel

- **A · Add** — drop a zone, machine, rack, stillage, or person; toggle 0.5 m snap.
- **B · Selected** — edit label, geometry (X/Y/W/H), workers/type, colour;
  reorder zones; delete.
- **Capacity & area**, **Equipment summary** — computed live from the layout.
- **C · Layout JSON** — Export/Import the whole `{zones, objs}` structure.

## Notes

- Area figures are computed footprint (`width × 30 m`); add an explicit per-zone
  `m²` field if you need to match a spec sheet that differs from footprint.
- The statistics/info numbers come from sample constants at the top of the file
  (`TODAY_HOURLY`, `HISTORIC`, `SHIFT_TARGET`, `HOURS_ELAPSED`); swap for live data.
