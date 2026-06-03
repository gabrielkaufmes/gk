/**
 * orderflow.mjs — ORDER-LEVEL production flow.
 *
 * Unlike flow.mjs (which counts pieces), this tracks identifiable ORDERS — each with
 * its own id, piece count, destination, and deadline — moving stage by stage through
 * the line. It produces, for every day, the actual LIST OF ORDERS at each station.
 *
 * It re-adjusts to reality via SCAN EVENTS: a scan says "order X was seen leaving
 * station Y on day D". The model takes that as truth (the order is now downstream of
 * Y as of D, even if planned later or earlier) and re-plans everything after it.
 *
 * Pure: no DOM, no React. Units: orders (each carrying pcs) and days.
 */

import { rng } from "./flow.mjs";

export const LINE_ORDER = ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"];
/* orders (not pieces) a station can finish per shift — derived from piece throughput
 * ÷ a typical order size, but expressed in ORDERS for the order board. */
export const ORDERS_PER_SHIFT_DEFAULT = { cut: 14, weld: 18, clean: 16, fitting: 16, glaze: 16, qc: 22, pack: 20 };
const CAN_SECOND = new Set(["cut", "weld", "fitting", "glaze", "pack"]);

const ri = (rnd, lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));

/** Build a starting order book. Each order: id, pcs, dest, dueDay, stageIdx (0=cut). */
export function seedOrders(cfg = {}) {
  const c = { count: 80, dueLo: 14, dueHi: 28, pcsLo: 3, pcsHi: 12, seed: 42, ...cfg };
  const rnd = rng(c.seed);
  const dests = ["Lyon", "Paris", "Marseille", "Nice", "Lille"];
  const orders = [];
  for (let i = 0; i < c.count; i++) {
    orders.push({
      id: "O" + (1001 + i),
      pcs: ri(rnd, c.pcsLo, c.pcsHi),
      dest: dests[i % dests.length],
      dueDay: ri(rnd, c.dueLo, c.dueHi),
      stageIdx: 0,           // starts at first station
      done: false,
      history: {},           // station -> day it left (filled as it flows / from scans)
    });
  }
  return orders;
}

/**
 * Simulate order flow day by day.
 *
 * cfg.orders  : starting order book (from seedOrders or real data)
 * cfg.scans   : [{ id, station, day, leftOn? }] — order seen at/leaving a station on a day.
 *               Applied as ground truth before that day's planning.
 * cfg.days, cfg.ordersPerShift, cfg.arrivals (new orders/day [lo,hi] optional)
 *
 * Returns {
 *   days: [{ day, stations: { [st]: { orders:[...], capacity, shifts, done:[ids], escalate } } }],
 *   orders: final order states,
 *   lineOrder
 * }
 */
export function orderFlow(cfg = {}) {
  const order = cfg.lineOrder || LINE_ORDER;
  const ops = { ...ORDERS_PER_SHIFT_DEFAULT, ...(cfg.ordersPerShift || {}) };
  const days = cfg.days || 20;
  const maxShifts = cfg.maxShifts || 3;
  const idxOf = Object.fromEntries(order.map((s, i) => [s, i]));
  const downstreamDays = (stIdx) => Math.max(1, order.length - stIdx - 1);

  // clone orders so we don't mutate the caller's
  const orders = (cfg.orders || seedOrders()).map((o) => ({ ...o, history: { ...o.history } }));

  // index scans by day for quick application
  const scansByDay = {};
  for (const s of (cfg.scans || [])) (scansByDay[s.day] ||= []).push(s);

  const out = [];
  for (let d = 1; d <= days; d++) {
    // 1) apply scans as ground truth: move the order to just-downstream of the scanned station
    for (const sc of (scansByDay[d] || [])) {
      const o = orders.find((x) => x.id === sc.id);
      if (!o || o.done) continue;
      const sIdx = idxOf[sc.station];
      if (sIdx == null) continue;
      o.history[sc.station] = d;                 // record real departure
      o.stageIdx = sIdx + 1;                     // now downstream of the scanned station
      o.scanAdjusted = d;                        // mark that reality moved it
      if (o.stageIdx >= order.length) { o.done = true; o.doneDay = d; }
    }

    // 2) plan the day's work, station by station, earliest-deadline-first
    const stations = {};
    for (let si = 0; si < order.length; si++) {
      const st = order[si];
      const here = orders.filter((o) => !o.done && o.stageIdx === si).sort((a, b) => a.dueDay - b.dueDay);
      const lead = downstreamDays(si);
      // how many orders MUST clear today to still hit their deadline
      const mustToday = here.filter((o) => o.dueDay - lead <= d).length;
      const perShift = ops[st];
      let shifts = 1;
      if (CAN_SECOND.has(st)) {
        const fromDeadline = mustToday > perShift ? Math.ceil(mustToday / perShift) : 1;
        const fromBacklog = here.length > perShift * 2.5 ? 2 : 1;
        shifts = Math.min(maxShifts, Math.max(fromDeadline, fromBacklog));
      }
      const capacity = perShift * shifts;
      const escalate = mustToday > capacity;

      // complete up to capacity (whole orders), pass them downstream for NEXT day
      const doneToday = here.slice(0, capacity);
      const doneIds = [];
      for (const o of doneToday) {
        o.history[st] = d;
        o.stageIdx = si + 1;
        doneIds.push(o.id);
        if (o.stageIdx >= order.length) { o.done = true; o.doneDay = d; }
      }

      stations[st] = {
        station: st,
        orders: here.map((o) => ({ id: o.id, pcs: o.pcs, dest: o.dest, dueDay: o.dueDay, dueIn: o.dueDay - d, mustRun: o.dueDay - lead <= d, scanAdjusted: o.scanAdjusted || null, willClear: doneIds.includes(o.id) })),
        queueCount: here.length,
        capacity, shifts, mustToday, escalate,
        doneToday: doneIds,
        late: here.filter((o) => o.dueDay - lead < d).map((o) => o.id),
      };
    }

    out.push({ day: d, stations });
  }

  return { days: out, orders, lineOrder: order };
}
