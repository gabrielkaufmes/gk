/**
 * workcontent.mjs — Layer 1 of the engine extension.
 *
 * Replaces the old "1 hour per stage" fiction with REAL work content computed
 * from an element's bill-of-materials/geometry, and a ROUTE decided by the
 * element's type and options. Times are MINUTES internally; exposed as hours
 * where the orchestrator expects hours.
 *
 * Pure: no DOM, no React. Safe in Node, a worker, or the backend.
 *
 *   import { computeElement, RATES_DEFAULT, ROUTES_DEFAULT } from "./workcontent.mjs";
 *   const r = computeElement(descriptor, rates?, routes?);
 *   // r.workByStation (min), r.route, r.totalMin, r.earliest_h, r.bindingComponent
 */

/* ------------------------------------------------------------------ *
 * Tunable constants (per-unit MINUTES). Ship as defaults; the office
 * edits them (settings), and Layer 4 calibrates them from scans.
 * These are the ONLY magic numbers — everything else is derived.
 * ------------------------------------------------------------------ */
export const RATES_DEFAULT = {
  cut:      { perFrameSide: 1.5, perMullion: 2,   perSashSide: 1.5, perBead: 1 },
  weld:     { perFrameSide: 2,   perMullion: 3,   perSashSide: 2 },
  clean:    { perCorner: 1.5 },                 // corners = welded joints to clean
  fitting:  { perSashSet: 8 },                  // one hardware set per sash
  sprossen: { perSprosse: 6 },                  // cut + apply per decorative bar
  shutter:  { perShutter: 25 },                 // roller shutter mount
  glaze:    { perBead: 2, perGlass: 4 },        // 4 beads/glass + handling
  qc:       { perElement: 4 },
  pack:     { perElement: 5 },
  /* whole-route modifiers */
  door:     { multiplier: 1.6 },                // door route is slower
  special:  { perElementManual: 120 },          // HST/sliding/irregular = manual block
};

/* ------------------------------------------------------------------ *
 * Routing: which stations an element visits, by type. Options insert
 * extra stations. Order matters — it's the physical flow.
 * ------------------------------------------------------------------ */
export const ROUTES_DEFAULT = {
  window: ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"],
  door:   ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"], // same path, door multiplier applied
  special_hst:      ["manual", "fitting", "glaze", "qc", "pack"],
  special_sliding:  ["manual", "fitting", "glaze", "qc", "pack"],
  special_irregular:["manual", "qc", "pack"],
};
/* conditional inserts: option → { station, before } */
const OPTION_INSERTS = [
  { when: (d) => d.sprossen > 0,      station: "sprossen", before: "glaze" },
  { when: (d) => d.roller_shutter,    station: "shutter",  before: "qc" },
];

const isSpecial = (t) => t && t.startsWith("special");

/* ------------------------------------------------------------------ *
 * Geometry → counts. Each driver maps to physical work units.
 * ------------------------------------------------------------------ */
function counts(d) {
  const frames = d.frames || 0;
  const mullions = d.mullions || 0;
  const sashes = d.sashes || 0;
  const glasses = d.glasses || 0;
  const sprossen = d.sprossen || 0;
  return {
    frames, mullions, sashes, glasses, sprossen,
    frameSides: frames * 4,
    sashSides: sashes * 4,
    fittingSets: sashes,                 // 1 set per sash
    beads: glasses * 4,                  // 4 glazing beads per glass
    corners: frames * 4 + sashes * 4,    // welded corners to clean
    shutters: d.roller_shutter ? 1 : 0,
  };
}

/* work minutes for one station given counts + rates */
function stationMinutes(station, c, rates) {
  const r = rates[station] || {};
  switch (station) {
    case "cut":   return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide + c.beads * r.perBead;
    case "weld":  return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide;
    case "clean": return c.corners * r.perCorner;
    case "fitting": return c.fittingSets * r.perSashSet;
    case "sprossen": return c.sprossen * r.perSprosse;
    case "shutter":  return c.shutters * r.perShutter;
    case "glaze": return c.beads * r.perBead + c.glasses * r.perGlass;
    case "qc":    return r.perElement || 0;
    case "pack":  return r.perElement || 0;
    case "manual": return rates.special.perElementManual;
    default: return 0;
  }
}

/** Build the ordered route for a descriptor (type + option inserts). */
export function routeFor(d, routes = ROUTES_DEFAULT) {
  const base = (routes[d.type] || routes.window).slice();
  for (const ins of OPTION_INSERTS) {
    if (!ins.when(d)) continue;
    const at = base.indexOf(ins.before);
    if (at === -1) base.push(ins.station);
    else base.splice(at, 0, ins.station);
  }
  return base;
}

/* materials gate: latest-arriving component binds; name it */
function materialsGate(components) {
  if (!components || !components.length) return { matReady_h: 0, bindingComponent: null };
  let binding = components[0];
  for (const c of components) if ((c.eta_h ?? 0) > (binding.eta_h ?? 0)) binding = c;
  const matReady_h = Math.max(0, binding.eta_h ?? 0);
  return { matReady_h, bindingComponent: matReady_h > 0 ? binding.kind : null };
}

/**
 * Compute full work content + honest earliest-ready for one element.
 * `stageIndex` (optional) = how far it already is along its route; only the
 * remaining stations count toward earliest-ready.
 */
export function computeElement(d, rates = RATES_DEFAULT, routes = ROUTES_DEFAULT) {
  const c = counts(d);
  const route = routeFor(d, routes);
  const mult = d.type === "door" ? rates.door.multiplier : 1;

  const workByStation = {};
  for (const st of route) workByStation[st] = +(stationMinutes(st, c, rates) * mult).toFixed(1);

  const totalMin = +Object.values(workByStation).reduce((a, b) => a + b, 0).toFixed(1);

  const stageIndex = d.stage_index ?? 0;
  const remainingStations = route.slice(stageIndex);
  const remainingMin = remainingStations.reduce((a, st) => a + (workByStation[st] || 0), 0);

  const { matReady_h, bindingComponent } = materialsGate(d.components);
  // earliest-ready (h) = when materials are in + the remaining work to do
  const earliest_h = +(matReady_h + remainingMin / 60).toFixed(2);

  return {
    id: d.id,
    type: d.type,
    route,
    counts: c,
    workByStation,           // minutes per station (explainable)
    totalMin,
    remainingMin: +remainingMin.toFixed(1),
    matReady_h,
    bindingComponent,
    earliest_h,
    // passthrough planning fields for downstream layers (sequence/orchestrate)
    loading_in: d.loading_in,
    dest: d.dest,
    pcs: d.pcs,
    stage_index: stageIndex,
  };
}

/** Convenience: compute a batch. */
export function computeBatch(descriptors, rates = RATES_DEFAULT, routes = ROUTES_DEFAULT) {
  return descriptors.map((d) => computeElement(d, rates, routes));
}
