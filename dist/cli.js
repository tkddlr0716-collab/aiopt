#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/install.ts
var install_exports = {};
__export(install_exports, {
  runInstall: () => runInstall
});
function ensureDir2(p) {
  import_fs3.default.mkdirSync(p, { recursive: true });
}
function writeFile(filePath, content, force) {
  if (!force && import_fs3.default.existsSync(filePath)) return { wrote: false, reason: "exists" };
  ensureDir2(import_path3.default.dirname(filePath));
  import_fs3.default.writeFileSync(filePath, content);
  return { wrote: true };
}
function runInstall(cwd, opts) {
  const force = Boolean(opts.force);
  const aioptDir = import_path3.default.join(cwd, "aiopt");
  const policiesDir = import_path3.default.join(aioptDir, "policies");
  const outDir = import_path3.default.join(cwd, "aiopt-output");
  ensureDir2(aioptDir);
  ensureDir2(policiesDir);
  ensureDir2(outDir);
  const created = [];
  const readme = `# AIOpt

AIOpt\uB294 **scan \uD234\uC774 \uC544\uB2C8\uB77C \uC124\uCE58\uD615 \uBE44\uC6A9 \uAC00\uB4DC\uB808\uC77C**\uC785\uB2C8\uB2E4.

## Quick start
\`\`\`bash
npx aiopt install --force
npx aiopt doctor
# (your app runs, wrapper logs usage)
npx aiopt scan
\`\`\`

- \uC11C\uBC84/\uB300\uC2DC\uBCF4\uB4DC/\uACC4\uC815/\uC5C5\uB85C\uB4DC/\uACB0\uC81C/\uD504\uB85D\uC2DC \uC5C6\uC74C
- \uB85C\uCEEC \uD30C\uC77C \uAE30\uBC18(\uC815\uCC45 + usage.jsonl)
- LLM \uD638\uCD9C \uAE08\uC9C0(\uC218\uD559/\uB8F0 \uAE30\uBC18)
`;
  const r1 = writeFile(import_path3.default.join(aioptDir, "README.md"), readme, force);
  created.push({ path: "aiopt/README.md", status: r1.wrote ? "created" : "skipped" });
  const config = {
    version: 1,
    installed_at: (/* @__PURE__ */ new Date()).toISOString(),
    output_dir: "./aiopt-output",
    usage_path: "./aiopt-output/usage.jsonl",
    policies_dir: "./aiopt/policies",
    rate_table: { path: "./rates/rate_table.json" }
  };
  const r2 = writeFile(import_path3.default.join(aioptDir, "aiopt.config.json"), JSON.stringify(config, null, 2) + "\n", force);
  created.push({ path: "aiopt/aiopt.config.json", status: r2.wrote ? "created" : "skipped" });
  const routing = {
    version: 1,
    rules: [
      { match: { feature_tag_in: ["summarize", "classify", "translate"] }, action: { tier: "cheap", reason: "cheap feature routing" } },
      { match: { feature_tag_in: ["coding", "reasoning"] }, action: { tier: "default", reason: "keep for quality" } }
    ]
  };
  const retry = {
    version: 1,
    max_attempts: 2,
    backoff_ms: [200, 500],
    retry_on_status: ["error", "timeout"],
    notes: "MVP deterministic retry tuning"
  };
  const output = {
    version: 1,
    max_output_tokens_default: 1024,
    per_feature: {
      summarize: 512,
      classify: 256,
      translate: 512
    }
  };
  const context = {
    version: 1,
    input_token_soft_cap: 12e3,
    reduce_top_percentile: 0.2,
    assumed_reduction_ratio: 0.25
  };
  const p1 = writeFile(import_path3.default.join(policiesDir, "routing.json"), JSON.stringify(routing, null, 2) + "\n", force);
  const p2 = writeFile(import_path3.default.join(policiesDir, "retry.json"), JSON.stringify(retry, null, 2) + "\n", force);
  const p3 = writeFile(import_path3.default.join(policiesDir, "output.json"), JSON.stringify(output, null, 2) + "\n", force);
  const p4 = writeFile(import_path3.default.join(policiesDir, "context.json"), JSON.stringify(context, null, 2) + "\n", force);
  created.push({ path: "aiopt/policies/routing.json", status: p1.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/retry.json", status: p2.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/output.json", status: p3.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/context.json", status: p4.wrote ? "created" : "skipped" });
  const wrapperPath = import_path3.default.join(aioptDir, "aiopt-wrapper.js");
  const wrapper = `// AIOpt Wrapper (guardrails) \u2014 local-only (CommonJS)

const fs = require('fs');

const path = require('path');

const crypto = require('crypto');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function appendJsonl(filePath,obj){ ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, JSON.stringify(obj)+'\\n'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function loadConfig(cwd){ return readJson(path.join(cwd,'aiopt','aiopt.config.json')); }
function loadPolicies(cwd,cfg){ const dir=path.isAbsolute(cfg.policies_dir)?cfg.policies_dir:path.join(cwd,cfg.policies_dir);
  return {
    retry: readJson(path.join(dir,'retry.json')) ,
    output: readJson(path.join(dir,'output.json'))
  };
}
function loadRates(cwd,cfg){ const rp=path.isAbsolute(cfg.rate_table.path)?cfg.rate_table.path:path.join(cwd,cfg.rate_table.path); return readJson(rp); }

function costUsd(rt, provider, model, promptTokens, completionTokens){
  const p=rt.providers && rt.providers[provider];
  const r=(p && p.models && p.models[model]) || (p && p.default_estimated) || {input:1.0, output:4.0};
  return (promptTokens/1e6)*r.input + (completionTokens/1e6)*r.output;
}

function pickRoutedModel(rt, provider, featureTag, currentModel){
  const cheap=['summarize','classify','translate'];
  if(!cheap.includes(String(featureTag||'').toLowerCase())) return { model: currentModel, routed_from: null, hit: null };
  const p=rt.providers && rt.providers[provider];
  const entries=p && p.models ? Object.entries(p.models) : [];
  if(!entries.length) return { model: currentModel, routed_from: null, hit: null };
  const cheapest=entries.map(([name,r])=>({name,score:(r.input+r.output)/2})).sort((a,b)=>a.score-b.score)[0];
  if(!cheapest || cheapest.name===currentModel) return { model: currentModel, routed_from: null, hit: null };
  return { model: cheapest.name, routed_from: currentModel, hit: 'routing:cheap-feature' };
}

function outputCap(outputPolicy, featureTag, requested){
  const per=(outputPolicy && outputPolicy.per_feature) || {};
  const cap=per[String(featureTag||'').toLowerCase()] ?? (outputPolicy.max_output_tokens_default || 1024);
  const req=requested ?? cap;
  return Math.min(req, cap);
}

const IDEMPOTENCY=new Map();

/**
 * guardedCall(cwd, input, fn)
 * fn(req) must return: { status: 'ok'|'error'|'timeout', completion_tokens: number, error_code?: string }
 */
async function guardedCall(cwd, input, fn){
  const cfg=loadConfig(cwd);
  const pol=loadPolicies(cwd,cfg);
  const rt=loadRates(cwd,cfg);

  const request_id=crypto.randomUUID();
  const trace_id=input.trace_id || request_id;
  const idem=input.idempotency_key || trace_id;
  if(IDEMPOTENCY.has(idem)) return IDEMPOTENCY.get(idem);

  const routed=pickRoutedModel(rt, input.provider, input.feature_tag, input.model);
  const maxOut=outputCap(pol.output, input.feature_tag, input.max_output_tokens);
  const usagePath=path.isAbsolute(cfg.usage_path)?cfg.usage_path:path.join(cwd,cfg.usage_path);

  const maxAttempts=Math.max(1, Number(pol.retry.max_attempts||1));
  const backoffs=pol.retry.backoff_ms || [200];
  const retryOn=new Set(pol.retry.retry_on_status || ['error','timeout']);

  let last={status:'error', completion_tokens:0, error_code:'unknown'};

  for(let attempt=1; attempt<=maxAttempts; attempt++){
    const t0=Date.now();
    const policy_hits=[];
    if(routed.hit) policy_hits.push(routed.hit);
    policy_hits.push('outputcap:'+maxOut);
    try{
      const out=await fn({ provider: input.provider, model: routed.model, endpoint: input.endpoint, max_output_tokens: maxOut, prompt_tokens: input.prompt_tokens, idempotency_key: idem });
      const latency_ms=Date.now()-t0;
      const completion_tokens=Number(out.completion_tokens||0);
      const total_tokens=Number(input.prompt_tokens||0)+completion_tokens;
      const cost_usd=costUsd(rt, input.provider, routed.model, Number(input.prompt_tokens||0), completion_tokens);
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: out.status, error_code: out.status==='ok'?null:String(out.error_code||out.status), provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens:Number(input.prompt_tokens||0), completion_tokens, total_tokens, cost_usd, latency_ms, meta:{ routed_from: routed.routed_from, policy_hits } });
      last=out;
      if(out.status==='ok'){ IDEMPOTENCY.set(idem,out); return out; }
      if(retryOn.has(out.status) && attempt<maxAttempts){ await sleep(Number(backoffs[Math.min(attempt-1, backoffs.length-1)]||200)); continue; }
      IDEMPOTENCY.set(idem,out); return out;
    }catch(e){
      const latency_ms=Date.now()-t0;
      const out={ status:'error', completion_tokens:0, error_code:String(e && (e.code||e.name) || 'exception') };
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: out.status, error_code: out.error_code, provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens:Number(input.prompt_tokens||0), completion_tokens:0, total_tokens:Number(input.prompt_tokens||0), cost_usd:costUsd(rt, input.provider, routed.model, Number(input.prompt_tokens||0), 0), latency_ms, meta:{ routed_from: routed.routed_from, policy_hits:[routed.hit||'routing:none','outputcap:'+maxOut,'error:exception'] } });
      last=out;
      if(attempt<maxAttempts){ await sleep(Number(backoffs[Math.min(attempt-1, backoffs.length-1)]||200)); continue; }
      IDEMPOTENCY.set(idem,out); return out;
    }
  }
  IDEMPOTENCY.set(idem,last);
  return last;
}

module.exports = { guardedCall };
`;
  ;
  const w = writeFile(wrapperPath, wrapper, force);
  created.push({ path: "aiopt/aiopt-wrapper.js", status: w.wrote ? "created" : "skipped" });
  const usagePath = import_path3.default.join(outDir, "usage.jsonl");
  if (force || !import_fs3.default.existsSync(usagePath)) {
    const header = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      request_id: "sample",
      trace_id: "sample",
      attempt: 1,
      status: "ok",
      error_code: null,
      provider: "openai",
      model: "gpt-5-mini",
      endpoint: "demo",
      prompt_tokens: 12,
      completion_tokens: 3,
      total_tokens: 15,
      cost_usd: 0,
      latency_ms: 1,
      meta: { routed_from: null, policy_hits: ["install-sample"] }
    };
    import_fs3.default.writeFileSync(usagePath, JSON.stringify(header) + "\n");
    created.push({ path: "aiopt-output/usage.jsonl", status: "created" });
  } else {
    created.push({ path: "aiopt-output/usage.jsonl", status: "skipped" });
  }
  return { created };
}
var import_fs3, import_path3;
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
    import_fs3 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
  }
});

// src/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  runDoctor: () => runDoctor
});
function canWrite(dir) {
  try {
    import_fs4.default.mkdirSync(dir, { recursive: true });
    const p = import_path4.default.join(dir, `.aiopt-write-test-${Date.now()}`);
    import_fs4.default.writeFileSync(p, "ok");
    import_fs4.default.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}
function tailLines(filePath, n) {
  try {
    const raw = import_fs4.default.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - n));
  } catch {
    return [];
  }
}
function runDoctor(cwd) {
  const aioptDir = import_path4.default.join(cwd, "aiopt");
  const policiesDir = import_path4.default.join(aioptDir, "policies");
  const outDir = import_path4.default.join(cwd, "aiopt-output");
  const usagePath = import_path4.default.join(outDir, "usage.jsonl");
  const checks = [];
  checks.push({ name: "aiopt/ exists", ok: import_fs4.default.existsSync(aioptDir) });
  checks.push({ name: "aiopt/policies exists", ok: import_fs4.default.existsSync(policiesDir) });
  checks.push({ name: "aiopt-output/ writable", ok: canWrite(outDir) });
  checks.push({ name: "usage.jsonl exists", ok: import_fs4.default.existsSync(usagePath), detail: usagePath });
  const last5raw = tailLines(usagePath, 5);
  const last5 = last5raw.map((l) => {
    try {
      const j = JSON.parse(l);
      return {
        status: j.status,
        provider: j.provider,
        model: j.model,
        endpoint: j.endpoint,
        attempt: j.attempt
      };
    } catch {
      return {};
    }
  });
  const ok = checks.every((c) => c.ok);
  return { ok, checks, last5 };
}
var import_fs4, import_path4;
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    import_fs4 = __toESM(require("fs"));
    import_path4 = __toESM(require("path"));
  }
});

// src/cli.ts
var import_fs5 = __toESM(require("fs"));
var import_path5 = __toESM(require("path"));
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
  const p = import_path5.default.join(__dirname, "..", "rates", "rate_table.json");
  return JSON.parse(import_fs5.default.readFileSync(p, "utf8"));
}
program.name("aiopt").description("AI \uBE44\uC6A9 \uC790\uB3D9 \uC808\uAC10 \uC778\uD504\uB77C \u2014 \uC11C\uBC84 \uC5C6\uB294 \uB85C\uCEEC CLI MVP").version("0.0.1");
program.command("init").description("aiopt-input/ \uBC0F \uC0D8\uD50C usage.jsonl, aiopt-output/ \uC0DD\uC131").action(() => {
  ensureDir("./aiopt-input");
  ensureDir("./aiopt-output");
  const sampleSrc = import_path5.default.join(__dirname, "..", "samples", "sample_usage.jsonl");
  const dst = import_path5.default.join("./aiopt-input", "usage.jsonl");
  if (!import_fs5.default.existsSync(dst)) {
    import_fs5.default.copyFileSync(sampleSrc, dst);
    console.log("Created ./aiopt-input/usage.jsonl (sample)");
  } else {
    console.log("Exists ./aiopt-input/usage.jsonl (skip)");
  }
  console.log("Ready: ./aiopt-output/");
});
program.command("scan").description("\uC785\uB825 \uB85C\uADF8(JSONL/CSV)\uB97C \uBD84\uC11D\uD558\uACE0 3\uAC1C \uC0B0\uCD9C\uBB3C \uC0DD\uC131").option("--input <path>", "input file path (default: ./aiopt-input/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action((opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  if (!import_fs5.default.existsSync(inputPath)) {
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
  import_fs5.default.writeFileSync(import_path5.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
  console.log(`OK: ${outDir}/cost-policy.json`);
});
program.command("install").description("Install AIOpt guardrails: create aiopt/ + policies + usage.jsonl").option("--force", "overwrite existing files").action(async (opts) => {
  const { runInstall: runInstall2 } = await Promise.resolve().then(() => (init_install(), install_exports));
  const result = runInstall2(process.cwd(), { force: Boolean(opts.force) });
  for (const c of result.created) {
    console.log(`${c.status === "created" ? "CREATED" : "SKIP"}: ${c.path}`);
  }
});
program.command("doctor").description("Check installation + print last 5 usage events").action(async () => {
  const { runDoctor: runDoctor2 } = await Promise.resolve().then(() => (init_doctor(), doctor_exports));
  const r = runDoctor2(process.cwd());
  console.log(r.ok ? "OK: doctor" : "WARN: doctor");
  for (const c of r.checks) {
    console.log(`${c.ok ? "OK" : "FAIL"}: ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  }
  console.log("--- last5 usage");
  for (const x of r.last5) {
    console.log(JSON.stringify(x));
  }
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map