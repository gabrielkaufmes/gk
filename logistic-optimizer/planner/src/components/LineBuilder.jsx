import React, { useState, useMemo } from "react";

/* ---------------- tokens ---------------- */
const FD = "'Archivo', system-ui, sans-serif", FM = "'Space Mono', ui-monospace, monospace";
const INK = "#1c2230", MUTED = "#6b7689", LINE = "#e3e6ec", PAPER = "#f6f5f1", CARD = "#fff";
const OK = "#22c55e", WARN = "#f59e0b", HOT = "#ef4444", BLUE = "#2563eb";
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

const SHIFT_HOURS = 8, EFF = 0.85;
const clampShifts = (n) => Math.max(1, Math.min(3, n || 1));

/* ---------------- engine (mirrors src/engine/line.mjs) ---------------- */
function stationCapacityMin(st) {
  const horizon = clampShifts(st.shifts) * SHIFT_HOURS * 60 * (st.effective ?? EFF);
  const labor = (st.people || 0) * horizon;
  if (!st.machines) return +labor.toFixed(0);
  const usable = Math.min(st.machines, Math.floor((st.people || 0) / (st.peoplePerMachine || 1)));
  return +Math.min(labor, Math.max(0, usable) * horizon).toFixed(0);
}
function stationLanes(st) {
  if (!st.machines) return Math.max(1, st.people || 1);
  return Math.max(1, Math.min(st.machines, Math.floor((st.people || 0) / (st.peoplePerMachine || 1))));
}
function perUnitSeconds(t) {
  if (t.model === "per_piece") return t.seconds;
  if (t.model === "per_batch_of") return t.secondsPerBatch / t.batch;
  if (t.model === "manual") return (t.minutes || 0) * 60;
  return 0;
}
function stationDemandMin(st, count) {
  return +((count * perUnitSeconds(st.time)) / 60).toFixed(1);
}

/* ---------------- seed line (the eight examples) ---------------- */
const SEED = [
  { id: "matprep", label: "Material preparation", people: 3, machines: 0, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_optimization", codeFilter: [], time: { model: "optimization" }, demo: 0, notes: "Output: optimized bars. Scan per bundle." },
  { id: "cut_schirmer", label: "Cutting 1 · Schirmer", people: 2, machines: 1, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: [], time: { model: "per_piece", seconds: 20 }, demo: 1400, notes: "Cutting + machining centre." },
  { id: "cut_dms", label: "Cutting 2 · double-mitre", people: 1, machines: 1, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: ["blind_mullion", "additional_profile"], time: { model: "per_piece", seconds: 15 }, demo: 150, notes: "Defined codes + additional profiles." },
  { id: "cut_mono", label: "Cutting 3 · monoblock", people: 1, machines: 1, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: ["monoblock_frame"], time: { model: "per_piece", seconds: 35 }, demo: 40, notes: "Monoblock frames only." },
  { id: "cut_steel", label: "Cutting steel", people: 2, machines: 2, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: [], time: { model: "per_piece", seconds: 15 }, demo: 300, notes: "2 identical machines, 1 person each." },
  { id: "screwing", label: "Screwing", people: 2, machines: 2, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: [], time: { model: "per_piece", seconds: 25 }, demo: 300, notes: "2 identical machines, 1 person each." },
  { id: "fit_frames_1", label: "Fittings frames 1", people: 1, machines: 1, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: ["frame"], time: { model: "per_piece", seconds: 35 }, demo: 400, notes: "Frames only." },
  { id: "welding", label: "Welding", people: 3, machines: 3, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: [], time: { model: "per_batch_of", secondsPerBatch: 180, batch: 4 }, demo: 1200, notes: "3 machines/people. 3 min per weld of 4." },
];

const loadColor = (p) => (p >= 100 ? HOT : p >= 85 ? WARN : OK);
const SCAN_OPTS = ["per_piece", "per_batch", "per_optimization"];
const MODEL_OPTS = [["per_piece", "Per piece (sec)"], ["per_batch_of", "Per batch of N"], ["manual", "Manual (min)"], ["optimization", "Optimization (output)"]];

export default function LineBuilder() {
  const [stations, setStations] = useState(SEED);
  const [sel, setSel] = useState("cut_schirmer");
  const [json, setJson] = useState("");

  const rows = useMemo(() => stations.map((st) => {
    const cap = stationCapacityMin(st);
    const req = st.time.model === "optimization" ? 0 : stationDemandMin(st, st.demo || 0);
    const load = cap > 0 ? Math.round((req / cap) * 100) : 0;
    return { ...st, cap, req, load, lanes: stationLanes(st), perUnit: perUnitSeconds(st.time) };
  }), [stations]);

  const binding = useMemo(() => [...rows].filter((r) => r.time.model !== "optimization").sort((a, b) => b.load - a.load)[0], [rows]);
  const selSt = stations.find((s) => s.id === sel);
  const up = (patch) => setStations((p) => p.map((s) => (s.id === sel ? { ...s, ...patch } : s)));
  const upTime = (patch) => up({ time: { ...selSt.time, ...patch } });

  const add = () => { const id = "ws_" + Math.random().toString(36).slice(2, 6); setStations((p) => [...p, { id, label: "New station", people: 1, machines: 1, peoplePerMachine: 1, shifts: 1, effective: EFF, scan: "per_piece", codeFilter: [], time: { model: "per_piece", seconds: 30 }, demo: 100, notes: "" }]); setSel(id); };
  const del = () => { setStations((p) => p.filter((s) => s.id !== sel)); setSel(null); };
  const move = (dir) => setStations((p) => { const i = p.findIndex((s) => s.id === sel), j = i + dir; if (j < 0 || j >= p.length) return p; const a = [...p];[a[i], a[j]] = [a[j], a[i]]; return a; });
  const exportJ = () => setJson(JSON.stringify(stations, null, 2));
  const importJ = () => { try { const v = JSON.parse(json); if (Array.isArray(v)) setStations(v); } catch { alert("Invalid JSON"); } };

  const totalPeople = stations.reduce((a, s) => a + (s.people || 0), 0);
  const totalMachines = stations.reduce((a, s) => a + (s.machines || 0), 0);

  const fieldStyle = { width: "100%", fontFamily: FM, fontSize: 12, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 6, boxSizing: "border-box", marginTop: 2 };
  const Num = ({ label, k, step = 1, min = 0 }) => (<label style={{ flex: 1 }}><span style={lab}>{label}</span><input type="number" step={step} min={min} value={selSt?.[k] ?? ""} onChange={(e) => up({ [k]: Math.max(min, parseFloat(e.target.value) || 0) })} style={fieldStyle} /></label>);
  const TNum = ({ label, k, step = 1 }) => (<label style={{ flex: 1 }}><span style={lab}>{label}</span><input type="number" step={step} value={selSt?.time?.[k] ?? ""} onChange={(e) => upTime({ [k]: parseFloat(e.target.value) || 0 })} style={fieldStyle} /></label>);

  return (
    <div style={{ fontFamily: FD, background: PAPER, minHeight: "100vh", color: INK, padding: "24px 20px 44px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: FM, fontSize: 11, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>Optimizer · Line builder</div>
          <h1 style={{ fontWeight: 800, fontSize: 28, margin: "4px 0 0", letterSpacing: -0.5 }}>Define the production line</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Add workstations · set people, machines, time model & code routing · capacity computes live</div>
        </div>

        {/* summary strip */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Info label="Stations" value={stations.length} accent={INK} />
          <Info label="People" value={totalPeople} accent={BLUE} />
          <Info label="Machines" value={totalMachines} accent={INK} />
          <Info label="Bottleneck" value={binding ? binding.label.replace(/^.*· /, "") : "—"} sub={binding ? binding.load + "% load" : ""} accent={binding ? loadColor(binding.load) : MUTED} />
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* station list */}
          <div style={{ flex: "1 1 560px", minWidth: 300 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r, i) => {
                const isSel = sel === r.id, c = r.time.model === "optimization" ? BLUE : loadColor(r.load);
                const isBind = binding && binding.id === r.id;
                return (
                  <div key={r.id} onClick={() => setSel(r.id)} style={{ background: CARD, border: `1px solid ${isSel ? INK : LINE}`, borderLeft: `5px solid ${c}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer", boxShadow: isSel ? `0 0 0 2px ${hexA(INK, 0.12)}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: FM, fontSize: 10, color: MUTED }}>{i + 1}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</span>
                        {isBind && <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: HOT, background: hexA(HOT, 0.12), borderRadius: 4, padding: "1px 6px" }}>BOTTLENECK</span>}
                        {r.codeFilter?.length > 0 && <span style={{ fontFamily: FM, fontSize: 9, color: BLUE, background: hexA(BLUE, 0.1), borderRadius: 4, padding: "1px 6px" }}>codes: {r.codeFilter.join(", ")}</span>}
                      </div>
                      <span style={{ fontFamily: FM, fontSize: 11, color: MUTED }}>{r.people}P · {r.machines}M · {r.lanes} lane{r.lanes > 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1, height: 8, background: "#eceef2", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, r.load)}%`, height: "100%", background: c }} /></div>
                      <span style={{ fontFamily: FM, fontSize: 11, width: 96, textAlign: "right", color: MUTED }}>
                        {r.time.model === "optimization" ? "output" : `${r.req}/${r.cap}m · ${r.load}%`}</span>
                    </div>
                    <div style={{ fontFamily: FM, fontSize: 10.5, color: MUTED, marginTop: 5 }}>
                      {r.time.model === "per_piece" && `${r.time.seconds}s/piece`}
                      {r.time.model === "per_batch_of" && `${r.time.secondsPerBatch}s per ${r.time.batch} → ${r.perUnit.toFixed(0)}s/unit`}
                      {r.time.model === "manual" && `${r.time.minutes}min/piece`}
                      {r.time.model === "optimization" && `optimization output · scan ${r.scan}`}
                      {r.scan && r.time.model !== "optimization" ? ` · scan ${r.scan}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={add} style={{ marginTop: 10, fontFamily: FM, fontSize: 12, fontWeight: 700, padding: "10px 16px", borderRadius: 8, border: `1px dashed ${MUTED}`, background: "transparent", color: INK, cursor: "pointer", width: "100%" }}>+ Add workstation</button>
          </div>

          {/* editor */}
          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={panel}>
              <div style={ptitle}>Edit station</div>
              {!selSt ? <div style={{ fontSize: 12, color: MUTED }}>Select a station.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <label><span style={lab}>Label</span><input value={selSt.label} onChange={(e) => up({ label: e.target.value })} style={{ ...fieldStyle, fontFamily: FD }} /></label>
                  <div style={{ display: "flex", gap: 6 }}><Num label="People" k="people" /><Num label="Machines" k="machines" /></div>
                  <div style={{ display: "flex", gap: 6 }}><Num label="People / machine" k="peoplePerMachine" /><Num label="Shifts (1–3)" k="shifts" min={1} /></div>
                  <label><span style={lab}>Effective % ({Math.round((selSt.effective ?? EFF) * 100)})</span><input type="range" min="0.4" max="1" step="0.01" value={selSt.effective ?? EFF} onChange={(e) => up({ effective: parseFloat(e.target.value) })} style={{ width: "100%", marginTop: 4 }} /></label>

                  <div style={{ height: 1, background: LINE, margin: "2px 0" }} />
                  <label><span style={lab}>Time model</span>
                    <select value={selSt.time.model} onChange={(e) => { const m = e.target.value; const d = { per_piece: { model: "per_piece", seconds: 20 }, per_batch_of: { model: "per_batch_of", secondsPerBatch: 180, batch: 4 }, manual: { model: "manual", minutes: 2 }, optimization: { model: "optimization" } }[m]; up({ time: d }); }} style={fieldStyle}>
                      {MODEL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  {selSt.time.model === "per_piece" && <div style={{ display: "flex", gap: 6 }}><TNum label="Seconds / piece" k="seconds" /></div>}
                  {selSt.time.model === "per_batch_of" && <div style={{ display: "flex", gap: 6 }}><TNum label="Seconds / batch" k="secondsPerBatch" /><TNum label="Batch size" k="batch" /></div>}
                  {selSt.time.model === "manual" && <div style={{ display: "flex", gap: 6 }}><TNum label="Minutes / piece" k="minutes" step={0.5} /></div>}
                  {selSt.time.model !== "optimization" && <Num label="Demo demand (pieces)" k="demo" step={10} />}

                  <div style={{ height: 1, background: LINE, margin: "2px 0" }} />
                  <label><span style={lab}>Scan rule</span>
                    <select value={selSt.scan} onChange={(e) => up({ scan: e.target.value })} style={fieldStyle}>{SCAN_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
                  <label><span style={lab}>Code routing (comma-sep; blank = all)</span>
                    <input value={(selSt.codeFilter || []).join(", ")} onChange={(e) => up({ codeFilter: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} style={{ ...fieldStyle, fontFamily: FM }} placeholder="e.g. monoblock_frame" /></label>
                  <label><span style={lab}>Notes</span><textarea value={selSt.notes} onChange={(e) => up({ notes: e.target.value })} style={{ ...fieldStyle, height: 44, resize: "vertical" }} /></label>

                  <div style={{ display: "flex", gap: 6 }}><button onClick={() => move(-1)} style={mini}>↑ up</button><button onClick={() => move(1)} style={mini}>↓ down</button></div>
                  <button onClick={del} style={{ ...mini, color: HOT, background: hexA(HOT, 0.08), border: `1px solid ${hexA(HOT, 0.3)}` }}>✕ Delete station</button>
                  <div style={{ fontFamily: FM, fontSize: 10, color: MUTED }}>capacity {stationCapacityMin(selSt)} min/shift · {stationLanes(selSt)} lane(s)</div>
                </div>
              )}
            </div>

            <div style={panel}>
              <div style={ptitle}>Line JSON</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}><button onClick={exportJ} style={mini}>↑ Export</button><button onClick={importJ} style={mini}>↓ Import</button></div>
              <textarea value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} placeholder="Export writes the line here. Paste + Import to load." style={{ ...fieldStyle, height: 90, fontFamily: FM, fontSize: 10, resize: "vertical" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const lab = { fontFamily: FM, fontSize: 9, color: MUTED, textTransform: "uppercase" };
const panel = { background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 12 };
const ptitle = { fontFamily: FM, fontSize: 10, letterSpacing: 1, color: MUTED, textTransform: "uppercase", marginBottom: 8 };
const mini = { flex: 1, fontFamily: FM, fontSize: 11, fontWeight: 700, padding: "8px 6px", borderRadius: 7, border: `1px solid ${LINE}`, background: PAPER, cursor: "pointer" };
function Info({ label, value, sub, accent }) { return (<div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", flex: "1 1 130px", minWidth: 120, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} /><div style={lab}>{label}</div><div style={{ fontFamily: FD, fontWeight: 800, fontSize: 24, lineHeight: 1.1, marginTop: 3 }}>{value}</div>{sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}</div>); }
