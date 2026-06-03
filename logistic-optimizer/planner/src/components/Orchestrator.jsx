import React, { useState, useMemo } from "react";

/* ------------------------------------------------------------------ *
 * Design tokens (shared with the other optimizer mockups)
 * ------------------------------------------------------------------ */
const FONT_DISPLAY = "'Archivo', system-ui, sans-serif";
const FONT_MONO = "'Space Mono', ui-monospace, monospace";
const INK = "#1c2230";
const MUTED = "#6b7689";
const LINE = "#e3e6ec";
const PAPER = "#f6f5f1";
const CARD = "#ffffff";
const OK = "#22c55e";
const WARN = "#f59e0b";
const HOT = "#ef4444";
const BLOCK = "#8b5cf6";
const BLUE = "#0ea5e9";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ------------------------------------------------------------------ *
 * Engine constants
 * ------------------------------------------------------------------ */
const STAGES = ["prep", "cut", "weld", "glaze", "ready", "pack"];
const LAST = STAGES.length - 1;
const STAGE_LABEL = {
  prep: "Material prep", cut: "Cut", weld: "Weld",
  glaze: "Glaze", ready: "Ready/QC", pack: "Pack",
};
const MIN_STAGE_H = 1; // minimum dwell per production stage
const TRUCK_THRESHOLD = 80; // pcs needed to dispatch a truck
const RISK_SLACK_H = 4; // slack below this = at risk

/* Inputs: orders with delivery/loading + materials arrival + scan stage. */
const ORDERS = [
  // region        dest          pcs  stage    matArrivalH loadingH  carrier
  ["O24-501", "F24",          "HUB_A", "Lyon",       32, "ready", -10, 6],
  ["O24-502", "F24",          "HUB_A", "Lyon",       28, "weld",   -5, 6],
  ["O24-503", "ARABESQUE",    "HUB_A", "Lyon",       24, "cut",    -2, 6],
  ["O24-530", "LEROY MERLIN", "HUB_B", "Paris",      40, "glaze",  -3, 10],
  ["O24-531", "HUB_B co.",    "HUB_B", "Paris",      22, "prep",    4, 10],
  ["O24-540", "ARABESQUE",    "MRS",   "Marseille",  18, "weld",   -8, 2],
].map(([id, customer, region, dest, pcs, stage, matArrivalH, loadingH]) => {
  const stageIdx = STAGES.indexOf(stage);
  const remaining = LAST - stageIdx; // stages left to reach Packed
  const matReadyH = Math.max(0, matArrivalH); // when production can run to completion
  const minLeadH = remaining * MIN_STAGE_H;
  const earliestReadyH = matReadyH + minLeadH;
  const slackH = loadingH - earliestReadyH;
  const windowH = loadingH - matReadyH; // usable production window
  const budgetPerStage = remaining > 0 ? Math.max(MIN_STAGE_H, Math.floor(windowH / remaining)) : null;
  const blocked = matArrivalH > 0;
  let status;
  if (slackH < 0) status = "LATE";
  else if (blocked) status = "BLOCKED";
  else if (slackH < RISK_SLACK_H) status = "RISK";
  else status = "OK";
  return {
    id, customer, region, dest, pcs, stage, stageIdx, remaining,
    matArrivalH, minLeadH, earliestReadyH, slackH, budgetPerStage, blocked, status, loadingH,
  };
});

const STATUS_C = { LATE: HOT, BLOCKED: BLOCK, RISK: WARN, OK: OK };

/* Group orders into proposed trucks per destination. */
const buildTrucks = () => {
  const byRegion = {};
  ORDERS.forEach((o) => {
    (byRegion[o.region] ||= { region: o.region, dest: o.dest, loadingH: o.loadingH, orders: [] }).orders.push(o);
    byRegion[o.region].loadingH = Math.min(byRegion[o.region].loadingH, o.loadingH);
  });
  return Object.values(byRegion).map((t) => {
    const pcs = t.orders.reduce((a, o) => a + o.pcs, 0);
    const atRisk = t.orders.some((o) => o.status === "LATE" || o.status === "RISK" || o.status === "BLOCKED");
    const fill = Math.round((pcs / TRUCK_THRESHOLD) * 100);
    let verdict;
    if (pcs >= TRUCK_THRESHOLD) verdict = atRisk ? "READY · at risk" : "READY";
    else verdict = "SHORT";
    return { ...t, pcs, fill, atRisk, short: Math.max(0, TRUCK_THRESHOLD - pcs), verdict };
  });
};

/* Derive ranked calls to action from the computed state. */
const deriveActions = (trucks) => {
  const acts = [];
  ORDERS.forEach((o) => {
    if (o.status === "LATE") {
      acts.push({
        sev: 0, tag: o.id,
        title: `Renegotiate or expedite ${o.id} — late by ${Math.abs(o.slackH)}h`,
        why: `Earliest ready +${o.earliestReadyH}h (${o.remaining} stages × ${MIN_STAGE_H}h min) but truck loads at +${o.loadingH}h. Cannot make the date even at floor speed.`,
      });
    } else if (o.status === "BLOCKED") {
      acts.push({
        sev: o.slackH < RISK_SLACK_H ? 0 : 1, tag: o.id,
        title: `Expedite materials for ${o.id} — arriving +${o.matArrivalH}h`,
        why: `Production can't complete until materials land. Leaves only ${o.slackH}h slack before the +${o.loadingH}h truck; ${o.budgetPerStage}h per remaining stage.`,
      });
    } else if (o.status === "RISK") {
      acts.push({
        sev: 1, tag: o.id,
        title: `Push ${o.id} through ${STAGE_LABEL[STAGES[o.stageIdx + 1]]} now — ${o.slackH}h slack`,
        why: `${o.remaining} stages left, only ${o.budgetPerStage}h budget per stage (min is ${MIN_STAGE_H}h). Any stall here misses the +${o.loadingH}h loading.`,
      });
    }
  });
  trucks.forEach((t) => {
    if (t.pcs >= TRUCK_THRESHOLD && !t.atRisk) {
      acts.push({
        sev: 2, tag: t.region,
        title: `Confirm carrier for ${t.dest} truck — ${t.pcs}/${TRUCK_THRESHOLD} pcs, loads +${t.loadingH}h`,
        why: `Threshold met. Compare own truck vs Damian for cost before the slot.`,
      });
    } else if (t.pcs < TRUCK_THRESHOLD) {
      acts.push({
        sev: 1, tag: t.region,
        title: `${t.dest} truck short by ${t.short} pcs (${t.pcs}/${TRUCK_THRESHOLD})`,
        why: `Below dispatch threshold. Hold for next consolidation or pull forward a nearby ${t.dest} order to fill, rather than send under-loaded.`,
      });
    }
  });
  return acts.sort((a, b) => a.sev - b.sev);
};

const SEV = [
  { label: "CRITICAL", c: HOT, icon: "▲" },
  { label: "ACTION", c: WARN, icon: "⚑" },
  { label: "REVIEW", c: BLUE, icon: "◆" },
];
const fmtH = (h) => (h >= 0 ? `+${h}h` : `${h}h`);

/* ------------------------------------------------------------------ */
function Kpi({ label, value, accent, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 130, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 1.1, color: INK, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Orchestrator() {
  const [tab, setTab] = useState("actions");
  const trucks = useMemo(() => buildTrucks(), []);
  const actions = useMemo(() => deriveActions(trucks), [trucks]);

  const critical = actions.filter((a) => a.sev === 0).length;
  const atRiskOrders = ORDERS.filter((o) => o.status !== "OK").length;
  const trucksReady = trucks.filter((t) => t.pcs >= TRUCK_THRESHOLD).length;

  const Tab = ({ id, children }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
        padding: "8px 14px", borderRadius: 8, cursor: "pointer", border: "none",
        background: tab === id ? INK : "transparent", color: tab === id ? "#fff" : MUTED,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ fontFamily: FONT_DISPLAY, background: PAPER, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(28,34,48,0.05) 1px, transparent 0)", backgroundSize: "22px 22px", minHeight: "100vh", color: INK, padding: "28px 24px 48px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap');`}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>
            Optimizer · Loading orchestrator
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 34, margin: "4px 0 0", letterSpacing: -0.5 }}>
            What to do to hit the loading dates
          </h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Reads scan status, materials arrival &amp; delivery dates · lead time = remaining stages × min {MIN_STAGE_H}h · truck threshold {TRUCK_THRESHOLD} pcs
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <Kpi label="Orders analyzed" value={ORDERS.length} accent={INK} />
          <Kpi label="Critical actions" value={critical} accent={HOT} sub="must act now" />
          <Kpi label="Orders off-track" value={atRiskOrders} accent={WARN} sub="late · blocked · at risk" />
          <Kpi label="Trucks ready" value={`${trucksReady}/${trucks.length}`} accent={OK} sub={`≥${TRUCK_THRESHOLD} pcs`} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 5, width: "fit-content", marginBottom: 16 }}>
          <Tab id="actions">Calls to action</Tab>
          <Tab id="trucks">Truck plan</Tab>
          <Tab id="orders">Order feasibility</Tab>
        </div>

        {/* ----- Calls to action ----- */}
        {tab === "actions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.map((a, i) => {
              const s = SEV[a.sev];
              return (
                <div key={i} style={{ background: CARD, border: `1px solid ${LINE}`, borderLeft: `5px solid ${s.c}`, borderRadius: 10, padding: "14px 16px", display: "flex", gap: 14 }}>
                  <div style={{ fontSize: 18, color: s.c, lineHeight: 1.4 }}>{s.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: s.c, background: hexA(s.c, 0.12), borderRadius: 4, padding: "2px 6px" }}>{s.label}</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>{a.tag}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: INK }}>{a.title}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>{a.why}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ----- Truck plan ----- */}
        {tab === "trucks" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {trucks.map((t) => {
              const c = t.pcs >= TRUCK_THRESHOLD ? (t.atRisk ? WARN : OK) : HOT;
              return (
                <div key={t.region} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{t.dest}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>{t.region} · loads {fmtH(t.loadingH)}</div>
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: c, background: hexA(c, 0.12), borderRadius: 6, padding: "3px 8px" }}>{t.verdict}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 6px" }}>
                    <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#eceef2", overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${Math.min(100, t.fill)}%`, height: "100%", background: c, borderRadius: 999 }} />
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 }}>{t.pcs}/{TRUCK_THRESHOLD}</span>
                  </div>
                  <div style={{ fontSize: 12, color: t.pcs >= TRUCK_THRESHOLD ? OK : HOT, marginBottom: 10 }}>
                    {t.pcs >= TRUCK_THRESHOLD ? `Threshold met (+${t.pcs - TRUCK_THRESHOLD} over)` : `Short by ${t.short} pcs`}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {t.orders.map((o) => (
                      <span key={o.id} style={{ fontFamily: FONT_MONO, fontSize: 11, border: `1px solid ${hexA(STATUS_C[o.status], 0.4)}`, color: STATUS_C[o.status], background: hexA(STATUS_C[o.status], 0.08), borderRadius: 6, padding: "2px 7px" }}>
                        {o.id} · {o.pcs}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ----- Order feasibility ----- */}
        {tab === "orders" && (
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                <thead>
                  <tr>
                    {["Order", "Dest", "Stage", "Stages left", "h / stage", "Materials", "Earliest", "Loading", "Slack", "Status"].map((h, i) => (
                      <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "10px 12px", fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ORDERS.map((o, i) => {
                    const c = STATUS_C[o.status];
                    return (
                      <tr key={o.id} style={{ background: i % 2 ? hexA(INK, 0.015) : "transparent" }}>
                        <td style={{ padding: "10px 12px", fontFamily: FONT_MONO, fontSize: 13, whiteSpace: "nowrap" }}>{o.id}<div style={{ color: MUTED, fontSize: 10 }}>{o.customer}</div></td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>{o.dest}<div style={{ color: MUTED, fontFamily: FONT_MONO, fontSize: 10 }}>{o.pcs} pcs</div></td>
                        <td style={{ padding: "10px 12px", fontFamily: FONT_MONO, fontSize: 12 }}>{STAGE_LABEL[o.stage]}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12 }}>{o.remaining}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12, color: o.budgetPerStage === MIN_STAGE_H ? HOT : INK }}>
                          {o.budgetPerStage == null ? "—" : `${o.budgetPerStage}h`}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12, color: o.blocked ? BLOCK : MUTED }}>
                          {o.blocked ? `in ${o.matArrivalH}h` : "on site"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12 }}>{fmtH(o.earliestReadyH)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 12 }}>{fmtH(o.loadingH)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: o.slackH < 0 ? HOT : o.slackH < RISK_SLACK_H ? WARN : OK }}>{fmtH(o.slackH)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: c, background: hexA(c, 0.12), border: `1px solid ${hexA(c, 0.3)}`, borderRadius: 999, padding: "2px 8px" }}>{o.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>
              earliest = materials-ready + (stages left × {MIN_STAGE_H}h) · slack = loading − earliest · source: WHNet.Skany + Aluplast
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
