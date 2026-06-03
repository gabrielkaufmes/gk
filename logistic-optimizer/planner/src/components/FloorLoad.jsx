import React, { useState, useMemo } from "react";

/* ============================================================== *
 * EMBEDDED ENGINE (mirrors src/engine — standalone)
 * ============================================================== */
const SHIFT_HOURS = 8, EFF = 0.85;
const clampShifts = (n) => Math.max(1, Math.min(3, n || 1));
const RATES = {
  cut: { perFrameSide: 1.5, perMullion: 2, perSashSide: 1.5, perBead: 1 },
  weld: { perFrameSide: 2, perMullion: 3, perSashSide: 2 },
  clean: { perCorner: 1.5 }, fitting: { perSashSet: 8 },
  sprossen: { perSprosse: 6 }, shutter: { perShutter: 25 },
  glaze: { perBead: 2, perGlass: 4 }, qc: { perElement: 4 }, pack: { perElement: 5 },
  door: { multiplier: 1.6 }, special: { perElementManual: 120 },
};
const ROUTES = {
  window: ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"],
  door: ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"],
  special_hst: ["manual", "fitting", "glaze", "qc", "pack"],
};
function routeFor(d) { const b = (ROUTES[d.type] || ROUTES.window).slice(); if (d.sprossen > 0) b.splice(b.indexOf("glaze"), 0, "sprossen"); if (d.roller_shutter) b.splice(b.indexOf("qc"), 0, "shutter"); return b; }
function counts(d) { const fr = d.frames || 0, mu = d.mullions || 0, sa = d.sashes || 0, gl = d.glasses || 0, sp = d.sprossen || 0; return { frameSides: fr * 4, sashSides: sa * 4, fittingSets: sa, beads: gl * 4, corners: fr * 4 + sa * 4, shutters: d.roller_shutter ? 1 : 0, mullions: mu, glasses: gl, sprossen: sp }; }
function stMin(st, c) { const r = RATES[st] || {}; switch (st) {
  case "cut": return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide + c.beads * r.perBead;
  case "weld": return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide;
  case "clean": return c.corners * r.perCorner; case "fitting": return c.fittingSets * r.perSashSet;
  case "sprossen": return c.sprossen * r.perSprosse; case "shutter": return c.shutters * r.perShutter;
  case "glaze": return c.beads * r.perBead + c.glasses * r.perGlass; case "qc": case "pack": return r.perElement || 0;
  case "manual": return RATES.special.perElementManual; default: return 0; } }
function workOf(d) { const c = counts(d), route = routeFor(d), mult = d.type === "door" ? RATES.door.multiplier : 1; const w = {}; route.forEach((st) => (w[st] = stMin(st, c) * mult * (d.pcs || 1))); return { route, w }; }
function usableMachines(cfg) { if (!cfg.machines) return 0; return Math.max(0, Math.min(cfg.machines, Math.floor((cfg.workers || 0) / (cfg.crew || 1)))); }
function capMin(cfg) { const h = clampShifts(cfg.shifts) * SHIFT_HOURS * 60 * (cfg.effective ?? EFF); return cfg.machines ? usableMachines(cfg) * h : (cfg.workers || 0) * h; }

function multiDayPlan(elements, stations, days = 12) {
  const req = {}; elements.forEach((e) => { const { route, w } = workOf(e); route.forEach((st) => (req[st] = (req[st] || 0) + w[st])); });
  const rows = Object.keys(stations).filter((st) => (req[st] || 0) > 0).map((st) => {
    const dayCap = capMin(stations[st]), total = req[st]; let carry = total; const perDay = [];
    for (let d = 1; d <= days; d++) { const incoming = carry, done = Math.min(incoming, dayCap); carry = Math.max(0, incoming - done);
      perDay.push({ day: d, load_pct: dayCap > 0 ? Math.round((incoming / dayCap) * 100) : 0, over: incoming > dayCap }); if (carry <= 0) break; }
    return { station: st, totalReq_min: total, dayCap_min: dayCap, daysToClear: dayCap > 0 ? Math.ceil(total / dayCap) : 99, perDay };
  });
  const maxDays = rows.reduce((m, s) => Math.max(m, s.daysToClear), 1);
  return { stations: rows, maxDays, binding: [...rows].sort((a, b) => b.daysToClear - a.daysToClear)[0]?.station };
}

/* ============================================================== *
 * SEED: 200 orders ~1188 pcs + station floor positions
 * ============================================================== */
function seedBook() { const out = []; let pcs = 0; for (let i = 0; i < 200; i++) { const r = (i * 37) % 100; let type = "window", ex = {}; if (r < 6) { type = "special_hst"; ex = { sashes: 2, glasses: 2, roller_shutter: i % 2 === 0 }; } else if (r < 16) { type = "door"; ex = { frames: 1, sashes: 1, glasses: 1 }; } else { const big = i % 9 === 0; ex = { frames: 1, mullions: big ? 2 : i % 3, sashes: big ? 3 : 1 + (i % 3), glasses: big ? 4 : 1 + (i % 3), sprossen: i % 7 === 0 ? (big ? 8 : 6) : 0, roller_shutter: i % 5 === 0 }; } const ppo = 3 + (i % 6) + (i % 9 === 0 ? 4 : 0); out.push({ id: "O" + (1001 + i), type, pcs: ppo, ...ex }); pcs += ppo; } return { out, pcs }; }
const seedStations = () => ({
  cut: { workers: 4, machines: 2, crew: 2, shifts: 2, effective: EFF }, weld: { workers: 6, machines: 3, crew: 1, shifts: 2, effective: EFF },
  clean: { workers: 2, machines: 1, crew: 1, shifts: 2, effective: EFF }, fitting: { workers: 4, machines: 0, crew: 1, shifts: 2, effective: EFF },
  sprossen: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: EFF }, shutter: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },
  glaze: { workers: 4, machines: 0, crew: 1, shifts: 2, effective: EFF }, qc: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },
  pack: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF }, manual: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
});
/* floor footprints (metres) in an 80×30 hall, laid out along the flow */
const LABEL = { cut: "Cutting", weld: "Welding", clean: "Corner clean", fitting: "Fittings", sprossen: "Sprossen", shutter: "Shutter", glaze: "Glazing", qc: "QC", pack: "Packing", manual: "Manual" };
const FLOOR = {
  cut: { x: 3, y: 4, w: 11, h: 9 }, weld: { x: 16, y: 3, w: 11, h: 11 }, clean: { x: 29, y: 4, w: 8, h: 9 },
  fitting: { x: 39, y: 3, w: 9, h: 11 }, sprossen: { x: 50, y: 3, w: 6, h: 5 }, glaze: { x: 50, y: 9, w: 9, h: 5 },
  shutter: { x: 61, y: 3, w: 6, h: 5 }, qc: { x: 61, y: 9, w: 6, h: 5 }, pack: { x: 69, y: 4, w: 8, h: 9 },
  manual: { x: 3, y: 17, w: 11, h: 9 },
};

/* ============================================================== *
 * UI
 * ============================================================== */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#161b26", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f4f2ec", CARD = "#fff";
const OK = "#22c55e", WARN = "#f59e0b", HOT = "#ef4444", DEEP = "#991b1b", ACCENT = "#e8590c";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const loadColor = (p) => (p <= 0 ? "#cfd4dc" : p >= 150 ? DEEP : p >= 100 ? HOT : p >= 85 ? WARN : OK);

const SCALE = 11.6, OX = 14, OY = 40;
const mx = (m) => OX + m * SCALE, my = (m) => OY + m * SCALE, ms = (m) => m * SCALE;

export default function FloorLoad() {
  const [book] = useState(seedBook);
  const [stations] = useState(seedStations);
  const plan = useMemo(() => multiDayPlan(book.out, stations, 12), [book, stations]);
  const [day, setDay] = useState(1);
  const [sel, setSel] = useState(plan.binding);

  const dayLoad = (st) => { const s = plan.stations.find((x) => x.station === st); if (!s) return 0; const c = s.perDay.find((p) => p.day === day); return c ? c.load_pct : 0; };
  const selRow = plan.stations.find((s) => s.station === sel);

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "18px 16px 44px", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(22,27,38,0.045) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 14, borderBottom: `2px solid ${INK}`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 3, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>Optimizer · Multi-day load</div>
            <h1 style={{ fontWeight: 900, fontSize: 28, margin: "2px 0 0", letterSpacing: -1 }}>Floor plan · backlog over {plan.maxDays} days</h1>
          </div>
          <div style={{ fontFamily: FM, fontSize: 11, color: MUTED, textAlign: "right" }}>{book.out.length} orders · {book.pcs} pcs<br />binding: {LABEL[plan.binding]} ({plan.stations.find(s => s.station === plan.binding)?.daysToClear} days to clear)</div>
        </div>

        {/* day stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FM, fontSize: 12, fontWeight: 700 }}>DAY {day} / {plan.maxDays}</div>
          <input type="range" min={1} max={plan.maxDays} value={day} onChange={(e) => setDay(+e.target.value)} style={{ flex: 1, minWidth: 160, accentColor: ACCENT }} />
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: plan.maxDays }, (_, i) => i + 1).map((d) => {
              const anyOver = plan.stations.some((s) => { const c = s.perDay.find((p) => p.day === d); return c && c.over; });
              return <button key={d} onClick={() => setDay(d)} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${day === d ? INK : LINE}`, background: day === d ? INK : (anyOver ? hexA(HOT, 0.12) : CARD), color: day === d ? "#fff" : (anyOver ? HOT : INK), fontFamily: FM, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{d}</button>;
            })}
          </div>
        </div>

        {/* floor plan */}
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 8, marginBottom: 14 }}>
          <svg viewBox={`0 0 ${mx(80) + 14} ${my(30) + 16}`} width="100%" style={{ minWidth: 640, fontFamily: FM }}>
            <rect x={mx(0)} y={my(0)} width={ms(80)} height={ms(30)} fill="#fbfaf7" stroke={INK} strokeWidth={2} rx={4} />
            {[1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} x1={mx(i * 10)} y1={my(0)} x2={mx(i * 10)} y2={my(30)} stroke={LINE} />)}
            {[1, 2].map((i) => <line key={i} x1={mx(0)} y1={my(i * 10)} x2={mx(80)} y2={my(i * 10)} stroke={LINE} />)}
            <text x={mx(40)} y={my(30) + 12} textAnchor="middle" fontSize={9} fill={MUTED}>80 m</text>

            {/* flow arrows between stations along the main line */}
            {["cut", "weld", "clean", "fitting", "glaze", "pack"].map((st, i, a) => { if (i === a.length - 1) return null; const a1 = FLOOR[st], b1 = FLOOR[a[i + 1]]; const x1 = mx(a1.x + a1.w), y1 = my(a1.y + a1.h / 2), x2 = mx(b1.x), y2 = my(b1.y + b1.h / 2); return <line key={st} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hexA(INK, 0.2)} strokeWidth={2} strokeDasharray="5 4" />; })}

            {plan.stations.map((s) => {
              const f = FLOOR[s.station]; if (!f) return null;
              const pct = dayLoad(s.station), c = loadColor(pct), isSel = sel === s.station, cleared = pct <= 0;
              return (
                <g key={s.station} onClick={() => setSel(s.station)} style={{ cursor: "pointer" }}>
                  <rect x={mx(f.x)} y={my(f.y)} width={ms(f.w)} height={ms(f.h)} rx={4} fill={hexA(c, cleared ? 0.12 : 0.22)} stroke={isSel ? INK : c} strokeWidth={isSel ? 3 : 2} />
                  {/* fill bar inside box = today's load up to 100% */}
                  <rect x={mx(f.x)} y={my(f.y + f.h) - Math.min(ms(f.h), ms(f.h) * Math.min(1, pct / 100))} width={ms(f.w)} height={Math.min(ms(f.h), ms(f.h) * Math.min(1, pct / 100))} rx={3} fill={hexA(c, 0.25)} />
                  <text x={mx(f.x + f.w / 2)} y={my(f.y) + 14} textAnchor="middle" fontSize={9.5} fontWeight="700" fill={INK}>{LABEL[s.station]}</text>
                  <text x={mx(f.x + f.w / 2)} y={my(f.y + f.h / 2) + 4} textAnchor="middle" fontSize={13} fontWeight="800" fill={c}>{cleared ? "✓" : pct + "%"}</text>
                  {/* days-to-clear badge */}
                  <g>
                    <circle cx={mx(f.x + f.w) - 7} cy={my(f.y) + 7} r={9} fill={s.daysToClear >= day ? c : "#cfd4dc"} stroke="#fff" strokeWidth={1.5} />
                    <text x={mx(f.x + f.w) - 7} y={my(f.y) + 10.5} textAnchor="middle" fontSize={9} fontWeight="800" fill="#fff">{s.daysToClear}d</text>
                  </g>
                </g>
              );
            })}
            <rect x={mx(69)} y={my(17)} width={ms(8)} height={ms(9)} rx={3} fill={hexA(INK, 0.06)} stroke="#475569" strokeWidth={1.6} />
            <text x={mx(73)} y={my(21.5)} textAnchor="middle" fontSize={9} fontWeight="700" fill={INK}>Dock</text>
          </svg>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: FM, fontSize: 10, color: MUTED, padding: "4px 6px 0" }}>
            <Leg c={OK} t="<85%" /><Leg c={WARN} t="85-99%" /><Leg c={HOT} t="100-149%" /><Leg c={DEEP} t="≥150%" /><Leg c={"#cfd4dc"} t="cleared" />
            <span>badge = days to clear · box fill = day {day} load</span>
          </div>
        </div>

        {/* inspector: per-day drain for selected station */}
        {selRow && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderLeft: `5px solid ${loadColor(dayLoad(sel))}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{LABEL[selRow.station]}</div>
              <div style={{ fontFamily: FM, fontSize: 13, color: MUTED }}>{(selRow.totalReq_min / 60).toFixed(0)}h backlog · {(selRow.dayCap_min / 60).toFixed(0)}h/day · <b style={{ color: INK }}>{selRow.daysToClear} days to clear</b></div>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 12, alignItems: "flex-end", height: 80 }}>
              {selRow.perDay.map((p) => (
                <div key={p.day} onClick={() => setDay(p.day)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ fontFamily: FM, fontSize: 9, color: p.over ? HOT : MUTED }}>{p.load_pct}%</div>
                  <div style={{ width: "78%", height: Math.max(3, Math.min(64, p.load_pct / 100 * 40)), background: day === p.day ? INK : loadColor(p.load_pct), borderRadius: 3 }} />
                  <div style={{ fontFamily: FM, fontSize: 9, color: day === p.day ? INK : MUTED, marginTop: 3, fontWeight: day === p.day ? 700 : 400 }}>{p.day}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: FM, fontSize: 10.5, color: MUTED, marginTop: 8 }}>Each day clears one shift-capacity of backlog; the rest carries to the next day. Bars show daily load draining to ✓.</div>
          </div>
        )}

        <div style={{ marginTop: 14, fontFamily: FM, fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Live · {book.pcs} pcs across {plan.maxDays} working days. Step the day to watch the backlog drain across the floor. Mirrors <code>multiday.mjs</code>.
        </div>
      </div>
    </div>
  );
}
function Leg({ c, t }) { return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: c, display: "inline-block" }} />{t}</span>; }
