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
  const wrapperPath = import_path3.default.join(aioptDir, "aiopt-wrapper.ts");
  const wrapper = `// AIOpt Wrapper (local guardrail)
//
// Goals (MVP):
// - deterministic (no LLM calls)
// - local-file based (aiopt/aiopt.config.json + aiopt/policies/*.json)
// - logs every call to aiopt-output/usage.jsonl (JSONL)
// - optional routing/caps/retry based on policies
//
// Integration idea:
//   import { aioptWrap } from './aiopt/aiopt-wrapper';
//   const guarded = aioptWrap(callLLM);
//   const res = await guarded({ provider:'openai', model:'gpt-5', endpoint:'responses', feature_tag:'summarize', trace_id:'t1', meta:{...}, exec: () => client.responses.create(...) });

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type AioptConfig = {
  version: number;
  installed_at?: string;
  output_dir: string;
  usage_path: string;
  policies_dir: string;
  rate_table?: { path: string };
};

export type RoutingPolicy = {
  version: number;
  rules: Array<{
    match: { feature_tag_in?: string[] };
    action: { tier: 'cheap' | 'default'; reason?: string };
  }>;
};

export type RetryPolicy = {
  version: number;
  max_attempts: number;
  backoff_ms: number[];
  retry_on_status: Array<'error' | 'timeout'>;
};

export type OutputPolicy = {
  version: number;
  max_output_tokens_default: number;
  per_feature?: Record<string, number>;
};

export type ContextPolicy = {
  version: number;
  input_token_soft_cap: number;
  reduce_top_percentile: number;
  assumed_reduction_ratio: number;
};

export type UsageLine = {
  ts: string;
  request_id: string;
  trace_id: string;
  attempt: number;
  status: 'ok' | 'error' | 'timeout';
  error_code: string | null;
  provider: string;
  model: string;
  endpoint: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  meta: Record<string, any>;
};

export type AioptCallRequest<T> = {
  provider: string;
  model: string;
  endpoint: string;
  feature_tag?: string;
  trace_id?: string;
  request_id?: string;
  idempotency_key?: string;
  max_output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  meta?: Record<string, any>;
  exec: (patched: { model: string; max_output_tokens: number; idempotency_key: string }) => Promise<T>;
};

export type AioptWrapperOptions = {
  cwd?: string;
  configPath?: string;
  usagePath?: string;
  cheapModel?: string; // default: gpt-5-mini
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonSafe<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function resolveFrom(baseDir: string, maybeRel: string) {
  return path.isAbsolute(maybeRel) ? maybeRel : path.join(baseDir, maybeRel);
}

function loadConfig(cwd: string, explicitPath?: string): { cfg: AioptConfig; baseDir: string } {
  const baseDir = cwd;
  const cfgPath = explicitPath ? resolveFrom(baseDir, explicitPath) : path.join(baseDir, 'aiopt', 'aiopt.config.json');
  const cfg = readJsonSafe<AioptConfig>(cfgPath) || {
    version: 1,
    installed_at: new Date().toISOString(),
    output_dir: './aiopt-output',
    usage_path: './aiopt-output/usage.jsonl',
    policies_dir: './aiopt/policies'
  };
  return { cfg, baseDir };
}

function loadPolicies(baseDir: string, cfg: AioptConfig) {
  const policiesDir = resolveFrom(baseDir, cfg.policies_dir);
  const routing = readJsonSafe<RoutingPolicy>(path.join(policiesDir, 'routing.json'));
  const retry = readJsonSafe<RetryPolicy>(path.join(policiesDir, 'retry.json'));
  const output = readJsonSafe<OutputPolicy>(path.join(policiesDir, 'output.json'));
  const context = readJsonSafe<ContextPolicy>(path.join(policiesDir, 'context.json'));
  return { routing, retry, output, context };
}

function pickOutputCap(output: OutputPolicy | null, featureTag?: string) {
  if (!output) return 1024;
  if (featureTag && output.per_feature && typeof output.per_feature[featureTag] === 'number') return output.per_feature[featureTag];
  return output.max_output_tokens_default ?? 1024;
}

function applyRouting(routing: RoutingPolicy | null, featureTag: string | undefined, originalModel: string, cheapModel: string) {
  if (!routing || !featureTag) return { model: originalModel, routed_from: null as string | null, policy_hits: [] as string[] };
  for (const rule of routing.rules || []) {
    const inList = rule.match?.feature_tag_in?.includes(featureTag);
    if (!inList) continue;
    if (rule.action?.tier === 'cheap') {
      if (originalModel !== cheapModel) {
        return { model: cheapModel, routed_from: originalModel, policy_hits: ['routing:' + featureTag] };
      }
    }
    return { model: originalModel, routed_from: null, policy_hits: ['routing:' + featureTag] };
  }
  return { model: originalModel, routed_from: null, policy_hits: [] };
}

function makeId(prefix: string) {
  return prefix + '-' + crypto.randomBytes(8).toString('hex');
}

function classifyError(e: any): { status: 'error' | 'timeout'; code: string } {
  const msg = String(e?.message || e || 'error');
  const name = String(e?.name || 'Error');
  const isTimeout = /timeout|timed out|ETIMEDOUT/i.test(msg) || /timeout/i.test(name);
  return { status: isTimeout ? 'timeout' : 'error', code: (e?.code ? String(e.code) : isTimeout ? 'TIMEOUT' : 'ERROR') };
}

function extractObservedUsage(res: any): Partial<Pick<UsageLine, 'prompt_tokens' | 'completion_tokens' | 'total_tokens' | 'cost_usd'>> {
  // Best-effort extraction for common SDK shapes.
  // OpenAI-like: { usage: { prompt_tokens, completion_tokens, total_tokens } }
  // Some wrappers: { cost_usd } or { costUSD } or { cost: { usd } }
  try {
    const u = res?.usage;
    const prompt_tokens = typeof u?.prompt_tokens === 'number' ? u.prompt_tokens : undefined;
    const completion_tokens = typeof u?.completion_tokens === 'number' ? u.completion_tokens : undefined;
    const total_tokens = typeof u?.total_tokens === 'number' ? u.total_tokens : undefined;

    const cost_usd =
      typeof res?.cost_usd === 'number'
        ? res.cost_usd
        : typeof res?.costUSD === 'number'
          ? res.costUSD
          : typeof res?.cost?.usd === 'number'
            ? res.cost.usd
            : undefined;

    return { prompt_tokens, completion_tokens, total_tokens, cost_usd };
  } catch {
    return {};
  }
}

function appendUsageLine(usagePath: string, line: UsageLine) {
  ensureDir(path.dirname(usagePath));
  fs.appendFileSync(usagePath, JSON.stringify(line) + '
');
}

export function aioptWrap<T>(fn: (req: AioptCallRequest<T>) => Promise<T>, opts?: AioptWrapperOptions) {
  const cwd = opts?.cwd || process.cwd();
  const cheapModel = opts?.cheapModel || 'gpt-5-mini';
  const { cfg, baseDir } = loadConfig(cwd, opts?.configPath);
  const policies = loadPolicies(baseDir, cfg);

  const usagePath = opts?.usagePath
    ? resolveFrom(baseDir, opts.usagePath)
    : resolveFrom(baseDir, cfg.usage_path);

  return async (req: AioptCallRequest<T>) => {
    const trace_id = req.trace_id || makeId('trace');
    const request_id = req.request_id || makeId('req');
    const idempotency_key = req.idempotency_key || crypto.createHash('sha256').update(trace_id + ':' + request_id).digest('hex');

    const cap = Math.max(1, pickOutputCap(policies.output, req.feature_tag));
    const desiredMax = typeof req.max_output_tokens === 'number' ? req.max_output_tokens : cap;
    const max_output_tokens = Math.min(desiredMax, cap);

    const routed = applyRouting(policies.routing, req.feature_tag, req.model, cheapModel);

    const retry = policies.retry;
    const maxAttempts = Math.max(1, retry?.max_attempts ?? 1);
    const backoff = retry?.backoff_ms ?? [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const res = await fn({
          ...req,
          model: routed.model,
          max_output_tokens,
          trace_id,
          request_id,
          idempotency_key
        });

        const latency_ms = Date.now() - t0;

        const observed = extractObservedUsage(res as any);

        const prompt_tokens = Number(observed.prompt_tokens ?? req.prompt_tokens ?? 0);
        const completion_tokens = Number(observed.completion_tokens ?? req.completion_tokens ?? 0);
        const total_tokens = Number(observed.total_tokens ?? req.total_tokens ?? (prompt_tokens + completion_tokens));
        const cost_usd = Number(observed.cost_usd ?? req.cost_usd ?? 0);

        appendUsageLine(usagePath, {
          ts: new Date().toISOString(),
          request_id,
          trace_id,
          attempt,
          status: 'ok',
          error_code: null,
          provider: req.provider,
          model: routed.model,
          endpoint: req.endpoint,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_usd,
          latency_ms,
          meta: {
            ...(req.meta || {}),
            feature_tag: req.feature_tag || null,
            routed_from: routed.routed_from,
            policy_hits: routed.policy_hits,
            max_output_tokens,
            idempotency_key
          }
        });

        return res;
      } catch (e) {
        const latency_ms = Date.now() - t0;
        const ce = classifyError(e);

        appendUsageLine(usagePath, {
          ts: new Date().toISOString(),
          request_id,
          trace_id,
          attempt,
          status: ce.status,
          error_code: ce.code,
          provider: req.provider,
          model: routed.model,
          endpoint: req.endpoint,
          prompt_tokens: Number(req.prompt_tokens ?? 0),
          completion_tokens: Number(req.completion_tokens ?? 0),
          total_tokens: Number(req.total_tokens ?? 0),
          cost_usd: Number(req.cost_usd ?? 0),
          latency_ms,
          meta: {
            ...(req.meta || {}),
            feature_tag: req.feature_tag || null,
            routed_from: routed.routed_from,
            policy_hits: routed.policy_hits,
            max_output_tokens,
            idempotency_key,
            error_message: String((e as any)?.message || e)
          }
        });

        const shouldRetry = attempt < maxAttempts && (retry?.retry_on_status || []).includes(ce.status);
        if (!shouldRetry) throw e;

        const waitMs = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 250;
        await sleep(waitMs);
        continue;
      }
    }

    // unreachable
    throw new Error('AIOpt wrapper: exhausted retries');
  };
}
`;
  const w = writeFile(wrapperPath, wrapper, force);
  created.push({ path: "aiopt/aiopt-wrapper.ts", status: w.wrote ? "created" : "skipped" });
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
  const reportJson = {
    version: 1,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    summary: {
      total_cost_usd: analysis.total_cost,
      estimated_savings_usd: savings.estimated_savings_total,
      routing_savings_usd: savings.routing_savings,
      context_savings_usd: savings.context_savings,
      retry_waste_usd: savings.retry_waste
    },
    top: {
      by_model: analysis.by_model_top,
      by_feature: analysis.by_feature_top
    },
    unknown_models: analysis.unknown_models,
    notes: savings.notes
  };
  import_fs2.default.writeFileSync(import_path2.default.join(outDir, "report.json"), JSON.stringify(reportJson, null, 2));
  const reportTxt = [
    `\uCD1D\uBE44\uC6A9: $${analysis.total_cost}`,
    `\uC808\uAC10 \uAC00\uB2A5 \uAE08\uC561(Estimated): $${savings.estimated_savings_total}`,
    `\uC808\uAC10 \uADFC\uAC70 3\uC904:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ""
  ].join("\n");
  import_fs2.default.writeFileSync(import_path2.default.join(outDir, "report.txt"), reportTxt);
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