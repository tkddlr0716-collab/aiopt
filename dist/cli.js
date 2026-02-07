#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_fs3 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var import_commander = require("commander");

// src/io.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_sync = require("csv-parse/sync");
function ensureDir(p) {
  import_fs.default.mkdirSync(p, { recursive: true });
}
function readJsonl(filePath) {
  const raw = import_fs.default.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines) {
    const obj = JSON.parse(line);
    out.push(normalizeEvent(obj));
  }
  return out;
}
function readCsv(filePath) {
  const raw = import_fs.default.readFileSync(filePath, "utf8");
  const records = (0, import_sync.parse)(raw, { columns: true, skip_empty_lines: true, trim: true });
  return records.map((r) => normalizeEvent(r));
}
function toNum(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}
function normalizeEvent(x) {
  return {
    ts: String(x.ts ?? ""),
    provider: String(x.provider ?? "").toLowerCase(),
    model: String(x.model ?? ""),
    input_tokens: toNum(x.input_tokens),
    output_tokens: toNum(x.output_tokens),
    feature_tag: String(x.feature_tag ?? ""),
    retries: toNum(x.retries),
    status: String(x.status ?? ""),
    billed_cost: x.billed_cost === void 0 || x.billed_cost === "" ? void 0 : toNum(x.billed_cost)
  };
}
function isCsvPath(p) {
  return import_path.default.extname(p).toLowerCase() === ".csv";
}

// src/scan.ts
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));

// src/cost.ts
function getRates(rt, provider, model) {
  const p = rt.providers[provider];
  if (!p) return null;
  const m = p.models[model];
  if (m) return { kind: "official", input: m.input, output: m.output };
  return { kind: "estimated", input: p.default_estimated.input, output: p.default_estimated.output };
}
function costOfEvent(rt, ev) {
  if (typeof ev.billed_cost === "number" && Number.isFinite(ev.billed_cost)) {
    return {
      cost: ev.billed_cost,
      used_rate: {
        kind: "billed_cost",
        provider: ev.provider,
        model: ev.model,
        input_per_m: 0,
        output_per_m: 0
      }
    };
  }
  const r = getRates(rt, ev.provider, ev.model);
  if (!r) {
    const input_per_m = 1;
    const output_per_m = 4;
    const cost2 = ev.input_tokens / 1e6 * input_per_m + ev.output_tokens / 1e6 * output_per_m;
    return {
      cost: cost2,
      used_rate: { kind: "estimated", provider: ev.provider, model: ev.model, input_per_m, output_per_m }
    };
  }
  const cost = ev.input_tokens / 1e6 * r.input + ev.output_tokens / 1e6 * r.output;
  return {
    cost,
    used_rate: {
      kind: r.kind,
      provider: ev.provider,
      model: ev.model,
      input_per_m: r.input,
      output_per_m: r.output
    }
  };
}

// src/scan.ts
var ROUTE_TO_CHEAP_FEATURES = /* @__PURE__ */ new Set(["summarize", "classify", "translate"]);
function topN(map, n) {
  return [...map.entries()].map(([key, v]) => ({ key, cost: v.cost, events: v.events })).sort((a, b) => b.cost - a.cost).slice(0, n);
}
function analyze(rt, events) {
  const byModel = /* @__PURE__ */ new Map();
  const byFeature = /* @__PURE__ */ new Map();
  const unknownModels = [];
  const perEventCosts = [];
  let total = 0;
  for (const ev of events) {
    const cr = costOfEvent(rt, ev);
    total += cr.cost;
    perEventCosts.push({ ev, cost: cr.cost });
    const mk = `${ev.provider}:${ev.model}`;
    const fk = ev.feature_tag || "(none)";
    const mv = byModel.get(mk) || { cost: 0, events: 0 };
    mv.cost += cr.cost;
    mv.events += 1;
    byModel.set(mk, mv);
    const fv = byFeature.get(fk) || { cost: 0, events: 0 };
    fv.cost += cr.cost;
    fv.events += 1;
    byFeature.set(fk, fv);
    const rr = getRates(rt, ev.provider, ev.model);
    if (!rr) {
      unknownModels.push({ provider: ev.provider, model: ev.model, reason: "unknown provider (estimated)" });
    } else if (rr.kind === "estimated") {
      unknownModels.push({ provider: ev.provider, model: ev.model, reason: "unknown model (estimated)" });
    }
  }
  let routingSavings = 0;
  for (const { ev } of perEventCosts) {
    if (!ROUTE_TO_CHEAP_FEATURES.has(String(ev.feature_tag || "").toLowerCase())) continue;
    const provider = ev.provider;
    const p = rt.providers[provider];
    if (!p) continue;
    const entries = Object.entries(p.models);
    if (entries.length === 0) continue;
    const cheapest = entries.map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r })).sort((a, b) => a.score - b.score)[0];
    const currentRate = getRates(rt, provider, ev.model);
    if (!currentRate) continue;
    if (currentRate.kind === "estimated") continue;
    const currentCost = ev.input_tokens / 1e6 * currentRate.input + ev.output_tokens / 1e6 * currentRate.output;
    const cheapCost = ev.input_tokens / 1e6 * cheapest.r.input + ev.output_tokens / 1e6 * cheapest.r.output;
    const diff = currentCost - cheapCost;
    if (diff > 0) routingSavings += diff;
  }
  const sortedByInput = [...events].sort((a, b) => (b.input_tokens || 0) - (a.input_tokens || 0));
  const k = Math.max(1, Math.floor(sortedByInput.length * 0.2));
  const contextTargets = sortedByInput.slice(0, k);
  let contextSavings = 0;
  for (const ev of contextTargets) {
    const r = getRates(rt, ev.provider, ev.model);
    if (!r) continue;
    const inputPerM = r.input;
    const saveTokens = (ev.input_tokens || 0) * 0.25;
    contextSavings += saveTokens / 1e6 * inputPerM;
  }
  let retryWaste = 0;
  for (const ev of events) {
    const retries = Number(ev.retries || 0);
    if (retries <= 0) continue;
    const base = costOfEvent(rt, { ...ev, retries: 0 }).cost;
    retryWaste += base * retries;
  }
  const estimatedSavingsTotal = routingSavings + contextSavings + retryWaste;
  const analysis = {
    total_cost: round2(total),
    by_model_top: topN(byModel, 10).map((x) => ({ ...x, cost: round2(x.cost) })),
    by_feature_top: topN(byFeature, 10).map((x) => ({ ...x, cost: round2(x.cost) })),
    unknown_models: uniqUnknown(unknownModels),
    rate_table_version: rt.version,
    rate_table_date: rt.date
  };
  const savings = {
    estimated_savings_total: round2(estimatedSavingsTotal),
    routing_savings: round2(routingSavings),
    context_savings: round2(contextSavings),
    retry_waste: round2(retryWaste),
    notes: [
      `a) \uBAA8\uB378 \uB77C\uC6B0\uD305 \uC808\uAC10(\uCD94\uC815): $${round2(routingSavings)}`,
      `b) \uCEE8\uD14D\uC2A4\uD2B8 \uAC10\uCD95(\uCD94\uC815): $${round2(contextSavings)} (\uC0C1\uC704 20% input\uC5D0 25% \uAC10\uCD95 \uAC00\uC815)`,
      `c) \uC7AC\uC2DC\uB3C4/\uC624\uB958 \uB0AD\uBE44: $${round2(retryWaste)} (retries \uAE30\uBC18)`
    ]
  };
  const policy = buildPolicy(rt, events);
  return { analysis, savings, policy };
}
function buildPolicy(rt, events) {
  const freq = /* @__PURE__ */ new Map();
  for (const ev of events) freq.set(ev.provider, (freq.get(ev.provider) || 0) + 1);
  const defaultProvider = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "openai";
  const rules = [];
  for (const provider of Object.keys(rt.providers)) {
    const p = rt.providers[provider];
    const entries = Object.entries(p.models);
    if (entries.length === 0) continue;
    const cheapest = entries.map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r })).sort((a, b) => a.score - b.score)[0];
    rules.push({
      match: { provider, feature_tag_in: ["summarize", "classify", "translate"] },
      action: { recommend_model: cheapest.name, reason: "cheap-feature routing" }
    });
  }
  rules.push({ match: { model_unknown: true }, action: { keep: true, reason: "unknown model -> no policy applied" } });
  return {
    version: 1,
    default_provider: defaultProvider,
    rules,
    budgets: { currency: rt.currency, notes: "MVP: budgets not enforced" },
    generated_from: { rate_table_version: rt.version, input: "./aiopt-input/usage.jsonl" }
  };
}
function uniqUnknown(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const x of list) {
    const k = `${x.provider}:${x.model}:${x.reason}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function writeOutputs(outDir, analysis, savings, policy) {
  import_fs2.default.mkdirSync(outDir, { recursive: true });
  import_fs2.default.writeFileSync(import_path2.default.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  const report = [
    `\uCD1D\uBE44\uC6A9: $${analysis.total_cost}`,
    `\uC808\uAC10 \uAC00\uB2A5 \uAE08\uC561(Estimated): $${savings.estimated_savings_total}`,
    `\uC808\uAC10 \uADFC\uAC70 3\uC904:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ""
  ].join("\n");
  import_fs2.default.writeFileSync(import_path2.default.join(outDir, "report.txt"), report);
  import_fs2.default.writeFileSync(import_path2.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
}

// src/cli.ts
var program = new import_commander.Command();
var DEFAULT_INPUT = "./aiopt-input/usage.jsonl";
var DEFAULT_OUTPUT_DIR = "./aiopt-output";
function loadRateTable() {
  const p = import_path3.default.join(__dirname, "..", "rates", "rate_table.json");
  return JSON.parse(import_fs3.default.readFileSync(p, "utf8"));
}
program.name("aiopt").description("AI \uBE44\uC6A9 \uC790\uB3D9 \uC808\uAC10 \uC778\uD504\uB77C \u2014 \uC11C\uBC84 \uC5C6\uB294 \uB85C\uCEEC CLI MVP").version("0.0.1");
program.command("init").description("aiopt-input/ \uBC0F \uC0D8\uD50C usage.jsonl, aiopt-output/ \uC0DD\uC131").action(() => {
  ensureDir("./aiopt-input");
  ensureDir("./aiopt-output");
  const sampleSrc = import_path3.default.join(__dirname, "..", "samples", "sample_usage.jsonl");
  const dst = import_path3.default.join("./aiopt-input", "usage.jsonl");
  if (!import_fs3.default.existsSync(dst)) {
    import_fs3.default.copyFileSync(sampleSrc, dst);
    console.log("Created ./aiopt-input/usage.jsonl (sample)");
  } else {
    console.log("Exists ./aiopt-input/usage.jsonl (skip)");
  }
  console.log("Ready: ./aiopt-output/");
});
program.command("scan").description("\uC785\uB825 \uB85C\uADF8(JSONL/CSV)\uB97C \uBD84\uC11D\uD558\uACE0 3\uAC1C \uC0B0\uCD9C\uBB3C \uC0DD\uC131").option("--input <path>", "input file path (default: ./aiopt-input/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action((opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  if (!import_fs3.default.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { analysis, savings, policy } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  writeOutputs(outDir, analysis, savings, policy);
  console.log(`OK: ${outDir}/analysis.json`);
  console.log(`OK: ${outDir}/report.txt`);
  console.log(`OK: ${outDir}/cost-policy.json`);
});
program.command("policy").description("\uB9C8\uC9C0\uB9C9 scan \uACB0\uACFC \uAE30\uBC18\uC73C\uB85C cost-policy.json\uB9CC \uC7AC\uC0DD\uC131 (MVP: scan\uACFC \uB3D9\uC77C \uB85C\uC9C1)").option("--input <path>", "input file path (default: ./aiopt-input/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action((opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { policy } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  ensureDir(outDir);
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
  console.log(`OK: ${outDir}/cost-policy.json`);
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map