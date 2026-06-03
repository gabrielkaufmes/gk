/**
 * line.mjs — user-definable production line: workstations with people, machines,
 * parallelism, scan rule, code routing, and a TIME MODEL.
 *
 * Designed from real station examples. A station is one of these time models:
 *   - "per_piece":      fixed seconds × pieces processed        (saws, fittings…)
 *   - "per_batch_of":   seconds per group of N units            (welding: 3min/4)
 *   - "optimization":   no per-piece time; produces bar bundles (material prep)
 *   - "manual":         flat minutes per element                (specials)
 *
 * Parallelism: `machines` run in parallel; each machine needs `peoplePerMachine`.
 * Effective workers = min(people, machines × peoplePerMachine) bounds throughput.
 * Code routing: `codeFilter` (list or predicate name) limits which items a station
 * processes — lets you say "this saw only cuts monoblock frames".
 *
 * Pure: no DOM, no React. Seconds internally where noted; minutes for capacity.
 */

export const SHIFT_HOURS = 8;
export const MAX_SHIFTS = 3;
export const EFFECTIVE_DEFAULT = 0.85; // station-level utilisation (own breaks/setup)

/* ------------------------------------------------------------------ *
 * Station schema (one object per workstation). Only the fields a given
 * time model needs are required; the rest are ignored.
 * ------------------------------------------------------------------ */
export function defineStation(s) {
  return {
    id: s.id,
    label: s.label || s.id,
    people: s.people ?? 1,
    machines: s.machines ?? 0,          // 0 = manual/no-machine station
    peoplePerMachine: s.peoplePerMachine ?? 1,
    shifts: clampShifts(s.shifts),
    effective: s.effective ?? EFFECTIVE_DEFAULT,
    scan: s.scan || "per_piece",        // "per_piece" | "per_batch" | "per_optimization"
    codeFilter: s.codeFilter || null,   // null = all; or array of codes/types it handles
    time: s.time || { model: "per_piece", seconds: 30 },
    notes: s.notes || "",
  };
}
const clampShifts = (n) => Math.max(1, Math.min(MAX_SHIFTS, n || 1));

/* ------------------------------------------------------------------ *
 * Capacity: how many minutes of *useful* work this station can deliver
 * per horizon, bounded by BOTH people and machines.
 *   laborMin   = people        × shifts × 8h × 60 × effective
 *   machineMin = machines       × shifts × 8h × 60 × effective
 * For a machine station, throughput is limited by the lesser of the two
 * (you can't run 3 machines with 1 person if peoplePerMachine=1).
 * ------------------------------------------------------------------ */
export function stationCapacityMin(st) {
  const horizon = st.shifts * SHIFT_HOURS * 60 * st.effective;
  const laborMin = st.people * horizon;
  if (!st.machines) return +laborMin.toFixed(1);            // no-machine: people-bound
  const usableMachines = Math.min(st.machines, Math.floor(st.people / st.peoplePerMachine));
  const machineMin = Math.max(0, usableMachines) * horizon;
  return +Math.min(laborMin, machineMin).toFixed(1);
}

/** Effective parallel lanes (for sequencing). */
export function stationLanes(st) {
  if (!st.machines) return Math.max(1, st.people);
  return Math.max(1, Math.min(st.machines, Math.floor(st.people / st.peoplePerMachine)));
}

/* ------------------------------------------------------------------ *
 * Work demand: minutes this station needs to process a set of items.
 * `items` = [{ code, type, pieces, units }] where the meaning of the count
 * depends on the time model. Returns required minutes for THIS station only,
 * after applying the station's codeFilter.
 * ------------------------------------------------------------------ */
export function stationDemandMin(st, items) {
  const handled = items.filter((it) => passesFilter(st, it));
  const t = st.time;
  let seconds = 0;
  switch (t.model) {
    case "per_piece":
      seconds = handled.reduce((a, it) => a + (it.pieces || 0) * t.seconds, 0);
      break;
    case "per_batch_of": {
      // e.g. welding: secondsPerBatch per `batch` units (4 corners/frames)
      const per = t.secondsPerBatch / t.batch;
      seconds = handled.reduce((a, it) => a + (it.units || it.pieces || 0) * per, 0);
      break;
    }
    case "manual":
      seconds = handled.reduce((a, it) => a + (it.pieces || 0) * (t.minutes * 60), 0);
      break;
    case "optimization":
      // produces bundles; "time" is per produced bar bundle if given, else 0
      seconds = handled.reduce((a, it) => a + (it.bundles || 0) * (t.secondsPerBundle || 0), 0);
      break;
    default:
      seconds = 0;
  }
  return +(seconds / 60).toFixed(2);
}

function passesFilter(st, item) {
  if (!st.codeFilter) return true;
  if (Array.isArray(st.codeFilter)) return st.codeFilter.includes(item.code) || st.codeFilter.includes(item.type);
  return true;
}

/* ------------------------------------------------------------------ *
 * Line: ordered list of stations + load report.
 * ------------------------------------------------------------------ */
export function defineLine(stations) {
  return stations.map(defineStation);
}

export function lineReport(line, items) {
  const rows = line.map((st) => {
    const required = stationDemandMin(st, items);
    const capacity = stationCapacityMin(st);
    const lanes = stationLanes(st);
    const loadPct = capacity > 0 ? Math.round((required / capacity) * 100) : (required > 0 ? Infinity : 0);
    return {
      id: st.id, label: st.label,
      people: st.people, machines: st.machines, lanes,
      scan: st.scan, timeModel: st.time.model,
      required_min: required, capacity_min: capacity, load_pct: loadPct,
      overbooked: required > capacity, over_min: +Math.max(0, required - capacity).toFixed(1),
    };
  });
  const sorted = [...rows].sort((a, b) => b.load_pct - a.load_pct);
  return { stations: rows, binding: sorted[0]?.id || null, bindingLoadPct: sorted[0]?.load_pct ?? null, overbooked: rows.filter((r) => r.overbooked).map((r) => r.id) };
}

/* ------------------------------------------------------------------ *
 * The eight example stations, encoded — the reference line.
 * ------------------------------------------------------------------ */
export const EXAMPLE_LINE = defineLine([
  { id: "matprep", label: "Material preparation", people: 3, machines: 0, scan: "per_optimization",
    time: { model: "optimization", secondsPerBundle: 0 }, notes: "Output: optimized bars (frame 6/6.5m, sash 6/6.5m, mullion 6m, blind mullion 6m). One scan per optimization bundle to cutting." },
  { id: "cut_schirmer", label: "Cutting 1 · Schirmer centre", people: 2, machines: 1, scan: "per_piece",
    time: { model: "per_piece", seconds: 20 }, notes: "Cutting + machining centre." },
  { id: "cut_dms", label: "Cutting 2 · double-mitre saw", people: 1, machines: 1, scan: "per_piece",
    codeFilter: ["blind_mullion", "additional_profile"], time: { model: "per_piece", seconds: 15 },
    notes: "Defined codes: some blind mullions + all additional profiles." },
  { id: "cut_mono", label: "Cutting 3 · monoblock", people: 1, machines: 1, scan: "per_piece",
    codeFilter: ["monoblock_frame"], time: { model: "per_piece", seconds: 35 }, notes: "Only monoblock frames (defined codes)." },
  { id: "cut_steel", label: "Cutting steel", people: 2, machines: 2, peoplePerMachine: 1, scan: "per_piece",
    time: { model: "per_piece", seconds: 15 }, notes: "Two identical machines, 1 person each." },
  { id: "screwing", label: "Screwing", people: 2, machines: 2, peoplePerMachine: 1, scan: "per_piece",
    time: { model: "per_piece", seconds: 25 }, notes: "Two identical machines, 1 person each." },
  { id: "fit_frames_1", label: "Fittings frames 1", people: 1, machines: 1, scan: "per_piece",
    codeFilter: ["frame"], time: { model: "per_piece", seconds: 35 }, notes: "Frames only." },
  { id: "welding", label: "Welding", people: 3, machines: 3, peoplePerMachine: 1, scan: "per_piece",
    time: { model: "per_batch_of", secondsPerBatch: 180, batch: 4 }, notes: "3 machines, 3 people. 3 min per weld of four frames/sashes." },
]);
