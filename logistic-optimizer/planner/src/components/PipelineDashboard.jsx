import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/* ------------------------------------------------------------------ *
 * Design tokens
 * ------------------------------------------------------------------ */
const FONT_DISPLAY = "'Archivo', system-ui, sans-serif";
const FONT_MONO = "'Space Mono', ui-monospace, monospace";

const INK = "#1c2230";
const MUTED = "#6b7689";
const LINE = "#e3e6ec";
const PAPER = "#f6f5f1";
const CARD = "#ffffff";

// Readiness stages, ordered Rest -> Packed. The 11 canonical scan stages
// bucket into these 7 readiness states (see §7.4 of the data model).
const STAGES = [
  { key: "rest", label: "Rest", pct: 1, color: "#64748b" },
  { key: "prep", label: "Material prepared", pct: 10, color: "#0ea5e9" },
  { key: "cut", label: "Cut", pct: 20, color: "#f59e0b" },
  { key: "weld", label: "Welded", pct: 50, color: "#f97316" },
  { key: "glaze", label: "Glazed", pct: 70, color: "#8b5cf6" },
  { key: "ready", label: "Ready · not packed", pct: 90, color: "#14b8a6" },
  { key: "packed", label: "Packed · shippable", pct: 100, color: "#22c55e" },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));
const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ------------------------------------------------------------------ *
 * Sample data — deterministic, shaped like the optimizer cache
 * ------------------------------------------------------------------ */
const H = 3600 * 1000;
const now = Date.now();
const ago = (h) => new Date(now - h * H).toISOString();

const ELEMENTS = [
  ["O24-457", "P03", 2, "F24", "pvc", "packed", ago(5), false, 24],
  ["O24-457", "P03", 1, "F24", "pvc", "packed", ago(6), false, 24],
  ["O24-457", "P01", 1, "F24", "pvc", "ready", ago(9), false, 24],
  ["O24-461", "P02", 1, "F24", "pvc", "glaze", ago(3), false, 24],
  ["O24-461", "P02", 2, "F24", "pvc", "glaze", ago(28), true, 24],
  ["O24-461", "P04", 1, "F24", "pvc", "weld", ago(12), false, 24],
  ["O24-470", "P01", 1, "ARABESQUE", "pvc", "ready", ago(2), false, 25],
  ["O24-470", "P01", 2, "ARABESQUE", "pvc", "ready", ago(2), false, 25],
  ["O24-470", "P03", 1, "ARABESQUE", "pvc", "glaze", ago(7), false, 25],
  ["O24-470", "P03", 2, "ARABESQUE", "pvc", "weld", ago(14), false, 25],
  ["O24-482", "P02", 1, "LEROY MERLIN", "pvc", "cut", ago(4), false, 25],
  ["O24-482", "P02", 2, "LEROY MERLIN", "pvc", "cut", ago(4), false, 25],
  ["O24-482", "P05", 1, "LEROY MERLIN", "pvc", "prep", ago(1), false, 25],
  ["O24-488", "P01", 1, "HUB_A", "pvc", "weld", ago(10), false, 25],
  ["O24-488", "P01", 2, "HUB_A", "pvc", "weld", ago(10), false, 25],
  ["O24-488", "P02", 1, "HUB_A", "pvc", "cut", ago(33), true, 25],
  ["O24-491", "P03", 1, "HUB_B", "pvc", "glaze", ago(6), false, 26],
  ["O24-491", "P03", 2, "HUB_B", "pvc", "ready", ago(5), false, 26],
  ["O24-491", "P07", 1, "HUB_B", "pvc", "prep", ago(2), false, 26],
  ["STP-203", "P01", 1, "F24", "pvc", "rest", ago(48), false, 26],
  ["STR-118", "P01", 1, "ARABESQUE", "pvc", "cut", ago(20), false, 26],
  ["O24-495", "P02", 1, "LEROY MERLIN", "pvc", "weld", ago(8), false, 26],
  ["O24-495", "P02", 2, "LEROY MERLIN", "pvc", "rest", ago(50), false, 26],
  ["O24-499", "P01", 1, "HUB_A", "pvc", "packed", ago(11), false, 26],
  // a few aluminium elements (tracked separately)
  ["O24-460", "P01", 1, "F24", "alu", "weld", ago(9), false, 24],
  ["O24-460", "P02", 1, "F24", "alu", "cut", ago(4), false, 24],
  ["O24-489", "P01", 1, "HUB_A", "alu", "glaze", ago(6), false, 25],
].map(([order, pos, el, customer, material, stage, lastScan, anomaly, opti]) => ({
  code: `${order}·${pos}·E${el}`,
  order,
  pos,
  el,
  customer,
  material,
  stage,
  lastScan,
  anomaly,
  opti,
  pct: STAGE[stage].pct,
}));

const relTime = (iso) => {
  const h = Math.round((now - new Date(iso).getTime()) / H);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/* ------------------------------------------------------------------ *
 * Small UI atoms
 * ------------------------------------------------------------------ */
function Kpi({ label, value, accent, sub }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        padding: "14px 16px",
        flex: 1,
        minWidth: 130,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: accent,
        }}
      />
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          lineHeight: 1.1,
          color: INK,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function StagePill({ stageKey }) {
  const s = STAGE[stageKey];
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        fontWeight: 700,
        color: s.color,
        background: hexA(s.color, 0.12),
        border: `1px solid ${hexA(s.color, 0.35)}`,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function ReadinessBar({ pct, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 7,
          borderRadius: 999,
          background: "#eceef2",
          overflow: "hidden",
          minWidth: 60,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: INK,
          width: 34,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
export default function PvcPipeline() {
  const [material, setMaterial] = useState("pvc");
  const [stageFilter, setStageFilter] = useState(null);
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ col: "stage", dir: "desc" });

  const byMaterial = useMemo(
    () => ELEMENTS.filter((e) => e.material === material),
    [material]
  );

  const funnelData = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        count: byMaterial.filter((e) => e.stage === s.key).length,
      })),
    [byMaterial]
  );

  const rows = useMemo(() => {
    let r = byMaterial;
    if (stageFilter) r = r.filter((e) => e.stage === stageFilter);
    if (anomalyOnly) r = r.filter((e) => e.anomaly);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter(
        (e) =>
          e.code.toLowerCase().includes(q) ||
          e.customer.toLowerCase().includes(q) ||
          e.order.toLowerCase().includes(q)
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const get = {
      code: (e) => e.code,
      customer: (e) => e.customer,
      order: (e) => e.order,
      stage: (e) => STAGE_ORDER[e.stage],
      pct: (e) => e.pct,
      lastScan: (e) => new Date(e.lastScan).getTime(),
    }[sort.col];
    return [...r].sort((a, b) => {
      const va = get(a),
        vb = get(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [byMaterial, stageFilter, anomalyOnly, query, sort]);

  const total = byMaterial.length;
  const packed = byMaterial.filter((e) => e.stage === "packed").length;
  const readyNotPacked = byMaterial.filter((e) => e.stage === "ready").length;
  const anomalies = byMaterial.filter((e) => e.anomaly).length;

  const setSortCol = (col) =>
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );

  const Th = ({ col, children, align = "left", w }) => (
    <th
      onClick={() => setSortCol(col)}
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: MUTED,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        width: w,
        borderBottom: `1px solid ${LINE}`,
      }}
    >
      {children}
      <span style={{ opacity: sort.col === col ? 1 : 0.2, marginLeft: 4 }}>
        {sort.col === col && sort.dir === "asc" ? "▲" : "▼"}
      </span>
    </th>
  );

  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        background: PAPER,
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(28,34,48,0.05) 1px, transparent 0)",
        backgroundSize: "22px 22px",
        minHeight: "100vh",
        color: INK,
        padding: "28px 24px 48px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap');`}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: 2,
                color: MUTED,
                textTransform: "uppercase",
              }}
            >
              Optimizer · Production scans
            </div>
            <h1
              style={{
                fontWeight: 800,
                fontSize: 34,
                margin: "4px 0 0",
                letterSpacing: -0.5,
              }}
            >
              Element pipeline
            </h1>
          </div>

          {/* PVC / Alu toggle */}
          <div
            style={{
              display: "flex",
              background: CARD,
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: 4,
            }}
          >
            {["pvc", "alu"].map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMaterial(m);
                  setStageFilter(null);
                }}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  border: "none",
                  cursor: "pointer",
                  padding: "7px 16px",
                  borderRadius: 999,
                  background: material === m ? INK : "transparent",
                  color: material === m ? "#fff" : MUTED,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <Kpi label="Elements tracked" value={total} accent={INK} sub={material.toUpperCase()} />
          <Kpi
            label="Packed · shippable"
            value={packed}
            accent={STAGE.packed.color}
            sub={total ? `${Math.round((packed / total) * 100)}% of total` : "—"}
          />
          <Kpi
            label="Ready · not packed"
            value={readyNotPacked}
            accent={STAGE.ready.color}
            sub="awaiting pack"
          />
          <Kpi
            label="Open anomalies"
            value={anomalies}
            accent="#ef4444"
            sub="scans flagged"
          />
        </div>

        {/* Funnel */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            padding: "18px 18px 8px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>Stage pipeline</div>
            <div style={{ fontSize: 12, color: MUTED }}>
              {stageFilter ? (
                <button
                  onClick={() => setStageFilter(null)}
                  style={{
                    border: `1px solid ${LINE}`,
                    background: PAPER,
                    borderRadius: 6,
                    padding: "3px 10px",
                    cursor: "pointer",
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    color: INK,
                  }}
                >
                  filtering: {STAGE[stageFilter].label} ✕
                </button>
              ) : (
                "click a bar to filter the table"
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={STAGES.length * 38 + 20}>
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 4, right: 44, left: 8, bottom: 4 }}
              barCategoryGap={6}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={132}
                tickLine={false}
                axisLine={false}
                tick={{ fontFamily: FONT_MONO, fontSize: 11, fill: INK }}
              />
              <Tooltip
                cursor={{ fill: hexA(INK, 0.04) }}
                contentStyle={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${LINE}`,
                }}
                formatter={(v, _n, p) => [`${v} elements · ${p.payload.pct}% ready`, p.payload.label]}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 4, 4]}
                onClick={(d) =>
                  setStageFilter((cur) => (cur === d.key ? null : d.key))
                }
                cursor="pointer"
              >
                {funnelData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.color}
                    opacity={stageFilter && stageFilter !== d.key ? 0.3 : 1}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{ fontFamily: FONT_MONO, fontSize: 12, fill: INK, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table controls */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search element, order, customer…"
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${LINE}`,
              background: CARD,
              color: INK,
              flex: 1,
              minWidth: 220,
              outline: "none",
            }}
          />
          <button
            onClick={() => setAnomalyOnly((v) => !v)}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: 700,
              padding: "9px 14px",
              borderRadius: 8,
              cursor: "pointer",
              border: `1px solid ${anomalyOnly ? "#ef4444" : LINE}`,
              background: anomalyOnly ? hexA("#ef4444", 0.1) : CARD,
              color: anomalyOnly ? "#ef4444" : MUTED,
            }}
          >
            ⚑ Anomalies only
          </button>
        </div>

        {/* Table */}
        <div
          style={{
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <Th col="code">Element</Th>
                  <Th col="customer">Customer</Th>
                  <Th col="order">Order · Pos</Th>
                  <Th col="stage">Stage</Th>
                  <Th col="pct" w={170}>Readiness</Th>
                  <Th col="lastScan" align="right">Last scan</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr
                    key={e.code}
                    style={{
                      background: i % 2 ? hexA(INK, 0.015) : "transparent",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                        color: INK,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.anomaly && (
                        <span title="Anomaly scan" style={{ color: "#ef4444", marginRight: 6 }}>
                          ⚑
                        </span>
                      )}
                      {e.code}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{e.customer}</td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: MUTED,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.order} · {e.pos}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <StagePill stageKey={e.stage} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <ReadinessBar pct={e.pct} color={STAGE[e.stage].color} />
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: MUTED,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {relTime(e.lastScan)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 28, textAlign: "center", color: MUTED, fontSize: 13 }}
                    >
                      No elements match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderTop: `1px solid ${LINE}`,
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: MUTED,
            }}
          >
            {rows.length} element{rows.length === 1 ? "" : "s"} shown · source: WHNet.Skany
          </div>
        </div>
      </div>
    </div>
  );
}
