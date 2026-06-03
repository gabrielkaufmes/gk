/**
 * flow.mjs — production as a QUEUE OVER TIME, not a load snapshot.
 *
 * A station/line has a finite throughput per shift. Work arrives daily, is
 * completed at throughput, and the backlog rises or falls. Each piece carries a
 * deadline (2–4 weeks). Load is never "2700%": it's a queue that takes N days to
 * clear, and the only question that matters is whether pieces finish before their
 * deadline. A 2nd shift is suggested only when backlog is high AND deadlines are
 * at risk — on the stations that can take one.
 *
 * Pure: no DOM, no React. Units: PIECES and DAYS.
 */

/* deterministic RNG so a plan is reproducible */
export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
const ri = (rnd, lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));

export const FLOW_DEFAULTS = {
  days: 28,
  startInWork: 500,        // pcs already on the line
  startWaiting: 300,       // pcs staged, not yet released
  arrivalsLo: 50, arrivalsHi: 150,   // new pcs/day
  perShiftLo: 100, perShiftHi: 140,  // pcs completed per shift
  deadlineLoDays: 14, deadlineHiDays: 28,  // 2–4 weeks
  riskWindowDays: 5,       // a piece is "at risk" if due within this many days
  riskThresholdPcs: 120,   // at-risk pcs above this → consider 2nd shift
  backlogThresholdPcs: 700,// backlog above this → consider 2nd shift
  secondShiftStations: ["cut", "weld", "fitting", "glaze", "pack"], // can take a 2nd shift
};

/**
 * Simulate the line day by day.
 * Returns {
 *   days: [{ day, arrivals, backlogStart, done, secondShift, backlogEnd, atRisk, lateToday }],
 *   summary: { peakBacklog, endBacklog, totalLate, secondShiftDays, clearedByDay|null }
 * }
 */
export function simulateFlow(cfg = {}) {
  const c = { ...FLOW_DEFAULTS, ...cfg };
  const rnd = rng(c.seed ?? 42);

  // model the backlog as a list of due-days (one entry per piece)
  let queue = [];
  for (let i = 0; i < c.startInWork + c.startWaiting; i++) queue.push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));

  const days = [];
  let peakBacklog = queue.length, totalLate = 0, secondShiftDays = 0, clearedByDay = null;

  for (let d = 1; d <= c.days; d++) {
    const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
    for (let i = 0; i < arrivals; i++) queue.push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));

    const backlogStart = queue.length;
    const atRisk = queue.filter((due) => due - d <= c.riskWindowDays).length;

    // decide a 2nd shift: backlog high OR enough deadlines at risk
    const secondShift = atRisk > c.riskThresholdPcs || backlogStart > c.backlogThresholdPcs;
    const base = ri(rnd, c.perShiftLo, c.perShiftHi);
    const capacity = secondShift ? base + ri(rnd, c.perShiftLo, c.perShiftHi) : base;
    const done = Math.min(capacity, backlogStart);

    // complete earliest-deadline-first; count pieces finished AFTER their due day as late
    queue.sort((a, b) => a - b);
    const finished = queue.splice(0, done);
    const lateToday = finished.filter((due) => due < d).length;
    totalLate += lateToday;

    const backlogEnd = queue.length;
    if (secondShift) secondShiftDays++;
    peakBacklog = Math.max(peakBacklog, backlogStart);
    if (clearedByDay === null && backlogEnd === 0) clearedByDay = d;

    days.push({ day: d, arrivals, backlogStart, done, capacity, secondShift, backlogEnd, atRisk, lateToday });
  }

  return {
    days,
    summary: {
      peakBacklog, endBacklog: queue.length, totalLate, secondShiftDays, clearedByDay,
      avgArrivals: Math.round(days.reduce((a, x) => a + x.arrivals, 0) / days.length),
      avgDone: Math.round(days.reduce((a, x) => a + x.done, 0) / days.length),
    },
  };
}

/** Per-station view: split the line throughput by station share, flag which
 *  stations would need a 2nd shift on a given day. Stations not in
 *  secondShiftStations can't take one (advice reflects that). */
export function stationFlow(cfg = {}) {
  const c = { ...FLOW_DEFAULTS, ...cfg };
  const sim = simulateFlow(c);
  const canSecond = new Set(c.secondShiftStations);
  return {
    ...sim,
    secondShiftStations: c.secondShiftStations,
    canSecond: (st) => canSecond.has(st),
  };
}

/* Per-station NOMINAL per-shift throughput (pcs) — the planned rate. Real output
 * varies day to day; in production these come from scan history, not constants. */
export const THROUGHPUT_DEFAULT = { cut: 130, weld: 165, clean: 140, fitting: 150, glaze: 150, qc: 210, pack: 185 };
export const LINE_ORDER = ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"];

/* Day-to-day output variance per station (fraction of nominal). Real lines swing:
 * breakdowns, absences, changeovers, product mix. A bad day on cut ≈ 60% of plan,
 * a good day ≈ 115%. These envelopes would be FITTED from scan history per station. */
export const VARIANCE_DEFAULT = {
  cut:   { lo: 0.6, hi: 1.15, breakdownP: 0.08, breakdownTo: 0.35 }, // saw jams hurt most
  weld:  { lo: 0.7, hi: 1.15, breakdownP: 0.05, breakdownTo: 0.45 },
  clean: { lo: 0.75, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.5 },
  fitting: { lo: 0.7, hi: 1.15, breakdownP: 0.04, breakdownTo: 0.5 },
  glaze: { lo: 0.75, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.5 },
  qc:    { lo: 0.8, hi: 1.15, breakdownP: 0.02, breakdownTo: 0.6 },
  pack:  { lo: 0.8, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.55 },
};

/** Simulated realised per-shift output for a station on one day, using the variance
 *  envelope (breakdowns, absences, mix). Real lines never hit the same number twice. */
function realisedOutput(st, dayIdx, nominal, variance, _unused, rnd) {
  const v = variance[st] || { lo: 0.7, hi: 1.1, breakdownP: 0.04, breakdownTo: 0.5 };
  if (rnd() < v.breakdownP) return Math.round(nominal * v.breakdownTo * (0.8 + rnd() * 0.4)); // breakdown day
  const f = v.lo + rnd() * (v.hi - v.lo);
  return Math.round(nominal * f);
}

/**
 * gridFlow — the FULL station × day matrix, DEADLINE-DRIVEN.
 *
 * Work is tracked as individual pieces carrying a due-day, and cascades through the
 * line. The number of shifts at each station each day is SOLVED from deadlines, not
 * backlog size: look at the pieces due within this station's remaining lead time,
 * and open just enough shifts (1, 2, or max 3) to clear the at-risk work in time.
 * A big backlog that's all due weeks out needs 1 shift; a small backlog due tomorrow
 * may need 3. If even 3 shifts can't clear what's due, the day is flagged `escalate`.
 *
 * Returns {
 *   stations, days, grid: { [station]: [{day, backlog, dueSoon, shifts, capacity,
 *      done, carried, escalate, ...}] },
 *   byDay, peak, bottleneck
 * }
 */
export function gridFlow(cfg = {}) {
  const c = { ...FLOW_DEFAULTS, ...cfg };
  const nominal = { ...THROUGHPUT_DEFAULT, ...(c.throughput || {}) };
  const variance = { ...VARIANCE_DEFAULT, ...(c.variance || {}) };
  const scans = c.scans || null; // { station: [day0, day1, ...] } realised counts from WHNet
  const today = c.today || 1;    // day index that is "today": days < today are actual/past
  const order = c.lineOrder || LINE_ORDER;
  const canSecond = new Set(c.secondShiftStations);
  const maxShifts = c.maxShifts || 3;
  const rnd = rng(c.seed ?? 42);

  // pieces per station queue, each = its due-day. seed backlog enters at the front.
  const q = {}; order.forEach((s) => (q[s] = []));
  for (let i = 0; i < (c.startInWork || 0) + (c.startWaiting || 0); i++) q[order[0]].push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));

  const idxOf = Object.fromEntries(order.map((s, i) => [s, i]));
  const downstreamDays = (st) => Math.max(1, order.length - idxOf[st] - 1);

  const grid = {}; order.forEach((s) => (grid[s] = []));
  const byDay = [];
  const peak = {}; order.forEach((s) => (peak[s] = q[s].length));

  for (let d = 1; d <= c.days; d++) {
    const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
    for (let i = 0; i < arrivals; i++) q[order[0]].push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));

    const cells = {};
    let passed = []; // pieces (due-days) handed downstream this day
    for (const st of order) {
      q[st] = q[st].concat(passed);
      const backlog = q[st].length;
      const phase = d < today ? "past" : d === today ? "today" : "future";

      const lead = downstreamDays(st);
      const mustToday = q[st].filter((due) => due - lead <= d).length;
      const dueSoon = q[st].filter((due) => due - lead <= d + 2).length;

      // shifts planned (deadline + forward-window driven)
      const shiftOut = Math.max(1, realisedOutput(st, d - 1, nominal[st], variance, null, rnd)); // simulated per-shift rate
      let shifts = 1;
      if (canSecond.has(st)) {
        const fromDeadline = mustToday > shiftOut ? Math.ceil(mustToday / shiftOut) : 1;
        const windowDays = 5;
        const dueInWindow = q[st].filter((due) => due - lead <= d + windowDays).length;
        const fromWindow = dueInWindow > shiftOut * windowDays ? Math.ceil(dueInWindow / (shiftOut * windowDays)) : 1;
        shifts = Math.min(maxShifts, Math.max(fromDeadline, fromWindow));
      }
      const plannedCap = shiftOut * shifts;          // full planned capacity for the day

      // --- output depends on phase ---
      let done, planned = null, doneSoFar = null, capacity = plannedCap;
      const scanTotal = scans && scans[st] && scans[st][d - 1] != null ? scans[st][d - 1] : null;
      if (phase === "past") {
        // ACTUAL output that day — each station's OWN realised count (scan or its
        // own variance), not whatever upstream happened to pass. Capped by what was
        // actually in front of it.
        const actual = scanTotal != null ? scanTotal : Math.max(1, realisedOutput(st, d - 1, nominal[st], variance, null, rnd));
        done = Math.min(backlog, actual);
        capacity = actual;
      } else if (phase === "today") {
        // TWO numbers: planned for the full day, and done-so-far (shift partway).
        planned = Math.min(backlog, plannedCap);
        const frac = c.todayFraction ?? 0.55;        // ~55% of the shift elapsed
        doneSoFar = scanTotal != null ? Math.min(backlog, scanTotal) : Math.round(planned * frac);
        done = doneSoFar;                            // only what's actually done leaves today
        capacity = plannedCap;
      } else {
        // FUTURE: run to planned capacity, draining backlog (tapers when queue < cap)
        done = Math.min(backlog, plannedCap);
        capacity = plannedCap;
      }
      const escalate = mustToday > plannedCap;

      q[st].sort((a, b) => a - b);
      passed = q[st].splice(0, done);
      peak[st] = Math.max(peak[st], backlog);
      const cell = {
        day: d, station: st, backlog, dueSoon, mustToday, phase,
        shifts, shiftOut, capacity, done, planned, doneSoFar, carried: backlog - done,
        second: shifts >= 2, escalate, fromScan: scanTotal != null,
        daysOfWork: +(backlog / shiftOut).toFixed(1), thru: shiftOut, nominal: nominal[st], canSecond: canSecond.has(st),
      };
      grid[st].push(cell); cells[st] = cell;
    }
    byDay.push({ day: d, arrivals, cells });
  }

  const bottleneck = order.reduce((b, s) => (peak[s] > peak[b] ? s : b), order[0]);
  return { stations: order, days: c.days, grid, byDay, peak, bottleneck, nominal, maxShifts, today };
}
