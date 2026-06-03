/**
 * multiday.mjs — spread the work-content backlog across working days.
 *
 * Single-day capacity can't absorb a multi-day backlog; this drains each station's
 * required minutes at its per-day capacity and reports a per-day, per-station load
 * plus days-to-clear. Pure: no DOM, no React. Minutes internally.
 *
 *   import { multiDayPlan } from "./multiday.mjs";
 *   const plan = multiDayPlan(elements, stations, { days: 10 });
 */

import { stationCapacityMin } from "./capacity.mjs";

/**
 * elements : work-content rows (from computeBatch) — each has workByStation
 * stations : { [id]: cfg }  (workers/machines/crew/shifts/effective) — cfg is PER DAY
 * opts.days: horizon to simulate (default 10)
 *
 * Returns {
 *   horizonDays, stations: [{ station, totalReq_min, dayCap_min, daysToClear,
 *                              perDay: [{day, done_min, carry_min, load_pct}] }],
 *   binding, maxDaysToClear, byDay: [{ day, load: {station: pct}, anyOver }]
 * }
 */
export function multiDayPlan(elements, stations, opts = {}) {
  const horizonDays = opts.days || 10;

  // total demand per station
  const req = {};
  for (const el of elements) {
    const route = el.route || Object.keys(el.workByStation || {});
    for (const st of route) req[st] = (req[st] || 0) + (el.workByStation?.[st] || 0);
  }

  const stationRows = Object.keys(stations)
    .filter((st) => (req[st] || 0) > 0)
    .map((st) => {
      const dayCap = stationCapacityMin(stations[st]); // per-day capacity
      const total = +(req[st] || 0).toFixed(1);
      let carry = total;
      const perDay = [];
      for (let d = 1; d <= horizonDays; d++) {
        const incoming = carry;
        const done = Math.min(incoming, dayCap);
        carry = +(incoming - done).toFixed(1);
        perDay.push({
          day: d,
          incoming_min: +incoming.toFixed(0),
          done_min: +done.toFixed(0),
          carry_min: +carry.toFixed(0),
          load_pct: dayCap > 0 ? Math.round((incoming / dayCap) * 100) : (incoming > 0 ? Infinity : 0),
          over: incoming > dayCap,
        });
        if (carry <= 0) break;
      }
      const daysToClear = dayCap > 0 ? Math.ceil(total / dayCap) : Infinity;
      return { station: st, totalReq_min: +total.toFixed(0), dayCap_min: +dayCap.toFixed(0), daysToClear, perDay };
    });

  stationRows.sort((a, b) => b.daysToClear - a.daysToClear || b.totalReq_min - a.totalReq_min);
  const binding = stationRows[0] || null;
  const maxDaysToClear = stationRows.reduce((m, s) => Math.max(m, isFinite(s.daysToClear) ? s.daysToClear : 0), 0);

  // pivot to per-day view for stepping through on the floor plan
  const byDay = [];
  for (let d = 1; d <= Math.max(1, maxDaysToClear); d++) {
    const load = {};
    let anyOver = false;
    for (const s of stationRows) {
      const cell = s.perDay.find((p) => p.day === d);
      const pct = cell ? cell.load_pct : 0; // cleared before this day → 0
      load[s.station] = pct;
      if (pct > 100) anyOver = true;
    }
    byDay.push({ day: d, load, anyOver });
  }

  return { horizonDays, stations: stationRows, binding: binding?.station || null, maxDaysToClear, byDay };
}
