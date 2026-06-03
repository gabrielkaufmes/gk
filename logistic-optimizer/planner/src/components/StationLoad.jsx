import React, { useState, useMemo } from "react";

/* ============================================================== *
 * EMBEDDED ENGINE (mirrors src/engine — runs standalone)
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
function routeFor(d) {
  const base = (ROUTES[d.type] || ROUTES.window).slice();
  if (d.sprossen > 0) base.splice(base.indexOf("glaze"), 0, "sprossen");
  if (d.roller_shutter) base.splice(base.indexOf("qc"), 0, "shutter");
  return base;
}
function counts(d) {
  const frames = d.frames || 0, mullions = d.mullions || 0, sashes = d.sashes || 0, glasses = d.glasses || 0, sprossen = d.sprossen || 0;
  return { frameSides: frames * 4, sashSides: sashes * 4, fittingSets: sashes, beads: glasses * 4, corners: frames * 4 + sashes * 4, shutters: d.roller_shutter ? 1 : 0, mullions, glasses, sprossen };
}
function stMin(st, c) {
  const r = RATES[st] || {};
  switch (st) {
    case "cut": return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide + c.beads * r.perBead;
    case "weld": return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide;
    case "clean": return c.corners * r.perCorner;
    case "fitting": return c.fittingSets * r.perSashSet;
    case "sprossen": return c.sprossen * r.perSprosse;
    case "shutter": return c.shutters * r.perShutter;
    case "glaze": return c.beads * r.perBead + c.glasses * r.perGlass;
    case "qc": case "pack": return r.perElement || 0;
    case "manual": return RATES.special.perElementManual;
    default: return 0;
  }
}
function workOf(d) {
  const c = counts(d), route = routeFor(d), mult = d.type === "door" ? RATES.door.multiplier : 1;
  const w = {}; route.forEach((st) => (w[st] = +(stMin(st, c) * mult * (d.pcs || 1)).toFixed(1)));
  return { route, w };
}
function usableMachines(cfg) { if (!cfg.machines) return 0; return Math.max(0, Math.min(cfg.machines, Math.floor((cfg.workers || 0) / (cfg.crew || 1)))); }
function capMin(cfg) {
  const horizon = clampShifts(cfg.shifts) * SHIFT_HOURS * 60 * (cfg.effective ?? EFF);
  if (!cfg.machines) return (cfg.workers || 0) * horizon;
  return usableMachines(cfg) * horizon;
}

/* ============================================================== *
 * SEED: 200 orders, ~1188 pcs (deterministic, realistic mix)
 * ============================================================== */
const DESTS = ["Lyon", "Paris", "Marseille", "Nice", "Lille", "Reims"];
function seedBook() {
  const out = []; let pcs = 0;
  for (let i = 0; i < 200; i++) {
    const r = (i * 37) % 100; let type = "window", extra = {};
    if (r < 6) { type = "special_hst"; extra = { sashes: 2, glasses: 2, roller_shutter: i % 2 === 0 }; }
    else if (r < 16) { type = "door"; extra = { frames: 1, sashes: 1, glasses: 1 }; }
    else { const big = i % 9 === 0; extra = { frames: 1, mullions: big ? 2 : i % 3, sashes: big ? 3 : 1 + (i % 3), glasses: big ? 4 : 1 + (i % 3), sprossen: i % 7 === 0 ? (big ? 8 : 6) : 0, roller_shutter: i % 5 === 0 }; }
    const ppo = 3 + (i % 6) + (i % 9 === 0 ? 4 : 0);
    out.push({ id: "O" + (1001 + i), dest: DESTS[i % DESTS.length], type, pcs: ppo, ...extra }); pcs += ppo;
  }
  return { out, pcs };
}
const STATION_LABELS = { cut: "Cutting (Schirmer)", weld: "Welding", clean: "Corner cleaning", fitting: "Fittings", sprossen: "Sprossen", shutter: "Shutter mount", glaze: "Glazing", qc: "QC", pack: "Packing", manual: "Manual / specials" };
const seedStations = () => ({
  cut: { workers: 4, machines: 2, crew: 2, shifts: 2, effective: EFF },
  weld: { workers: 6, machines: 3, crew: 1, shifts: 2, effective: EFF },
  clean: { workers: 2, machines: 1, crew: 1, shifts: 2, effective: EFF },
  fitting: { workers: 4, machines: 0, crew: 1, shifts: 2, effective: EFF },
  sprossen: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: EFF },
  shutter: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },
  glaze: { workers: 4, machines: 0, crew: 1, shifts: 2, effective: EFF },
  qc: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },
  pack: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },
  manual: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
});

/* ============================================================== *
 * UI tokens — industrial, consistent with the cockpit
 * ============================================================== */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#161b26", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f4f2ec", CARD = "#fff";
const OK = "#22c55e", WARN = "#f59e0b", HOT = "#ef4444", DEEP = "#b91c1c", BLUE = "#2563eb", ACCENT = "#e8590c";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const loadColor = (p) => (p >= 150 ? DEEP : p >= 100 ? HOT : p >= 85 ? WARN : OK);

export default function StationLoad() {
  const [book] = useState(seedBook);
  const [stations, setStations] = useState(seedStations);
  const [sel, setSel] = useState("clean");

  const rows = useMemo(() => {
    const req = {};
    book.out.forEach((o) => { const { route, w } = workOf(o); route.forEach((st) => (req[st] = (req[st] || 0) + w[st])); });
    const list = Object.keys(stations).map((st) => {
      const cap = capMin(stations[st]); const required = +(req[st] || 0).toFixed(0);
      const cfg = stations[st];
      return {
        station: st, required_min: required, capacity_min: +cap.toFixed(0),
        load_pct: cap > 0 ? Math.round((required / cap) * 100) : 0,
        over_h: Math.max(0, (required - cap) / 60),
        lanes: cfg.machines ? usableMachines(cfg) : cfg.workers,
        workers: cfg.workers, machines: cfg.machines, shifts: clampShifts(cfg.shifts),
      };
    }).filter((r) => r.required_min > 0);
    list.sort((a, b) => b.load_pct - a.load_pct);
    return list;
  }, [book, stations]);

  const binding = rows[0];
  const overCount = rows.filter((r) => r.load_pct > 100).length;
  const totalReqH = rows.reduce((a, r) => a + r.required_min, 0) / 60;
  const totalCapH = rows.reduce((a, r) => a + r.capacity_min, 0) / 60;
  const selRow = rows.find((r) => r.station === sel) || binding;
  const maxPct = Math.max(...rows.map((r) => r.load_pct), 100);

  const bump = (st, key, d, min = 0, max = 9) => setStations((s) => ({ ...s, [st]: { ...s[st], [key]: Math.max(min, Math.min(max, (s[st][key] || 0) + d)) } }));

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "20px 18px 48px", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(22,27,38,0.045) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16, borderBottom: `2px solid ${INK}`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 3, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>Optimizer · Capacity</div>
            <h1 style={{ fontWeight: 900, fontSize: 30, margin: "2px 0 0", letterSpacing: -1 }}>Station loading</h1>
          </div>
          <div style={{ fontFamily: FM, fontSize: 11, color: MUTED, textAlign: "right" }}>
            {book.out.length} orders · {book.pcs} pcs<br />today's order book vs station capacity
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <Kpi label="Bottleneck" value={STATION_LABELS[binding.station]} sub={`${binding.load_pct}% · over by ${binding.over_h.toFixed(0)}h`} accent={loadColor(binding.load_pct)} big />
          <Kpi label="Stations over capacity" value={`${overCount} / ${rows.length}`} sub="need relief today" accent={overCount ? HOT : OK} />
          <Kpi label="Total work demand" value={`${totalReqH.toFixed(0)}h`} sub={`vs ${totalCapH.toFixed(0)}h capacity`} accent={INK} />
          <Kpi label="Plant load" value={`${Math.round(totalReqH / totalCapH * 100)}%`} sub="all stations combined" accent={loadColor(Math.round(totalReqH / totalCapH * 100))} />
        </div>

        {/* load board */}
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 16px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>Load by station · click to inspect</div>
            <div style={{ fontFamily: FM, fontSize: 10, color: MUTED }}>bar = % of shift capacity · │ = 100%</div>
          </div>
          {rows.map((r) => {
            const c = loadColor(r.load_pct), isSel = sel === r.station, isBind = binding.station === r.station;
            const barW = Math.min(100, (r.load_pct / maxPct) * 100);
            const hundred = (100 / maxPct) * 100;
            return (
              <div key={r.station} onClick={() => setSel(r.station)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 8, cursor: "pointer", background: isSel ? hexA(INK, 0.04) : "transparent" }}>
                <div style={{ width: 130, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5 }}>{STATION_LABELS[r.station]}{isBind && <span style={{ color: HOT, fontFamily: FM, fontSize: 9 }}>◆</span>}</div>
                  <div style={{ fontFamily: FM, fontSize: 9.5, color: MUTED }}>{r.machines ? `${r.lanes} mach` : `${r.workers}P`} · {r.shifts}sh</div>
                </div>
                <div style={{ flex: 1, position: "relative", height: 26, background: "#eceef2", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${barW}%`, height: "100%", background: c, borderRadius: 5, transition: "width .2s" }} />
                  <div style={{ position: "absolute", left: `${hundred}%`, top: 0, bottom: 0, width: 2, background: INK }} />
                  <div style={{ position: "absolute", left: 8, top: 0, bottom: 0, display: "flex", alignItems: "center", fontFamily: FM, fontSize: 11, fontWeight: 700, color: barW > 30 ? "#fff" : INK }}>{r.load_pct}%</div>
                </div>
                <div style={{ width: 92, flexShrink: 0, textAlign: "right", fontFamily: FM, fontSize: 10.5, color: MUTED }}>{(r.required_min / 60).toFixed(0)}h / {(r.capacity_min / 60).toFixed(0)}h</div>
              </div>
            );
          })}
        </div>

        {/* inspector */}
        {selRow && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderLeft: `5px solid ${loadColor(selRow.load_pct)}`, borderRadius: 12, padding: "14px 16px", marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{STATION_LABELS[selRow.station]}</div>
              <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 700, color: loadColor(selRow.load_pct) }}>{selRow.load_pct}% load{selRow.over_h > 0 ? ` · over by ${selRow.over_h.toFixed(1)}h` : " · within capacity"}</div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontFamily: FM, fontSize: 12.5, color: MUTED, marginTop: 8 }}>
              <span>demand <b style={{ color: INK }}>{(selRow.required_min / 60).toFixed(1)}h</b></span>
              <span>capacity <b style={{ color: INK }}>{(selRow.capacity_min / 60).toFixed(1)}h</b></span>
              <span>{selRow.machines ? `machines ${selRow.machines} (${selRow.lanes} staffable)` : `workers ${selRow.workers}`}</span>
              <span>shifts {selRow.shifts}</span>
            </div>
            {/* quick levers to watch the bar move */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <span style={{ fontFamily: FM, fontSize: 10, color: MUTED, textTransform: "uppercase" }}>adjust:</span>
              {selRow.machines > 0 && <Lever label={`machines ${stations[selRow.station].machines}`} onMinus={() => bump(selRow.station, "machines", -1, 0, 6)} onPlus={() => bump(selRow.station, "machines", 1, 0, 6)} />}
              <Lever label={`workers ${stations[selRow.station].workers}`} onMinus={() => bump(selRow.station, "workers", -1, 0, 12)} onPlus={() => bump(selRow.station, "workers", 1, 0, 12)} />
              <Lever label={`shifts ${stations[selRow.station].shifts}`} onMinus={() => bump(selRow.station, "shifts", -1, 1, 3)} onPlus={() => bump(selRow.station, "shifts", 1, 1, 3)} />
            </div>
            <div style={{ fontFamily: FM, fontSize: 10, color: MUTED, marginTop: 8 }}>
              {selRow.machines > 0 ? "Machine-paced: capacity = staffable machines × shift hours. Workers only help up to crew × machines." : "People-paced: capacity = workers × shift hours."}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, fontFamily: FM, fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Live · {book.out.length} orders / {book.pcs} pcs run through the embedded engine. Adjust a station's machines/workers/shifts and watch its load recompute. Mirrors <code>capacity.mjs</code>.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, big }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "13px 15px", flex: big ? "1 1 220px" : "1 1 150px", minWidth: big ? 200 : 140, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ fontFamily: FD, fontWeight: 800, fontSize: big ? 22 : 24, lineHeight: 1.15, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Lever({ label, onMinus, onPlus }) {
  const btn = { width: 26, height: 26, border: `1px solid ${LINE}`, background: PAPER, borderRadius: 6, cursor: "pointer", fontFamily: FM, fontWeight: 700, fontSize: 14, color: INK };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${LINE}`, borderRadius: 8, padding: "3px 6px" }}>
      <button onClick={onMinus} style={btn}>−</button>
      <span style={{ fontFamily: FM, fontSize: 11, minWidth: 78, textAlign: "center" }}>{label}</span>
      <button onClick={onPlus} style={btn}>+</button>
    </span>
  );
}
