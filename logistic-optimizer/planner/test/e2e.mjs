/* End-to-end engine test. Run: node test/e2e.mjs (from module root)
 * Covers every module through the public barrel. Exit 0 = all pass. */
import {
  orchestrate, parse, run,
  computeBatch, computeElement, RATES_DEFAULT,
  capacityReport, STATION_DEFAULT, oee, stationCapacityMin,
  sequence, whatIf, COST_DEFAULT,
  recordActuals, calibrateRates, forecastBottleneck,
  lineReport, stationLanes, EXAMPLE_LINE,
  multiDayPlan,
  simulateFlow, gridFlow,
  orderFlow, seedOrders,
} from "../src/engine/index.js";

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}  got: ${JSON.stringify(got)}`); } };
const mk = (id, o = {}) => ({ id, type: "window", frames: 1, mullions: 1, sashes: 2, glasses: 2, components: [{ kind: "profile", eta_h: -10 }], stage_index: 0, loading_in: 4, ...o });

console.log("[0] BASELINE — orchestrator regression");
const rows = [
  { id: "O24-501", dest: "Lyon", pcs: 32, stage_index: 4, stages_total: 5, materials_in: -10, loading_in: 6 },
  { id: "O24-502", dest: "Lyon", pcs: 28, stage_index: 2, stages_total: 5, materials_in: -5, loading_in: 6 },
  { id: "O24-503", dest: "Lyon", pcs: 24, stage_index: 1, stages_total: 5, materials_in: -2, loading_in: 6 },
  { id: "O24-530", dest: "Paris", pcs: 40, stage_index: 3, stages_total: 5, materials_in: -3, loading_in: 10 },
  { id: "O24-531", dest: "Paris", pcs: 22, stage_index: 0, stages_total: 5, materials_in: 4, loading_in: 10 },
  { id: "O24-540", dest: "Marseille", pcs: 18, stage_index: 2, stages_total: 5, materials_in: -8, loading_in: 2 },
];
const o = orchestrate(rows);
ok("Lyon 84 READY", o.trucks.find(t => t.dest === "Lyon").pcs === 84 && o.trucks.find(t => t.dest === "Lyon").ready);
ok("Paris short 18", o.trucks.find(t => t.dest === "Paris").short === 18);
ok("2 critical actions", o.kpis.critical === 2, o.kpis);
ok("no-opts capacity is null (backward compat)", o.capacity === null);

console.log("[0b] constraint-aware orchestrator");
const heavyEls = computeBatch(Array.from({ length: 24 }, (_, i) => mk("E" + i)));
const oc = orchestrate(rows, undefined, { elements: heavyEls });
ok("folds in binding station", !!oc.kpis.binding && oc.kpis.bindingLoadPct > 100, oc.kpis.binding);
ok("station overload actions merged", oc.actions.some((a) => a.scope === "station" && a.sev === 0));

console.log("[0c] per-component materials gate");
const compRow = [{ id: "C1", dest: "Lyon", pcs: 30, stage_index: 3, stages_total: 5, loading_in: 10, components: [{ kind: "profile", eta_h: -20 }, { kind: "glass", eta_h: 3 }] }];
const ocomp = orchestrate(compRow);
ok("gates on latest component (glass +3)", ocomp.computed[0].materials_in === 3 && ocomp.computed[0].bindingComponent === "glass");
ok("BLOCKED action names the component", ocomp.actions[0].title.includes("glass"));
ok("scalar materials_in still works", orchestrate([{ id: "S1", dest: "Lyon", pcs: 5, stage_index: 0, stages_total: 5, materials_in: 4, loading_in: 10 }]).computed[0].status === "BLOCKED");

console.log("[WFL]");
const w = run(parse('let r = stages_total - stage_index\nlet slack = loading_in - (max(0,materials_in)+r*1h)\nkpi "n" = @count()\nrule "late" when slack<0 => action(critical, id+" late")'), rows);
ok("WFL 6 orders, O24-540 late", w.kpis[0].value === 6 && w.ctas[0].id === "O24-540");

console.log("[L1] work content + routing");
const B = computeElement({ id: "B", type: "window", frames: 1, mullions: 2, sashes: 2, glasses: 3, sprossen: 6, roller_shutter: true, components: [{ kind: "glass", eta_h: 12 }], stage_index: 0, loading_in: 6, dest: "Lyon", pcs: 1 });
ok("weld = 30 min", B.workByStation.weld === 30, B.workByStation.weld);
ok("route inserts sprossen+shutter", B.route.includes("sprossen") && B.route.includes("shutter"));
ok("binding glass @12h", B.bindingComponent === "glass" && B.matReady_h === 12);
ok("door 1.6×", computeElement({ id: "D", type: "door", frames: 1, sashes: 1, glasses: 1, components: [], stage_index: 0 }).workByStation.cut === computeElement({ id: "W", type: "window", frames: 1, sashes: 1, glasses: 1, components: [], stage_index: 0 }).workByStation.cut * 1.6);
ok("passthrough fields", B.loading_in === 6 && B.dest === "Lyon" && B.pcs === 1);

console.log("[L2] capacity + OEE");
const day = computeBatch(Array.from({ length: 24 }, (_, i) => mk("E" + i)));
const cap = capacityReport(day, STATION_DEFAULT, { weld: { plannedTime: 480, runTime: 410, idealCycleMin: 7, totalCount: 48, goodCount: 46 } });
ok("binding identified", !!cap.binding);
ok("overbooked detected", cap.overbooked.length > 0);
const oeeT = oee({ plannedTime: 480, runTime: 410, idealCycleMin: 7, totalCount: 48, goodCount: 46 });
ok("OEE = A×P×Q", Math.abs(oeeT.oee - oeeT.availability * oeeT.performance * oeeT.quality) < 0.001);

console.log("[L2b] machine-paced capacity");
const scap = stationCapacityMin;
const schirmer = { workers: 2, machines: 1, crew: 2, shifts: 1, effective: 0.85 };
ok("Schirmer +worker ≠ more capacity", scap(schirmer) === scap({ ...schirmer, workers: 3 }), [scap(schirmer), scap({ ...schirmer, workers: 3 })]);
ok("Schirmer +machine doubles capacity", Math.abs(scap({ ...schirmer, machines: 2, workers: 4 }) - 2 * scap(schirmer)) < 0.1);
ok("understaffed machine → 0 capacity", scap({ ...schirmer, workers: 1 }) === 0, scap({ ...schirmer, workers: 1 }));
ok("people-paced unchanged (no machines field)", scap({ workers: 2, shifts: 1, effective: 0.85 }) > 0);

console.log("[L3] sequencing + costed what-if");
const tight = computeBatch(["A", "B", "C", "D", "E", "F"].map((id, i) => mk(id, { mullions: 2, sashes: 3, glasses: 3, loading_in: 0.6 + i * 0.4 })));
const ample = { workers: 9, shifts: 1, effective: 0.67 };
const one = { cut: ample, weld: { workers: 1, shifts: 1, effective: 0.67 }, clean: ample, fitting: ample, glaze: ample, qc: ample, pack: ample };
const seq = sequence(tight, one);
ok("late detected", seq.lateCount > 0);
const addW = whatIf(tight, one, { kind: "add_worker", station: seq.station });
ok("add_worker recovers + costs €", addW.saved.length > 0 && addW.deltaCost_eur > 0);

console.log("[L4] actuals + calibration + forecast");
const va = recordActuals({ weld: 200 }, [{ id: "A", station: "weld", in_ts: 0, out_ts: 45 * 60000 }, { id: "B", station: "weld", in_ts: 45 * 60000, out_ts: 95 * 60000 }]);
ok("variance computed", va.find(r => r.station === "weld").actual_min === 95);
const roll = calibrateRates(RATES_DEFAULT, { weld: [1, 1, 1, 1.6] }, 0.0, 1.0);
const ewma = calibrateRates(RATES_DEFAULT, { weld: [1, 1, 1, 1.6] }, 1.0, 1.0);
ok("alpha shifts blend (rolling≠ewma)", roll.audit[0].applied_factor !== ewma.audit[0].applied_factor, [roll.audit[0].applied_factor, ewma.audit[0].applied_factor]);
const fc = forecastBottleneck([{ label: "Next", descriptors: Array.from({ length: 14 }, (_, i) => mk("N" + i)) }], STATION_DEFAULT, { cut: 1.2 });
ok("forecast horizon + risk", fc.horizon.length === 1 && !!fc.next.binding);

console.log("[LINE] user-defined workstations");
ok("8 stations", EXAMPLE_LINE.length === 8);
ok("steel = 2 lanes", stationLanes(EXAMPLE_LINE.find(s => s.id === "cut_steel")) === 2);
const rep = lineReport(EXAMPLE_LINE, [{ code: "frame", type: "frame", pieces: 400 }, { code: "monoblock_frame", type: "monoblock_frame", pieces: 40 }]);
ok("monoblock saw counts only its codes", Math.abs(rep.stations.find(r => r.id === "cut_mono").required_min - 40 * 35 / 60) < 0.1);

console.log("[MULTIDAY] backlog spread across days");
const bigDay = computeBatch(Array.from({ length: 60 }, (_, i) => mk("M" + i, { mullions: 2, sashes: 3, glasses: 3 })));
const oneShift = { cut: { workers: 2, machines: 1, crew: 2, shifts: 1, effective: 0.85 }, weld: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: 0.85 }, clean: { workers: 1, machines: 1, crew: 1, shifts: 1, effective: 0.85 }, fitting: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: 0.85 }, glaze: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: 0.85 }, qc: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: 0.85 }, pack: { workers: 1, machines: 0, crew: 1, shifts: 1, effective: 0.85 } };
const mdp = multiDayPlan(bigDay, oneShift, { days: 15 });
ok("multi-day needs >1 day to clear", mdp.maxDaysToClear > 1, mdp.maxDaysToClear);
ok("binding station has most days", mdp.stations[0].daysToClear === mdp.maxDaysToClear);
ok("load drains monotonically", (() => { const s = mdp.stations[0].perDay; for (let i = 1; i < s.length; i++) if (s[i].load_pct > s[i - 1].load_pct) return false; return true; })());

console.log("[FLOW] queue-over-time simulation");
const flowSim = simulateFlow({ days: 28, startInWork: 500, startWaiting: 300, seed: 42 });
ok("backlog never blows up (queue, not %)", Math.max(...flowSim.days.map((d) => d.backlogStart)) < 2000);
ok("arrivals within 50-150/day", flowSim.days.every((d) => d.arrivals >= 50 && d.arrivals <= 150));
ok("2nd shift only when backlog high or deadlines at risk", flowSim.days.filter((d) => d.secondShift).every((d) => d.backlogStart > 700 || d.atRisk > 120));
ok("completions bounded (1 or 2 shifts)", flowSim.days.every((d) => d.done <= 280));

console.log("[GRID] station × day matrix (deadline-driven shifts)");
const gf = gridFlow({ days: 28 });
ok("full grid populated (7×28)", gf.stations.length * gf.days === 196);
ok("backlog never negative", gf.stations.every((s) => gf.grid[s].every((c) => c.backlog >= 0)));
ok("bottleneck has the max peak", gf.stations.every((s) => gf.peak[s] <= gf.peak[gf.bottleneck]));
ok("far deadlines + small backlog ⇒ 1 shift (not backlog-panicked)", gridFlow({ days: 10, startInWork: 120, startWaiting: 60, deadlineLoDays: 26, deadlineHiDays: 28, seed: 7 }).grid.weld.every((c) => c.shifts === 1));
ok("output varies day to day (not constant)", (() => { const o = gridFlow({ days: 12, seed: 3 }).grid.weld.map((c) => c.done); return new Set(o).size > 3; })());
ok("scan totals used as exact daily output (past phase)", (() => { const sc = { cut: [80, 200, 95, 140, 60] }; const g = gridFlow({ days: 8, seed: 1, today: 6, scans: sc }); return g.grid.cut.slice(0, 5).every((c, i) => c.done === Math.min(c.backlog, sc.cut[i]) && c.fromScan && c.phase === "past"); })());
ok("tight deadlines ⇒ multiple shifts", gridFlow({ days: 10, startInWork: 500, startWaiting: 300, deadlineLoDays: 3, deadlineHiDays: 6, seed: 7 }).grid.cut.some((c) => c.shifts >= 2));
ok("shifts capped at maxShifts, escalate flagged", (() => { const g = gridFlow({ days: 10, startInWork: 800, startWaiting: 400, deadlineLoDays: 1, deadlineHiDays: 3, seed: 7 }); return g.grid.cut.every((c) => c.shifts <= g.maxShifts) && g.grid.cut.some((c) => c.escalate); })());
ok("today carries two numbers: planned + doneSoFar", (() => { const g = gridFlow({ days: 12, today: 6, seed: 42 }); const t = g.grid.cut[5]; return t.phase === "today" && t.planned != null && t.doneSoFar != null && t.doneSoFar <= t.planned; })());
  ok("today splits past/future; past uses actual scans", (() => { const sc = { cut: [120, 95, 140, 110, 130] }; const g = gridFlow({ days: 12, today: 6, scans: sc }); const pastOk = g.grid.cut.slice(0, 5).every((c, i) => c.done === sc.cut[i] && c.phase === "past"); const todayOk = g.grid.cut[5].phase === "today"; const futureOk = g.grid.cut[6].phase === "future"; return pastOk && todayOk && futureOk; })());

console.log("[ORDERFLOW] order-level flow + scan re-adjust");
const obk = seedOrders({ count: 120, seed: 5 });
const ofl = orderFlow({ orders: obk, days: 6 });
ok("day-1 first station lists real orders (EDF)", ofl.days[0].stations.cut.orders.length > 0 && ofl.days[0].stations.cut.orders[0].dueDay <= ofl.days[0].stations.cut.orders.at(-1).dueDay);
ok("orders cascade downstream (weld populated later)", ofl.days[3].stations.weld.orders.length >= 0 && ofl.days.some((d) => d.stations.weld.orders.length > 0));
const scanned = orderFlow({ orders: obk, days: 6, scans: [{ id: obk[0].id, station: "pack", day: 2 }] });
const so = scanned.orders.find((o) => o.id === obk[0].id);
ok("scan marks order shipped early, taken as-is", so.done && so.doneDay === 2);
const midScan = orderFlow({ orders: obk, days: 6, scans: [{ id: "O1002", station: "glaze", day: 2 }] });
const ms = midScan.orders.find((o) => o.id === "O1002");
ok("scan re-adjusts stage + flags scanAdjusted", ms.history.glaze === 2 && ms.scanAdjusted === 2);

console.log("[CROSS] L1→L2→L3 threaded");
const flow = computeBatch(Array.from({ length: 16 }, (_, i) => mk("F" + i, { loading_in: 1 + i * 0.3 })));
const c2 = capacityReport(flow, STATION_DEFAULT);
const s3 = sequence(flow, STATION_DEFAULT, { station: c2.binding });
ok("binding consistent L2↔L3", s3.station === c2.binding);

console.log(`\n${"=".repeat(48)}\nRESULT: ${pass} passed, ${fail} failed\n${"=".repeat(48)}`);
process.exit(fail ? 1 : 0);
