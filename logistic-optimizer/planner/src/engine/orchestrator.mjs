/**
 * orchestrator.mjs — pure planning engine for the window factory.
 *
 * Input  : array of order rows (SQL columns). Required fields per row:
 *   id, dest, pcs, stage_index, stages_total, materials_in (h, +future/-past), loading_in (h)
 * Output : { computed, kpis, actions, trucks, schedule, capacity? }
 *
 * Constraint-aware: pass opts.elements (work-content from computeElement/Batch) and
 * opts.stations (station config) to fold in finite-capacity checks — the orchestrator
 * then knows when independently-"OK" orders collectively overload a station.
 *
 * No DOM, no React. Times are in HOURS. materials_in > 0 means not yet arrived.
 */

import { capacityReport, STATION_DEFAULT } from "./capacity.mjs";

export const DEFAULTS = {
  MIN_STAGE_H: 1,      // a piece cannot pass a stage faster than this
  TRUCK_THRESHOLD: 80, // pcs required to dispatch a truck
  RISK_SLACK_H: 4,     // slack below this (but >= 0) = at risk
};

/** Severity ranks — lower is more urgent. */
export const SEVERITY = { critical: 0, action: 1, review: 2 };

/** Resolve the materials gate from either per-component ETAs or the scalar fallback.
 *  components: [{ kind, eta_h }]  → gate on the LATEST-arriving component, name it.
 *  else materials_in (scalar h)   → backward-compatible single gate. */
export function materialsGate(row) {
  if (Array.isArray(row.components) && row.components.length) {
    let binding = row.components[0];
    for (const c of row.components) if ((c.eta_h ?? 0) > (binding.eta_h ?? 0)) binding = c;
    const eta = binding.eta_h ?? 0;
    return { materials_in: eta, matReady: Math.max(0, eta), bindingComponent: eta > 0 ? binding.kind : null };
  }
  const eta = row.materials_in ?? 0;
  return { materials_in: eta, matReady: Math.max(0, eta), bindingComponent: null };
}

/** Compute derived feasibility fields for a single order row. */
export function feasibility(row, cfg = DEFAULTS) {
  const remaining = row.stages_total - row.stage_index;       // stages left to Packed
  const gate = materialsGate(row);                            // per-component or scalar
  const matReady = gate.matReady;                             // when production can finish
  const earliest = matReady + remaining * cfg.MIN_STAGE_H;    // earliest-ready (h)
  const slack = row.loading_in - earliest;                    // h of buffer before truck
  const window = row.loading_in - matReady;                   // usable production window
  const budgetPerStage = remaining > 0
    ? Math.max(cfg.MIN_STAGE_H, Math.floor(window / remaining))
    : null;
  const blocked = gate.materials_in > 0;
  let status;
  if (slack < 0) status = "LATE";
  else if (blocked) status = "BLOCKED";
  else if (slack < cfg.RISK_SLACK_H) status = "RISK";
  else status = "OK";
  return { ...row, remaining, matReady, materials_in: gate.materials_in, bindingComponent: gate.bindingComponent, earliest, slack, budgetPerStage, blocked, status };
}

/** Group feasible orders (slack >= 0) into trucks per destination. */
export function planTrucks(computed, cfg = DEFAULTS) {
  const byDest = {};
  for (const o of computed) {
    if (o.slack < 0) continue; // late orders can't be promised onto a truck
    (byDest[o.dest] ||= { dest: o.dest, pcs: 0, orders: [], loading_in: Infinity });
    byDest[o.dest].pcs += o.pcs;
    byDest[o.dest].orders.push(o.id);
    byDest[o.dest].loading_in = Math.min(byDest[o.dest].loading_in, o.loading_in);
  }
  return Object.values(byDest).map((t) => ({
    ...t,
    fill: Math.round((t.pcs / cfg.TRUCK_THRESHOLD) * 100),
    short: Math.max(0, cfg.TRUCK_THRESHOLD - t.pcs),
    ready: t.pcs >= cfg.TRUCK_THRESHOLD,
  }));
}

/** Derive ranked calls-to-action from computed rows + trucks. Each carries a reason. */
export function deriveActions(computed, trucks, cfg = DEFAULTS) {
  const acts = [];
  for (const o of computed) {
    if (o.status === "LATE")
      acts.push({ sev: 0, id: o.id, title: `Renegotiate or expedite ${o.id} — late by ${Math.abs(o.slack)}h`,
        why: `Earliest ready +${o.earliest}h (${o.remaining} stages × ${cfg.MIN_STAGE_H}h) but truck loads at +${o.loading_in}h.` });
    else if (o.status === "BLOCKED")
      acts.push({ sev: o.slack < cfg.RISK_SLACK_H ? 0 : 1, id: o.id, title: `Expedite ${o.bindingComponent || "materials"} for ${o.id} — arriving +${o.materials_in}h`,
        why: `Blocked until ${o.bindingComponent || "materials"} lands; ${o.slack}h slack, ${o.budgetPerStage}h per remaining stage.` });
    else if (o.status === "RISK")
      acts.push({ sev: 1, id: o.id, title: `Push ${o.id} — ${o.slack}h slack`,
        why: `${o.remaining} stages left, only ${o.budgetPerStage}h budget per stage.` });
  }
  for (const t of trucks) {
    if (t.ready)
      acts.push({ sev: 2, id: t.dest, title: `Confirm carrier for ${t.dest} — ${t.pcs}/${cfg.TRUCK_THRESHOLD} pcs`, why: `Threshold met. Compare own truck vs carrier before the slot.` });
    else
      acts.push({ sev: 1, id: t.dest, title: `${t.dest} truck short by ${t.short} pcs (${t.pcs}/${cfg.TRUCK_THRESHOLD})`, why: `Below dispatch threshold. Hold for consolidation or pull a nearby order forward.` });
  }
  return acts.sort((a, b) => a.sev - b.sev);
}

/** Earliest-deadline-first work schedule (by slack ascending). */
export function workSchedule(computed) {
  return [...computed].sort((a, b) => a.slack - b.slack);
}

/** One-shot: run the whole engine.
 *  opts.elements + opts.stations (optional) enable finite-capacity awareness:
 *  the orchestrator folds in station overloads that per-order slack can't see. */
export function orchestrate(rows, cfg = DEFAULTS, opts = {}) {
  const computed = rows.map((r) => feasibility(r, cfg));
  const trucks = planTrucks(computed, cfg);
  const actions = deriveActions(computed, trucks, cfg);
  const schedule = workSchedule(computed);
  const kpis = {
    orders: rows.length,
    offTrack: computed.filter((o) => o.status !== "OK").length,
    critical: actions.filter((a) => a.sev === 0).length,
    trucksReady: trucks.filter((t) => t.ready).length,
  };

  // --- constraint awareness (Layer 2 fold-in) ---
  let capacity = null;
  if (opts.elements && opts.elements.length) {
    const stations = opts.stations || STATION_DEFAULT;
    capacity = capacityReport(opts.elements, stations, opts.oeeInputs || {});
    // merge capacity actions (station overloads, pacing, OEE) into the ranked list
    for (const a of capacity.actions) actions.push({ ...a, scope: "station" });
    actions.sort((x, y) => x.sev - y.sev);
    kpis.binding = capacity.binding;
    kpis.bindingLoadPct = capacity.bindingLoadPct;
    kpis.overbooked = capacity.overbooked.length;
    kpis.critical = actions.filter((a) => a.sev === 0).length; // recount incl. station crits
  }

  return { computed, kpis, actions, trucks, schedule, capacity };
}
