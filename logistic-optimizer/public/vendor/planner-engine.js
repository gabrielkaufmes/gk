var PlannerEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // planner/src/engine/index.js
  var engine_exports = {};
  __export(engine_exports, {
    ALPHA_DEFAULT: () => ALPHA_DEFAULT,
    COST_DEFAULT: () => COST_DEFAULT,
    DEFAULTS: () => DEFAULTS,
    EXAMPLE_LINE: () => EXAMPLE_LINE,
    FLOW_DEFAULTS: () => FLOW_DEFAULTS,
    LINE_ORDER: () => LINE_ORDER,
    MAX_SHIFTS: () => MAX_SHIFTS,
    ORDERS_PER_SHIFT_DEFAULT: () => ORDERS_PER_SHIFT_DEFAULT,
    RATES_DEFAULT: () => RATES_DEFAULT,
    ROUTES_DEFAULT: () => ROUTES_DEFAULT,
    SEVERITY: () => SEVERITY,
    SHIFT_HOURS: () => SHIFT_HOURS,
    STATION_DEFAULT: () => STATION_DEFAULT,
    THROUGHPUT_DEFAULT: () => THROUGHPUT_DEFAULT,
    VARIANCE_DEFAULT: () => VARIANCE_DEFAULT,
    calibrateRates: () => calibrateRates,
    capacityReport: () => capacityReport,
    computeBatch: () => computeBatch,
    computeElement: () => computeElement,
    defineLine: () => defineLine,
    defineStation: () => defineStation,
    deriveActions: () => deriveActions,
    feasibility: () => feasibility,
    forecastBottleneck: () => forecastBottleneck,
    gridFlow: () => gridFlow,
    lineReport: () => lineReport,
    lineStationCapacityMin: () => stationCapacityMin2,
    loadStations: () => loadStations,
    materialsGate: () => materialsGate,
    multiDayPlan: () => multiDayPlan,
    oee: () => oee,
    orchestrate: () => orchestrate,
    orderFlow: () => orderFlow,
    parse: () => parse,
    planTrucks: () => planTrucks,
    recordActuals: () => recordActuals,
    rng: () => rng,
    routeFor: () => routeFor,
    run: () => run,
    seedOrders: () => seedOrders,
    sequence: () => sequence,
    simulateFlow: () => simulateFlow,
    stationCapacityMin: () => stationCapacityMin,
    stationDemandMin: () => stationDemandMin,
    stationFlow: () => stationFlow,
    stationLanes: () => stationLanes,
    whatIf: () => whatIf,
    workSchedule: () => workSchedule
  });

  // planner/src/engine/capacity.mjs
  var SHIFT_HOURS = 8;
  var MAX_SHIFTS = 3;
  var EFFECTIVE_DEFAULT = 0.67;
  var STATION_DEFAULT = {
    cut: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    weld: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    clean: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    fitting: { workers: 2, shifts: 1, effective: EFFECTIVE_DEFAULT },
    sprossen: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    shutter: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    glaze: { workers: 2, shifts: 1, effective: EFFECTIVE_DEFAULT },
    qc: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    pack: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT },
    manual: { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT }
  };
  var clampShifts = (n) => Math.max(1, Math.min(MAX_SHIFTS, n || 1));
  function usableMachines(cfg) {
    if (!cfg.machines) return 0;
    return Math.max(0, Math.min(cfg.machines, Math.floor((cfg.workers || 0) / (cfg.crew || 1))));
  }
  function stationCapacityMin(cfg) {
    const shifts = clampShifts(cfg.shifts);
    const eff = cfg.effective ?? EFFECTIVE_DEFAULT;
    const horizon = shifts * SHIFT_HOURS * 60 * eff;
    if (!cfg.machines) return +(Math.max(0, cfg.workers || 0) * horizon).toFixed(1);
    return +(usableMachines(cfg) * horizon).toFixed(1);
  }
  function loadStations(elements, stations = STATION_DEFAULT) {
    const required = {};
    for (const el of elements) {
      const route = el.route || Object.keys(el.workByStation || {});
      const startIdx = el._stageIndex ?? 0;
      route.slice(startIdx).forEach((st) => {
        required[st] = (required[st] || 0) + (el.workByStation?.[st] || 0);
      });
    }
    const rows = Object.keys({ ...required, ...stations }).map((st) => {
      const cfg = stations[st] || { workers: 1, shifts: 1, effective: EFFECTIVE_DEFAULT };
      const cap = stationCapacityMin(cfg);
      const req = +(required[st] || 0).toFixed(1);
      const loadPct = cap > 0 ? Math.round(req / cap * 100) : req > 0 ? Infinity : 0;
      return {
        station: st,
        required_min: req,
        capacity_min: cap,
        load_pct: loadPct,
        overbooked: req > cap,
        over_min: +Math.max(0, req - cap).toFixed(1),
        workers: cfg.workers,
        shifts: clampShifts(cfg.shifts),
        effective: cfg.effective ?? EFFECTIVE_DEFAULT
      };
    }).filter((r) => r.required_min > 0 || stations[r.station]);
    rows.sort((a, b) => b.load_pct - a.load_pct);
    return rows;
  }
  function oee({ plannedTime, runTime, idealCycleMin, totalCount, goodCount }) {
    const availability = plannedTime > 0 ? runTime / plannedTime : 0;
    const performance = runTime > 0 ? idealCycleMin * totalCount / runTime : 0;
    const quality = totalCount > 0 ? goodCount / totalCount : 0;
    const value = availability * Math.min(1, performance) * quality;
    return {
      availability: +availability.toFixed(3),
      performance: +Math.min(1, performance).toFixed(3),
      quality: +quality.toFixed(3),
      oee: +value.toFixed(3),
      losses: {
        availability_pct: +((1 - availability) * 100).toFixed(1),
        performance_pct: +((1 - Math.min(1, performance)) * 100).toFixed(1),
        quality_pct: +((1 - quality) * 100).toFixed(1)
      }
    };
  }
  function capacityReport(elements, stations = STATION_DEFAULT, oeeInputs = {}) {
    const load = loadStations(elements, stations);
    const binding = load[0] || null;
    const overbooked = load.filter((r) => r.overbooked);
    const bindingOEE = binding && oeeInputs[binding.station] ? oee(oeeInputs[binding.station]) : null;
    const actions = [];
    for (const r of overbooked) {
      actions.push({
        sev: 0,
        station: r.station,
        title: `${r.station} overbooked by ${(r.over_min / 60).toFixed(1)}h (${r.load_pct}% load)`,
        why: `Needs ${(r.required_min / 60).toFixed(1)}h of labor but has ${(r.capacity_min / 60).toFixed(1)}h (${r.workers}\xD7${r.shifts} shift). Add a worker/shift, offload, or these elements can't all run.`
      });
    }
    if (binding && !binding.overbooked && binding.load_pct >= 85) {
      actions.push({
        sev: 1,
        station: binding.station,
        title: `${binding.station} is the pacing station at ${binding.load_pct}% load`,
        why: `Tightest resource this shift. Protect it from starvation/stalls \u2014 it sets the floor's rate.`
      });
    }
    if (bindingOEE) {
      const worst = Object.entries(bindingOEE.losses).sort((a, b) => b[1] - a[1])[0];
      actions.push({
        sev: bindingOEE.oee < 0.6 ? 1 : 2,
        station: binding.station,
        title: `OEE at ${binding.station}: ${(bindingOEE.oee * 100).toFixed(0)}%`,
        why: `Biggest loss is ${worst[0].replace("_pct", "")} (${worst[1]}%). Availability ${(bindingOEE.availability * 100).toFixed(0)}% \xB7 Performance ${(bindingOEE.performance * 100).toFixed(0)}% \xB7 Quality ${(bindingOEE.quality * 100).toFixed(0)}%.`
      });
    }
    actions.sort((a, b) => a.sev - b.sev);
    return {
      load,
      binding: binding ? binding.station : null,
      bindingLoadPct: binding ? binding.load_pct : null,
      overbooked: overbooked.map((r) => r.station),
      bindingOEE,
      actions
    };
  }

  // planner/src/engine/orchestrator.mjs
  var DEFAULTS = {
    MIN_STAGE_H: 1,
    // a piece cannot pass a stage faster than this
    TRUCK_THRESHOLD: 80,
    // pcs required to dispatch a truck
    RISK_SLACK_H: 4
    // slack below this (but >= 0) = at risk
  };
  var SEVERITY = { critical: 0, action: 1, review: 2 };
  function materialsGate(row) {
    if (Array.isArray(row.components) && row.components.length) {
      let binding = row.components[0];
      for (const c of row.components) if ((c.eta_h ?? 0) > (binding.eta_h ?? 0)) binding = c;
      const eta2 = binding.eta_h ?? 0;
      return { materials_in: eta2, matReady: Math.max(0, eta2), bindingComponent: eta2 > 0 ? binding.kind : null };
    }
    const eta = row.materials_in ?? 0;
    return { materials_in: eta, matReady: Math.max(0, eta), bindingComponent: null };
  }
  function feasibility(row, cfg = DEFAULTS) {
    const remaining = row.stages_total - row.stage_index;
    const gate = materialsGate(row);
    const matReady = gate.matReady;
    const earliest = matReady + remaining * cfg.MIN_STAGE_H;
    const slack = row.loading_in - earliest;
    const window = row.loading_in - matReady;
    const budgetPerStage = remaining > 0 ? Math.max(cfg.MIN_STAGE_H, Math.floor(window / remaining)) : null;
    const blocked = gate.materials_in > 0;
    let status;
    if (slack < 0) status = "LATE";
    else if (blocked) status = "BLOCKED";
    else if (slack < cfg.RISK_SLACK_H) status = "RISK";
    else status = "OK";
    return { ...row, remaining, matReady, materials_in: gate.materials_in, bindingComponent: gate.bindingComponent, earliest, slack, budgetPerStage, blocked, status };
  }
  function planTrucks(computed, cfg = DEFAULTS) {
    const byDest = {};
    for (const o of computed) {
      if (o.slack < 0) continue;
      byDest[o.dest] ||= { dest: o.dest, pcs: 0, orders: [], loading_in: Infinity };
      byDest[o.dest].pcs += o.pcs;
      byDest[o.dest].orders.push(o.id);
      byDest[o.dest].loading_in = Math.min(byDest[o.dest].loading_in, o.loading_in);
    }
    return Object.values(byDest).map((t) => ({
      ...t,
      fill: Math.round(t.pcs / cfg.TRUCK_THRESHOLD * 100),
      short: Math.max(0, cfg.TRUCK_THRESHOLD - t.pcs),
      ready: t.pcs >= cfg.TRUCK_THRESHOLD
    }));
  }
  function deriveActions(computed, trucks, cfg = DEFAULTS) {
    const acts = [];
    for (const o of computed) {
      if (o.status === "LATE")
        acts.push({
          sev: 0,
          id: o.id,
          title: `Renegotiate or expedite ${o.id} \u2014 late by ${Math.abs(o.slack)}h`,
          why: `Earliest ready +${o.earliest}h (${o.remaining} stages \xD7 ${cfg.MIN_STAGE_H}h) but truck loads at +${o.loading_in}h.`
        });
      else if (o.status === "BLOCKED")
        acts.push({
          sev: o.slack < cfg.RISK_SLACK_H ? 0 : 1,
          id: o.id,
          title: `Expedite ${o.bindingComponent || "materials"} for ${o.id} \u2014 arriving +${o.materials_in}h`,
          why: `Blocked until ${o.bindingComponent || "materials"} lands; ${o.slack}h slack, ${o.budgetPerStage}h per remaining stage.`
        });
      else if (o.status === "RISK")
        acts.push({
          sev: 1,
          id: o.id,
          title: `Push ${o.id} \u2014 ${o.slack}h slack`,
          why: `${o.remaining} stages left, only ${o.budgetPerStage}h budget per stage.`
        });
    }
    for (const t of trucks) {
      if (t.ready)
        acts.push({ sev: 2, id: t.dest, title: `Confirm carrier for ${t.dest} \u2014 ${t.pcs}/${cfg.TRUCK_THRESHOLD} pcs`, why: `Threshold met. Compare own truck vs carrier before the slot.` });
      else
        acts.push({ sev: 1, id: t.dest, title: `${t.dest} truck short by ${t.short} pcs (${t.pcs}/${cfg.TRUCK_THRESHOLD})`, why: `Below dispatch threshold. Hold for consolidation or pull a nearby order forward.` });
    }
    return acts.sort((a, b) => a.sev - b.sev);
  }
  function workSchedule(computed) {
    return [...computed].sort((a, b) => a.slack - b.slack);
  }
  function orchestrate(rows, cfg = DEFAULTS, opts = {}) {
    const computed = rows.map((r) => feasibility(r, cfg));
    const trucks = planTrucks(computed, cfg);
    const actions = deriveActions(computed, trucks, cfg);
    const schedule = workSchedule(computed);
    const kpis = {
      orders: rows.length,
      offTrack: computed.filter((o) => o.status !== "OK").length,
      critical: actions.filter((a) => a.sev === 0).length,
      trucksReady: trucks.filter((t) => t.ready).length
    };
    let capacity = null;
    if (opts.elements && opts.elements.length) {
      const stations = opts.stations || STATION_DEFAULT;
      capacity = capacityReport(opts.elements, stations, opts.oeeInputs || {});
      for (const a of capacity.actions) actions.push({ ...a, scope: "station" });
      actions.sort((x, y) => x.sev - y.sev);
      kpis.binding = capacity.binding;
      kpis.bindingLoadPct = capacity.bindingLoadPct;
      kpis.overbooked = capacity.overbooked.length;
      kpis.critical = actions.filter((a) => a.sev === 0).length;
    }
    return { computed, kpis, actions, trucks, schedule, capacity };
  }

  // planner/src/engine/wfl.mjs
  var KW = /* @__PURE__ */ new Set(["if", "then", "else", "and", "or", "not", "where", "const", "let", "kpi", "rule", "action", "when", "true", "false"]);
  function lex(src) {
    const t = [];
    let i = 0;
    const n = src.length;
    const push = (type, value) => t.push({ type, value });
    while (i < n) {
      const c = src[i];
      if (c === "#") {
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      if (c === "\n") {
        push("nl");
        i++;
        continue;
      }
      if (c === " " || c === "	" || c === "\r") {
        i++;
        continue;
      }
      if (c === '"') {
        let j = i + 1, s = "";
        while (j < n && src[j] !== '"') {
          s += src[j];
          j++;
        }
        i = j + 1;
        push("str", s);
        continue;
      }
      if (/[0-9]/.test(c)) {
        let j = i, num = "";
        while (j < n && /[0-9.]/.test(src[j])) {
          num += src[j];
          j++;
        }
        let mult = 1;
        if (src[j] === "h") {
          mult = 1;
          j++;
        } else if (src[j] === "m") {
          mult = 1 / 60;
          j++;
        } else if (src[j] === "d") {
          mult = 24;
          j++;
        }
        i = j;
        push("num", parseFloat(num) * mult);
        continue;
      }
      if (c === "@") {
        i++;
        let j = i, id = "";
        while (j < n && /[A-Za-z_]/.test(src[j])) {
          id += src[j];
          j++;
        }
        i = j;
        push("agg", id);
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i, id = "";
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) {
          id += src[j];
          j++;
        }
        i = j;
        push(KW.has(id) ? id : "id", id);
        continue;
      }
      const two = src.slice(i, i + 2);
      if (["==", "!=", ">=", "<=", "=>"].includes(two)) {
        push("op", two);
        i += 2;
        continue;
      }
      if ("+-*/%<>(),=".includes(c)) {
        push("op", c);
        i++;
        continue;
      }
      throw new Error("Unexpected character: " + c);
    }
    push("eof");
    return t;
  }
  function parse(src) {
    const t = lex(src);
    let p = 0;
    const peek = () => t[p], next = () => t[p++];
    const at = (type, value) => peek().type === type && (value === void 0 || peek().value === value);
    const eat = (type, value) => {
      if (!at(type, value)) throw new Error(`Expected ${value || type} but got ${peek().type} ${peek().value ?? ""}`);
      return next();
    };
    const skipNl = () => {
      while (at("nl")) next();
    };
    function parseExpr() {
      if (at("if")) return parseIf();
      return parseOr();
    }
    function parseIf() {
      eat("if");
      const c = parseExpr();
      eat("then");
      const a = parseExpr();
      eat("else");
      const b = parseExpr();
      return { k: "if", c, a, b };
    }
    function parseOr() {
      let l = parseAnd();
      while (at("or")) {
        next();
        l = { k: "bin", op: "or", l, r: parseAnd() };
      }
      return l;
    }
    function parseAnd() {
      let l = parseNot();
      while (at("and")) {
        next();
        l = { k: "bin", op: "and", l, r: parseNot() };
      }
      return l;
    }
    function parseNot() {
      if (at("not")) {
        next();
        return { k: "un", op: "not", e: parseCmp() };
      }
      return parseCmp();
    }
    function parseCmp() {
      let l = parseAdd();
      while (at("op") && ["==", "!=", "<", "<=", ">", ">="].includes(peek().value)) {
        const op = next().value;
        l = { k: "bin", op, l, r: parseAdd() };
      }
      return l;
    }
    function parseAdd() {
      let l = parseMul();
      while (at("op") && ["+", "-"].includes(peek().value)) {
        const op = next().value;
        l = { k: "bin", op, l, r: parseMul() };
      }
      return l;
    }
    function parseMul() {
      let l = parseUn();
      while (at("op") && ["*", "/", "%"].includes(peek().value)) {
        const op = next().value;
        l = { k: "bin", op, l, r: parseUn() };
      }
      return l;
    }
    function parseUn() {
      if (at("op", "-")) {
        next();
        return { k: "un", op: "neg", e: parseUn() };
      }
      return parsePrimary();
    }
    function parsePrimary() {
      if (at("num")) return { k: "num", v: next().value };
      if (at("str")) return { k: "str", v: next().value };
      if (at("true")) {
        next();
        return { k: "num", v: 1, bool: true };
      }
      if (at("false")) {
        next();
        return { k: "num", v: 0, bool: true };
      }
      if (at("agg")) return parseAgg();
      if (at("op", "(")) {
        next();
        const e = parseExpr();
        eat("op", ")");
        return e;
      }
      if (at("id")) {
        const name = next().value;
        if (at("op", "(")) {
          next();
          const args = [];
          if (!at("op", ")")) {
            args.push(parseExpr());
            while (at("op", ",")) {
              next();
              args.push(parseExpr());
            }
          }
          eat("op", ")");
          return { k: "call", name, args };
        }
        return { k: "field", name };
      }
      throw new Error("Unexpected token in expression: " + peek().type + " " + (peek().value ?? ""));
    }
    function parseAgg() {
      const fn = next().value;
      eat("op", "(");
      let measure = null, where = null;
      if (!at("op", ")")) {
        if (!at("where")) measure = parseExpr();
        if (at("where")) {
          next();
          where = parseExpr();
        }
      }
      eat("op", ")");
      return { k: "agg", fn, measure, where };
    }
    const prog = { consts: [], lets: [], kpis: [], rules: [] };
    skipNl();
    while (!at("eof")) {
      if (at("const")) {
        next();
        const name = eat("id").value;
        eat("op", "=");
        prog.consts.push({ name, expr: parseExpr() });
      } else if (at("let")) {
        next();
        const name = eat("id").value;
        eat("op", "=");
        prog.lets.push({ name, expr: parseExpr() });
      } else if (at("kpi")) {
        next();
        const label = eat("str").value;
        eat("op", "=");
        prog.kpis.push({ label, expr: parseExpr() });
      } else if (at("rule")) {
        next();
        const name = eat("str").value;
        eat("when");
        const cond = parseExpr();
        eat("op", "=>");
        eat("action");
        eat("op", "(");
        const sev = next().value;
        eat("op", ",");
        const msg = parseExpr();
        eat("op", ")");
        prog.rules.push({ name, cond, sev, msg });
      } else throw new Error("Unknown statement: " + peek().type + " " + (peek().value ?? ""));
      if (!at("eof")) eat("nl");
      skipNl();
    }
    return prog;
  }
  function fmtNum(n) {
    if (typeof n !== "number" || !isFinite(n)) return String(n);
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }
  var truthy = (v) => typeof v === "number" ? v !== 0 : !!v;
  function evalExpr(node, scope, ctx) {
    switch (node.k) {
      case "num":
        return node.v;
      case "str":
        return node.v;
      case "field": {
        if (node.name in scope) return scope[node.name];
        throw new Error("Unknown field/const: " + node.name);
      }
      case "un":
        if (node.op === "neg") return -evalExpr(node.e, scope, ctx);
        if (node.op === "not") return truthy(evalExpr(node.e, scope, ctx)) ? 0 : 1;
        break;
      case "bin": {
        const op = node.op;
        if (op === "and") return truthy(evalExpr(node.l, scope, ctx)) && truthy(evalExpr(node.r, scope, ctx)) ? 1 : 0;
        if (op === "or") return truthy(evalExpr(node.l, scope, ctx)) || truthy(evalExpr(node.r, scope, ctx)) ? 1 : 0;
        const l = evalExpr(node.l, scope, ctx), r = evalExpr(node.r, scope, ctx);
        switch (op) {
          case "+":
            return typeof l === "string" || typeof r === "string" ? lstr(l) + lstr(r) : l + r;
          case "-":
            return l - r;
          case "*":
            return l * r;
          case "/":
            return l / r;
          case "%":
            return l % r;
          case "==":
            return l === r ? 1 : 0;
          case "!=":
            return l !== r ? 1 : 0;
          case "<":
            return l < r ? 1 : 0;
          case "<=":
            return l <= r ? 1 : 0;
          case ">":
            return l > r ? 1 : 0;
          case ">=":
            return l >= r ? 1 : 0;
        }
        break;
      }
      case "if":
        return truthy(evalExpr(node.c, scope, ctx)) ? evalExpr(node.a, scope, ctx) : evalExpr(node.b, scope, ctx);
      case "call": {
        const a = node.args.map((x) => evalExpr(x, scope, ctx));
        const f = { max: Math.max, min: Math.min, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil }[node.name];
        if (!f) throw new Error("Unknown function: " + node.name);
        return f(...a);
      }
      case "agg": {
        const rows = ctx.dataset.filter((r) => node.where ? truthy(evalExpr(node.where, ctx.rowScope(r), ctx)) : true);
        if (node.fn === "count") return rows.length;
        const vals = rows.map((r) => evalExpr(node.measure, ctx.rowScope(r), ctx));
        if (node.fn === "sum") return vals.reduce((a, b) => a + b, 0);
        if (node.fn === "avg") return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        if (node.fn === "min") return vals.length ? Math.min(...vals) : 0;
        if (node.fn === "max") return vals.length ? Math.max(...vals) : 0;
        throw new Error("Unknown aggregate: @" + node.fn);
      }
    }
    throw new Error("eval fail " + node.k);
  }
  function lstr(v) {
    return typeof v === "number" ? fmtNum(v) : String(v);
  }
  function run(prog, dataset) {
    const G = {};
    for (const c of prog.consts) G[c.name] = evalExpr(c.expr, G, { dataset, rowScope: () => G });
    const rowScope = (row) => {
      const s = { ...G, ...row };
      for (const l of prog.lets) s[l.name] = evalExpr(l.expr, s, { dataset, rowScope });
      return s;
    };
    const ctx = { dataset, rowScope };
    const kpis = prog.kpis.map((k) => ({ label: k.label, value: evalExpr(k.expr, G, ctx) }));
    const SEVR = { critical: 0, action: 1, review: 2 };
    const ctas = [];
    for (const row of dataset) {
      const s = rowScope(row);
      for (const ru of prog.rules) {
        if (truthy(evalExpr(ru.cond, s, ctx))) {
          ctas.push({ sev: SEVR[ru.sev] ?? 1, rule: ru.name, id: row.id, msg: lstr(evalExpr(ru.msg, s, ctx)) });
        }
      }
    }
    ctas.sort((a, b) => a.sev - b.sev);
    const computed = dataset.map((r) => rowScope(r));
    return { kpis, ctas, computed };
  }

  // planner/src/engine/workcontent.mjs
  var RATES_DEFAULT = {
    cut: { perFrameSide: 1.5, perMullion: 2, perSashSide: 1.5, perBead: 1 },
    weld: { perFrameSide: 2, perMullion: 3, perSashSide: 2 },
    clean: { perCorner: 1.5 },
    // corners = welded joints to clean
    fitting: { perSashSet: 8 },
    // one hardware set per sash
    sprossen: { perSprosse: 6 },
    // cut + apply per decorative bar
    shutter: { perShutter: 25 },
    // roller shutter mount
    glaze: { perBead: 2, perGlass: 4 },
    // 4 beads/glass + handling
    qc: { perElement: 4 },
    pack: { perElement: 5 },
    /* whole-route modifiers */
    door: { multiplier: 1.6 },
    // door route is slower
    special: { perElementManual: 120 }
    // HST/sliding/irregular = manual block
  };
  var ROUTES_DEFAULT = {
    window: ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"],
    door: ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"],
    // same path, door multiplier applied
    special_hst: ["manual", "fitting", "glaze", "qc", "pack"],
    special_sliding: ["manual", "fitting", "glaze", "qc", "pack"],
    special_irregular: ["manual", "qc", "pack"]
  };
  var OPTION_INSERTS = [
    { when: (d) => d.sprossen > 0, station: "sprossen", before: "glaze" },
    { when: (d) => d.roller_shutter, station: "shutter", before: "qc" }
  ];
  function counts(d) {
    const frames = d.frames || 0;
    const mullions = d.mullions || 0;
    const sashes = d.sashes || 0;
    const glasses = d.glasses || 0;
    const sprossen = d.sprossen || 0;
    return {
      frames,
      mullions,
      sashes,
      glasses,
      sprossen,
      frameSides: frames * 4,
      sashSides: sashes * 4,
      fittingSets: sashes,
      // 1 set per sash
      beads: glasses * 4,
      // 4 glazing beads per glass
      corners: frames * 4 + sashes * 4,
      // welded corners to clean
      shutters: d.roller_shutter ? 1 : 0
    };
  }
  function stationMinutes(station, c, rates) {
    const r = rates[station] || {};
    switch (station) {
      case "cut":
        return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide + c.beads * r.perBead;
      case "weld":
        return c.frameSides * r.perFrameSide + c.mullions * r.perMullion + c.sashSides * r.perSashSide;
      case "clean":
        return c.corners * r.perCorner;
      case "fitting":
        return c.fittingSets * r.perSashSet;
      case "sprossen":
        return c.sprossen * r.perSprosse;
      case "shutter":
        return c.shutters * r.perShutter;
      case "glaze":
        return c.beads * r.perBead + c.glasses * r.perGlass;
      case "qc":
        return r.perElement || 0;
      case "pack":
        return r.perElement || 0;
      case "manual":
        return rates.special.perElementManual;
      default:
        return 0;
    }
  }
  function routeFor(d, routes = ROUTES_DEFAULT) {
    const base = (routes[d.type] || routes.window).slice();
    for (const ins of OPTION_INSERTS) {
      if (!ins.when(d)) continue;
      const at = base.indexOf(ins.before);
      if (at === -1) base.push(ins.station);
      else base.splice(at, 0, ins.station);
    }
    return base;
  }
  function materialsGate2(components) {
    if (!components || !components.length) return { matReady_h: 0, bindingComponent: null };
    let binding = components[0];
    for (const c of components) if ((c.eta_h ?? 0) > (binding.eta_h ?? 0)) binding = c;
    const matReady_h = Math.max(0, binding.eta_h ?? 0);
    return { matReady_h, bindingComponent: matReady_h > 0 ? binding.kind : null };
  }
  function computeElement(d, rates = RATES_DEFAULT, routes = ROUTES_DEFAULT) {
    const c = counts(d);
    const route = routeFor(d, routes);
    const mult = d.type === "door" ? rates.door.multiplier : 1;
    const workByStation = {};
    for (const st of route) workByStation[st] = +(stationMinutes(st, c, rates) * mult).toFixed(1);
    const totalMin = +Object.values(workByStation).reduce((a, b) => a + b, 0).toFixed(1);
    const stageIndex = d.stage_index ?? 0;
    const remainingStations = route.slice(stageIndex);
    const remainingMin = remainingStations.reduce((a, st) => a + (workByStation[st] || 0), 0);
    const { matReady_h, bindingComponent } = materialsGate2(d.components);
    const earliest_h = +(matReady_h + remainingMin / 60).toFixed(2);
    return {
      id: d.id,
      type: d.type,
      route,
      counts: c,
      workByStation,
      // minutes per station (explainable)
      totalMin,
      remainingMin: +remainingMin.toFixed(1),
      matReady_h,
      bindingComponent,
      earliest_h,
      // passthrough planning fields for downstream layers (sequence/orchestrate)
      loading_in: d.loading_in,
      dest: d.dest,
      pcs: d.pcs,
      stage_index: stageIndex
    };
  }
  function computeBatch(descriptors, rates = RATES_DEFAULT, routes = ROUTES_DEFAULT) {
    return descriptors.map((d) => computeElement(d, rates, routes));
  }

  // planner/src/engine/sequence.mjs
  var COST_DEFAULT = {
    overtime_per_h: 38,
    // € per labor-hour beyond the shift
    extra_shift_per_worker: 220,
    // € to open another shift slot (per worker)
    add_worker_per_shift: 180,
    // € for an extra worker for a shift
    extra_truck: 450,
    // € to dispatch a second/under-filled truck
    subcontract_per_min: 1.4,
    // € per minute of work sent outside
    late_penalty_per_h: 25
    // € per hour an order misses its loading slot
  };
  function sequence(elements, stations = STATION_DEFAULT, opts = {}) {
    const load = loadStations(elements, stations);
    const binding = opts.station || load[0] && load[0].station || null;
    if (!binding) return { station: null, timeline: [], capacity_min: 0, makespan_min: 0, lateCount: 0 };
    const cfg = stations[binding] || { workers: 1, shifts: 1, effective: 0.67 };
    const capacity_min = stationCapacityMin(cfg);
    const parallel = Math.max(1, cfg.workers || 1);
    const queue = elements.filter((el) => (el.workByStation?.[binding] || 0) > 0).map((el) => ({
      id: el.id,
      work: el.workByStation[binding],
      loading_min: (el.loading_in ?? Infinity) * 60
    })).sort((a, b) => a.loading_min - b.loading_min);
    const laneFree = new Array(parallel).fill(0);
    const timeline = queue.map((q) => {
      const lane = laneFree.indexOf(Math.min(...laneFree));
      const start = laneFree[lane];
      const end = start + q.work;
      laneFree[lane] = end;
      const late_min = Math.max(0, end - q.loading_min);
      return { id: q.id, lane, start_min: +start.toFixed(1), end_min: +end.toFixed(1), work_min: q.work, loading_min: q.loading_min, late_min: +late_min.toFixed(1), late: late_min > 0 };
    });
    const makespan_min = Math.max(0, ...laneFree);
    const lateCount = timeline.filter((t) => t.late).length;
    const required_min = timeline.reduce((a, t) => a + t.work_min, 0);
    return { station: binding, parallel, capacity_min, required_min: +required_min.toFixed(1), makespan_min: +makespan_min.toFixed(1), lateCount, timeline, overbooked: required_min > capacity_min, over_min: +Math.max(0, required_min - capacity_min).toFixed(1) };
  }
  function whatIf(elements, stations, lever, cost = COST_DEFAULT, opts = {}) {
    const before = sequence(elements, stations, opts);
    let els = elements;
    let st = stations;
    let deltaCost = 0;
    let note = "";
    const cloneStation = (name, patch) => ({ ...st, [name]: { ...st[name] || STATION_DEFAULT[name] || { workers: 1, shifts: 1, effective: 0.67 }, ...patch } });
    switch (lever.kind) {
      case "add_worker": {
        const n = lever.n || 1;
        const cur = st[lever.station] || {};
        st = cloneStation(lever.station, { workers: (cur.workers || 1) + n });
        deltaCost = n * cost.add_worker_per_shift * (cur.shifts || 1);
        note = `+${n} worker(s) at ${lever.station}`;
        break;
      }
      case "add_shift": {
        const n = lever.n || 1;
        const cur = st[lever.station] || {};
        const shifts = Math.min(3, (cur.shifts || 1) + n);
        st = cloneStation(lever.station, { shifts });
        deltaCost = n * cost.extra_shift_per_worker * (cur.workers || 1);
        note = `${lever.station} \u2192 ${shifts} shift(s)`;
        break;
      }
      case "overtime": {
        const cur = st[lever.station] || {};
        const cap = stationCapacityMin(cur);
        const bonusEff = (cap + lever.minutes) / (cap / (cur.effective ?? 0.67));
        st = cloneStation(lever.station, { effective: bonusEff });
        deltaCost = lever.minutes / 60 * cost.overtime_per_h * (cur.workers || 1);
        note = `+${(lever.minutes / 60).toFixed(1)}h overtime at ${lever.station}`;
        break;
      }
      case "pull_forward": {
        els = elements.map((e) => e.id === lever.id ? { ...e, loading_in: lever.to_loading_in } : e);
        note = `${lever.id} loading \u2192 +${lever.to_loading_in}h`;
        break;
      }
      case "split_load": {
        const f = lever.fraction ?? 0.5;
        els = elements.map((e) => e.id === lever.id ? { ...e, workByStation: scale(e.workByStation, f) } : e);
        deltaCost = cost.extra_truck;
        note = `split ${lever.id}: ship ${Math.round((1 - f) * 100)}% now`;
        break;
      }
      case "outsource": {
        const target = elements.find((e) => e.id === lever.id);
        const bindMin = target ? target.workByStation?.[before.station] || 0 : 0;
        els = elements.map((e) => e.id === lever.id ? { ...e, workByStation: { ...e.workByStation, [before.station]: 0 } } : e);
        deltaCost = +(bindMin * cost.subcontract_per_min).toFixed(0);
        note = `outsource ${lever.id} at ${before.station} (${bindMin}m)`;
        break;
      }
      case "resequence": {
        const idx = Object.fromEntries(lever.order.map((id, i) => [id, i]));
        els = [...elements].sort((a, b) => (idx[a.id] ?? 1e9) - (idx[b.id] ?? 1e9));
        els = els.map((e, i) => ({ ...e, loading_in: (e.loading_in ?? 999) + i * 1e-6 }));
        note = "manual resequence";
        break;
      }
      default:
        note = "no-op";
    }
    const after = sequence(els, st, opts);
    const lateB = new Set(before.timeline.filter((t) => t.late).map((t) => t.id));
    const lateA = new Set(after.timeline.filter((t) => t.late).map((t) => t.id));
    const saved = [...lateB].filter((id) => !lateA.has(id));
    const slipped = [...lateA].filter((id) => !lateB.has(id));
    const lateMinB = before.timeline.reduce((a, t) => a + t.late_min, 0);
    const lateMinA = after.timeline.reduce((a, t) => a + t.late_min, 0);
    const penaltyDelta = +((lateMinA - lateMinB) / 60 * cost.late_penalty_per_h).toFixed(0);
    const netCost = deltaCost + penaltyDelta;
    return {
      lever: lever.kind,
      note,
      before: { binding: before.station, lateCount: before.lateCount, over_min: before.over_min, makespan_min: before.makespan_min },
      after: { binding: after.station, lateCount: after.lateCount, over_min: after.over_min, makespan_min: after.makespan_min },
      saved,
      slipped,
      deltaCost_eur: deltaCost,
      latePenaltyDelta_eur: penaltyDelta,
      netCost_eur: netCost,
      verdict: saved.length && netCost <= 0 ? "do it (saves time and money)" : saved.length ? `recovers ${saved.length} order(s) for \u20AC${netCost}` : slipped.length ? "makes things worse" : "no schedule change"
    };
  }
  function scale(work, f) {
    const o = {};
    for (const k in work) o[k] = +(work[k] * f).toFixed(1);
    return o;
  }

  // planner/src/engine/learning.mjs
  var ALPHA_DEFAULT = 0.4;
  function recordActuals(plannedByStation, scans) {
    const actual = {};
    for (const s of scans) {
      if (s.out_ts == null || s.in_ts == null) continue;
      const min = (s.out_ts - s.in_ts) / 6e4;
      if (min <= 0) continue;
      actual[s.station] = (actual[s.station] || 0) + min;
    }
    const rows = Object.keys({ ...plannedByStation, ...actual }).map((st) => {
      const planned = +(plannedByStation[st] || 0).toFixed(1);
      const act = +(actual[st] || 0).toFixed(1);
      const variance_min = +(act - planned).toFixed(1);
      const ratio = planned > 0 ? +(act / planned).toFixed(3) : null;
      return { station: st, planned_min: planned, actual_min: act, variance_min, ratio };
    });
    return rows;
  }
  function calibrateRates(rates, history, alpha = ALPHA_DEFAULT, damping = 0.5) {
    const out = JSON.parse(JSON.stringify(rates));
    const audit = [];
    for (const station of Object.keys(history)) {
      const ratios = (history[station] || []).filter((r) => r > 0);
      if (!ratios.length || !out[station]) continue;
      const rolling = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      let ewma = ratios[0];
      for (let i = 1; i < ratios.length; i++) ewma = alpha * ratios[i] + (1 - alpha) * ewma;
      const blend = (1 - alpha) * rolling + alpha * ewma;
      const factor = 1 + (blend - 1) * damping;
      for (const key of Object.keys(out[station])) {
        if (typeof out[station][key] === "number") out[station][key] = +(out[station][key] * factor).toFixed(3);
      }
      audit.push({ station, rolling: +rolling.toFixed(3), ewma: +ewma.toFixed(3), blend: +blend.toFixed(3), applied_factor: +factor.toFixed(3) });
    }
    return { rates: out, audit };
  }
  function forecastBottleneck(shiftsAhead, stations = STATION_DEFAULT, trendByStation = {}, rates) {
    const horizon = shiftsAhead.map((shift) => {
      const elements = computeBatch(shift.descriptors, rates);
      const load = loadStations(elements, stations).map((r) => {
        const trend = trendByStation[r.station] || 1;
        const projReq = r.required_min * trend;
        const projLoad = r.capacity_min > 0 ? Math.round(projReq / r.capacity_min * 100) : Infinity;
        let risk = "ok";
        if (projLoad >= 100) risk = "overbooked";
        else if (projLoad >= 85) risk = "at_risk";
        return { station: r.station, proj_load_pct: projLoad, trend: +trend.toFixed(2), risk };
      }).sort((a, b) => b.proj_load_pct - a.proj_load_pct);
      const top = load[0] || null;
      return { label: shift.label, binding: top ? top.station : null, binding_load_pct: top ? top.proj_load_pct : null, risk: top ? top.risk : "ok", stations: load };
    });
    const next = horizon[0] || null;
    const window48 = horizon.slice(0, Math.min(horizon.length, 6));
    const earliestOverbook = horizon.find((h) => h.risk === "overbooked") || null;
    const alerts = [];
    if (next && next.risk !== "ok")
      alerts.push({ sev: next.risk === "overbooked" ? 0 : 1, horizon: "next-shift", title: `${next.binding} ${next.risk === "overbooked" ? "will be overbooked" : "at risk"} next shift (${next.binding_load_pct}%)`, why: `Projected with current order book \xD7 observed trend ${next.stations[0]?.trend}\xD7.` });
    if (earliestOverbook && earliestOverbook !== next)
      alerts.push({ sev: 1, horizon: "24-48h", title: `${earliestOverbook.binding} overbooks at "${earliestOverbook.label}" (${earliestOverbook.binding_load_pct}%)`, why: `Build capacity now: add shift/worker or pull work forward before it lands.` });
    return { horizon, next, window48, earliestOverbook, alerts };
  }

  // planner/src/engine/line.mjs
  var SHIFT_HOURS2 = 8;
  var MAX_SHIFTS2 = 3;
  var EFFECTIVE_DEFAULT2 = 0.85;
  function defineStation(s) {
    return {
      id: s.id,
      label: s.label || s.id,
      people: s.people ?? 1,
      machines: s.machines ?? 0,
      // 0 = manual/no-machine station
      peoplePerMachine: s.peoplePerMachine ?? 1,
      shifts: clampShifts2(s.shifts),
      effective: s.effective ?? EFFECTIVE_DEFAULT2,
      scan: s.scan || "per_piece",
      // "per_piece" | "per_batch" | "per_optimization"
      codeFilter: s.codeFilter || null,
      // null = all; or array of codes/types it handles
      time: s.time || { model: "per_piece", seconds: 30 },
      notes: s.notes || ""
    };
  }
  var clampShifts2 = (n) => Math.max(1, Math.min(MAX_SHIFTS2, n || 1));
  function stationCapacityMin2(st) {
    const horizon = st.shifts * SHIFT_HOURS2 * 60 * st.effective;
    const laborMin = st.people * horizon;
    if (!st.machines) return +laborMin.toFixed(1);
    const usableMachines2 = Math.min(st.machines, Math.floor(st.people / st.peoplePerMachine));
    const machineMin = Math.max(0, usableMachines2) * horizon;
    return +Math.min(laborMin, machineMin).toFixed(1);
  }
  function stationLanes(st) {
    if (!st.machines) return Math.max(1, st.people);
    return Math.max(1, Math.min(st.machines, Math.floor(st.people / st.peoplePerMachine)));
  }
  function stationDemandMin(st, items) {
    const handled = items.filter((it) => passesFilter(st, it));
    const t = st.time;
    let seconds = 0;
    switch (t.model) {
      case "per_piece":
        seconds = handled.reduce((a, it) => a + (it.pieces || 0) * t.seconds, 0);
        break;
      case "per_batch_of": {
        const per = t.secondsPerBatch / t.batch;
        seconds = handled.reduce((a, it) => a + (it.units || it.pieces || 0) * per, 0);
        break;
      }
      case "manual":
        seconds = handled.reduce((a, it) => a + (it.pieces || 0) * (t.minutes * 60), 0);
        break;
      case "optimization":
        seconds = handled.reduce((a, it) => a + (it.bundles || 0) * (t.secondsPerBundle || 0), 0);
        break;
      default:
        seconds = 0;
    }
    return +(seconds / 60).toFixed(2);
  }
  function passesFilter(st, item) {
    if (!st.codeFilter) return true;
    if (Array.isArray(st.codeFilter)) return st.codeFilter.includes(item.code) || st.codeFilter.includes(item.type);
    return true;
  }
  function defineLine(stations) {
    return stations.map(defineStation);
  }
  function lineReport(line, items) {
    const rows = line.map((st) => {
      const required = stationDemandMin(st, items);
      const capacity = stationCapacityMin2(st);
      const lanes = stationLanes(st);
      const loadPct = capacity > 0 ? Math.round(required / capacity * 100) : required > 0 ? Infinity : 0;
      return {
        id: st.id,
        label: st.label,
        people: st.people,
        machines: st.machines,
        lanes,
        scan: st.scan,
        timeModel: st.time.model,
        required_min: required,
        capacity_min: capacity,
        load_pct: loadPct,
        overbooked: required > capacity,
        over_min: +Math.max(0, required - capacity).toFixed(1)
      };
    });
    const sorted = [...rows].sort((a, b) => b.load_pct - a.load_pct);
    return { stations: rows, binding: sorted[0]?.id || null, bindingLoadPct: sorted[0]?.load_pct ?? null, overbooked: rows.filter((r) => r.overbooked).map((r) => r.id) };
  }
  var EXAMPLE_LINE = defineLine([
    {
      id: "matprep",
      label: "Material preparation",
      people: 3,
      machines: 0,
      scan: "per_optimization",
      time: { model: "optimization", secondsPerBundle: 0 },
      notes: "Output: optimized bars (frame 6/6.5m, sash 6/6.5m, mullion 6m, blind mullion 6m). One scan per optimization bundle to cutting."
    },
    {
      id: "cut_schirmer",
      label: "Cutting 1 \xB7 Schirmer centre",
      people: 2,
      machines: 1,
      scan: "per_piece",
      time: { model: "per_piece", seconds: 20 },
      notes: "Cutting + machining centre."
    },
    {
      id: "cut_dms",
      label: "Cutting 2 \xB7 double-mitre saw",
      people: 1,
      machines: 1,
      scan: "per_piece",
      codeFilter: ["blind_mullion", "additional_profile"],
      time: { model: "per_piece", seconds: 15 },
      notes: "Defined codes: some blind mullions + all additional profiles."
    },
    {
      id: "cut_mono",
      label: "Cutting 3 \xB7 monoblock",
      people: 1,
      machines: 1,
      scan: "per_piece",
      codeFilter: ["monoblock_frame"],
      time: { model: "per_piece", seconds: 35 },
      notes: "Only monoblock frames (defined codes)."
    },
    {
      id: "cut_steel",
      label: "Cutting steel",
      people: 2,
      machines: 2,
      peoplePerMachine: 1,
      scan: "per_piece",
      time: { model: "per_piece", seconds: 15 },
      notes: "Two identical machines, 1 person each."
    },
    {
      id: "screwing",
      label: "Screwing",
      people: 2,
      machines: 2,
      peoplePerMachine: 1,
      scan: "per_piece",
      time: { model: "per_piece", seconds: 25 },
      notes: "Two identical machines, 1 person each."
    },
    {
      id: "fit_frames_1",
      label: "Fittings frames 1",
      people: 1,
      machines: 1,
      scan: "per_piece",
      codeFilter: ["frame"],
      time: { model: "per_piece", seconds: 35 },
      notes: "Frames only."
    },
    {
      id: "welding",
      label: "Welding",
      people: 3,
      machines: 3,
      peoplePerMachine: 1,
      scan: "per_piece",
      time: { model: "per_batch_of", secondsPerBatch: 180, batch: 4 },
      notes: "3 machines, 3 people. 3 min per weld of four frames/sashes."
    }
  ]);

  // planner/src/engine/multiday.mjs
  function multiDayPlan(elements, stations, opts = {}) {
    const horizonDays = opts.days || 10;
    const req = {};
    for (const el of elements) {
      const route = el.route || Object.keys(el.workByStation || {});
      for (const st of route) req[st] = (req[st] || 0) + (el.workByStation?.[st] || 0);
    }
    const stationRows = Object.keys(stations).filter((st) => (req[st] || 0) > 0).map((st) => {
      const dayCap = stationCapacityMin(stations[st]);
      const total = +(req[st] || 0).toFixed(1);
      let carry = total;
      const perDay = [];
      for (let d = 1; d <= horizonDays; d++) {
        const incoming = carry;
        const done = Math.min(incoming, dayCap);
        carry = +(incoming - done).toFixed(1);
        perDay.push({
          day: d,
          incoming_min: +incoming.toFixed(0),
          done_min: +done.toFixed(0),
          carry_min: +carry.toFixed(0),
          load_pct: dayCap > 0 ? Math.round(incoming / dayCap * 100) : incoming > 0 ? Infinity : 0,
          over: incoming > dayCap
        });
        if (carry <= 0) break;
      }
      const daysToClear = dayCap > 0 ? Math.ceil(total / dayCap) : Infinity;
      return { station: st, totalReq_min: +total.toFixed(0), dayCap_min: +dayCap.toFixed(0), daysToClear, perDay };
    });
    stationRows.sort((a, b) => b.daysToClear - a.daysToClear || b.totalReq_min - a.totalReq_min);
    const binding = stationRows[0] || null;
    const maxDaysToClear = stationRows.reduce((m, s) => Math.max(m, isFinite(s.daysToClear) ? s.daysToClear : 0), 0);
    const byDay = [];
    for (let d = 1; d <= Math.max(1, maxDaysToClear); d++) {
      const load = {};
      let anyOver = false;
      for (const s of stationRows) {
        const cell = s.perDay.find((p) => p.day === d);
        const pct = cell ? cell.load_pct : 0;
        load[s.station] = pct;
        if (pct > 100) anyOver = true;
      }
      byDay.push({ day: d, load, anyOver });
    }
    return { horizonDays, stations: stationRows, binding: binding?.station || null, maxDaysToClear, byDay };
  }

  // planner/src/engine/flow.mjs
  function rng(seed = 42) {
    let s = seed >>> 0;
    return () => {
      s = s * 1103515245 + 12345 & 2147483647;
      return s / 2147483647;
    };
  }
  var ri = (rnd, lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  var FLOW_DEFAULTS = {
    days: 28,
    startInWork: 500,
    // pcs already on the line
    startWaiting: 300,
    // pcs staged, not yet released
    arrivalsLo: 50,
    arrivalsHi: 150,
    // new pcs/day
    perShiftLo: 100,
    perShiftHi: 140,
    // pcs completed per shift
    deadlineLoDays: 14,
    deadlineHiDays: 28,
    // 2–4 weeks
    riskWindowDays: 5,
    // a piece is "at risk" if due within this many days
    riskThresholdPcs: 120,
    // at-risk pcs above this → consider 2nd shift
    backlogThresholdPcs: 700,
    // backlog above this → consider 2nd shift
    secondShiftStations: ["cut", "weld", "fitting", "glaze", "pack"]
    // can take a 2nd shift
  };
  function simulateFlow(cfg = {}) {
    const c = { ...FLOW_DEFAULTS, ...cfg };
    const rnd = rng(c.seed ?? 42);
    let queue = [];
    for (let i = 0; i < c.startInWork + c.startWaiting; i++) queue.push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
    const days = [];
    let peakBacklog = queue.length, totalLate = 0, secondShiftDays = 0, clearedByDay = null;
    for (let d = 1; d <= c.days; d++) {
      const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
      for (let i = 0; i < arrivals; i++) queue.push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
      const backlogStart = queue.length;
      const atRisk = queue.filter((due) => due - d <= c.riskWindowDays).length;
      const secondShift = atRisk > c.riskThresholdPcs || backlogStart > c.backlogThresholdPcs;
      const base = ri(rnd, c.perShiftLo, c.perShiftHi);
      const capacity = secondShift ? base + ri(rnd, c.perShiftLo, c.perShiftHi) : base;
      const done = Math.min(capacity, backlogStart);
      queue.sort((a, b) => a - b);
      const finished = queue.splice(0, done);
      const lateToday = finished.filter((due) => due < d).length;
      totalLate += lateToday;
      const backlogEnd = queue.length;
      if (secondShift) secondShiftDays++;
      peakBacklog = Math.max(peakBacklog, backlogStart);
      if (clearedByDay === null && backlogEnd === 0) clearedByDay = d;
      days.push({ day: d, arrivals, backlogStart, done, capacity, secondShift, backlogEnd, atRisk, lateToday });
    }
    return {
      days,
      summary: {
        peakBacklog,
        endBacklog: queue.length,
        totalLate,
        secondShiftDays,
        clearedByDay,
        avgArrivals: Math.round(days.reduce((a, x) => a + x.arrivals, 0) / days.length),
        avgDone: Math.round(days.reduce((a, x) => a + x.done, 0) / days.length)
      }
    };
  }
  function stationFlow(cfg = {}) {
    const c = { ...FLOW_DEFAULTS, ...cfg };
    const sim = simulateFlow(c);
    const canSecond = new Set(c.secondShiftStations);
    return {
      ...sim,
      secondShiftStations: c.secondShiftStations,
      canSecond: (st) => canSecond.has(st)
    };
  }
  var THROUGHPUT_DEFAULT = { cut: 130, weld: 165, clean: 140, fitting: 150, glaze: 150, qc: 210, pack: 185 };
  var LINE_ORDER = ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"];
  var VARIANCE_DEFAULT = {
    cut: { lo: 0.6, hi: 1.15, breakdownP: 0.08, breakdownTo: 0.35 },
    // saw jams hurt most
    weld: { lo: 0.7, hi: 1.15, breakdownP: 0.05, breakdownTo: 0.45 },
    clean: { lo: 0.75, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.5 },
    fitting: { lo: 0.7, hi: 1.15, breakdownP: 0.04, breakdownTo: 0.5 },
    glaze: { lo: 0.75, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.5 },
    qc: { lo: 0.8, hi: 1.15, breakdownP: 0.02, breakdownTo: 0.6 },
    pack: { lo: 0.8, hi: 1.1, breakdownP: 0.03, breakdownTo: 0.55 }
  };
  function realisedOutput(st, dayIdx, nominal, variance, _unused, rnd) {
    const v = variance[st] || { lo: 0.7, hi: 1.1, breakdownP: 0.04, breakdownTo: 0.5 };
    if (rnd() < v.breakdownP) return Math.round(nominal * v.breakdownTo * (0.8 + rnd() * 0.4));
    const f = v.lo + rnd() * (v.hi - v.lo);
    return Math.round(nominal * f);
  }
  function gridFlow(cfg = {}) {
    const c = { ...FLOW_DEFAULTS, ...cfg };
    const nominal = { ...THROUGHPUT_DEFAULT, ...c.throughput || {} };
    const variance = { ...VARIANCE_DEFAULT, ...c.variance || {} };
    const scans = c.scans || null;
    const today = c.today || 1;
    const order = c.lineOrder || LINE_ORDER;
    const canSecond = new Set(c.secondShiftStations);
    const maxShifts = c.maxShifts || 3;
    const rnd = rng(c.seed ?? 42);
    const q = {};
    order.forEach((s) => q[s] = []);
    for (let i = 0; i < (c.startInWork || 0) + (c.startWaiting || 0); i++) q[order[0]].push(ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
    const idxOf = Object.fromEntries(order.map((s, i) => [s, i]));
    const downstreamDays = (st) => Math.max(1, order.length - idxOf[st] - 1);
    const grid = {};
    order.forEach((s) => grid[s] = []);
    const byDay = [];
    const peak = {};
    order.forEach((s) => peak[s] = q[s].length);
    for (let d = 1; d <= c.days; d++) {
      const arrivals = ri(rnd, c.arrivalsLo, c.arrivalsHi);
      for (let i = 0; i < arrivals; i++) q[order[0]].push(d + ri(rnd, c.deadlineLoDays, c.deadlineHiDays));
      const cells = {};
      let passed = [];
      for (const st of order) {
        q[st] = q[st].concat(passed);
        const backlog = q[st].length;
        const phase = d < today ? "past" : d === today ? "today" : "future";
        const lead = downstreamDays(st);
        const mustToday = q[st].filter((due) => due - lead <= d).length;
        const dueSoon = q[st].filter((due) => due - lead <= d + 2).length;
        const shiftOut = Math.max(1, realisedOutput(st, d - 1, nominal[st], variance, null, rnd));
        let shifts = 1;
        if (canSecond.has(st)) {
          const fromDeadline = mustToday > shiftOut ? Math.ceil(mustToday / shiftOut) : 1;
          const windowDays = 5;
          const dueInWindow = q[st].filter((due) => due - lead <= d + windowDays).length;
          const fromWindow = dueInWindow > shiftOut * windowDays ? Math.ceil(dueInWindow / (shiftOut * windowDays)) : 1;
          shifts = Math.min(maxShifts, Math.max(fromDeadline, fromWindow));
        }
        const plannedCap = shiftOut * shifts;
        let done, planned = null, doneSoFar = null, capacity = plannedCap;
        const scanTotal = scans && scans[st] && scans[st][d - 1] != null ? scans[st][d - 1] : null;
        if (phase === "past") {
          const actual = scanTotal != null ? scanTotal : Math.max(1, realisedOutput(st, d - 1, nominal[st], variance, null, rnd));
          done = Math.min(backlog, actual);
          capacity = actual;
        } else if (phase === "today") {
          planned = Math.min(backlog, plannedCap);
          const frac = c.todayFraction ?? 0.55;
          doneSoFar = scanTotal != null ? Math.min(backlog, scanTotal) : Math.round(planned * frac);
          done = doneSoFar;
          capacity = plannedCap;
        } else {
          done = Math.min(backlog, plannedCap);
          capacity = plannedCap;
        }
        const escalate = mustToday > plannedCap;
        q[st].sort((a, b) => a - b);
        passed = q[st].splice(0, done);
        peak[st] = Math.max(peak[st], backlog);
        const cell = {
          day: d,
          station: st,
          backlog,
          dueSoon,
          mustToday,
          phase,
          shifts,
          shiftOut,
          capacity,
          done,
          planned,
          doneSoFar,
          carried: backlog - done,
          second: shifts >= 2,
          escalate,
          fromScan: scanTotal != null,
          daysOfWork: +(backlog / shiftOut).toFixed(1),
          thru: shiftOut,
          nominal: nominal[st],
          canSecond: canSecond.has(st)
        };
        grid[st].push(cell);
        cells[st] = cell;
      }
      byDay.push({ day: d, arrivals, cells });
    }
    const bottleneck = order.reduce((b, s) => peak[s] > peak[b] ? s : b, order[0]);
    return { stations: order, days: c.days, grid, byDay, peak, bottleneck, nominal, maxShifts, today };
  }

  // planner/src/engine/orderflow.mjs
  var LINE_ORDER2 = ["cut", "weld", "clean", "fitting", "glaze", "qc", "pack"];
  var ORDERS_PER_SHIFT_DEFAULT = { cut: 14, weld: 18, clean: 16, fitting: 16, glaze: 16, qc: 22, pack: 20 };
  var CAN_SECOND = /* @__PURE__ */ new Set(["cut", "weld", "fitting", "glaze", "pack"]);
  var ri2 = (rnd, lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  function seedOrders(cfg = {}) {
    const c = { count: 80, dueLo: 14, dueHi: 28, pcsLo: 3, pcsHi: 12, seed: 42, ...cfg };
    const rnd = rng(c.seed);
    const dests = ["Lyon", "Paris", "Marseille", "Nice", "Lille"];
    const orders = [];
    for (let i = 0; i < c.count; i++) {
      orders.push({
        id: "O" + (1001 + i),
        pcs: ri2(rnd, c.pcsLo, c.pcsHi),
        dest: dests[i % dests.length],
        dueDay: ri2(rnd, c.dueLo, c.dueHi),
        stageIdx: 0,
        // starts at first station
        done: false,
        history: {}
        // station -> day it left (filled as it flows / from scans)
      });
    }
    return orders;
  }
  function orderFlow(cfg = {}) {
    const order = cfg.lineOrder || LINE_ORDER2;
    const ops = { ...ORDERS_PER_SHIFT_DEFAULT, ...cfg.ordersPerShift || {} };
    const days = cfg.days || 20;
    const maxShifts = cfg.maxShifts || 3;
    const idxOf = Object.fromEntries(order.map((s, i) => [s, i]));
    const downstreamDays = (stIdx) => Math.max(1, order.length - stIdx - 1);
    const orders = (cfg.orders || seedOrders()).map((o) => ({ ...o, history: { ...o.history } }));
    const scansByDay = {};
    for (const s of cfg.scans || []) (scansByDay[s.day] ||= []).push(s);
    const out = [];
    for (let d = 1; d <= days; d++) {
      for (const sc of scansByDay[d] || []) {
        const o = orders.find((x) => x.id === sc.id);
        if (!o || o.done) continue;
        const sIdx = idxOf[sc.station];
        if (sIdx == null) continue;
        o.history[sc.station] = d;
        o.stageIdx = sIdx + 1;
        o.scanAdjusted = d;
        if (o.stageIdx >= order.length) {
          o.done = true;
          o.doneDay = d;
        }
      }
      const stations = {};
      for (let si = 0; si < order.length; si++) {
        const st = order[si];
        const here = orders.filter((o) => !o.done && o.stageIdx === si).sort((a, b) => a.dueDay - b.dueDay);
        const lead = downstreamDays(si);
        const mustToday = here.filter((o) => o.dueDay - lead <= d).length;
        const perShift = ops[st];
        let shifts = 1;
        if (CAN_SECOND.has(st)) {
          const fromDeadline = mustToday > perShift ? Math.ceil(mustToday / perShift) : 1;
          const fromBacklog = here.length > perShift * 2.5 ? 2 : 1;
          shifts = Math.min(maxShifts, Math.max(fromDeadline, fromBacklog));
        }
        const capacity = perShift * shifts;
        const escalate = mustToday > capacity;
        const doneToday = here.slice(0, capacity);
        const doneIds = [];
        for (const o of doneToday) {
          o.history[st] = d;
          o.stageIdx = si + 1;
          doneIds.push(o.id);
          if (o.stageIdx >= order.length) {
            o.done = true;
            o.doneDay = d;
          }
        }
        stations[st] = {
          station: st,
          orders: here.map((o) => ({ id: o.id, pcs: o.pcs, dest: o.dest, dueDay: o.dueDay, dueIn: o.dueDay - d, mustRun: o.dueDay - lead <= d, scanAdjusted: o.scanAdjusted || null, willClear: doneIds.includes(o.id) })),
          queueCount: here.length,
          capacity,
          shifts,
          mustToday,
          escalate,
          doneToday: doneIds,
          late: here.filter((o) => o.dueDay - lead < d).map((o) => o.id)
        };
      }
      out.push({ day: d, stations });
    }
    return { days: out, orders, lineOrder: order };
  }
  return __toCommonJS(engine_exports);
})();
