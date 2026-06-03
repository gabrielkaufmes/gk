import React, { useState, useMemo } from "react";

/* ============================================================== *
 * EMBEDDED ENGINE (mirrors src/engine — kept inline so the mockup
 * runs standalone). Logic is identical to the tested modules.
 * ============================================================== */
const SHIFT_HOURS = 8, EFF = 0.85;
const clampShifts = (n) => Math.max(1, Math.min(3, n || 1));

/* --- Layer 1: work content from geometry --- */
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
  return { frames, mullions, sashes, glasses, sprossen, frameSides: frames * 4, sashSides: sashes * 4, fittingSets: sashes, beads: glasses * 4, corners: frames * 4 + sashes * 4, shutters: d.roller_shutter ? 1 : 0 };
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
function computeElement(d) {
  const c = counts(d), route = routeFor(d), mult = d.type === "door" ? RATES.door.multiplier : 1;
  const workByStation = {};
  route.forEach((st) => (workByStation[st] = +(stMin(st, c) * mult).toFixed(1)));
  return { ...d, route, workByStation, totalMin: +Object.values(workByStation).reduce((a, b) => a + b, 0).toFixed(1) };
}

/* --- Layer 2: capacity (machine-paced) ---
 * A station has `machines` and `crew` (people needed to run ONE machine).
 * - Throughput lanes = machines you can actually staff = min(machines, floor(workers/crew)).
 *   A no-machine station (machines:0) is people-paced: lanes = workers.
 * - Capacity is bounded by BOTH machine-time and labor-time.
 * Adding a worker beyond crew×machines adds NO lanes (can't speed a running machine);
 * dropping below crew reduces usable machines (slows the station). */
function usableMachines(cfg) {
  if (!cfg.machines) return 0;
  return Math.max(0, Math.min(cfg.machines, Math.floor((cfg.workers || 0) / (cfg.crew || 1))));
}
function stationLanesCfg(cfg) {
  if (!cfg.machines) return Math.max(1, cfg.workers || 1);  // people-paced
  return Math.max(0, usableMachines(cfg)) || 0;             // machine-paced (0 = unstaffed → stalled)
}
function stationCapacityMin(cfg) {
  const horizon = clampShifts(cfg.shifts) * SHIFT_HOURS * 60 * (cfg.effective ?? EFF);
  if (!cfg.machines) return +((cfg.workers || 0) * horizon).toFixed(0); // people-paced
  const machineMin = usableMachines(cfg) * horizon;          // machine-paced, staffing-gated
  return +machineMin.toFixed(0);
}
function loadStations(elements, stations) {
  const req = {};
  elements.forEach((el) => el.route.forEach((st) => (req[st] = (req[st] || 0) + (el.workByStation[st] || 0))));
  const rows = Object.keys(stations).map((st) => {
    const cap = stationCapacityMin(stations[st]); const r = +(req[st] || 0).toFixed(0);
    return { station: st, required_min: r, capacity_min: cap, load_pct: cap > 0 ? Math.round((r / cap) * 100) : 0, overbooked: r > cap, over_min: +Math.max(0, r - cap).toFixed(0), workers: stations[st].workers, shifts: clampShifts(stations[st].shifts) };
  }).filter((r) => r.required_min > 0);
  rows.sort((a, b) => b.load_pct - a.load_pct);
  return rows;
}
function oee({ plannedTime, runTime, idealCycleMin, totalCount, goodCount }) {
  const a = plannedTime > 0 ? runTime / plannedTime : 0, p = runTime > 0 ? Math.min(1, (idealCycleMin * totalCount) / runTime) : 0, q = totalCount > 0 ? goodCount / totalCount : 0;
  return { availability: a, performance: p, quality: q, oee: a * p * q };
}

/* --- Layer 3: sequence + what-if --- */
const COST = { overtime_per_h: 38, extra_shift_per_worker: 220, add_worker_per_shift: 180, extra_machine: 1200, extra_truck: 450, subcontract_per_min: 1.4, late_penalty_per_h: 25 };
function sequence(elements, stations, station) {
  const cfg = stations[station] || { workers: 1, shifts: 1, effective: EFF };
  const parallel = Math.max(1, stationLanesCfg(cfg));
  const queue = elements.filter((el) => (el.workByStation[station] || 0) > 0).map((el) => ({ id: el.id, work: el.workByStation[station], loading_min: (el.loading_in ?? Infinity) * 60 })).sort((a, b) => a.loading_min - b.loading_min);
  const lane = new Array(parallel).fill(0);
  const timeline = queue.map((q) => {
    const li = lane.indexOf(Math.min(...lane)); const start = lane[li]; const end = start + q.work; lane[li] = end;
    const late_min = Math.max(0, end - q.loading_min);
    return { id: q.id, lane: li, start_min: +start.toFixed(0), end_min: +end.toFixed(0), work_min: q.work, loading_min: q.loading_min, late_min: +late_min.toFixed(0), late: late_min > 0 };
  });
  return { station, parallel, makespan_min: Math.max(0, ...lane), lateCount: timeline.filter((t) => t.late).length, timeline };
}
function whatIf(elements, stations, lever, station) {
  const before = sequence(elements, stations, station);
  let els = elements, st = stations, deltaCost = 0, note = "";
  const clone = (name, patch) => ({ ...st, [name]: { ...(st[name] || { workers: 1, shifts: 1, effective: EFF }), ...patch } });
  switch (lever.kind) {
    case "add_shift": {
      const cur = st[station] || {}; const sh = Math.min(3, (cur.shifts || 1) + 1);
      st = clone(station, { shifts: sh });
      deltaCost = COST.extra_shift_per_worker * (cur.workers || 1);
      // a new shift adds a whole horizon of capacity; how much does the backlog use?
      const base = sequence(elements, stations, station);
      const backlogH = Math.max(0, ...base.timeline.map((t) => t.late_min)) / 60;
      const shiftH = SHIFT_HOURS;
      lever._fillPct = Math.round((Math.min(backlogH, shiftH) / shiftH) * 100);
      lever._backlogH = +backlogH.toFixed(1);
      // a 2nd shift moves the whole day's deadlines out by a shift → clears same-day backlog
      els = elements.map((e) => (e.workByStation[station] > 0 && e.loading_in != null) ? { ...e, loading_in: e.loading_in + shiftH } : e);
      note = `${station} → ${sh} shifts`;
      break;
    }
    case "overtime": {
      // Overtime extends the production day at this station by N hours. An order
      // recovers if its lateness ≤ N hours (the extra running time covers it).
      // SOLVE for the minimum N that clears the backlog (rounded up to 0.5h, capped).
      const cur = st[station] || {};
      const base = sequence(elements, stations, station);
      const maxLateH = Math.max(0, ...base.timeline.map((t) => t.late_min)) / 60;
      const CAP_OT_H = 4; // realistic ceiling on a shift's overtime
      const neededH = Math.min(CAP_OT_H, Math.ceil(maxLateH * 2) / 2);
      lever._solvedH = neededH;
      lever._fullClear = maxLateH <= CAP_OT_H;
      // recover orders whose lateness ≤ neededH: model by extending their deadline by neededH
      els = elements.map((e) => (e.workByStation[station] > 0 && e.loading_in != null)
        ? { ...e, loading_in: e.loading_in + neededH } : e);
      deltaCost = +(neededH * COST.overtime_per_h * (cur.workers || 1)).toFixed(0);
      note = neededH > 0 ? `+${neededH}h overtime at ${station}` + (lever._fullClear ? " (clears backlog)" : " (max — partial)") : "no overtime needed";
      break;
    }
    default: note = "no-op";
  }
  const after = sequence(els, st, station);
  const lateB = new Set(before.timeline.filter((t) => t.late).map((t) => t.id)), lateA = new Set(after.timeline.filter((t) => t.late).map((t) => t.id));
  const saved = [...lateB].filter((id) => !lateA.has(id)), slipped = [...lateA].filter((id) => !lateB.has(id));
  const lpB = before.timeline.reduce((a, t) => a + t.late_min, 0), lpA = after.timeline.reduce((a, t) => a + t.late_min, 0);
  const penalty = +(((lpA - lpB) / 60) * COST.late_penalty_per_h).toFixed(0); const net = deltaCost + penalty;
  const shiftNote = lever._fillPct != null ? (lever._fillPct < 50 ? ` · only ${lever._fillPct}% of the new shift used — open it only if there's other work to fill it` : ` · fills ${lever._fillPct}% of the new shift`) : "";
  return { note, before, after, saved, slipped, deltaCost, penalty, net, solvedH: lever._solvedH, fullClear: lever._fullClear, fillPct: lever._fillPct, shiftNote, verdict: saved.length && net <= 0 ? "do it — saves time & money" : saved.length ? `recovers ${saved.length} for €${net}${shiftNote}` : slipped.length ? "makes it worse" : "no change" };
}

/* ============================================================== *
 * SAMPLE SHOP: a day's order book + station config (editable)
 * ============================================================== */
const TYPES = { window: "Window", door: "Door", special_hst: "HST/special" };
const seedOrders = () => {
  const out = [];
  const add = (id, dest, type, o) => out.push(computeElement({ id, dest, type, frames: 1, mullions: 1, sashes: 2, glasses: 2, sprossen: 0, roller_shutter: false, components: [], stage_index: 0, ...o }));
  const dests = ["Lyon", "Paris", "Marseille"];
  for (let i = 0; i < 18; i++) add("W" + (101 + i), dests[i % 3], "window", { loading_in: 1.2 + i * 0.45, mullions: (i % 3), sashes: 1 + (i % 3), glasses: 1 + (i % 3) });
  add("BAY1", "Paris", "window", { loading_in: 3, mullions: 2, sashes: 3, glasses: 4, sprossen: 8, roller_shutter: true });
  add("BAY2", "Lyon", "window", { loading_in: 4.5, mullions: 2, sashes: 3, glasses: 4, sprossen: 6 });
  add("DOOR1", "Marseille", "door", { loading_in: 2, sashes: 1, glasses: 1 });
  add("HST1", "Lyon", "special_hst", { loading_in: 5, sashes: 2, glasses: 2, roller_shutter: true });
  return out;
};
const STATION_LABELS = { cut: "Cutting", weld: "Welding", clean: "Corner clean", fitting: "Fittings", sprossen: "Sprossen", shutter: "Shutter", glaze: "Glazing", qc: "QC", pack: "Packing", manual: "Manual" };
const seedStations = () => ({
  cut: { workers: 2, machines: 1, crew: 2, shifts: 1, effective: EFF },      // Schirmer: 1 machine, 2 crew (load/unload)
  weld: { workers: 3, machines: 3, crew: 1, shifts: 1, effective: EFF },     // 3 welders, 1 each
  clean: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: EFF },
  fitting: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },  // bench work, people-paced
  sprossen: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: EFF },
  shutter: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
  glaze: { workers: 2, machines: 0, crew: 1, shifts: 1, effective: EFF },    // glazing benches
  qc: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
  pack: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
  manual: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: EFF },
});

/* ============================================================== *
 * UI tokens
 * ============================================================== */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#161b26", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f4f2ec", CARD = "#fff";
const OK = "#22c55e", WARN = "#f59e0b", HOT = "#ef4444", BLUE = "#2563eb", ACCENT = "#e8590c";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const loadColor = (p) => (p >= 100 ? HOT : p >= 85 ? WARN : OK);

export default function Cockpit() {
  const [orders, setOrders] = useState(seedOrders);
  const [stations, setStations] = useState(seedStations);
  const [pinned, setPinned] = useState(null);      // manually selected station
  const [lever, setLever] = useState(null);        // applied what-if preview

  const load = useMemo(() => loadStations(orders, stations), [orders, stations]);
  const binding = pinned || (load[0] && load[0].station);
  const bindingRow = load.find((r) => r.station === binding);
  const seq = useMemo(() => (binding ? sequence(orders, stations, binding) : null), [orders, stations, binding]);
  const oeeVal = useMemo(() => oee({ plannedTime: 480, runTime: 408, idealCycleMin: 6.5, totalCount: 44, goodCount: 42 }), []);

  const preview = useMemo(() => (binding && lever ? whatIf(orders, stations, lever, binding) : null), [orders, stations, binding, lever]);

  const applyLever = (kind) => setLever({ kind });
  const commit = () => {
    if (!preview || !lever || !binding) return;
    const h = lever.kind === "overtime" ? (preview.solvedH || 0) : (lever.kind === "add_shift" ? SHIFT_HOURS : 0);
    if (h <= 0) { setLever(null); return; }
    // Apply EXACTLY what the preview showed: extend the affected orders' deadlines
    // by the overtime/shift window at the binding station. (Same transform as whatIf.)
    setOrders((os) => os.map((e) => (e.workByStation[binding] > 0 && e.loading_in != null)
      ? { ...e, loading_in: e.loading_in + h } : e));
    if (lever.kind === "add_shift") setStations((st) => ({ ...st, [binding]: { ...(st[binding] || {}), shifts: Math.min(3, (st[binding]?.shifts || 1) + 1) } }));
    setLever(null);
  };

  const totalLate = seq ? seq.lateCount : 0;
  const totalPeople = Object.values(stations).reduce((a, s) => a + s.workers, 0);
  const maxLane = seq ? Math.max(seq.makespan_min, ...(seq.timeline.map((t) => t.loading_min).filter((x) => isFinite(x))), 1) : 1;

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "20px 18px 48px", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(22,27,38,0.045) 1px, transparent 0)", backgroundSize: "20px 20px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16, borderBottom: `2px solid ${INK}`, paddingBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 3, color: ACCENT, textTransform: "uppercase", fontWeight: 700 }}>Optimizer · Live</div>
            <h1 style={{ fontWeight: 900, fontSize: 32, margin: "2px 0 0", letterSpacing: -1 }}>Production cockpit</h1>
          </div>
          <div style={{ fontFamily: FM, fontSize: 11, color: MUTED, textAlign: "right" }}>
            {orders.length} orders · {totalPeople} people on shift<br />engine: line → capacity → sequence → what-if
          </div>
        </div>

        {/* KPI ribbon */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Kpi label="Bottleneck" value={STATION_LABELS[binding] || "—"} sub={bindingRow ? `${bindingRow.load_pct}% load` : ""} accent={bindingRow ? loadColor(bindingRow.load_pct) : MUTED} big />
          <Kpi label="Late at binding" value={totalLate} sub={totalLate ? "orders miss slot" : "all fit"} accent={totalLate ? HOT : OK} />
          <Kpi label="Overbooked stns" value={load.filter((r) => r.overbooked).length} sub="need capacity" accent={load.some((r) => r.overbooked) ? WARN : OK} />
          <Kpi label={`OEE · ${STATION_LABELS[binding] || ""}`} value={`${Math.round(oeeVal.oee * 100)}%`} sub={`A${Math.round(oeeVal.availability * 100)} P${Math.round(oeeVal.performance * 100)} Q${Math.round(oeeVal.quality * 100)}`} accent={oeeVal.oee < 0.6 ? HOT : oeeVal.oee < 0.75 ? WARN : OK} />
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* LEFT: station load (click to pin binding) */}
          <div style={{ flex: "1 1 300px", minWidth: 280 }}>
            <SectionTitle>Station load · click to inspect</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {load.map((r) => {
                const c = loadColor(r.load_pct), isBind = r.station === binding;
                return (
                  <button key={r.station} onClick={() => setPinned(r.station === pinned ? null : r.station)} style={{ textAlign: "left", background: CARD, border: `1px solid ${isBind ? INK : LINE}`, borderLeft: `5px solid ${c}`, borderRadius: 9, padding: "9px 11px", cursor: "pointer", boxShadow: isBind ? `0 2px 0 ${INK}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{STATION_LABELS[r.station]}{isBind && <span style={{ fontFamily: FM, fontSize: 9, color: HOT, marginLeft: 6 }}>◆ BINDING</span>}</span>
                      <span style={{ fontFamily: FM, fontSize: 11, color: MUTED }}>{r.workers}P×{r.shifts}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 7, background: "#eceef2", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.min(100, r.load_pct)}%`, height: "100%", background: c }} /></div>
                      <span style={{ fontFamily: FM, fontSize: 11, width: 96, textAlign: "right", color: r.overbooked ? HOT : MUTED }}>{Math.round(r.required_min / 60 * 10) / 10}/{Math.round(r.capacity_min / 60 * 10) / 10}h · {r.load_pct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER: Gantt of the binding station */}
          <div style={{ flex: "1 1 420px", minWidth: 300 }}>
            <SectionTitle>{STATION_LABELS[binding]} schedule · earliest-deadline-first</SectionTitle>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 12 }}>
              {seq && seq.timeline.length ? (
                <>
                  <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
                    {seq.timeline.map((t) => {
                      const left = (t.start_min / maxLane) * 100, w = Math.max(2, ((t.end_min - t.start_min) / maxLane) * 100);
                      const dl = isFinite(t.loading_min) ? (t.loading_min / maxLane) * 100 : null;
                      return (
                        <div key={t.id} style={{ position: "relative", height: 22 }}>
                          <div style={{ position: "absolute", left: `${left}%`, width: `${w}%`, top: 2, height: 18, background: t.late ? hexA(HOT, 0.85) : hexA(BLUE, 0.8), borderRadius: 3, display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden" }}>
                            <span style={{ fontFamily: FM, fontSize: 9.5, color: "#fff", whiteSpace: "nowrap" }}>{t.id}</span>
                          </div>
                          {dl != null && <div title="deadline" style={{ position: "absolute", left: `${dl}%`, top: 0, height: 22, width: 2, background: INK }} />}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: FM, fontSize: 10, color: MUTED }}>
                    <span>0h</span><span>│ = deadline · red = late</span><span>{(maxLane / 60).toFixed(1)}h</span>
                  </div>
                </>
              ) : <div style={{ color: MUTED, fontSize: 13 }}>No work at this station.</div>}
            </div>

            {/* What-if levers */}
            <SectionTitle style={{ marginTop: 16 }}>What-if · {STATION_LABELS[binding]}</SectionTitle>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {[["overtime", "Overtime (solve h)"], ["add_shift", "+ Shift"]].map(([k, l]) => (
                <button key={k} onClick={() => applyLever(k)} style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, padding: "9px 13px", borderRadius: 8, border: `1px solid ${lever?.kind === k ? INK : LINE}`, background: lever?.kind === k ? INK : CARD, color: lever?.kind === k ? "#fff" : INK, cursor: "pointer" }}>{l}</button>
              ))}
              {lever && <button onClick={() => setLever(null)} style={{ fontFamily: FM, fontSize: 12, padding: "9px 11px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", color: MUTED, cursor: "pointer" }}>clear</button>}
            </div>
            <div style={{ fontFamily: FM, fontSize: 10, color: MUTED, marginBottom: 10 }}>Both use the crew you have. Overtime tells you the hours needed. A 2nd shift also clears it — but only worth opening if there's enough other work to fill it.</div>
            {preview && (
              <div style={{ background: CARD, border: `1px solid ${preview.net <= 0 ? OK : LINE}`, borderLeft: `5px solid ${preview.saved.length ? (preview.net <= 0 ? OK : WARN) : MUTED}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{preview.note}</div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: FM, fontSize: 12.5, marginBottom: 6 }}>
                  <span>late <b>{preview.before.lateCount}→{preview.after.lateCount}</b></span>
                  <span style={{ color: OK }}>saved {preview.saved.length ? preview.saved.join(", ") : "—"}</span>
                  {preview.slipped.length > 0 && <span style={{ color: HOT }}>slipped {preview.slipped.join(", ")}</span>}
                </div>
                <div style={{ fontFamily: FM, fontSize: 12, color: MUTED }}>cost €{preview.deltaCost} + late€{preview.penalty} = <b style={{ color: preview.net <= 0 ? OK : INK }}>net €{preview.net}</b></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: preview.net <= 0 ? OK : WARN, flex: 1 }}>→ {preview.verdict}</span>
                  {(lever.kind === "add_shift" || lever.kind === "overtime") && preview.saved.length > 0 &&
                    <button onClick={commit} style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", cursor: "pointer" }}>Apply ✓</button>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, fontFamily: FM, fontSize: 10.5, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          Live mockup · every number recomputes from the embedded engine. Apply a lever to change the line and watch the bottleneck shift. Mirrors the tested <code>src/engine</code> modules.
        </div>
      </div>
    </div>
  );
}

/* ---- small UI atoms ---- */
function Kpi({ label, value, sub, accent, big }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "13px 15px", flex: big ? "1 1 200px" : "1 1 140px", minWidth: big ? 180 : 130, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ fontFamily: FD, fontWeight: 800, fontSize: big ? 26 : 24, lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function SectionTitle({ children, style }) {
  return <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1.5, color: INK, textTransform: "uppercase", fontWeight: 700, marginBottom: 9, ...style }}>{children}</div>;
}
