import React, { useState, useMemo } from "react";

/* ============================================================== *
 * EMBEDDED GRID FLOW ENGINE (mirrors src/engine/flow.mjs gridFlow)
 * ============================================================== */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const ri = (r, lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
const THRU = { cut: 130, weld: 165, clean: 140, fitting: 150, glaze: 150, qc: 210, pack: 185 };
const VAR = {
  cut: { lo: 0.6, hi: 1.15, bp: 0.08, bt: 0.35 }, weld: { lo: 0.7, hi: 1.15, bp: 0.05, bt: 0.45 },
  clean: { lo: 0.75, hi: 1.1, bp: 0.03, bt: 0.5 }, fitting: { lo: 0.7, hi: 1.15, bp: 0.04, bt: 0.5 },
  glaze: { lo: 0.75, hi: 1.1, bp: 0.03, bt: 0.5 }, qc: { lo: 0.8, hi: 1.15, bp: 0.02, bt: 0.6 }, pack: { lo: 0.8, hi: 1.1, bp: 0.03, bt: 0.55 },
};
const ORDER = ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"];
const CAN2 = new Set(["cut", "weld", "fitting", "glaze", "pack"]);
const LABEL = { cut: "Cutting", weld: "Welding", clean: "Corner clean", fitting: "Fittings", glaze: "Glazing", qc: "QC", pack: "Pack & load" };
function realised(st, rnd) { const v = VAR[st]; if (rnd() < v.bp) return Math.round(THRU[st] * v.bt * (0.8 + rnd() * 0.4)); return Math.round(THRU[st] * (v.lo + rnd() * (v.hi - v.lo))); }

function gridFlow(cfg = {}) {
  const c = { days: 28, startInWork: 500, startWaiting: 300, arrivalsLo: 50, arrivalsHi: 150, deadlineLoDays: 14, deadlineHiDays: 28, maxShifts: 3, seed: 42, scans: null, today: 6, ...cfg };
  const rnd = rng(c.seed);
  const q = {}; ORDER.forEach((s) => (q[s] = []));
  for (let i = 0; i < c.startInWork + c.startWaiting; i++) q[ORDER[0]].push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
  const idxOf = Object.fromEntries(ORDER.map((s, i) => [s, i]));
  const lead = (st) => Math.max(1, ORDER.length - idxOf[st] - 1);
  const grid = {}; ORDER.forEach((s) => (grid[s] = []));
  const peak = {}; ORDER.forEach((s) => (peak[s] = q[s].length));
  const byDay = [];
  for (let d = 1; d <= c.days; d++) {
    const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
    for (let i = 0; i < arrivals; i++) q[ORDER[0]].push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
    let passed = []; const cells = {};
    for (const st of ORDER) {
      q[st] = q[st].concat(passed);
      const backlog = q[st].length;
      const scanTotal = c.scans && c.scans[st] && c.scans[st][d - 1] != null ? c.scans[st][d - 1] : null;
      const shiftOut = Math.max(1, realised(st, rnd));
      const L = lead(st);
      const mustToday = q[st].filter((due) => due - L <= d).length;
      const dueSoon = q[st].filter((due) => due - L <= d + 2).length;
      let shifts = 1;
      if (CAN2.has(st)) {
        // shifts must clear what's DUE, today and looking ahead — never raw backlog.
        const fromDeadline = mustToday > shiftOut ? Math.ceil(mustToday / shiftOut) : 1;
        // forward pressure: pieces coming due within a 1-week window vs what 1 shift
        // can clear across those days. >1 shift only if deadlines genuinely crowd.
        const windowDays = 5;
        const dueInWindow = q[st].filter((due) => due - L <= d + windowDays).length;
        const fromWindow = dueInWindow > shiftOut * windowDays ? Math.ceil(dueInWindow / (shiftOut * windowDays)) : 1;
        shifts = Math.min(c.maxShifts, Math.max(fromDeadline, fromWindow));
      }
      const dueWindow = q[st].filter((due) => due - L <= d + 5).length;
      const phase = d < c.today ? "past" : d === c.today ? "today" : "future";
      const plannedCap = shiftOut * shifts;
      let done, planned = null, doneSoFar = null, capacity = plannedCap;
      if (phase === "past") {
        const actual = scanTotal != null ? scanTotal : Math.max(1, realised(st, rnd));
        done = Math.min(backlog, actual); capacity = actual;
      } else if (phase === "today") {
        planned = Math.min(backlog, plannedCap);
        doneSoFar = scanTotal != null ? Math.min(backlog, scanTotal) : Math.round(planned * (c.todayFraction ?? 0.55));
        done = doneSoFar; capacity = plannedCap;
      } else {
        done = Math.min(backlog, plannedCap); capacity = plannedCap;
      }
      const escalate = mustToday > plannedCap;
      q[st].sort((a, b) => a - b);
      passed = q[st].splice(0, done);
      peak[st] = Math.max(peak[st], backlog);
      const cell = { day: d, station: st, backlog, dueSoon, mustToday, dueWindow, phase, shifts, shiftOut, capacity, done, planned, doneSoFar, carried: backlog - done, second: shifts >= 2, escalate, fromScan: scanTotal != null, daysOfWork: +(backlog / shiftOut).toFixed(1), thru: shiftOut, nominal: THRU[st], canSecond: CAN2.has(st) };
      grid[st].push(cell); cells[st] = cell;
    }
    byDay.push({ day: d, arrivals, cells });
  }
  const bottleneck = ORDER.reduce((b, s) => (peak[s] > peak[b] ? s : b), ORDER[0]);
  return { stations: ORDER, days: c.days, grid, byDay, peak, bottleneck, maxShifts: c.maxShifts, today: c.today };
}

/* ============================================================== *
 * ORDER-LEVEL flow (mirrors src/engine/orderflow.mjs) — for the per-day order list
 * ============================================================== */
const OPS = { cut: 14, weld: 18, clean: 16, fitting: 16, glaze: 16, qc: 22, pack: 20 };
function seedOrderBook(seed, count = 90) {
  const rnd = rng(seed); const dests = ["Lyon", "Paris", "Marseille", "Nice", "Lille"]; const o = [];
  for (let i = 0; i < count; i++) o.push({ id: "O" + (1001 + i), pcs: ri(rnd, 3, 12), dest: dests[i % dests.length], dueDay: ri(rnd, 14, 28), stageIdx: 0, done: false, history: {} });
  return o;
}
function orderFlow(cfg) {
  const order = ORDER, days = cfg.days || 28, maxShifts = 3;
  const idxOf = Object.fromEntries(order.map((s, i) => [s, i]));
  const downstream = (i) => Math.max(1, order.length - i - 1);
  const orders = cfg.orders.map((o) => ({ ...o, history: { ...o.history } }));
  const scansByDay = {}; for (const s of (cfg.scans || [])) (scansByDay[s.day] ||= []).push(s);
  const out = [];
  for (let d = 1; d <= days; d++) {
    for (const sc of (scansByDay[d] || [])) {
      const o = orders.find((x) => x.id === sc.id); if (!o || o.done) continue;
      const si = idxOf[sc.station]; if (si == null) continue;
      o.history[sc.station] = d; o.stageIdx = si + 1; o.scanAdjusted = d;
      if (o.stageIdx >= order.length) { o.done = true; o.doneDay = d; }
    }
    const stations = {};
    for (let si = 0; si < order.length; si++) {
      const st = order[si];
      const here = orders.filter((o) => !o.done && o.stageIdx === si).sort((a, b) => a.dueDay - b.dueDay);
      const lead = downstream(si); const mustToday = here.filter((o) => o.dueDay - lead <= d).length;
      const perShift = OPS[st]; let shifts = 1;
      if (CAN2.has(st)) { const fd = mustToday > perShift ? Math.ceil(mustToday / perShift) : 1; const fb = here.length > perShift * 2.5 ? 2 : 1; shifts = Math.min(maxShifts, Math.max(fd, fb)); }
      const capacity = perShift * shifts;
      const doneToday = here.slice(0, capacity); const doneIds = new Set(doneToday.map((o) => o.id));
      for (const o of doneToday) { o.history[st] = d; o.stageIdx = si + 1; if (o.stageIdx >= order.length) { o.done = true; o.doneDay = d; } }
      stations[st] = { orders: here.map((o) => ({ id: o.id, pcs: o.pcs, dest: o.dest, dueDay: o.dueDay, dueIn: o.dueDay - d, mustRun: o.dueDay - lead <= d, scanAdjusted: o.scanAdjusted || null, willClear: doneIds.has(o.id) })), shifts, capacity, mustToday };
    }
    out.push({ day: d, stations });
  }
  return { days: out };
}

/* ============================================================== *
 * UI tokens
 * ============================================================== */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#161b26", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f4f2ec", CARD = "#fff";
const ACCENT = "#e8590c", PURP = "#7c3aed", OK = "#22c55e", HOT = "#ef4444", WARN = "#f59e0b";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
/* heat scale on DAYS-OF-WORK in the queue (not %): green ≤1 day → deep red ≥4 days */
function heat(daysOfWork) {
  const stops = [[0, "#e9f7ef"], [1, "#7ed7a5"], [2, "#f6d860"], [3, "#f08a4b"], [4, "#e0524a"], [6, "#9e2a26"]];
  const v = Math.min(6, daysOfWork);
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) return stops[i][1];
  return stops[stops.length - 1][1];
}
const textOn = (daysOfWork) => (daysOfWork >= 2.2 ? "#fff" : INK);

export default function FlowGrid() {
  const [inWork, setInWork] = useState(500);
  const [waiting, setWaiting] = useState(300);
  const [seed, setSeed] = useState(42);
  const [metric, setMetric] = useState("done"); // done | backlog | days
  const g = useMemo(() => gridFlow({ startInWork: inWork, startWaiting: waiting, seed }), [inWork, waiting, seed]);
  const of = useMemo(() => orderFlow({ orders: seedOrderBook(seed, 90), days: g.days }), [seed, g.days]);
  const [sel, setSel] = useState({ st: "cut", day: 1 }); // tap a cell to inspect

  const cellW = 30, cellH = 34, labelW = 104;
  const scell = sel ? g.grid[sel.st][sel.day - 1] : null;

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "18px 16px 44px", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(22,27,38,0.045) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 14, borderBottom: `2px solid ${INK}`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 3, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>Optimizer · Flow grid</div>
            <h1 style={{ fontWeight: 900, fontSize: 28, margin: "2px 0 0", letterSpacing: -1 }}>All stations · all {g.days} days</h1>
          </div>
          <div style={{ fontFamily: FM, fontSize: 11, color: MUTED, textAlign: "right" }}>
            backlog cascades cut → pack<br />bottleneck: {LABEL[g.bottleneck]} (peak {g.peak[g.bottleneck]} pcs)
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <Seg options={[["backlog", "Backlog (pcs)"], ["done", "Completed/day"], ["days", "Days of work"]]} value={metric} onChange={setMetric} />
          <Knob label={`In work ${inWork}`} onMinus={() => setInWork((v) => Math.max(0, v - 100))} onPlus={() => setInWork((v) => v + 100)} />
          <Knob label={`Waiting ${waiting}`} onMinus={() => setWaiting((v) => Math.max(0, v - 100))} onPlus={() => setWaiting((v) => v + 100)} />
          <Knob label="Reseed arrivals" onMinus={() => setSeed((s) => s - 1)} onPlus={() => setSeed((s) => s + 1)} />
        </div>

        {/* THE GRID */}
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, overflowX: "auto" }}>
          <div style={{ minWidth: labelW + g.days * cellW }}>
            {/* day header */}
            <div style={{ display: "flex", marginBottom: 4 }}>
              <div style={{ width: labelW, flexShrink: 0, fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase", display: "flex", alignItems: "flex-end", paddingBottom: 3 }}>station ╲ day</div>
              {g.byDay.map((d) => {
                const isToday = d.day === g.today;
                return (
                  <div key={d.day} style={{ width: cellW, textAlign: "center", fontFamily: FM, fontSize: 9, fontWeight: isToday ? 700 : 400, color: isToday ? HOT : MUTED, borderLeft: isToday ? `2px solid ${HOT}` : "none" }}>{isToday ? "▼" : ""}{d.day}</div>
                );
              })}
            </div>
            {/* past / today / planned band labels */}
            <div style={{ display: "flex", marginBottom: 4, fontFamily: FM, fontSize: 8.5, color: MUTED, textTransform: "uppercase" }}>
              <div style={{ width: labelW, flexShrink: 0 }} />
              <div style={{ width: (g.today - 1) * cellW, textAlign: "center" }}>{g.today > 1 ? "← actual (done/day)" : ""}</div>
              <div style={{ flex: 1, textAlign: "center", color: HOT }}>today (done/plan)</div>
              <div style={{ width: (g.days - g.today) * cellW, textAlign: "center" }}>planned (to capacity) →</div>
            </div>
            {/* rows */}
            {g.stations.map((st) => (
              <div key={st} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
                <div style={{ width: labelW, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{LABEL[st]}</span>
                  {st === g.bottleneck && <span style={{ color: "#9e2a26", fontFamily: FM, fontSize: 8.5, fontWeight: 700 }}>◆</span>}
                </div>
                {g.grid[st].map((cell) => {
                  const dow = cell.daysOfWork;
                  const bg = heat(dow);
                  const val = metric === "backlog" ? cell.backlog : metric === "done" ? cell.done : dow;
                  const isSel = sel && sel.st === st && sel.day === cell.day;
                  const isToday = cell.phase === "today";
                  const isPast = cell.phase === "past";
                  const showTwo = isToday && metric === "done"; // planned + done so far
                  return (
                    <div key={cell.day} onClick={() => setSel({ st, day: cell.day })}
                      style={{ width: cellW, height: cellH, marginRight: 1, background: bg, borderRadius: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", outline: isSel ? `3px solid ${INK}` : "none", zIndex: isSel ? 3 : isToday ? 2 : 1, borderLeft: isToday ? `3px solid ${HOT}` : "none", opacity: isPast ? 0.78 : 1 }}>
                      {showTwo ? (
                        <span style={{ fontFamily: FM, fontWeight: 700, lineHeight: 1.05, textAlign: "center", color: textOn(dow) }}>
                          <span style={{ fontSize: 10 }}>{cell.doneSoFar}</span>
                          <span style={{ fontSize: 8, opacity: 0.7 }}>/{cell.planned}</span>
                        </span>
                      ) : (
                        <span style={{ fontFamily: FM, fontSize: cell.backlog >= 1000 ? 8.5 : 10, fontWeight: 700, color: textOn(dow) }}>{val}</span>
                      )}
                      {isPast && cell.fromScan && <span style={{ position: "absolute", bottom: 1, left: 3, fontSize: 7, color: INK, opacity: 0.6 }}>scan</span>}
                      {!isPast && !isToday && cell.shifts >= 2 && !cell.escalate && <span style={{ position: "absolute", top: 1, right: 2, minWidth: 11, height: 11, padding: "0 1px", borderRadius: 6, background: PURP, color: "#fff", fontFamily: FM, fontSize: 8, fontWeight: 700, lineHeight: "11px", textAlign: "center", border: "1px solid #fff" }} title={`${cell.shifts} shifts planned`}>{cell.shifts}</span>}
                      {!isPast && cell.escalate && <span style={{ position: "absolute", top: 1, right: 2, fontSize: 9, lineHeight: "11px" }} title="even 3 shifts can't clear what's due">⚠</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: FM, fontSize: 10, color: MUTED, marginTop: 12 }}>
          <span>days of work in queue:</span>
          {[["≤1", 0.5], ["2", 2], ["3", 3], ["4", 4], ["≥6", 6]].map(([t, v]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 12, borderRadius: 3, background: heat(v), display: "inline-block" }} />{t}</span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ minWidth: 13, height: 13, borderRadius: 6, background: PURP, color: "#fff", fontFamily: FM, fontSize: 9, fontWeight: 700, textAlign: "center", lineHeight: "13px", display: "inline-block", padding: "0 2px" }}>2</span><b style={{ color: PURP }}>shifts needed</b> (from deadlines) · <span style={{ color: INK }}>⚠ = even 3 shifts short</span></span>
        </div>

        {/* tap-to-inspect detail panel */}
        {scell && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderLeft: `5px solid ${heat(scell.daysOfWork)}`, borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{LABEL[scell.station]} · day {scell.day}</div>
              <div style={{ fontFamily: FM, fontSize: 12.5, color: MUTED }}>{scell.fromScan ? "from scans" : `~${scell.nominal} nominal`} · realised {scell.thru} pcs/shift · {scell.daysOfWork} days queued</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Stat label="Backlog" value={scell.backlog} unit="pcs in queue" big />
              <Stat label="Must run today" value={scell.mustToday} unit="pcs (else late)" accent={scell.mustToday > 0 ? HOT : OK} />
              <Stat label="Due within ~2 days" value={scell.dueSoon} unit="pcs" />
              <Stat label="Shifts needed" value={scell.escalate ? `${scell.shifts}+` : scell.shifts} unit={scell.escalate ? "⚠ not enough" : scell.shifts >= 2 ? (scell.mustToday > scell.thru ? "due today" : "due this week") : "deadlines clear"} accent={scell.escalate ? HOT : scell.shifts >= 2 ? PURP : OK} big />
              <Stat label="Completed today" value={scell.phase === "today" ? `${scell.doneSoFar}/${scell.planned}` : scell.done} unit={scell.phase === "today" ? "done / planned" : scell.phase === "past" ? "actual (done)" : `planned (${scell.shifts}×shift)`} accent={OK} />
              <Stat label="Carried over" value={scell.carried} unit="pcs" accent={scell.carried > 0 ? WARN : OK} />
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: scell.escalate ? hexA(HOT, 0.1) : scell.shifts >= 2 ? hexA(PURP, 0.1) : (scell.canSecond ? hexA(OK, 0.08) : hexA(MUTED, 0.08)), fontFamily: FM, fontSize: 12, fontWeight: 700, color: scell.escalate ? HOT : scell.shifts >= 2 ? PURP : (scell.canSecond ? OK : MUTED) }}>
              {scell.escalate
                ? `→ Escalate: ${scell.mustToday} pcs due today but even ${scell.shifts} shifts clear only ${scell.capacity}. Pull work forward / renegotiate / outsource.`
                : scell.shifts >= 2
                  ? (scell.mustToday > scell.thru
                      ? `→ Run ${scell.shifts} shifts: ${scell.mustToday} pcs must ship today — more than one shift (${scell.thru}) clears.`
                      : `→ Run ${scell.shifts} shifts: ${scell.dueWindow} pcs come due within 5 days — one shift can't clear them in time.`)
                  : scell.mustToday === 0
                    ? `→ 1 shift — nothing is due yet. Backlog of ${scell.backlog} is real but deadlines are further out, so no rush.`
                    : `→ 1 shift covers it: ${scell.mustToday} pcs due ≤ one shift (${scell.thru}).`}
            </div>
            {/* ORDER LIST for this station-day — the actual orders, EDF, following the flow */}
            {(() => {
              const dayRec = of.days[sel.day - 1];
              const stRec = dayRec && dayRec.stations[scell.station];
              const list = stRec ? stRec.orders : [];
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: FM, fontSize: 9.5, color: MUTED, textTransform: "uppercase", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                    <span>orders at {LABEL[scell.station]} · day {sel.day} — earliest deadline first</span>
                    <span>{list.length} orders{stRec ? ` · ${stRec.shifts}×shift clears ${stRec.capacity}` : ""}</span>
                  </div>
                  {list.length === 0 ? <div style={{ fontFamily: FM, fontSize: 11, color: MUTED }}>No orders here this day.</div> : (
                    <div style={{ maxHeight: 230, overflowY: "auto", border: `1px solid ${LINE}`, borderRadius: 8 }}>
                      {list.map((o, i) => (
                        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: i < list.length - 1 ? `1px solid ${hexA(INK, 0.05)}` : "none", background: o.willClear ? hexA(OK, 0.06) : "transparent", fontFamily: FM, fontSize: 11.5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 9, flexShrink: 0, background: o.willClear ? OK : o.mustRun ? HOT : "#cfd4dc" }} />
                          <b style={{ width: 58, flexShrink: 0 }}>{o.id}</b>
                          <span style={{ width: 42, flexShrink: 0, color: MUTED }}>{o.pcs}pc</span>
                          <span style={{ width: 64, flexShrink: 0, color: MUTED }}>{o.dest}</span>
                          <span style={{ flex: 1, textAlign: "right", color: o.dueIn <= 2 ? HOT : o.dueIn <= 5 ? WARN : MUTED }}>due d{o.dueDay} ({o.dueIn >= 0 ? "in " + o.dueIn + "d" : Math.abs(o.dueIn) + "d late"})</span>
                          {o.scanAdjusted && <span title={`scan-adjusted day ${o.scanAdjusted}`} style={{ color: ACCENT, fontSize: 10 }}>⟲scan</span>}
                          {o.willClear && <span style={{ color: OK, fontSize: 10 }}>✓clears</span>}
                          {!o.willClear && o.mustRun && <span style={{ color: HOT, fontSize: 10 }}>⚠late risk</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontFamily: FM, fontSize: 9.5, color: MUTED, marginTop: 5 }}>green ✓ = clears today · red ⚠ = must run or it's late · ⟲scan = re-adjusted from a real scan · orders flow to the next station tomorrow</div>
                </div>
              );
            })()}

            {/* mini trend: this station across all days */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: FM, fontSize: 9.5, color: MUTED, textTransform: "uppercase", marginBottom: 5 }}>{LABEL[scell.station]} backlog over {g.days} days — tap to jump</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 50 }}>
                {g.grid[scell.station].map((c) => (
                  <div key={c.day} onClick={() => setSel({ st: scell.station, day: c.day })} title={`day ${c.day}: ${c.backlog} pcs`}
                    style={{ flex: 1, height: `${Math.max(4, (c.backlog / (g.peak[scell.station] || 1)) * 100)}%`, background: c.day === scell.day ? INK : heat(c.daysOfWork), borderRadius: 2, cursor: "pointer", position: "relative" }}>
                    {c.second && <span style={{ position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 9, background: PURP }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, fontFamily: FM, fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Red line = today. <b>Left of it = actual pieces done</b> per day (from scans); <b>right = planned</b> output, run to capacity until backlog+incoming drops below capacity. Number = {metric === "backlog" ? "pcs in queue" : metric === "done" ? "pcs done/planned" : "days of work"}; colour = days of work queued. Badge = planned shifts (2/3), ⚠ = even 3 short. <b>Tap any cell for the order list.</b> Mirrors <code>flow.mjs</code>.
        </div>
      </div>
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (<div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
    {options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, padding: "8px 12px", border: "none", background: value === v ? INK : CARD, color: value === v ? "#fff" : INK, cursor: "pointer" }}>{l}</button>)}
  </div>);
}
function Stat({ label, value, unit, accent = INK, big }) {
  return (<div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 11px", flex: big ? "1 1 120px" : "1 1 100px", minWidth: 92 }}>
    <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED }}>{label}</div>
    <div style={{ fontFamily: FD, fontWeight: 800, fontSize: big ? 22 : 19, lineHeight: 1.1, marginTop: 2, color: accent }}>{value}</div>
    <div style={{ fontFamily: FM, fontSize: 9.5, color: MUTED }}>{unit}</div>
  </div>);
}
function Knob({ label, onMinus, onPlus }) {
  const b = { width: 28, height: 28, border: `1px solid ${LINE}`, background: PAPER, borderRadius: 6, cursor: "pointer", fontFamily: FM, fontWeight: 700, fontSize: 15 };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${LINE}`, borderRadius: 8, padding: "4px 7px", background: CARD }}><button onClick={onMinus} style={b}>−</button><span style={{ fontFamily: FM, fontSize: 11.5, minWidth: 92, textAlign: "center" }}>{label}</span><button onClick={onPlus} style={b}>+</button></span>;
}
