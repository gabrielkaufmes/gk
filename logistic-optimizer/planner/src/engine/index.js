/**
 * Engine barrel. Pure, framework-free logic for the production planner.
 *
 *   import { orchestrate } from "./engine";        // feasibility, trucks, schedule, actions
 *   import { parse, run } from "./engine";          // WFL: text rules -> KPIs + actions
 */
export { orchestrate, feasibility, planTrucks, deriveActions, workSchedule, materialsGate, DEFAULTS, SEVERITY } from "./orchestrator.mjs";
export { parse, run } from "./wfl.mjs";
// Layer 1 — work-content & routing model (BOM → minutes; type+options → route)
export { computeElement, computeBatch, routeFor, RATES_DEFAULT, ROUTES_DEFAULT } from "./workcontent.mjs";
// Layer 2 — finite workforce capacity + OEE at the binding station
export { loadStations, oee, capacityReport, stationCapacityMin, STATION_DEFAULT, SHIFT_HOURS, MAX_SHIFTS } from "./capacity.mjs";
// Layer 3 — sequencing + what-if levers with euro costing
export { sequence, whatIf, COST_DEFAULT } from "./sequence.mjs";
// Layer 4 — actuals loop, rate calibration (rolling+EWMA blend), bottleneck forecast
export { recordActuals, calibrateRates, forecastBottleneck, ALPHA_DEFAULT } from "./learning.mjs";
// Line builder — user-definable workstations (people, machines, time models, routing)
export { defineStation, defineLine, stationCapacityMin as lineStationCapacityMin, stationLanes, stationDemandMin, lineReport, EXAMPLE_LINE } from "./line.mjs";
export { multiDayPlan } from "./multiday.mjs";
export { simulateFlow, stationFlow, gridFlow, rng, FLOW_DEFAULTS, THROUGHPUT_DEFAULT, VARIANCE_DEFAULT, LINE_ORDER } from './flow.mjs';
export { orderFlow, seedOrders, ORDERS_PER_SHIFT_DEFAULT } from './orderflow.mjs';
