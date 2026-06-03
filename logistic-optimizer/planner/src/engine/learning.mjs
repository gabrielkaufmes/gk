/**
 * learning.mjs — Layer 4 of the engine extension. Closes the loop.
 *
 *   - recordActuals(): planned-vs-actual minutes per station per shift
 *     (from scan-to-scan dwell), producing variance.
 *   - calibrateRates(): blend observed work into Layer 1's per-unit minutes.
 *     Blend = (1-alpha)·rolling-average + alpha·EWMA. alpha exposed:
 *       alpha=0 → smooth rolling (slow), alpha=1 → fully exponential (reactive).
 *   - forecastBottleneck(): next-shift AND 24–48h bottleneck-risk from the trend.
 *
 * Layer 4 writes back to the SAME rates object Layer 1 reads, so the
 * work-content model self-calibrates per station. Pure: no DOM, no React.
 */

import { computeBatch } from "./workcontent.mjs";
import { loadStations, STATION_DEFAULT } from "./capacity.mjs";

export const ALPHA_DEFAULT = 0.4; // recency weight in the blend [0..1]

/* ------------------------------------------------------------------ *
 * recordActuals — compare what we planned vs what the floor did.
 * `plannedByStation` : { station: minutes }   (from Layer 1/2 for the shift)
 * `scans`            : [{ id, station, in_ts, out_ts }]  (epoch ms)
 * Returns per-station actual minutes + variance + a correction ratio.
 * ------------------------------------------------------------------ */
export function recordActuals(plannedByStation, scans) {
  const actual = {};
  for (const s of scans) {
    if (s.out_ts == null || s.in_ts == null) continue;
    const min = (s.out_ts - s.in_ts) / 60000;
    if (min <= 0) continue;
    actual[s.station] = (actual[s.station] || 0) + min;
  }
  const rows = Object.keys({ ...plannedByStation, ...actual }).map((st) => {
    const planned = +(plannedByStation[st] || 0).toFixed(1);
    const act = +(actual[st] || 0).toFixed(1);
    const variance_min = +(act - planned).toFixed(1);
    const ratio = planned > 0 ? +(act / planned).toFixed(3) : null; // >1 = slower than planned
    return { station: st, planned_min: planned, actual_min: act, variance_min, ratio };
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * calibrateRates — fold a shift's correction ratios into the rates.
 * `history` : per station, array of recent ratios (most recent last).
 * For each station we compute:
 *   rolling = mean(history)
 *   ewma    = exponential weighting (alpha)
 *   blend   = (1-alpha)*rolling + alpha*ewma
 * then scale that station's per-unit minutes by `blend` (damped).
 * Returns a NEW rates object (never mutates) + an audit of changes.
 * ------------------------------------------------------------------ */
export function calibrateRates(rates, history, alpha = ALPHA_DEFAULT, damping = 0.5) {
  const out = JSON.parse(JSON.stringify(rates));
  const audit = [];
  for (const station of Object.keys(history)) {
    const ratios = (history[station] || []).filter((r) => r > 0);
    if (!ratios.length || !out[station]) continue;
    const rolling = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    let ewma = ratios[0];
    for (let i = 1; i < ratios.length; i++) ewma = alpha * ratios[i] + (1 - alpha) * ewma;
    const blend = (1 - alpha) * rolling + alpha * ewma;
    // damped correction toward blend so one noisy shift can't whipsaw the model
    const factor = 1 + (blend - 1) * damping;
    for (const key of Object.keys(out[station])) {
      if (typeof out[station][key] === "number") out[station][key] = +(out[station][key] * factor).toFixed(3);
    }
    audit.push({ station, rolling: +rolling.toFixed(3), ewma: +ewma.toFixed(3), blend: +blend.toFixed(3), applied_factor: +factor.toFixed(3) });
  }
  return { rates: out, audit };
}

/* ------------------------------------------------------------------ *
 * forecastBottleneck — project load forward for upcoming shifts using the
 * known order book per shift + a trend factor from recent actual/planned ratios.
 * `shiftsAhead` : [{ label, descriptors }]  (e.g. next shift, +1, +2 …)
 * `trendByStation` : { station: ratio }   (latest correction; >1 = drifting slow)
 * Returns per-shift, per-station projected load% and a risk flag.
 * ------------------------------------------------------------------ */
export function forecastBottleneck(shiftsAhead, stations = STATION_DEFAULT, trendByStation = {}, rates) {
  const horizon = shiftsAhead.map((shift) => {
    const elements = computeBatch(shift.descriptors, rates);
    const load = loadStations(elements, stations).map((r) => {
      const trend = trendByStation[r.station] || 1;          // apply observed drift
      const projReq = r.required_min * trend;
      const projLoad = r.capacity_min > 0 ? Math.round((projReq / r.capacity_min) * 100) : Infinity;
      let risk = "ok";
      if (projLoad >= 100) risk = "overbooked";
      else if (projLoad >= 85) risk = "at_risk";
      return { station: r.station, proj_load_pct: projLoad, trend: +trend.toFixed(2), risk };
    }).sort((a, b) => b.proj_load_pct - a.proj_load_pct);
    const top = load[0] || null;
    return { label: shift.label, binding: top ? top.station : null, binding_load_pct: top ? top.proj_load_pct : null, risk: top ? top.risk : "ok", stations: load };
  });

  const next = horizon[0] || null;
  const window48 = horizon.slice(0, Math.min(horizon.length, 6)); // up to ~48h if 8h shifts
  const earliestOverbook = horizon.find((h) => h.risk === "overbooked") || null;

  const alerts = [];
  if (next && next.risk !== "ok")
    alerts.push({ sev: next.risk === "overbooked" ? 0 : 1, horizon: "next-shift", title: `${next.binding} ${next.risk === "overbooked" ? "will be overbooked" : "at risk"} next shift (${next.binding_load_pct}%)`, why: `Projected with current order book × observed trend ${next.stations[0]?.trend}×.` });
  if (earliestOverbook && earliestOverbook !== next)
    alerts.push({ sev: 1, horizon: "24-48h", title: `${earliestOverbook.binding} overbooks at "${earliestOverbook.label}" (${earliestOverbook.binding_load_pct}%)`, why: `Build capacity now: add shift/worker or pull work forward before it lands.` });

  return { horizon, next, window48, earliestOverbook, alerts };
}
