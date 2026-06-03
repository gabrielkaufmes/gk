/**
 * capacity.mjs — Layer 2 of the engine extension.
 *
 * Finite WORKFORCE capacity. Consumes Layer 1's per-element `workByStation`
 * (minutes) and loads it against each station's people-capacity for the shift.
 * Surfaces the overbooked stations BEFORE the shift (the "queue problem"),
 * identifies the binding station, and computes OEE there.
 *
 * Pure: no DOM, no React.
 *
 *   import { computeBatch } from "./workcontent.mjs";
 *   import { loadStations, oee, capacityReport, STATION_DEFAULT } from "./capacity.mjs";
 *
 *   const elements = computeBatch(descriptors);
 *   const report = capacityReport(elements, stations, oeeInputs?);
 */

/* ------------------------------------------------------------------ *
 * Shift / worker model (aligned: 8h × effective%, 1–3 shifts).
 * availableMin(worker) = shifts × SHIFT_HOURS × 60 × effective
 * ------------------------------------------------------------------ */
export const SHIFT_HOURS = 8;
export const MAX_SHIFTS = 3;
export const EFFECTIVE_DEFAULT = 0.67; // breaks, changeover, micro-stops

/** Per-station workforce config. workers + shifts from the layout modeler;
 *  effective % editable. Stations not listed get a default block. */
export const STATION_DEFAULT = {
  cut:      { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  weld:     { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  clean:    { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  fitting:  { workers: 2, shifts: 1, effective: EFFECTIVE_DEFAULT },
  sprossen: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  shutter:  { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  glaze:    { workers: 2, shifts: 1, effective: EFFECTIVE_DEFAULT },
  qc:       { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  pack:     { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
  manual:   { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
};

const clampShifts = (n) => Math.max(1, Math.min(MAX_SHIFTS, n || 1));

/** Usable machines = machines you can staff (crew people per machine). */
export function usableMachines(cfg) {
  if (!cfg.machines) return 0;
  return Math.max(0, Math.min(cfg.machines, Math.floor((cfg.workers || 0) / (cfg.crew || 1))));
}

/** Available capacity-minutes at a station for the shift horizon.
 *  People-paced (machines: 0 or undefined) → bounded by workers (unchanged, backward compatible).
 *  Machine-paced (machines ≥ 1) → bounded by staffable machines, NOT raw headcount:
 *  extra workers beyond crew add nothing; too few drop usable machines. */
export function stationCapacityMin(cfg) {
  const shifts = clampShifts(cfg.shifts);
  const eff = cfg.effective ?? EFFECTIVE_DEFAULT;
  const horizon = shifts * SHIFT_HOURS * 60 * eff;
  if (!cfg.machines) return +(Math.max(0, cfg.workers || 0) * horizon).toFixed(1); // people-paced
  return +(usableMachines(cfg) * horizon).toFixed(1);                              // machine-paced
}

/**
 * Sum required labor-minutes per station across all (computed) elements,
 * compare to capacity, flag overbooked. Only remaining work counts if the
 * element exposes `route` + `stage_index` (Layer 1 already trims via remainingMin,
 * but here we attribute per-station from the *remaining* slice).
 */
export function loadStations(elements, stations = STATION_DEFAULT) {
  const required = {}; // station -> minutes
  for (const el of elements) {
    const route = el.route || Object.keys(el.workByStation || {});
    const startIdx = el._stageIndex ?? 0; // remaining slice (default whole route)
    route.slice(startIdx).forEach((st) => {
      required[st] = (required[st] || 0) + (el.workByStation?.[st] || 0);
    });
  }
  const rows = Object.keys({ ...required, ...stations }).map((st) => {
    const cfg = stations[st] || { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT };
    const cap = stationCapacityMin(cfg);
    const req = +(required[st] || 0).toFixed(1);
    const loadPct = cap > 0 ? Math.round((req / cap) * 100) : (req > 0 ? Infinity : 0);
    return {
      station: st,
      required_min: req,
      capacity_min: cap,
      load_pct: loadPct,
      overbooked: req > cap,
      over_min: +Math.max(0, req - cap).toFixed(1),
      workers: cfg.workers, shifts: clampShifts(cfg.shifts), effective: cfg.effective ?? EFFECTIVE_DEFAULT,
    };
  }).filter((r) => r.required_min > 0 || (stations[r.station]));
  // binding station = highest load
  rows.sort((a, b) => b.load_pct - a.load_pct);
  return rows;
}

/**
 * OEE = Availability × Performance × Quality, measured at one station.
 *   availability = runTime / plannedTime
 *   performance  = (idealCycleMin × totalCount) / runTime
 *   quality      = goodCount / totalCount
 * All inputs are observed shift data (Layer 4 will auto-feed these).
 */
export function oee({ plannedTime, runTime, idealCycleMin, totalCount, goodCount }) {
  const availability = plannedTime > 0 ? runTime / plannedTime : 0;
  const performance = runTime > 0 ? (idealCycleMin * totalCount) / runTime : 0;
  const quality = totalCount > 0 ? goodCount / totalCount : 0;
  const value = availability * Math.min(1, performance) * quality;
  return {
    availability: +availability.toFixed(3),
    performance: +Math.min(1, performance).toFixed(3),
    quality: +quality.toFixed(3),
    oee: +value.toFixed(3),
    losses: {
      availability_pct: +((1 - availability) * 100).toFixed(1),
      performance_pct: +((1 - Math.min(1, performance)) * 100).toFixed(1),
      quality_pct: +((1 - quality) * 100).toFixed(1),
    },
  };
}

/**
 * Full Layer-2 report. `oeeInputs` maps station -> oee shift data (optional);
 * OEE is computed for the binding station if data is present.
 */
export function capacityReport(elements, stations = STATION_DEFAULT, oeeInputs = {}) {
  const load = loadStations(elements, stations);
  const binding = load[0] || null;
  const overbooked = load.filter((r) => r.overbooked);
  const bindingOEE = binding && oeeInputs[binding.station] ? oee(oeeInputs[binding.station]) : null;

  const actions = [];
  for (const r of overbooked) {
    actions.push({
      sev: 0, station: r.station,
      title: `${r.station} overbooked by ${(r.over_min / 60).toFixed(1)}h (${r.load_pct}% load)`,
      why: `Needs ${(r.required_min / 60).toFixed(1)}h of labor but has ${(r.capacity_min / 60).toFixed(1)}h (${r.workers}×${r.shifts} shift). Add a worker/shift, offload, or these elements can't all run.`,
    });
  }
  if (binding && !binding.overbooked && binding.load_pct >= 85) {
    actions.push({
      sev: 1, station: binding.station,
      title: `${binding.station} is the pacing station at ${binding.load_pct}% load`,
      why: `Tightest resource this shift. Protect it from starvation/stalls — it sets the floor's rate.`,
    });
  }
  if (bindingOEE) {
    const worst = Object.entries(bindingOEE.losses).sort((a, b) => b[1] - a[1])[0];
    actions.push({
      sev: bindingOEE.oee < 0.6 ? 1 : 2, station: binding.station,
      title: `OEE at ${binding.station}: ${(bindingOEE.oee * 100).toFixed(0)}%`,
      why: `Biggest loss is ${worst[0].replace("_pct", "")} (${worst[1]}%). Availability ${(bindingOEE.availability * 100).toFixed(0)}% · Performance ${(bindingOEE.performance * 100).toFixed(0)}% · Quality ${(bindingOEE.quality * 100).toFixed(0)}%.`,
    });
  }
  actions.sort((a, b) => a.sev - b.sev);

  return {
    load,
    binding: binding ? binding.station : null,
    bindingLoadPct: binding ? binding.load_pct : null,
    overbooked: overbooked.map((r) => r.station),
    bindingOEE,
    actions,
  };
}
