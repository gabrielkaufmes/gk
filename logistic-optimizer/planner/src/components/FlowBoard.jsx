import React, { useState, useMemo } from "react";

/* ============================================================== *
 * EMBEDDED FLOW ENGINE (mirrors src/engine/flow.mjs)
 * ============================================================== */
function rng(seed = 42) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const ri = (rnd, lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
const DEF = {
  days: 28, startInWork: 500, startWaiting: 300, arrivalsLo: 50, arrivalsHi: 150,
  perShiftLo: 100, perShiftHi: 140, deadlineLoDays: 14, deadlineHiDays: 28,
  riskWindowDays: 5, riskThresholdPcs: 120, backlogThresholdPcs: 700,
};
function simulate(cfg) {
  const c = { ...DEF, ...cfg }, rnd = rng(c.seed ?? 42);
  let queue = [];
  for (let i = 0; i < c.startInWork + c.startWaiting; i++) queue.push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
  const days = []; let peak = queue.length, totalLate = 0, secondDays = 0;
  for (let d = 1; d <= c.days; d++) {
    const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
    for (let i = 0; i < arrivals; i++) queue.push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
    const backlogStart = queue.length;
    const atRisk = queue.filter((due) => due - d <= c.riskWindowDays).length;
    const second = atRisk > c.riskThresholdPcs || backlogStart > c.backlogThresholdPcs;
    const base = ri(rnd, c.perShiftLo, c.perShiftHi);
    const cap = second ? base + ri(rnd, c.perShiftLo, c.perShiftHi) : base;
    const done = Math.min(cap, backlogStart);
    queue.sort((a, b) => a - b);
    const fin = queue.splice(0, done);
    const lateToday = fin.filter((due) => due < d).length;
    totalLate += lateToday;
    if (second) secondDays++;
    peak = Math.max(peak, backlogStart);
    days.push({ day: d, arrivals, backlogStart, done, second, backlogEnd: queue.length, atRisk, lateToday });
  }
  return { days, summary: { peak, end: queue.length, totalLate, secondDays, avgArrivals: Math.round(days.reduce((a, x) => a + x.arrivals, 0) / days.length), avgDone: Math.round(days.reduce((a, x) => a + x.done, 0) / days.length) } };
}

/* ============================================================== *
 * UI tokens
 * ============================================================== */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#161b26", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f4f2ec", CARD = "#fff";
const OK = "#22c55e", WARN = "#f59e0b", HOT = "#ef4444", BLUE = "#2563eb", ACCENT = "#e8590c", PURP = "#7c3aed";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export default function FlowBoard() {
  const [inWork, setInWork] = useState(500);
  const [waiting, setWaiting] = useState(300);
  const [seed, setSeed] = useState(42);
  const sim = useMemo(() => simulate({ startInWork: inWork, startWaiting: waiting, seed }), [inWork, waiting, seed]);
  const [selDay, setSelDay] = useState(1);

  const maxBacklog = Math.max(...sim.days.map((d) => d.backlogStart), 1);
  const maxFlow = Math.max(...sim.days.map((d) => Math.max(d.arrivals, d.done)), 1);
  const sel = sim.days.find((d) => d.day === selDay) || sim.days[0];

  const W = 720, H = 200, PAD = 8;
  const bx = (i) => PAD + (i / (sim.days.length - 1)) * (W - 2 * PAD);
  const by = (v) => H - PAD - (v / maxBacklog) * (H - 2 * PAD);
  const backlogPath = sim.days.map((d, i) => `${i === 0 ? "M" : "L"}${bx(i).toFixed(1)},${by(d.backlogEnd).toFixed(1)}`).join(" ");

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "18px 16px 44px", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(22,27,38,0.045) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 14, borderBottom: `2px solid ${INK}`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 3, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>Optimizer · Flow</div>
            <h1 style={{ fontWeight: 900, fontSize: 28, margin: "2px 0 0", letterSpacing: -1 }}>Production flow · {sim.days.length} days</h1>
          </div>
          <div style={{ fontFamily: FM, fontSize: 11, color: MUTED, textAlign: "right" }}>
            arrivals {DEF.arrivalsLo}–{DEF.arrivalsHi}/day · done {DEF.perShiftLo}–{DEF.perShiftHi}/shift<br />deadlines 2–4 weeks · backlog tracked in pieces
          </div>
        </div>

        {/* KPIs — all in pieces, never % */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Kpi label="Backlog now" value={`${inWork + waiting} pcs`} sub={`${inWork} in work · ${waiting} waiting`} accent={INK} big />
          <Kpi label="Peak backlog" value={`${sim.summary.peak} pcs`} sub="highest queue" accent={sim.summary.peak > 1000 ? HOT : WARN} />
          <Kpi label="Backlog day 28" value={`${sim.summary.end} pcs`} sub={sim.summary.end < inWork + waiting ? "draining" : "growing"} accent={sim.summary.end < inWork + waiting ? OK : HOT} />
          <Kpi label="Late pieces" value={sim.summary.totalLate} sub="missed deadline" accent={sim.summary.totalLate ? HOT : OK} />
          <Kpi label="2nd-shift days" value={sim.summary.secondDays} sub="suggested" accent={PURP} />
        </div>

        {/* backlog over time */}
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Backlog over time (pcs) · purple band = 2nd shift suggested</div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FM }}>
            {/* 2nd-shift day bands */}
            {sim.days.map((d, i) => d.second ? <rect key={i} x={bx(i) - 6} y={PAD} width={12} height={H - 2 * PAD} fill={hexA(PURP, 0.1)} /> : null)}
            {/* gridlines */}
            {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={PAD} y1={by(maxBacklog * f)} x2={W - PAD} y2={by(maxBacklog * f)} stroke={LINE} />)}
            {[0.5, 1].map((f) => <text key={f} x={PAD + 2} y={by(maxBacklog * f) - 3} fontSize={8} fill={MUTED}>{Math.round(maxBacklog * f)}</text>)}
            {/* backlog line */}
            <path d={backlogPath} fill="none" stroke={INK} strokeWidth={2.5} />
            {/* selected day marker */}
            <line x1={bx(selDay - 1)} y1={PAD} x2={bx(selDay - 1)} y2={H - PAD} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="3 3" />
            <circle cx={bx(selDay - 1)} cy={by(sel.backlogEnd)} r={4} fill={ACCENT} />
            {sim.days.map((d, i) => d.lateToday > 0 ? <circle key={i} cx={bx(i)} cy={by(d.backlogEnd)} r={3} fill={HOT} /> : null)}
          </svg>
          {/* day stepper */}
          <input type="range" min={1} max={sim.days.length} value={selDay} onChange={(e) => setSelDay(+e.target.value)} style={{ width: "100%", accentColor: ACCENT, marginTop: 6 }} />
        </div>

        {/* arrivals vs done bars + selected day detail */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px", background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Arrivals vs completed (pcs/day)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110 }}>
              {sim.days.map((d) => (
                <div key={d.day} onClick={() => setSelDay(d.day)} title={`day ${d.day}: +${d.arrivals} in, ${d.done} done`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1, cursor: "pointer", opacity: selDay === d.day ? 1 : 0.8 }}>
                  <div style={{ height: `${(d.arrivals / maxFlow) * 50}%`, background: selDay === d.day ? BLUE : hexA(BLUE, 0.55), borderRadius: "2px 2px 0 0" }} />
                  <div style={{ height: `${(d.done / maxFlow) * 50}%`, background: d.second ? PURP : (selDay === d.day ? OK : hexA(OK, 0.6)), borderRadius: "0 0 2px 2px" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, fontFamily: FM, fontSize: 10, color: MUTED, marginTop: 8 }}>
              <Leg c={BLUE} t="arrivals" /><Leg c={OK} t="done (1 shift)" /><Leg c={PURP} t="done (2 shifts)" />
            </div>
          </div>

          <div style={{ flex: "1 1 230px", background: CARD, border: `1px solid ${LINE}`, borderLeft: `5px solid ${sel.second ? PURP : OK}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Day {sel.day}</div>
            <Row k="Backlog start" v={`${sel.backlogStart} pcs`} />
            <Row k="New orders in" v={`+${sel.arrivals} pcs`} />
            <Row k="Completed" v={`${sel.done} pcs`} />
            <Row k="Backlog end" v={`${sel.backlogEnd} pcs`} hot={sel.backlogEnd > sel.backlogStart} />
            <Row k="Due ≤5 days" v={`${sel.atRisk} pcs`} hot={sel.atRisk > DEF.riskThresholdPcs} />
            <Row k="Late today" v={`${sel.lateToday} pcs`} hot={sel.lateToday > 0} />
            <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: sel.second ? hexA(PURP, 0.1) : hexA(OK, 0.08), fontFamily: FM, fontSize: 11.5, fontWeight: 700, color: sel.second ? PURP : OK }}>
              {sel.second ? "→ Open 2nd shift (cut/weld/fitting/glaze/pack) — backlog high & deadlines at risk" : "→ Single shift keeps pace"}
            </div>
          </div>
        </div>

        {/* what-if knobs */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
          <Knob label={`In work ${inWork}`} onMinus={() => setInWork((v) => Math.max(0, v - 100))} onPlus={() => setInWork((v) => v + 100)} />
          <Knob label={`Waiting ${waiting}`} onMinus={() => setWaiting((v) => Math.max(0, v - 100))} onPlus={() => setWaiting((v) => v + 100)} />
          <Knob label="New random days" onMinus={() => setSeed((s) => s - 1)} onPlus={() => setSeed((s) => s + 1)} />
        </div>

        <div style={{ marginTop: 14, fontFamily: FM, fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Live queue simulation · {DEF.arrivalsLo}–{DEF.arrivalsHi} pcs/day arrive, {DEF.perShiftLo}–{DEF.perShiftHi}/shift complete, deadlines 2–4 weeks. A 2nd shift is suggested only when backlog is high and deadlines are at risk. Load is pieces & days — never &gt;100% nonsense. Mirrors <code>flow.mjs</code>.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, big }) {
  return (<div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", flex: big ? "1 1 190px" : "1 1 130px", minWidth: big ? 180 : 120, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
    <div style={{ fontFamily: FM, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{label}</div>
    <div style={{ fontFamily: FD, fontWeight: 800, fontSize: big ? 22 : 20, lineHeight: 1.15, marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
  </div>);
}
function Row({ k, v, hot }) { return <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FM, fontSize: 12, padding: "3px 0" }}><span style={{ color: MUTED }}>{k}</span><b style={{ color: hot ? HOT : INK }}>{v}</b></div>; }
function Leg({ c, t }) { return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: c }} />{t}</span>; }
function Knob({ label, onMinus, onPlus }) {
  const b = { width: 28, height: 28, border: `1px solid ${LINE}`, background: PAPER, borderRadius: 6, cursor: "pointer", fontFamily: FM, fontWeight: 700, fontSize: 15 };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${LINE}`, borderRadius: 8, padding: "4px 7px", background: CARD }}><button onClick={onMinus} style={b}>−</button><span style={{ fontFamily: FM, fontSize: 11.5, minWidth: 96, textAlign: "center" }}>{label}</span><button onClick={onPlus} style={b}>+</button></span>;
}
