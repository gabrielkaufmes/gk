import React, { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";

/* ---------------- tokens ---------------- */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#1c2230", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f6f5f1", CARD = "#fff";
const GREEN = "#22c55e", BLUE = "#2563eb", RED = "#ef4444", ORANGE = "#f59e0b";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- geometry ---------------- */
const SCALE = 12.6, OX = 16, OY = 64, HALL_D = 30;
const my = (m) => OY + m * SCALE, ms = (m) => m * SCALE;

/* ---------------- seed: the 10-zone PVC reference ---------------- */
const ZSEED = [
  { id: "z1", label: "1 · Profile Warehouse", color: "#c2ad7e", w: 8 },
  { id: "z2", label: "2 · Schirmer Cutting", color: "#94a3b8", w: 10 },
  { id: "z3", label: "3 · Reinforcement Prep", color: "#60a5fa", w: 5 },
  { id: "z4", label: "4 · 3× Welding (Fimtec)", color: "#4ade80", w: 15 },
  { id: "z5", label: "5 · Corner Cleaning", color: "#7dd3fc", w: 6 },
  { id: "z6", label: "6 · Hardware Assembly", color: "#fbbf24", w: 8 },
  { id: "z7", label: "7 · Glazing Station", color: "#cbd5e1", w: 9 },
  { id: "z8", label: "8 · QC & Repair", color: "#c4b5fd", w: 6 },
  { id: "z9", label: "9 · Packing", color: "#fde047", w: 5 },
  { id: "z10", label: "10 · Expedition & Loading", color: "#9ca3af", w: 8 },
];
/* objects are zone-relative: zone index + rx (m from zone start) + y */
const OSEED = [
  { id: "rack1", zone: 0, kind: "rack", color: "#c2ad7e", label: "Profile rack", rx: 0.6, y: 2.5, w: 2.6, h: 11 },
  { id: "rack2", zone: 0, kind: "rack", color: "#c2ad7e", label: "Profile rack", rx: 0.6, y: 16, w: 2.6, h: 11 },
  { id: "fork1", zone: 0, kind: "fork", color: ORANGE, label: "Forklift", rx: 4.6, y: 23, w: 2.4, h: 4 },
  { id: "cut", zone: 1, kind: "machine", color: "#64748b", label: "Schirmer C&M", type: "Cutting center", rx: 1, y: 10, w: 8, h: 9, workers: 1 },
  { id: "rein1", zone: 2, kind: "machine", color: "#3b82f6", label: "Reinf. bench", type: "Reinforcement", rx: 0.8, y: 5, w: 3.2, h: 5, workers: 1 },
  { id: "rein2", zone: 2, kind: "machine", color: "#3b82f6", label: "Reinf. bench", type: "Reinforcement", rx: 0.8, y: 18, w: 3.2, h: 5 },
  ...[4, 13, 22].map((y, i) => ({ id: "weld" + i, zone: 3, kind: "machine", color: "#22c55e", label: "Welding line " + (i + 1), type: "Welding line", rx: 3, y, w: 9, h: 6, workers: 1 })),
  ...[4, 13, 22].map((y, i) => ({ id: "clean" + i, zone: 4, kind: "machine", color: "#0ea5e9", label: "Corner cleaner", type: "Corner cleaner", rx: 1, y, w: 4, h: 6 })),
  ...[[0.8, 4], [4.4, 4], [0.8, 13], [4.4, 13], [0.8, 22], [4.4, 22]].map(([rx, y], i) => ({ id: "hw" + i, zone: 5, kind: "machine", color: "#f59e0b", label: "HW station", type: "Hardware station", rx, y, w: 3.2, h: 6, workers: i % 2 ? 0 : 1 })),
  { id: "glz1", zone: 6, kind: "machine", color: "#94a3b8", label: "Glazing table", type: "Glazing table", rx: 1, y: 4, w: 6, h: 7, workers: 1 },
  { id: "glz2", zone: 6, kind: "machine", color: "#94a3b8", label: "Glazing table", type: "Glazing table", rx: 1, y: 18, w: 6, h: 7, workers: 1 },
  { id: "glass", zone: 6, kind: "rack", color: "#2563eb", label: "Glass racks", rx: 7.4, y: 8, w: 1.2, h: 14 },
  { id: "qc1", zone: 7, kind: "machine", color: "#8b5cf6", label: "QC / repair", type: "QC/Repair", rx: 1, y: 7, w: 4, h: 6, workers: 1 },
  { id: "qc2", zone: 7, kind: "machine", color: "#8b5cf6", label: "QC / repair", type: "QC/Repair", rx: 1, y: 18, w: 4, h: 6 },
  { id: "pk1", zone: 8, kind: "machine", color: "#eab308", label: "Packing", type: "Packing table", rx: 0.7, y: 6, w: 3.4, h: 6, workers: 1 },
  { id: "pk2", zone: 8, kind: "machine", color: "#eab308", label: "Packing", type: "Packing table", rx: 0.7, y: 17, w: 3.4, h: 6 },
  { id: "dock", zone: 9, kind: "dock", color: "#475569", label: "Loading dock", rx: 4, y: 2, w: 4, h: 26 },
  { id: "stl", zone: 9, kind: "stillage", color: GREEN, label: "Finished goods", rx: 0.5, y: 11, w: 3, h: 8 },
];

/* ---------------- production + historic data (sample) ---------------- */
const SHIFT_TARGET = 200, SHIFT_HOURS = 8;
const HOURS_ELAPSED = 5;                          // into the current shift
const TODAY_HOURLY = [26, 28, 24, 31, 27];        // pieces completed per elapsed hour
const HISTORIC = [                                 // recent shifts
  { day: "Mon", total: 196, pace: 24.5 }, { day: "Tue", total: 188, pace: 23.5 },
  { day: "Wed", total: 205, pace: 25.6 }, { day: "Thu", total: 192, pace: 24.0 },
  { day: "Fri", total: 210, pace: 26.3 }, { day: "Mon ", total: 198, pace: 24.8 },
  { day: "Tue ", total: 201, pace: 25.1 },
];
const OUTPUT_TODAY = TODAY_HOURLY.reduce((a, b) => a + b, 0);
const PACE_NOW = TODAY_HOURLY[TODAY_HOURLY.length - 1];           // last hour
const PACE_AVG_TODAY = +(OUTPUT_TODAY / HOURS_ELAPSED).toFixed(1);
const PACE_HIST = +(HISTORIC.reduce((a, d) => a + d.pace, 0) / HISTORIC.length).toFixed(1);
const PROJECTED = Math.round(PACE_AVG_TODAY * SHIFT_HOURS);
const PACE_DELTA = +(PACE_AVG_TODAY - PACE_HIST).toFixed(1);
const METRIC_OPTS = [{ id: "output_today", label: "Output today" }, { id: "this_shift", label: "This shift" }, { id: "pace_now", label: "Pace / hour" }, { id: "avg_pace_today", label: "Avg pace/h today" }, { id: "historic_pace", label: "Historic avg/h" }, { id: "vs_historic", label: "vs historic" }, { id: "projected", label: "Projected shift" }, { id: "shift_pct", label: "Shift complete %" }, { id: "workers", label: "Workers on floor" }, { id: "target", label: "Shift target" }];

/* ---------------- worker glyph ---------------- */
const Worker = ({ cx, cy }) => (<g><circle cx={cx} cy={cy - 3.2} r={2.4} fill={INK} stroke="#fff" strokeWidth={0.7} /><path d={`M${cx - 2.8},${cy + 3.2} Q${cx},${cy - 0.6} ${cx + 2.8},${cy + 3.2} Z`} fill={INK} stroke="#fff" strokeWidth={0.7} /></g>);

export default function LayoutModeler() {
  const [zones, setZones] = useState(ZSEED);
  const [objs, setObjs] = useState(OSEED);
  const [sel, setSel] = useState({ t: "zone", id: "z4" });
  const [mode, setMode] = useState("edit");
  const [tab, setTab] = useState("layout");
  const [target, setTarget] = useState(SHIFT_TARGET);
  const [boxes, setBoxes] = useState(["output_today", "this_shift", "pace_now", "avg_pace_today", "projected"]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapOn, setSnap] = useState(true);
  const [json, setJson] = useState("");
  const [t, setT] = useState(0);
  const svgRef = useRef(null), drag = useRef(null), raf = useRef();
  const scrollRef = useRef(null), pan = useRef(null);

  const snap = (v) => (snapOn ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10);
  const starts = useMemo(() => { const s = []; let acc = 0; zones.forEach((z) => { s.push(acc); acc += z.w; }); return s; }, [zones]);
  const HALL_W = useMemo(() => zones.reduce((a, z) => a + z.w, 0), [zones]);
  const mx = (m) => OX + m * SCALE;
  const zoneOf = (absX) => { let i = 0; for (let k = 0; k < zones.length; k++) if (absX >= starts[k]) i = k; return i; };
  const absX = (o) => starts[o.zone] + o.rx;

  useEffect(() => { if (mode !== "live") return; const loop = (ts) => { setT(ts / 1000); raf.current = requestAnimationFrame(loop); }; raf.current = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf.current); }, [mode]);

  const toMeter = (e) => { const svg = svgRef.current, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const sp = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: (sp.x - OX) / SCALE, y: (sp.y - OY) / SCALE }; };

  const onObjDown = (e, o, m) => { setSel({ t: "obj", id: o.id }); if (mode !== "edit") return; e.stopPropagation(); const p = toMeter(e); drag.current = { id: o.id, mode: m, gx: p.x - absX(o), gy: p.y - o.y, sMX: p.x, sMY: p.y, sW: o.w, sH: o.h }; };
  const onMove = (e) => { if (!drag.current) return; const p = toMeter(e), d = drag.current; setObjs((prev) => prev.map((o) => { if (o.id !== d.id) return o; if (d.mode === "move") { const ax = clamp(snap(p.x - d.gx), 0, HALL_W - o.w); const z = zoneOf(ax); return { ...o, zone: z, rx: clamp(snap(ax - starts[z]), 0, Math.max(0, zones[z].w - o.w)), y: clamp(snap(p.y - d.gy), 0, HALL_D - o.h) }; } const nw = clamp(snap(d.sW + (p.x - d.sMX)), 1.5, 30), nh = clamp(snap(d.sH + (p.y - d.sMY)), 1.5, HALL_D - o.y); return { ...o, w: nw, h: nh }; })); };
  const onUp = () => (drag.current = null);
  const onWheel = (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.4, 6)); };
  /* pan by dragging empty floor (objects stopPropagation, so they don't start a pan) */
  const onPanDown = (e) => { const c = scrollRef.current; pan.current = { sx: e.clientX, sy: e.clientY, sl: c.scrollLeft, st: c.scrollTop }; };
  const onPanMove = (e) => { if (!pan.current) return; const c = scrollRef.current, p = pan.current; c.scrollLeft = p.sl - (e.clientX - p.sx); c.scrollTop = p.st - (e.clientY - p.sy); };
  const onPanUp = () => (pan.current = null);
  const resetView = () => { setZoom(1); const c = scrollRef.current; if (c) { c.scrollLeft = 0; c.scrollTop = 0; } };
  const fitSelection = () => {
    const c = scrollRef.current; if (!c) return;
    const cw = c.clientWidth, ch = c.clientHeight, vbw = mx(HALL_W) + 16;
    let X, Y, W, Hh;
    if (selZone) { const i = zones.findIndex((z) => z.id === selZone.id); X = mx(starts[i]); Y = my(0); W = ms(selZone.w); Hh = ms(HALL_D); }
    else if (selObj) { X = mx(absX(selObj)); Y = my(selObj.y); W = ms(selObj.w); Hh = ms(selObj.h); }
    else return resetView();
    const pad = 26; X -= pad; Y -= pad; W += pad * 2; Hh += pad * 2;
    const nz = clamp(Math.min(cw / W, ch / Hh) * vbw / cw, 0.4, 6);
    setZoom(nz);
    requestAnimationFrame(() => { const sc = (cw * nz) / vbw; c.scrollLeft = (X + W / 2) * sc - cw / 2; c.scrollTop = (Y + Hh / 2) * sc - ch / 2; });
  };

  const selZone = sel.t === "zone" ? zones.find((z) => z.id === sel.id) : null;
  const selObj = sel.t === "obj" ? objs.find((o) => o.id === sel.id) : null;
  const upZone = (patch) => setZones((p) => p.map((z) => (z.id === sel.id ? { ...z, ...patch } : z)));
  const upObj = (patch) => setObjs((p) => p.map((o) => (o.id === sel.id ? { ...o, ...patch } : o)));
  const moveZone = (dir) => setZones((p) => { const i = p.findIndex((z) => z.id === sel.id), j = i + dir; if (j < 0 || j >= p.length) return p; const a = [...p];[a[i], a[j]] = [a[j], a[i]]; return a; });
  const addZone = () => { const id = "z" + Math.random().toString(36).slice(2, 5); setZones((p) => [...p, { id, label: "New zone", color: "#cbd5e1", w: 6 }]); setSel({ t: "zone", id }); };
  const addObj = (kind) => { const id = kind + Math.random().toString(36).slice(2, 5); const base = { machine: { w: 5, h: 6, workers: 1, color: "#22c55e", type: "Machine" }, rack: { w: 2.5, h: 10, color: "#c2ad7e" }, stillage: { w: 3, h: 6, color: GREEN }, person: { w: 1.6, h: 1.6, color: INK, label: "Operator" } }[kind]; setObjs((p) => [...p, { id, zone: zoneOf(2), kind, rx: 1, y: 12, label: kind, ...base }]); setSel({ t: "obj", id }); };
  const del = () => { if (sel.t === "zone") { setZones((p) => p.filter((z) => z.id !== sel.id)); } else { setObjs((p) => p.filter((o) => o.id !== sel.id)); } setSel({ t: "none" }); };
  const exportJ = () => setJson(JSON.stringify({ zones, objs }, null, 2));
  const importJ = () => { try { const v = JSON.parse(json); if (v.zones) setZones(v.zones); if (v.objs) setObjs(v.objs); } catch { alert("Invalid JSON"); } };

  /* summaries */
  const equip = useMemo(() => { const m = {}; objs.forEach((o) => { if (o.type) m[o.type] = (m[o.type] || 0) + 1; }); return Object.entries(m); }, [objs]);
  const totalArea = Math.round(HALL_W * HALL_D);
  const workers = objs.reduce((a, o) => a + (o.workers || 0), 0) + objs.filter((o) => o.kind === "person").length;
  const hourly = TODAY_HOURLY.map((p, i) => ({ h: "H" + (i + 1), pace: p }));
  const dailyCompare = [...HISTORIC.map((d) => ({ day: d.day.trim(), pace: d.pace })), { day: "Today", pace: PACE_AVG_TODAY, today: 1 }];
  const TARGET_PACE = +(target / SHIFT_HOURS).toFixed(1);
  const shiftPct = Math.round(OUTPUT_TODAY / target * 100);
  const M = {
    output_today: { label: "Output today", value: OUTPUT_TODAY, sub: `target ${target}/shift`, accent: INK },
    this_shift: { label: "This shift", value: `${OUTPUT_TODAY} / ${target}`, sub: `${shiftPct}% · ${HOURS_ELAPSED}/${SHIFT_HOURS}h`, accent: BLUE },
    pace_now: { label: "Pace / hour", value: PACE_NOW, sub: `target ${TARGET_PACE}/h`, accent: PACE_NOW >= TARGET_PACE ? GREEN : ORANGE },
    avg_pace_today: { label: "Avg pace / h today", value: PACE_AVG_TODAY, sub: `hist ${PACE_HIST} · ${PACE_DELTA >= 0 ? "+" : ""}${PACE_DELTA}`, accent: PACE_DELTA >= 0 ? GREEN : RED },
    historic_pace: { label: "Historic avg / h", value: PACE_HIST, sub: `${HISTORIC.length} shifts`, accent: MUTED },
    vs_historic: { label: "vs historic", value: `${PACE_DELTA >= 0 ? "+" : ""}${PACE_DELTA}/h`, sub: PACE_DELTA >= 0 ? "ahead of avg" : "behind avg", accent: PACE_DELTA >= 0 ? GREEN : RED },
    projected: { label: "Projected shift", value: PROJECTED, sub: PROJECTED >= target ? "on track" : "below target", accent: PROJECTED >= target ? GREEN : ORANGE },
    shift_pct: { label: "Shift complete", value: `${shiftPct}%`, sub: `${OUTPUT_TODAY}/${target}`, accent: BLUE },
    workers: { label: "Workers on floor", value: workers, sub: "operators + persons", accent: INK },
    target: { label: "Shift target", value: target, sub: `${TARGET_PACE}/h needed`, accent: INK },
  };

  const renderObj = (o) => {
    const isSel = sel.t === "obj" && sel.id === o.id, x = absX(o);
    const selS = isSel ? { filter: `drop-shadow(0 0 6px ${hexA(o.color, 0.7)})` } : undefined;
    const sw = isSel ? 3 : 1.5;
    return (
      <g key={o.id} onPointerDown={(e) => onObjDown(e, o, "move")} style={{ cursor: mode === "edit" ? "move" : "pointer" }}>
        {o.kind === "rack" && (<><rect x={mx(x)} y={my(o.y)} width={ms(o.w)} height={ms(o.h)} rx={2} fill={hexA(o.color, 0.25)} stroke={o.color} strokeWidth={sw} style={selS} />{Array.from({ length: Math.max(2, Math.floor(o.h / 3)) }).map((_, i) => (<line key={i} x1={mx(x + 0.4)} y1={my(o.y + 1.6 + i * 3)} x2={mx(x + o.w - 0.4)} y2={my(o.y + 1.6 + i * 3)} stroke={hexA(o.color, 0.85)} strokeWidth={2} />))}</>)}
        {o.kind === "dock" && (<><rect x={mx(x)} y={my(o.y)} width={ms(o.w)} height={ms(o.h)} rx={2} fill={hexA(INK, 0.07)} stroke={o.color} strokeWidth={sw} style={selS} />{[0, 1, 2, 3].map((i) => (<rect key={i} x={mx(x + o.w) - 1} y={my(o.y + 2 + i * 5.5)} width={4.5} height={ms(3.2)} fill={hexA(INK, 0.45)} />))}</>)}
        {o.kind === "stillage" && (<><rect x={mx(x)} y={my(o.y)} width={ms(o.w)} height={ms(o.h)} rx={2} fill={hexA(o.color, 0.18)} stroke={o.color} strokeWidth={sw} strokeDasharray="4 2" style={selS} />{[0, 1, 2].map((i) => (<line key={i} x1={mx(x + 0.8 + i * 0.9)} y1={my(o.y + o.h - 0.8)} x2={mx(x + 1.4 + i * 0.9)} y2={my(o.y + 1)} stroke={hexA(o.color, 0.8)} strokeWidth={1.4} />))}</>)}
        {o.kind === "fork" && (<><rect x={mx(x)} y={my(o.y + 1)} width={ms(o.w * 0.6)} height={ms(o.h - 1.5)} rx={1.5} fill={ORANGE} stroke={INK} strokeWidth={1} style={selS} /><line x1={mx(x + o.w * 0.6)} y1={my(o.y + 1.5)} x2={mx(x + o.w)} y2={my(o.y + 1.5)} stroke={INK} strokeWidth={1.5} /><line x1={mx(x + o.w * 0.6)} y1={my(o.y + o.h - 1)} x2={mx(x + o.w)} y2={my(o.y + o.h - 1)} stroke={INK} strokeWidth={1.5} /></>)}
        {o.kind === "machine" && (<><rect x={mx(x)} y={my(o.y)} width={ms(o.w)} height={ms(o.h)} rx={2.5} fill={hexA(o.color, 0.16)} stroke={o.color} strokeWidth={sw} style={selS} />{Array.from({ length: o.workers || 0 }).map((_, i) => { const below = o.y + o.h < HALL_D - 2.5; const wy = below ? o.y + o.h + 1.6 : o.y - 1.6; return (<Worker key={i} cx={mx(x + (o.w * (i + 1)) / ((o.workers || 0) + 1))} cy={my(wy)} />); })}</>)}
        {o.kind === "person" && (<><Worker cx={mx(x + o.w / 2)} cy={my(o.y + o.h / 2)} />{isSel && <circle cx={mx(x + o.w / 2)} cy={my(o.y + o.h / 2) - 1} r={11} fill="none" stroke={INK} strokeDasharray="3 2" strokeWidth={1.2} />}</>)}
        <text x={mx(x + o.w / 2)} y={my(o.y) + 12} textAnchor="middle" fontSize={8.5} fontWeight="700" fill={INK} style={{ pointerEvents: "none" }}>{o.label}</text>
        {isSel && mode === "edit" && (<rect x={mx(x + o.w) - 6} y={my(o.y + o.h) - 6} width={12} height={12} rx={2} fill={INK} stroke="#fff" strokeWidth={1.5} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => { e.stopPropagation(); onObjDown(e, o, "resize"); }} />)}
      </g>
    );
  };

  /* flow arrows between zone centers */
  const cx = (i) => starts[i] + zones[i].w / 2;
  const arrow = (x1, y1, x2, y2, color, key) => { const a = Math.atan2(y2 - y1, x2 - x1); const hl = 7; return (<g key={key}><line x1={mx(x1)} y1={my(y1)} x2={mx(x2)} y2={my(y2)} stroke={color} strokeWidth={2.2} strokeDasharray="7 5" /><path d={`M${mx(x2)},${my(y2)} L${mx(x2) - hl * Math.cos(a - 0.4)},${my(y2) - hl * Math.sin(a - 0.4)} L${mx(x2) - hl * Math.cos(a + 0.4)},${my(y2) - hl * Math.sin(a + 0.4)} Z`} fill={color} /></g>); };

  const ta = { width: "100%", fontFamily: FM, fontSize: 11, padding: 8, border: `1px solid ${LINE}`, borderRadius: 7, boxSizing: "border-box" };
  const num = (label, key, obj, up, step = 0.5) => (<label style={{ flex: 1 }}><span style={{ fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>{label}</span><input type="number" step={step} value={obj?.[key] ?? ""} onChange={(e) => up({ [key]: parseFloat(e.target.value) || 0 })} style={{ ...ta, marginTop: 2 }} /></label>);

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "22px 20px 44px", userSelect: drag.current ? "none" : "auto" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>Optimizer · Layout modeler</div>
            <h1 style={{ fontWeight: 800, fontSize: 28, margin: "4px 0 0", letterSpacing: -0.5 }}>PVC line · {Math.round(HALL_W)} × {HALL_D} m</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: CARD, border: `1px solid ${LINE}`, borderRadius: 999, padding: 4 }}>
              {[["layout", "Layout"], ["stats", "Statistics"]].map(([k, lbl]) => (<button key={k} onClick={() => setTab(k)} style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 999, background: tab === k ? INK : "transparent", color: tab === k ? "#fff" : MUTED }}>{lbl}</button>))}
            </div>
            {tab === "layout" && (<>
            <div style={{ display: "flex", background: CARD, border: `1px solid ${LINE}`, borderRadius: 999, padding: 4 }}>
              {["view", "edit", "live"].map((m) => (<button key={m} onClick={() => setMode(m)} style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, textTransform: "uppercase", border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 999, background: mode === m ? INK : "transparent", color: mode === m ? "#fff" : MUTED }}>{m}</button>))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: CARD, border: `1px solid ${LINE}`, borderRadius: 999, padding: 4 }}>
              <button onClick={() => setZoom((z) => clamp(z / 1.25, 0.4, 6))} style={zbtn} title="Zoom out">−</button>
              <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, width: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => clamp(z * 1.25, 0.4, 6))} style={zbtn} title="Zoom in">+</button>
              <button onClick={fitSelection} style={{ ...zbtn, width: "auto", padding: "0 9px", fontSize: 11, fontWeight: 700 }} title="Fit to selection">⊙ fit</button>
              <button onClick={resetView} style={{ ...zbtn, width: "auto", padding: "0 9px", fontSize: 13 }} title="Reset view">⤢</button>
            </div>
            </>)}
          </div>
        </div>

        {tab === "layout" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, color: MUTED, textTransform: "uppercase" }}>Production status</div>
          <button onClick={() => setCfgOpen((o) => !o)} style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, border: `1px solid ${LINE}`, background: cfgOpen ? INK : CARD, color: cfgOpen ? "#fff" : INK, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>⚙ configure</button>
        </div>
        {cfgOpen && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Shift target (pcs)</span><input type="number" step={10} value={target} onChange={(e) => setTarget(Math.max(1, parseInt(e.target.value) || 0))} style={{ width: 90, fontFamily: FM, fontSize: 13, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 6 }} /></label>
              {boxes.map((b, i) => (<label key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Box {i + 1}</span><select value={b} onChange={(e) => setBoxes((p) => p.map((x, j) => (j === i ? e.target.value : x)))} style={{ fontFamily: FM, fontSize: 12, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff" }}>{METRIC_OPTS.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}</select></label>))}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setBoxes((p) => (p.length < 6 ? [...p, "workers"] : p))} style={{ ...btn, flex: "none", padding: "7px 10px" }}>+ box</button>
                <button onClick={() => setBoxes((p) => (p.length > 1 ? p.slice(0, -1) : p))} style={{ ...btn, flex: "none", padding: "7px 10px" }}>− box</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {boxes.map((b, i) => { const m = M[b]; return m ? <Info key={i} label={m.label} value={m.value} sub={m.sub} accent={m.accent} /> : null; })}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 660px", minWidth: 320 }}>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 8 }}>
              <div ref={scrollRef} style={{ overflow: "auto", maxHeight: "74vh", borderRadius: 8, cursor: "grab", touchAction: "none" }} onWheel={onWheel} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp} onPointerLeave={onPanUp}>
              <svg ref={svgRef} viewBox={`0 0 ${mx(HALL_W) + 16} ${my(HALL_D) + 30}`} style={{ width: `${100 * zoom}%`, minWidth: 0, height: "auto", display: "block", fontFamily: FM, touchAction: "none" }} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
                {/* zone bands */}
                {zones.map((z, i) => { const isSel = sel.t === "zone" && sel.id === z.id; return (
                  <g key={z.id} onClick={() => setSel({ t: "zone", id: z.id })} style={{ cursor: "pointer" }}>
                    <rect x={mx(starts[i])} y={my(0)} width={ms(z.w)} height={ms(HALL_D)} fill={hexA(z.color, 0.16)} stroke={isSel ? INK : hexA(z.color, 0.6)} strokeWidth={isSel ? 2.5 : 1} />
                    {/* width dim */}
                    <line x1={mx(starts[i]) + 2} y1={my(0) - 10} x2={mx(starts[i] + z.w) - 2} y2={my(0) - 10} stroke={MUTED} strokeWidth={1} />
                    <text x={mx(starts[i] + z.w / 2)} y={my(0) - 14} textAnchor="middle" fontSize={9} fill={MUTED}>{Math.round(z.w * 1000)}</text>
                    {/* header */}
                    <rect x={mx(starts[i]) + 3} y={my(0) + 3} width={ms(z.w) - 6} height={16} rx={3} fill={hexA(z.color, 0.92)} />
                    <text x={mx(starts[i] + z.w / 2)} y={my(0) + 14} textAnchor="middle" fontSize={7.6} fontWeight="700" fill="#fff" style={{ pointerEvents: "none" }}>{z.label}</text>
                    <text x={mx(starts[i] + z.w / 2)} y={my(HALL_D) - 5} textAnchor="middle" fontSize={8} fill={hexA(INK, 0.5)}>{Math.round(z.w * HALL_D)} m²</text>
                  </g>
                ); })}

                {/* main production flow (green) */}
                {zones.slice(0, -1).map((_, i) => arrow(cx(i) + zones[i].w / 2 - 0.5, 15, cx(i + 1) - zones[i + 1].w / 2 + 0.5, 15, GREEN, "mf" + i))}
                {/* material supply (blue, bottom) */}
                {arrow(cx(0), 28.5, cx(3) - 1, 28.5, BLUE, "ms1")}
                {/* WIP / return (red): QC back to hardware */}
                {arrow(cx(7), 28, cx(5), 28, RED, "wip1")}
                {/* packed goods (orange): packing → expedition */}
                {arrow(cx(8) + zones[8].w / 2, 26.5, cx(9) - zones[9].w / 2, 26.5, ORANGE, "pg1")}

                {/* objects */}
                {objs.map(renderObj)}

                {/* live dots */}
                {mode === "live" && Array.from({ length: 14 }).map((_, i) => { const off = i / 14, frac = (t * 0.05 + off) % 1, xm = 8.5 + frac * (HALL_W - 16); const z = zones[zoneOf(xm)]; const ym = 15 + Math.sin((t + off * 6) * 1.7) * 0.5; return (<g key={i}><circle cx={mx(xm)} cy={my(ym)} r={3.2} fill={z.color} stroke="#fff" strokeWidth={1} opacity={0.95} /><circle cx={mx(xm) - 5} cy={my(ym)} r={1.8} fill={z.color} opacity={0.3} /></g>); })}

                {/* outer wall */}
                <rect x={mx(0)} y={my(0)} width={ms(HALL_W)} height={ms(HALL_D)} fill="none" stroke={INK} strokeWidth={2.5} />
              </svg>
              </div>

              {/* flow legend */}
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: FM, fontSize: 10, color: MUTED, padding: "8px 6px 2px" }}>
                <Leg c={GREEN} t="main production flow" /><Leg c={BLUE} t="material supply" /><Leg c={RED} t="WIP / return" /><Leg c={ORANGE} t="packed goods" />
                <span>● worker · {mode === "edit" ? "drag objects · drag floor to pan" : "drag to pan · ⊙ fit to selection"}</span>
              </div>
            </div>
          </div>

          {/* right column: build + summaries */}
          <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <Panel title="A · Add">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["zone", addZone], ["machine", () => addObj("machine")], ["rack", () => addObj("rack")], ["stillage", () => addObj("stillage")], ["person", () => addObj("person")]].map(([k, fn]) => (<button key={k} onClick={fn} style={btn}>+ {k}</button>))}
              </div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, fontSize: 12, color: MUTED }}><input type="checkbox" checked={snapOn} onChange={(e) => setSnap(e.target.checked)} /> snap 0.5 m</label>
            </Panel>

            <Panel title="B · Selected">
              {selZone && (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Field label="Zone label" value={selZone.label} onChange={(v) => upZone({ label: v })} />
                <div style={{ display: "flex", gap: 6 }}>{num("Width m", "w", selZone, upZone)}</div>
                <Swatches val={selZone.color} set={(c) => upZone({ color: c })} />
                <div style={{ display: "flex", gap: 6 }}><button onClick={() => moveZone(-1)} style={btn}>↑ left</button><button onClick={() => moveZone(1)} style={btn}>↓ right</button></div>
                <button onClick={del} style={delBtn}>✕ Delete zone</button>
              </div>)}
              {selObj && (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Field label="Label" value={selObj.label} onChange={(v) => upObj({ label: v })} />
                <div style={{ display: "flex", gap: 6 }}>{num("X in zone", "rx", selObj, upObj)}{num("Y", "y", selObj, upObj)}</div>
                <div style={{ display: "flex", gap: 6 }}>{num("W", "w", selObj, upObj)}{num("H", "h", selObj, upObj)}</div>
                {selObj.kind === "machine" && <div style={{ display: "flex", gap: 6 }}>{num("Workers", "workers", selObj, upObj, 1)}<Field label="Type" value={selObj.type || ""} onChange={(v) => upObj({ type: v })} /></div>}
                <Swatches val={selObj.color} set={(c) => upObj({ color: c })} />
                <div style={{ fontFamily: FM, fontSize: 10, color: MUTED }}>zone {selObj.zone + 1} · {selObj.kind}</div>
                <button onClick={del} style={delBtn}>✕ Delete object</button>
              </div>)}
              {sel.t === "none" && <div style={{ fontSize: 12, color: MUTED }}>Click a zone band or an object.</div>}
            </Panel>

            <Panel title="Capacity & area">
              <Row k="Target output" v={`${target} / shift`} /><Row k="Operating time" v="8 h" /><Row k="OEE" v="70–75 %" />
              <div style={{ height: 1, background: LINE, margin: "8px 0" }} />
              {zones.map((z, i) => (<Row key={z.id} k={z.label.replace(/^\d+ · /, "")} v={`${Math.round(z.w * HALL_D)} m²`} small />))}
              <div style={{ height: 1, background: LINE, margin: "8px 0" }} />
              <Row k="Footprint" v={`${totalArea} m²`} bold /><Row k="Workers" v={workers} bold />
            </Panel>

            <Panel title="Equipment summary">
              {equip.map(([k, n]) => (<Row key={k} k={k} v={`${n}×`} small />))}
            </Panel>

            <Panel title="C · Layout JSON">
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><button onClick={exportJ} style={btn}>↑ Export</button><button onClick={importJ} style={btn}>↓ Import</button></div>
              <textarea value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} placeholder="Export → JSON here. Paste + Import to load." style={{ ...ta, height: 90, resize: "vertical" }} />
            </Panel>
          </div>
        </div>
        </>)}

        {tab === "stats" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Info label="Avg pace/h today" value={PACE_AVG_TODAY} sub={`${HOURS_ELAPSED}h elapsed`} accent={INK} />
              <Info label="Historic avg/h" value={PACE_HIST} sub={`${HISTORIC.length} shifts`} accent={MUTED} />
              <Info label="vs historic" value={`${PACE_DELTA >= 0 ? "+" : ""}${PACE_DELTA}/h`} sub={PACE_DELTA >= 0 ? "ahead of avg" : "behind avg"} accent={PACE_DELTA >= 0 ? GREEN : RED} />
              <Info label="Output today" value={OUTPUT_TODAY} sub={`/ ${target} target`} accent={BLUE} />
              <Info label="Projected shift" value={PROJECTED} sub={PROJECTED >= target ? "on track" : "below target"} accent={PROJECTED >= target ? GREEN : ORANGE} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
              <div style={card}>
                <div style={cardTitle}>Today · pieces per hour</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourly} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
                    <XAxis dataKey="h" tick={{ fontFamily: FM, fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: FM, fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontFamily: FM, fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                    <ReferenceLine y={TARGET_PACE} stroke={INK} strokeDasharray="5 4" label={{ value: "target", fontSize: 10, fill: INK, position: "insideTopRight" }} />
                    <ReferenceLine y={PACE_HIST} stroke={BLUE} strokeDasharray="5 4" label={{ value: "hist", fontSize: 10, fill: BLUE, position: "insideBottomRight" }} />
                    <Bar dataKey="pace" radius={[4, 4, 0, 0]}>{hourly.map((d, i) => (<Cell key={i} fill={d.pace >= TARGET_PACE ? GREEN : ORANGE} />))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={card}>
                <div style={cardTitle}>Avg pace/h · recent shifts vs today</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyCompare} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
                    <XAxis dataKey="day" tick={{ fontFamily: FM, fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, "dataMax+4"]} tick={{ fontFamily: FM, fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontFamily: FM, fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                    <ReferenceLine y={PACE_HIST} stroke={BLUE} strokeDasharray="5 4" label={{ value: "hist avg", fontSize: 10, fill: BLUE, position: "insideTopRight" }} />
                    <Bar dataKey="pace" radius={[4, 4, 0, 0]}>{dailyCompare.map((d, i) => (<Cell key={i} fill={d.today ? INK : hexA(BLUE, 0.55)} />))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Recent shifts</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                  <thead><tr>{["Shift", "Total", "Avg pace/h", "vs hist"].map((h, i) => (<th key={h} style={{ textAlign: i ? "right" : "left", padding: "8px 12px", fontFamily: FM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED, borderBottom: `1px solid ${LINE}` }}>{h}</th>))}</tr></thead>
                  <tbody>{[...HISTORIC].reverse().map((d, i) => { const dv = +(d.pace - PACE_HIST).toFixed(1); return (<tr key={i} style={{ background: i % 2 ? hexA(INK, 0.015) : "transparent" }}>
                    <td style={{ padding: "8px 12px", fontFamily: FM, fontSize: 13 }}>{d.day.trim()}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FM, fontSize: 12 }}>{d.total}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FM, fontSize: 12 }}>{d.pace}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FM, fontSize: 12, color: dv >= 0 ? GREEN : RED }}>{dv >= 0 ? "+" : ""}{dv}</td>
                  </tr>); })}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* small UI helpers */
const btn = { flex: 1, fontFamily: FM, fontSize: 11, fontWeight: 700, padding: "8px 4px", borderRadius: 7, border: `1px solid ${LINE}`, background: PAPER, cursor: "pointer", textTransform: "capitalize" };
const zbtn = { width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", fontFamily: FM, fontSize: 16, fontWeight: 700, color: INK, borderRadius: 999 };
const card = { background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 };
const cardTitle = { fontFamily: FM, fontSize: 10, letterSpacing: 1, color: MUTED, textTransform: "uppercase", marginBottom: 10 };
function Info({ label, value, sub, accent }) { return (<div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", flex: "1 1 130px", minWidth: 120, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} /><div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{label}</div><div style={{ fontFamily: FD, fontWeight: 800, fontSize: 26, lineHeight: 1.1, marginTop: 3 }}>{value}</div>{sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}</div>); }
const delBtn = { fontFamily: FM, fontSize: 12, fontWeight: 700, color: RED, background: hexA(RED, 0.08), border: `1px solid ${hexA(RED, 0.3)}`, borderRadius: 7, padding: 8, cursor: "pointer" };
function Panel({ title, children }) { return (<div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 12 }}><div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 1, color: MUTED, textTransform: "uppercase", marginBottom: 8 }}>{title}</div>{children}</div>); }
function Field({ label, value, onChange }) { return (<label style={{ flex: 1 }}><span style={{ fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "5px 7px", border: `1px solid ${LINE}`, borderRadius: 6, marginTop: 2, boxSizing: "border-box" }} /></label>); }
function Row({ k, v, bold, small }) { return (<div style={{ display: "flex", justifyContent: "space-between", fontSize: small ? 11 : 12.5, fontWeight: bold ? 700 : 400, padding: "2px 0", color: bold ? INK : MUTED }}><span>{k}</span><span style={{ fontFamily: FM, color: INK }}>{v}</span></div>); }
function Swatches({ val, set }) { const C = ["#c2ad7e", "#94a3b8", "#60a5fa", "#22c55e", "#0ea5e9", "#f59e0b", "#cbd5e1", "#8b5cf6", "#eab308", "#475569"]; return (<div><span style={{ fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Color</span><div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{C.map((c) => (<button key={c} onClick={() => set(c)} style={{ width: 20, height: 20, borderRadius: 5, background: c, border: val === c ? `2px solid ${INK}` : `1px solid ${LINE}`, cursor: "pointer" }} />))}</div></div>); }
function Leg({ c, t }) { return (<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={c} strokeWidth="2.2" strokeDasharray="5 3" /></svg>{t}</span>); }
