# Data model

## Order / element row (engine input)

One flat object per order (or per element, if you plan at element granularity).
These are the SQL columns the engine and WFL read.

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Order/element code, e.g. `O24-501·P03·E2`. |
| `dest` | string | Delivery destination (groups orders into trucks). |
| `pcs` | number | Pieces (windows) in this order. |
| `stage_index` | int | Current stage, 0-based (see stages below). |
| `stages_total` | int | Stages to completion (e.g. 5 → Packed is index 5). |
| `materials_in` | number (h) | Hours until materials arrive. **`> 0` = not yet on site.** Negative = arrived that many hours ago. |
| `loading_in` | number (h) | Hours until the truck loads (the deadline). |
| `customer`, `region`, `material` | string | Optional; used for grouping/labels and WFL rules. |

Extra columns are passed through untouched and are available to WFL by name.

## Stages

Default readiness flow (index in parentheses):

```
prep(0) → cut(1) → weld(2) → glaze(3) → ready(4) → pack(5=Packed)
```

`remaining = stages_total − stage_index`. Aluminium skips welding; model it with
its own `stages_total` / stage mapping, or run two passes (PVC and alu) and merge.

## Units

- **All durations are hours.** WFL literals: `1h` = 1, `30m` = 0.5, `1d` = 24.
- A piece cannot pass a stage faster than `MIN_STAGE_H` (default **1h**).
  This is a floor, not a real cycle time — replace with measured per-stage dwell
  (the gap between consecutive stage scans) for accuracy.

## Derived fields (engine output, per row)

| Field | Formula |
|-------|---------|
| `remaining` | `stages_total − stage_index` |
| `matReady` | `max(0, materials_in)` |
| `earliest` | `matReady + remaining × MIN_STAGE_H` (earliest-ready, h) |
| `slack` | `loading_in − earliest` (negative ⇒ LATE) |
| `budgetPerStage` | `max(MIN_STAGE_H, floor((loading_in − matReady) / remaining))` |
| `status` | `LATE` / `BLOCKED` / `RISK` / `OK` |

## Layout JSON (modeler presentation data)

Separate from planning rows. Shape produced by the modeler's Export:

```jsonc
{
  "zones": [
    { "id": "z4", "label": "4 · 3× Welding (Fimtec)", "color": "#4ade80", "w": 15 }
    // tiled left→right; `w` is metres. Depth is fixed (30 m).
  ],
  "objs": [
    { "id": "weld0", "zone": 3, "kind": "machine", "label": "Welding line 1",
      "type": "Welding line", "color": "#22c55e",
      "rx": 3, "y": 4, "w": 9, "h": 6, "workers": 1 }
    // `zone` = index; `rx` = metres from the zone's left edge; `y/w/h` = metres.
    // kinds: machine | rack | stillage | dock | fork | person
  ]
}
```
