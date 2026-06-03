/**
 * sequence.mjs — Layer 3 of the engine extension.
 *
 * Turns capacity analysis into steering:
 *   - sequence(): deadline-first packing of the binding station within capacity,
 *     producing time-phased load = the data behind a Gantt.
 *   - whatIf(): pure lever application (resequence / add worker / add shift /
 *     pull forward / split load / overtime / outsource), returning what's saved,
 *     what slips, and the euro cost.
 *
 * Consumes Layer 1 elements (work content + route + loading_in) and Layer 2
 * station config. Pure: no DOM, no React. Minutes internally; € for cost.
 *
 *   import { sequence, whatIf, COST_DEFAULT } from "./sequence.mjs";
 */

import { loadStations, stationCapacityMin, STATION_DEFAULT } from "./capacity.mjs";

/* ------------------------------------------------------------------ *
 * Cost model (€). Editable / persisted — these are business constants.
 * ------------------------------------------------------------------ */
export const COST_DEFAULT = {
  overtime_per_h: 38,       // € per labor-hour beyond the shift
  extra_shift_per_worker: 220, // € to open another shift slot (per worker)
  add_worker_per_shift: 180,   // € for an extra worker for a shift
  extra_truck: 450,         // € to dispatch a second/under-filled truck
  subcontract_per_min: 1.4, // € per minute of work sent outside
  late_penalty_per_h: 25,   // € per hour an order misses its loading slot
};

/* ------------------------------------------------------------------ *
 * sequence: pack the binding station's queue, deadline-first, within capacity.
 * Each element occupies `workByStation[binding]` minutes at the station.
 * Returns time-phased entries {id, start_min, end_min, loading_min, late_min}.
 * ------------------------------------------------------------------ */
export function sequence(elements, stations = STATION_DEFAULT, opts = {}) {
  const load = loadStations(elements, stations);
  const binding = opts.station || (load[0] && load[0].station) || null;
  if (!binding) return { station: null, timeline: [], capacity_min: 0, makespan_min: 0, lateCount: 0 };

  const cfg = stations[binding] || { workers: 1, shifts: 1, effective: 0.67 };
  const capacity_min = stationCapacityMin(cfg);
  const parallel = Math.max(1, cfg.workers || 1); // workers process in parallel

  // candidates that actually visit the binding station, deadline-first (EDF)
  const queue = elements
    .filter((el) => (el.workByStation?.[binding] || 0) > 0)
    .map((el) => ({
      id: el.id,
      work: el.workByStation[binding],
      loading_min: (el.loading_in ?? Infinity) * 60,
    }))
    .sort((a, b) => a.loading_min - b.loading_min);

  // pack across `parallel` lanes (each worker is a lane); pick the earliest-free lane
  const laneFree = new Array(parallel).fill(0);
  const timeline = queue.map((q) => {
    const lane = laneFree.indexOf(Math.min(...laneFree));
    const start = laneFree[lane];
    const end = start + q.work;
    laneFree[lane] = end;
    const late_min = Math.max(0, end - q.loading_min);
    return { id: q.id, lane, start_min: +start.toFixed(1), end_min: +end.toFixed(1), work_min: q.work, loading_min: q.loading_min, late_min: +late_min.toFixed(1), late: late_min > 0 };
  });

  const makespan_min = Math.max(0, ...laneFree);
  const lateCount = timeline.filter((t) => t.late).length;
  const required_min = timeline.reduce((a, t) => a + t.work_min, 0);
  return { station: binding, parallel, capacity_min, required_min: +required_min.toFixed(1), makespan_min: +makespan_min.toFixed(1), lateCount, timeline, overbooked: required_min > capacity_min, over_min: +Math.max(0, required_min - capacity_min).toFixed(1) };
}

/* ------------------------------------------------------------------ *
 * whatIf: apply one lever to a baseline, recompute, report delta.
 * Levers:
 *   { kind:"add_worker", station, n? }
 *   { kind:"add_shift",  station, n? }
 *   { kind:"overtime",   station, minutes }       // extra capacity, no headcount
 *   { kind:"pull_forward", id, to_loading_in }    // change a deadline/priority
 *   { kind:"split_load", id, fraction }           // ship part now (reduces work here)
 *   { kind:"outsource",  id }                      // remove element's binding-station work
 *   { kind:"resequence", order:[ids...] }          // manual order override
 * ------------------------------------------------------------------ */
export function whatIf(elements, stations, lever, cost = COST_DEFAULT, opts = {}) {
  const before = sequence(elements, stations, opts);
  let els = elements;
  let st = stations;
  let deltaCost = 0;
  let note = "";

  const cloneStation = (name, patch) => ({ ...st, [name]: { ...(st[name] || STATION_DEFAULT[name] || { workers: 1, shifts: 1, effective: 0.67 }), ...patch } });

  switch (lever.kind) {
    case "add_worker": {
      const n = lever.n || 1; const cur = st[lever.station] || {};
      st = cloneStation(lever.station, { workers: (cur.workers || 1) + n });
      deltaCost = n * cost.add_worker_per_shift * (cur.shifts || 1);
      note = `+${n} worker(s) at ${lever.station}`;
      break;
    }
    case "add_shift": {
      const n = lever.n || 1; const cur = st[lever.station] || {};
      const shifts = Math.min(3, (cur.shifts || 1) + n);
      st = cloneStation(lever.station, { shifts });
      deltaCost = n * cost.extra_shift_per_worker * (cur.workers || 1);
      note = `${lever.station} → ${shifts} shift(s)`;
      break;
    }
    case "overtime": {
      // model overtime as bonus capacity by bumping effective beyond shift
      const cur = st[lever.station] || {}; const cap = stationCapacityMin(cur);
      const bonusEff = (cap + lever.minutes) / (cap / (cur.effective ?? 0.67));
      st = cloneStation(lever.station, { effective: bonusEff });
      deltaCost = (lever.minutes / 60) * cost.overtime_per_h * (cur.workers || 1);
      note = `+${(lever.minutes / 60).toFixed(1)}h overtime at ${lever.station}`;
      break;
    }
    case "pull_forward": {
      els = elements.map((e) => (e.id === lever.id ? { ...e, loading_in: lever.to_loading_in } : e));
      note = `${lever.id} loading → +${lever.to_loading_in}h`;
      break;
    }
    case "split_load": {
      const f = lever.fraction ?? 0.5;
      els = elements.map((e) => e.id === lever.id ? { ...e, workByStation: scale(e.workByStation, f) } : e);
      deltaCost = cost.extra_truck; // the deferred part needs another truck later
      note = `split ${lever.id}: ship ${Math.round((1 - f) * 100)}% now`;
      break;
    }
    case "outsource": {
      const target = elements.find((e) => e.id === lever.id);
      const bindMin = target ? (target.workByStation?.[before.station] || 0) : 0;
      els = elements.map((e) => e.id === lever.id ? { ...e, workByStation: { ...e.workByStation, [before.station]: 0 } } : e);
      deltaCost = +(bindMin * cost.subcontract_per_min).toFixed(0);
      note = `outsource ${lever.id} at ${before.station} (${bindMin}m)`;
      break;
    }
    case "resequence": {
      const idx = Object.fromEntries(lever.order.map((id, i) => [id, i]));
      els = [...elements].sort((a, b) => (idx[a.id] ?? 1e9) - (idx[b.id] ?? 1e9));
      // resequence respects order by overriding deadline tiebreak
      els = els.map((e, i) => ({ ...e, loading_in: (e.loading_in ?? 999) + i * 1e-6 }));
      note = "manual resequence";
      break;
    }
    default: note = "no-op";
  }

  const after = sequence(els, st, opts);
  const lateB = new Set(before.timeline.filter((t) => t.late).map((t) => t.id));
  const lateA = new Set(after.timeline.filter((t) => t.late).map((t) => t.id));
  const saved = [...lateB].filter((id) => !lateA.has(id));
  const slipped = [...lateA].filter((id) => !lateB.has(id));

  // late penalty delta (less lateness = saving that offsets cost)
  const lateMinB = before.timeline.reduce((a, t) => a + t.late_min, 0);
  const lateMinA = after.timeline.reduce((a, t) => a + t.late_min, 0);
  const penaltyDelta = +(((lateMinA - lateMinB) / 60) * cost.late_penalty_per_h).toFixed(0);
  const netCost = deltaCost + penaltyDelta;

  return {
    lever: lever.kind, note,
    before: { binding: before.station, lateCount: before.lateCount, over_min: before.over_min, makespan_min: before.makespan_min },
    after: { binding: after.station, lateCount: after.lateCount, over_min: after.over_min, makespan_min: after.makespan_min },
    saved, slipped,
    deltaCost_eur: deltaCost,
    latePenaltyDelta_eur: penaltyDelta,
    netCost_eur: netCost,
    verdict: saved.length && netCost <= 0 ? "do it (saves time and money)" : saved.length ? `recovers ${saved.length} order(s) for €${netCost}` : slipped.length ? "makes things worse" : "no schedule change",
  };
}

function scale(work, f) { const o = {}; for (const k in work) o[k] = +(work[k] * f).toFixed(1); return o; }
