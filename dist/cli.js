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
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// src/cost.ts
function getRates(rt, provider, model) {
  const prov = String(provider || "").toLowerCase();
  if (prov === "local" || prov === "ollama" || prov === "vllm") {
    return { kind: "official", input: 0, output: 0 };
  }
  const p = rt.providers[prov];
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
      used_rate: { kind: "estimated", provider: String(ev.provider || "").toLowerCase(), model: ev.model, input_per_m, output_per_m }
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
var init_cost = __esm({
  "src/cost.ts"() {
    "use strict";
  }
});

// src/solutions.ts
var solutions_exports = {};
__export(solutions_exports, {
  buildTopFixes: () => buildTopFixes,
  writePatches: () => writePatches
});
function buildTopFixes(analysis, savings) {
  const fixes = [];
  fixes.push({
    id: "fix-retry-tuning",
    title: "Retry tuning",
    impact_usd: Number(savings.retry_waste || 0),
    status: Number(savings.retry_waste || 0) > EPS ? "action" : "no-issue",
    why: `Retry waste is estimated at $${round2(Number(savings.retry_waste || 0))}.`,
    what_to_change: [
      "aiopt/policies/retry.json: lower max_attempts or adjust backoff_ms",
      "Ensure idempotency keys are stable per trace_id",
      "Log error_code to identify retryable classes"
    ]
  });
  fixes.push({
    id: "fix-output-cap",
    title: "Output cap",
    impact_usd: Number(savings.context_savings || 0),
    status: Number(savings.context_savings || 0) > EPS ? "action" : "no-issue",
    why: `Context savings estimate: $${round2(Number(savings.context_savings || 0))}. Output caps prevent runaway completions.`,
    what_to_change: [
      "aiopt/policies/output.json: set max_output_tokens_default",
      "aiopt/policies/output.json: set per_feature caps (summarize/classify/translate)"
    ]
  });
  const topFeature = analysis.by_feature_top?.[0]?.key;
  fixes.push({
    id: "fix-routing",
    title: "Routing rule",
    impact_usd: Number(savings.routing_savings || 0),
    status: Number(savings.routing_savings || 0) > EPS ? "action" : "no-issue",
    why: `Routing savings estimate: $${round2(Number(savings.routing_savings || 0))}.`,
    what_to_change: [
      "aiopt/policies/routing.json: route summarize/classify/translate to cheap tier",
      `Consider adding feature_tag_in for top feature: ${topFeature || "(unknown)"}`
    ]
  });
  fixes.sort((a, b) => b.impact_usd - a.impact_usd || a.id.localeCompare(b.id));
  return fixes;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function writePatches(outDir, fixes) {
  const patchesDir = import_path2.default.join(outDir, "patches");
  import_fs2.default.mkdirSync(patchesDir, { recursive: true });
  const readme = [
    "# AIOpt patches (MVP)",
    "",
    "This folder contains suggested changes you can apply locally.",
    "",
    "## Top fixes",
    ...fixes.map((f, i) => `${i + 1}. ${f.title} \u2014 ${f.why}`),
    "",
    "Files are stubs (human review required).",
    ""
  ].join("\n");
  import_fs2.default.writeFileSync(import_path2.default.join(patchesDir, "README.md"), readme);
  import_fs2.default.writeFileSync(import_path2.default.join(patchesDir, "policies.updated.routing.json"), JSON.stringify({ note: "apply changes to aiopt/policies/routing.json", fixes: fixes.filter((f) => f.id.includes("routing")) }, null, 2));
  import_fs2.default.writeFileSync(import_path2.default.join(patchesDir, "policies.updated.retry.json"), JSON.stringify({ note: "apply changes to aiopt/policies/retry.json", fixes: fixes.filter((f) => f.id.includes("retry")) }, null, 2));
  import_fs2.default.writeFileSync(import_path2.default.join(patchesDir, "policies.updated.output.json"), JSON.stringify({ note: "apply changes to aiopt/policies/output.json", fixes: fixes.filter((f) => f.id.includes("output")) }, null, 2));
}
var import_fs2, import_path2, EPS;
var init_solutions = __esm({
  "src/solutions.ts"() {
    "use strict";
    import_fs2 = __toESM(require("fs"));
    import_path2 = __toESM(require("path"));
    EPS = 1e-4;
  }
});

// src/code-scan.ts
function isTextLike(p) {
  const ext = import_path3.default.extname(p).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".java", ".kt", ".rb", ".php"].includes(ext);
}
function walk(root, out) {
  const items = import_fs3.default.readdirSync(root, { withFileTypes: true });
  for (const it of items) {
    if (DEFAULT_EXCLUDES.has(it.name)) continue;
    const full = import_path3.default.join(root, it.name);
    if (it.isDirectory()) walk(full, out);
    else out.push(full);
  }
}
function findAllLines(content, re) {
  const lines = [];
  const parts = content.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (re.test(line)) lines.push(i + 1);
  }
  return lines;
}
function runCodeScan(rootDir) {
  const files = [];
  walk(rootDir, files);
  const findings = [];
  for (const file of files) {
    if (!isTextLike(file)) continue;
    let st;
    try {
      st = import_fs3.default.statSync(file);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > 1024 * 1024) continue;
    let content = "";
    try {
      content = import_fs3.default.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const ln of findAllLines(content, /\b(maxRetries|maximumRetries|retries|max_attempts|attempts)\s*[:=]\s*(\d{2,}|[6-9])\b/i)) {
      findings.push({
        ruleId: "AIOPT.RETRY.EXPLOSION_RISK",
        level: "warning",
        message: "High retry/attempt count detected. Consider capping retries to prevent cost explosions.",
        file,
        line: ln,
        help: "Cap retries (e.g. 2-3), add backoff, and fail fast on non-retriable errors."
      });
      break;
    }
    for (const ln of findAllLines(content, /(gpt-5\.?2|gpt-4\.?|o1-|o3-|claude-3|sonnet|opus)/i)) {
      findings.push({
        ruleId: "AIOPT.MODEL.ROUTING.EXPENSIVE_DEFAULT",
        level: "note",
        message: "Possible expensive model hard-coded. Consider cheap default + explicit override for critical paths.",
        file,
        line: ln,
        help: "Route cheap by default; allow overrides via env/config for high-impact tasks."
      });
      break;
    }
    const hasOpenAI = /\bopenai\b|\bOpenAI\b|responses\.create|chat\.completions\.create/i.test(content);
    const hasTimeout = /\btimeout\b|\brequestTimeout\b|\bsignal\b/i.test(content);
    if (hasOpenAI && !hasTimeout) {
      findings.push({
        ruleId: "AIOPT.TIMEOUT.MISSING",
        level: "note",
        message: "OpenAI/LLM call detected without obvious timeout. Add a timeout to reduce hanging retries and cost waste.",
        file,
        line: 1,
        help: "Add request timeout / AbortSignal and handle retryable errors explicitly."
      });
    }
  }
  return findings.slice(0, 200);
}
var import_fs3, import_path3, DEFAULT_EXCLUDES;
var init_code_scan = __esm({
  "src/code-scan.ts"() {
    "use strict";
    import_fs3 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
    DEFAULT_EXCLUDES = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      "dist",
      "aiopt-output",
      ".next",
      "build",
      "coverage"
    ]);
  }
});

// src/sarif.ts
function toUri(p) {
  try {
    const rel = import_path4.default.relative(process.cwd(), import_path4.default.resolve(p)).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..")) return rel;
  } catch {
  }
  const abs = import_path4.default.resolve(p);
  const u = abs.replace(/\\/g, "/");
  return u.match(/^[A-Za-z]:\//) ? `file:///${u}` : `file://${u}`;
}
function buildSarif(toolName, toolVersion, findings) {
  const rulesMap = /* @__PURE__ */ new Map();
  for (const f of findings) {
    if (!rulesMap.has(f.ruleId)) {
      rulesMap.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: f.ruleId,
        help: f.help
      });
    }
  }
  const rules = [...rulesMap.values()].map((r) => ({
    id: r.id,
    shortDescription: { text: r.shortDescription },
    help: r.help ? { text: r.help } : void 0
  })).map((x) => {
    const y = { ...x };
    if (!y.help) delete y.help;
    return y;
  });
  const results = findings.map((f) => ({
    ruleId: f.ruleId,
    level: f.level,
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toUri(f.file) },
          region: { startLine: Math.max(1, Math.floor(f.line || 1)) }
        }
      }
    ]
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version: toolVersion,
            informationUri: "https://www.npmjs.com/package/aiopt",
            rules
          }
        },
        results
      }
    ]
  };
}
var import_path4;
var init_sarif = __esm({
  "src/sarif.ts"() {
    "use strict";
    import_path4 = __toESM(require("path"));
  }
});

// src/scan.ts
function topN(map, n) {
  return [...map.entries()].map(([key, v]) => ({ key, cost: v.cost, events: v.events })).sort((a, b) => b.cost - a.cost).slice(0, n);
}
function analyze(rt, events) {
  const byModel = /* @__PURE__ */ new Map();
  const byFeature = /* @__PURE__ */ new Map();
  const unknownModels = [];
  const perEventCosts = [];
  const isAttemptLog = events.some((e) => e.trace_id && String(e.trace_id).length > 0 || e.attempt !== void 0 && Number(e.attempt) > 0);
  let baseTotal = 0;
  let total = 0;
  for (const ev of events) {
    const cr = costOfEvent(rt, ev);
    baseTotal += cr.cost;
    if (isAttemptLog) {
      total += cr.cost;
    } else {
      const retries = Math.max(0, Number(ev.retries || 0));
      total += cr.cost * (1 + retries);
    }
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
  const potByIdx = [];
  for (const { ev, cost } of perEventCosts) {
    const retries = Math.max(0, Number(ev.retries || 0));
    const attempt = Number(ev.attempt || 1);
    const total_i = isAttemptLog ? cost : cost * (1 + retries);
    const waste_i = isAttemptLog ? attempt >= 2 ? cost : 0 : cost * retries;
    let routing_i = 0;
    if (ROUTE_TO_CHEAP_FEATURES.has(String(ev.feature_tag || "").toLowerCase())) {
      const provider = ev.provider;
      const p = rt.providers[provider];
      if (p) {
        const entries = Object.entries(p.models);
        if (entries.length > 0) {
          const cheapest = entries.map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r })).sort((a, b) => a.score - b.score)[0];
          const currentRate = getRates(rt, provider, ev.model);
          if (currentRate && currentRate.kind !== "estimated") {
            const currentCost = ev.input_tokens / 1e6 * currentRate.input + ev.output_tokens / 1e6 * currentRate.output;
            const cheapCost = ev.input_tokens / 1e6 * cheapest.r.input + ev.output_tokens / 1e6 * cheapest.r.output;
            const diff = (currentCost - cheapCost) * (1 + retries);
            routing_i = Math.max(0, diff);
          }
        }
      }
    }
    potByIdx.push({ routing: routing_i, context: 0, retry: waste_i, total: total_i, waste: waste_i });
  }
  const sortedIdx = [...events.map((e, i) => ({ i, input: Number(e.input_tokens || 0), ok: !isAttemptLog || Number(e.attempt || 1) === 1 }))].filter((x) => x.ok).sort((a, b) => b.input - a.input);
  const k = Math.max(1, Math.floor(sortedIdx.length * 0.2));
  const topIdx = new Set(sortedIdx.slice(0, k).map((x) => x.i));
  for (let i = 0; i < events.length; i++) {
    if (!topIdx.has(i)) continue;
    const ev = events[i];
    const retries = Math.max(0, Number(ev.retries || 0));
    const r = getRates(rt, ev.provider, ev.model);
    if (!r) continue;
    const saveTokens = Number(ev.input_tokens || 0) * 0.25;
    const multiplier = isAttemptLog ? 1 : 1 + retries;
    const diff = saveTokens / 1e6 * r.input * multiplier;
    potByIdx[i].context = Math.max(0, diff);
  }
  let routingSavings = 0;
  let contextSavings = 0;
  let retryWaste = 0;
  for (const p of potByIdx) {
    let remaining = p.total;
    const rSave = Math.min(p.routing, remaining);
    remaining -= rSave;
    routingSavings += rSave;
    const cSave = Math.min(p.context, remaining);
    remaining -= cSave;
    contextSavings += cSave;
    const retrySave = Math.min(p.retry, remaining);
    retryWaste += retrySave;
  }
  const estimatedSavingsTotal = routingSavings + contextSavings + retryWaste;
  const guardedSavingsTotal = Math.min(estimatedSavingsTotal, total);
  const analysis = {
    total_cost: round22(total),
    by_model_top: topN(byModel, 10).map((x) => ({ ...x, cost: round22(x.cost) })),
    by_feature_top: topN(byFeature, 10).map((x) => ({ ...x, cost: round22(x.cost) })),
    unknown_models: uniqUnknown(unknownModels),
    rate_table_version: rt.version,
    rate_table_date: rt.date
  };
  const savings = {
    estimated_savings_total: round22(guardedSavingsTotal),
    routing_savings: round22(routingSavings),
    context_savings: round22(contextSavings),
    retry_waste: round22(retryWaste),
    notes: [
      `a) \uBAA8\uB378 \uB77C\uC6B0\uD305 \uC808\uAC10(\uCD94\uC815): $${round22(routingSavings)}`,
      `b) \uCEE8\uD14D\uC2A4\uD2B8 \uAC10\uCD95(\uCD94\uC815): $${round22(contextSavings)} (\uC0C1\uC704 20% input\uC5D0 25% \uAC10\uCD95 \uAC00\uC815)`,
      `c) \uC7AC\uC2DC\uB3C4/\uC624\uB958 \uB0AD\uBE44(\uC0C1\uD55C \uC801\uC6A9): $${round22(retryWaste)} (retries \uAE30\uBC18)`
    ]
  };
  const policy = buildPolicy(rt, events);
  return { analysis, savings, policy, meta: { mode: isAttemptLog ? "attempt-log" : "legacy" } };
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
function round22(n) {
  return Math.round(n * 100) / 100;
}
function writeOutputs(outDir, analysis, savings, policy, meta) {
  const mode = meta?.mode || "legacy";
  import_fs4.default.mkdirSync(outDir, { recursive: true });
  import_fs4.default.writeFileSync(import_path5.default.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  const unknownCount = analysis.unknown_models?.length || 0;
  const confidence = unknownCount === 0 ? "HIGH" : unknownCount <= 3 ? "MED" : "LOW";
  const ratio = analysis.total_cost > 0 ? savings.estimated_savings_total / analysis.total_cost : 0;
  const warnings = [];
  if (ratio >= 0.9) warnings.push("estimated savings >= 90%");
  if (unknownCount > 0) warnings.push("unknown models/providers detected (estimated pricing used)");
  const reportJson = {
    version: 3,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    confidence,
    warnings,
    assumptions: {
      no_double_counting: "routing -> context -> retry allocation per-event with remaining-cost caps",
      retry_cost_model: mode === "attempt-log" ? "attempt-log mode: total_cost is sum of attempt lines; retry_waste is sum of attempts>=2" : "legacy mode: total_cost includes retries as extra attempts (base_cost*(1+retries))",
      context_model: "top 20% by input_tokens assume 25% input reduction",
      estimated_pricing_note: unknownCount > 0 ? "some items use estimated rates; treat savings as a band" : "all items used known rates"
    },
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
  import_fs4.default.writeFileSync(import_path5.default.join(outDir, "report.json"), JSON.stringify(reportJson, null, 2));
  const ratioMd = analysis.total_cost > 0 ? savings.estimated_savings_total / analysis.total_cost : 0;
  const warningsMd = [];
  if (ratioMd >= 0.9) warningsMd.push("WARNING: estimated savings >= 90% \u2014 check overlap/missing rate table");
  const reportMd = [
    "# AIOpt Report",
    "",
    `- Total cost: $${analysis.total_cost}`,
    `- Estimated savings: $${savings.estimated_savings_total} (guarded <= total_cost)`,
    `- Confidence: ${confidence}`,
    unknownCount > 0 ? `- Unknown models: ${unknownCount} (estimated pricing used)` : "- Unknown models: 0",
    ...warningsMd.map((w) => `- ${w}`),
    "",
    "## ASSUMPTIONS",
    "- No double-counting: routing \u2192 context \u2192 retry savings allocated per-event with remaining-cost caps.",
    mode === "attempt-log" ? "- Retry cost model: attempt-log mode (total_cost=sum attempts, retry_waste=sum attempt>=2)." : "- Retry cost model: legacy mode (total_cost=base_cost*(1+retries)).",
    "- Context savings: top 20% input_tokens events assume 25% input reduction.",
    "",
    "## WHAT TO CHANGE",
    "1) Retry tuning \u2192 edit `aiopt/policies/retry.json`",
    "2) Output cap \u2192 edit `aiopt/policies/output.json`",
    "3) Routing rule \u2192 edit `aiopt/policies/routing.json`",
    "",
    "## OUTPUTS",
    "- `aiopt-output/analysis.json`",
    "- `aiopt-output/report.json`",
    "- `aiopt-output/patches/*`",
    ""
  ].join("\n");
  import_fs4.default.writeFileSync(import_path5.default.join(outDir, "report.md"), reportMd);
  const reportTxt = [
    `\uCD1D\uBE44\uC6A9: $${analysis.total_cost}`,
    `\uC808\uAC10 \uAC00\uB2A5 \uAE08\uC561(Estimated): $${savings.estimated_savings_total}`,
    `\uC808\uAC10 \uADFC\uAC70 3\uC904:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ""
  ].join("\n");
  import_fs4.default.writeFileSync(import_path5.default.join(outDir, "report.txt"), reportTxt);
  import_fs4.default.writeFileSync(import_path5.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
  const fixes = buildTopFixes(analysis, savings);
  writePatches(outDir, fixes);
  try {
    const cwd = meta?.cwd;
    const cliVersion = meta?.cliVersion || "unknown";
    if (cwd && import_fs4.default.existsSync(cwd)) {
      const findings = runCodeScan(cwd);
      const sarif = buildSarif("aiopt", cliVersion, findings);
      import_fs4.default.writeFileSync(import_path5.default.join(outDir, "aiopt.sarif"), JSON.stringify(sarif, null, 2));
    }
  } catch {
  }
}
var import_fs4, import_path5, ROUTE_TO_CHEAP_FEATURES;
var init_scan = __esm({
  "src/scan.ts"() {
    "use strict";
    import_fs4 = __toESM(require("fs"));
    import_path5 = __toESM(require("path"));
    init_cost();
    init_solutions();
    init_code_scan();
    init_sarif();
    ROUTE_TO_CHEAP_FEATURES = /* @__PURE__ */ new Set(["summarize", "classify", "translate"]);
  }
});

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "aiopt",
      version: "0.3.10",
      description: "Pre-deploy LLM cost accident guardrail (local CLI + CI)",
      bin: {
        aiopt: "dist/cli.js"
      },
      type: "commonjs",
      main: "dist/cli.js",
      keywords: [
        "ai",
        "llm",
        "openai",
        "tokens",
        "cost",
        "cost-optimization",
        "budget",
        "finops",
        "observability",
        "guardrails",
        "sarif",
        "code-scanning",
        "github-actions",
        "ci",
        "pre-deploy",
        "cli"
      ],
      homepage: "https://github.com/tkddlr0716-collab/aiopt#readme",
      repository: {
        type: "git",
        url: "git+https://github.com/tkddlr0716-collab/aiopt.git"
      },
      bugs: {
        url: "https://github.com/tkddlr0716-collab/aiopt/issues"
      },
      files: [
        "dist",
        "rates",
        "samples",
        "README.md"
      ],
      scripts: {
        build: "tsup",
        dev: "node --enable-source-maps dist/cli.js",
        prepack: "npm run build",
        "test:npx": `bash -lc 'set -euo pipefail; root="$(pwd)"; tmp="$(mktemp -d)"; echo "tmp=$tmp"; cd "$tmp"; npm pack --silent "$root" >/dev/null; tgz="$(ls -1 aiopt-*.tgz | tail -n 1)"; echo "tgz=$tgz"; npx --yes "./$tgz" install --force; npx --yes "./$tgz" doctor; npx --yes "./$tgz" scan; test -f ./aiopt-output/report.md; echo OK'`,
        "test:npx:keep": `bash -lc 'set -euo pipefail; root="$(pwd)"; tmp="$(mktemp -d)"; echo "tmp=$tmp"; cd "$tmp"; npm pack --silent "$root" >/dev/null; tgz="$(ls -1 aiopt-*.tgz | tail -n 1)"; echo "tgz=$tgz"; npx --yes "./$tgz" install --force; npx --yes "./$tgz" doctor; npx --yes "./$tgz" scan; test -f ./aiopt-output/report.md; echo "OK (kept at $tmp)"'`,
        "test:guard": "npm run build --silent && node scripts/test-guard.js",
        "test:license": "npm run build --silent && node scripts/test-license.js",
        "test:landing": "node scripts/test-landing.js",
        "task:open": "node scripts/tasktracker-open.js",
        test: "npm run test:guard && npm run test:license && npm run test:landing"
      },
      dependencies: {
        commander: "^14.0.0",
        "csv-parse": "^6.1.0"
      },
      devDependencies: {
        "@types/node": "^24.0.0",
        tsup: "^8.5.0",
        typescript: "^5.9.2"
      }
    };
  }
});

// src/install.ts
var install_exports = {};
__export(install_exports, {
  runInstall: () => runInstall
});
function ensureDir2(p) {
  import_fs6.default.mkdirSync(p, { recursive: true });
}
function writeFile(filePath, content, force) {
  if (!force && import_fs6.default.existsSync(filePath)) return { wrote: false, reason: "exists" };
  ensureDir2(import_path7.default.dirname(filePath));
  import_fs6.default.writeFileSync(filePath, content);
  return { wrote: true };
}
function runInstall(cwd, opts) {
  const force = Boolean(opts.force);
  const aioptDir = import_path7.default.join(cwd, "aiopt");
  const policiesDir = import_path7.default.join(aioptDir, "policies");
  const outDir = import_path7.default.join(cwd, "aiopt-output");
  ensureDir2(aioptDir);
  ensureDir2(policiesDir);
  ensureDir2(outDir);
  const created = [];
  const readme = `# AIOpt

AIOpt\uB294 **scan\uD234\uC774 \uC544\uB2C8\uB77C \uC124\uCE58\uD615 \uBE44\uC6A9 \uAC00\uB4DC\uB808\uC77C\uC774\uB2E4.**

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

## Wrapper usage (Node.js)

AIOpt \uC124\uCE58 \uD6C4, \uC571 \uCF54\uB4DC\uC5D0\uC11C wrapper\uB97C \uBD88\uB7EC\uC11C \uC0AC\uC6A9\uB7C9 JSONL\uC744 \uC790\uB3D9 \uAE30\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.


a) \uCD5C\uC18C \uD615\uD0DC(\uD1A0\uD070\uC744 \uC9C1\uC811 \uB118\uAE40)

\`\`\`js
const { guardedCall } = require('./aiopt/aiopt-wrapper.js');

await guardedCall(process.cwd(), {
  provider: 'openai',
  model: 'gpt-5-mini',
  endpoint: 'responses.create',
  feature_tag: 'summarize',
  prompt_tokens: 1200,
  trace_id: 'my-trace'
}, async (req) => {
  // req: { provider, model, endpoint, max_output_tokens, prompt_tokens, idempotency_key }
  // \uC5EC\uAE30\uC11C \uC2E4\uC81C SDK \uD638\uCD9C \uD6C4 \uACB0\uACFC\uB97C \uBC18\uD658
  return { status: 'ok', completion_tokens: 200 };
});
\`\`\`

b) OpenAI-style \uC751\uB2F5(usage \uC790\uB3D9 \uCD94\uCD9C)

\`\`\`js
return {
  status: 'ok',
  response: {
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400 }
  }
};
\`\`\`
`;
  const r1 = writeFile(import_path7.default.join(aioptDir, "README.md"), readme, force);
  created.push({ path: "aiopt/README.md", status: r1.wrote ? "created" : "skipped" });
  const config = {
    version: 1,
    installed_at: (/* @__PURE__ */ new Date()).toISOString(),
    output_dir: "./aiopt-output",
    usage_path: "./aiopt-output/usage.jsonl",
    policies_dir: "./aiopt/policies",
    rate_table: { path: "./rates/rate_table.json" }
  };
  const r2 = writeFile(import_path7.default.join(aioptDir, "aiopt.config.json"), JSON.stringify(config, null, 2) + "\n", force);
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
  const p1 = writeFile(import_path7.default.join(policiesDir, "routing.json"), JSON.stringify(routing, null, 2) + "\n", force);
  const p2 = writeFile(import_path7.default.join(policiesDir, "retry.json"), JSON.stringify(retry, null, 2) + "\n", force);
  const p3 = writeFile(import_path7.default.join(policiesDir, "output.json"), JSON.stringify(output, null, 2) + "\n", force);
  const p4 = writeFile(import_path7.default.join(policiesDir, "context.json"), JSON.stringify(context, null, 2) + "\n", force);
  created.push({ path: "aiopt/policies/routing.json", status: p1.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/retry.json", status: p2.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/output.json", status: p3.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/context.json", status: p4.wrote ? "created" : "skipped" });
  const wrapperPath = import_path7.default.join(aioptDir, "aiopt-wrapper.js");
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
function loadRates(cwd,cfg){
  const rp=path.isAbsolute(cfg.rate_table.path)?cfg.rate_table.path:path.join(cwd,cfg.rate_table.path);
  try{ return readJson(rp); }catch(e){
    // Fresh projects may not have a rates/ table yet. Fall back to a safe default.
    return { providers: {} };
  }
}

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

function normalizeResult(out, input){
  // Accept either normalized return or provider raw.
  const o = (out && out.response) ? out.response : out;
  const status = (out && out.status) || o.status || (o.error ? 'error' : 'ok');
  const usage = o.usage || (o.data && o.data.usage) || null;

  const prompt_tokens = Number(
    (out && out.prompt_tokens) ??
    (o && o.prompt_tokens) ??
    (usage && usage.prompt_tokens) ??
    input.prompt_tokens ??
    0
  );
  const completion_tokens = Number(
    (out && out.completion_tokens) ??
    (o && o.completion_tokens) ??
    (usage && usage.completion_tokens) ??
    0
  );
  const total_tokens = Number(
    (out && out.total_tokens) ??
    (o && o.total_tokens) ??
    (usage && usage.total_tokens) ??
    (prompt_tokens + completion_tokens)
  );

  const error_code = status === 'ok' ? null : String((out && out.error_code) || (o && o.error_code) || (o && o.error && (o.error.code || o.error.type)) || status);
  const cost_usd = (out && typeof out.cost_usd === 'number') ? out.cost_usd : null;

  return { status, prompt_tokens, completion_tokens, total_tokens, error_code, cost_usd };
}

/**
 * guardedCall(cwd, input, fn)
 *
 * fn(req) can return either:
 *  1) Normalized shape:
 *     { status: 'ok'|'error'|'timeout', prompt_tokens?, completion_tokens?, total_tokens?, cost_usd?, error_code? }
 *  2) Provider raw response (OpenAI-style), e.g.:
 *     { status:'ok', response:{ usage:{prompt_tokens, completion_tokens, total_tokens} } }
 *     { usage:{prompt_tokens, completion_tokens, total_tokens} }
 *
 * If token fields are missing, AIOpt will fall back to input.prompt_tokens and/or 0.
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
      const norm=normalizeResult(out, input);
      const cost_usd=(typeof norm.cost_usd==='number') ? norm.cost_usd : costUsd(rt, input.provider, routed.model, norm.prompt_tokens, norm.completion_tokens);
      const feature_tag = input.feature_tag || input.endpoint || 'unknown';
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: norm.status, error_code: norm.error_code, provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens: norm.prompt_tokens, completion_tokens: norm.completion_tokens, total_tokens: norm.total_tokens, cost_usd, latency_ms, meta:{ feature_tag, routed_from: routed.routed_from, policy_hits } });
      last={ status: norm.status, completion_tokens: norm.completion_tokens, error_code: norm.error_code };
      if(norm.status==='ok'){ IDEMPOTENCY.set(idem,out); return out; }
      if(retryOn.has(norm.status) && attempt<maxAttempts){ await sleep(Number(backoffs[Math.min(attempt-1, backoffs.length-1)]||200)); continue; }
      IDEMPOTENCY.set(idem,out); return out;
    }catch(e){
      const latency_ms=Date.now()-t0;
      const out={ status:'error', completion_tokens:0, error_code:String(e && (e.code||e.name) || 'exception') };
      const feature_tag = input.feature_tag || input.endpoint || 'unknown';
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: out.status, error_code: out.error_code, provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens:Number(input.prompt_tokens||0), completion_tokens:0, total_tokens:Number(input.prompt_tokens||0), cost_usd:costUsd(rt, input.provider, routed.model, Number(input.prompt_tokens||0), 0), latency_ms, meta:{ feature_tag, routed_from: routed.routed_from, policy_hits:[routed.hit||'routing:none','outputcap:'+maxOut,'error:exception'] } });
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
  const usagePath = import_path7.default.join(outDir, "usage.jsonl");
  if (force || !import_fs6.default.existsSync(usagePath)) {
    import_fs6.default.writeFileSync(usagePath, "");
    created.push({ path: "aiopt-output/usage.jsonl", status: "created" });
    if (opts.seedSample) {
      const sample = {
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
        meta: { feature_tag: "demo", routed_from: null, policy_hits: ["install-sample"] }
      };
      import_fs6.default.appendFileSync(usagePath, JSON.stringify(sample) + "\n");
    }
  } else {
    created.push({ path: "aiopt-output/usage.jsonl", status: "skipped" });
  }
  return { created };
}
var import_fs6, import_path7;
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
    import_fs6 = __toESM(require("fs"));
    import_path7 = __toESM(require("path"));
  }
});

// src/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  runDoctor: () => runDoctor
});
function canWrite(dir) {
  try {
    import_fs7.default.mkdirSync(dir, { recursive: true });
    const p = import_path8.default.join(dir, `.aiopt-write-test-${Date.now()}`);
    import_fs7.default.writeFileSync(p, "ok");
    import_fs7.default.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}
function tailLines(filePath, n) {
  try {
    const raw = import_fs7.default.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - n));
  } catch {
    return [];
  }
}
function runDoctor(cwd) {
  const aioptDir = import_path8.default.join(cwd, "aiopt");
  const policiesDir = import_path8.default.join(aioptDir, "policies");
  const outDir = import_path8.default.join(cwd, "aiopt-output");
  const usagePath = import_path8.default.join(outDir, "usage.jsonl");
  const checks = [];
  checks.push({ name: "aiopt/ exists", ok: import_fs7.default.existsSync(aioptDir) });
  checks.push({ name: "aiopt/policies exists", ok: import_fs7.default.existsSync(policiesDir) });
  checks.push({ name: "aiopt-output/ writable", ok: canWrite(outDir) });
  checks.push({ name: "usage.jsonl exists", ok: import_fs7.default.existsSync(usagePath), detail: usagePath });
  const last5raw = tailLines(usagePath, 5);
  const last5 = last5raw.length === 0 ? [{ status: "(empty usage.jsonl)" }] : last5raw.map((l) => {
    try {
      const j = JSON.parse(l);
      return {
        status: j.status,
        provider: j.provider,
        model: j.model,
        endpoint: j.endpoint,
        attempt: j.attempt,
        feature_tag: j?.meta?.feature_tag
      };
    } catch {
      return {};
    }
  });
  const last50 = tailLines(usagePath, 50);
  let missing = 0;
  let total50 = 0;
  for (const l of last50) {
    total50++;
    try {
      const j = JSON.parse(l);
      const ft = j?.meta?.feature_tag;
      if (!ft || String(ft).trim() === "") missing++;
    } catch {
      missing++;
    }
  }
  if (total50 > 0 && missing > 0) {
    checks.push({ name: "feature_tag quality (last50)", ok: false, detail: `${missing}/${total50} missing meta.feature_tag` });
  } else {
    checks.push({ name: "feature_tag quality (last50)", ok: true, detail: "meta.feature_tag present" });
  }
  const ok = checks.every((c) => c.ok);
  return { ok, checks, last5 };
}
var import_fs7, import_path8;
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    import_fs7 = __toESM(require("fs"));
    import_path8 = __toESM(require("path"));
  }
});

// src/license.ts
var license_exports = {};
__export(license_exports, {
  DEFAULT_PUBLIC_KEY_PEM: () => DEFAULT_PUBLIC_KEY_PEM,
  defaultLicensePath: () => defaultLicensePath,
  parseLicenseKey: () => parseLicenseKey,
  readLicenseFile: () => readLicenseFile,
  verifyLicenseKey: () => verifyLicenseKey,
  writeLicenseFile: () => writeLicenseFile
});
function b64urlDecodeToBuffer(s) {
  const padLen = (4 - s.length % 4) % 4;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(padded, "base64");
}
function safeJsonParse(buf) {
  const txt = buf.toString("utf8");
  return JSON.parse(txt);
}
function parseLicenseKey(key) {
  const parts = String(key).trim().split(".");
  if (parts.length !== 2) throw new Error("invalid license key format: expected <payloadB64Url>.<sigB64Url>");
  const [payloadB64Url, sigB64Url] = parts;
  const payloadBuf = b64urlDecodeToBuffer(payloadB64Url);
  const sigBuf = b64urlDecodeToBuffer(sigB64Url);
  const payload = safeJsonParse(payloadBuf);
  return { payload, signature: sigBuf, payloadB64Url };
}
function verifyLicenseKey(key, publicKeyPem) {
  let parsed;
  try {
    parsed = parseLicenseKey(key);
  } catch (e) {
    return { ok: false, reason: e?.message || "parse error" };
  }
  const now = Math.floor(Date.now() / 1e3);
  if (typeof parsed.payload?.exp !== "number" || parsed.payload.exp < now) {
    return { ok: false, reason: "expired", payload: parsed.payload };
  }
  try {
    const verifier = import_crypto.default.createVerify("RSA-SHA256");
    verifier.update(parsed.payloadB64Url);
    verifier.end();
    const ok = verifier.verify(publicKeyPem, parsed.signature);
    if (!ok) return { ok: false, reason: "bad signature", payload: parsed.payload };
    return { ok: true, payload: parsed.payload };
  } catch (e) {
    return { ok: false, reason: e?.message || "verify error", payload: parsed.payload };
  }
}
function defaultLicensePath(cwd) {
  return import_path9.default.join(cwd, "aiopt", "license.json");
}
function writeLicenseFile(p, key, payload, verified) {
  const out = {
    key,
    payload,
    verified,
    verified_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  import_fs8.default.mkdirSync(import_path9.default.dirname(p), { recursive: true });
  import_fs8.default.writeFileSync(p, JSON.stringify(out, null, 2));
}
function readLicenseFile(p) {
  return JSON.parse(import_fs8.default.readFileSync(p, "utf8"));
}
var import_crypto, import_fs8, import_path9, DEFAULT_PUBLIC_KEY_PEM;
var init_license = __esm({
  "src/license.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"));
    import_fs8 = __toESM(require("fs"));
    import_path9 = __toESM(require("path"));
    DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz1LLE/pXIx5TloDa0LAf
jg9NSIW6STWhsAFP2ZzXgpWoQ3cCmW6xcB/4QNEmPpGlfMWhyRfkxsdKuhnjUMTg
8MpMAcbjjF8JrGS9iLnW4yrLm7jzsOcndjkGO7pH+32GopZk98dVzmIRPok2Je76
3MQRaxLi0jWytaCmacEB4R7HyuquOQlHPg0vD9NOEwrC/+br2GdQbD1lKPyLeLv3
RidwAs8Iw2xx5g8G+BsVSM/HRC3jQT5GynfnuDsvMHCvGLRct/76ajiR71/NFZEP
Z7liILNnZzCTlKGGZfZmG70t+zkg8HKdpRuWy8rZ0DPWyQg5MKm6TZOMV6dC0Rpg
DwIDAQAB
-----END PUBLIC KEY-----`;
  }
});

// src/gate.ts
var gate_exports = {};
__export(gate_exports, {
  formatGateStdout: () => formatGateStdout,
  runGate: () => runGate
});
function parseFileUri(uri) {
  try {
    if (!uri) return "";
    const u = uri.replace(/^file:\/\//, "");
    const norm = u.replace(/^\/+/, "").replace(/%20/g, " ");
    return norm;
  } catch {
    return uri;
  }
}
function runGate(outDir, cwd) {
  const sarifPath = import_path10.default.join(outDir, "aiopt.sarif");
  if (!import_fs9.default.existsSync(sarifPath)) {
    return { violations: 0, top3: [] };
  }
  let sarif;
  try {
    sarif = JSON.parse(import_fs9.default.readFileSync(sarifPath, "utf8"));
  } catch {
    return { violations: 0, top3: [] };
  }
  const results = sarif.runs?.[0]?.results || [];
  const viol = results.filter((r) => {
    const lvl = String(r.level || "").toLowerCase();
    return lvl === "warning" || lvl === "error";
  });
  const locs = [];
  for (const r of viol) {
    const loc = r.locations?.[0]?.physicalLocation;
    const uri = loc?.artifactLocation?.uri || "";
    const line = Number(loc?.region?.startLine || 1);
    let file = parseFileUri(uri);
    try {
      const abs = import_path10.default.isAbsolute(file) ? file : import_path10.default.resolve(file);
      file = import_path10.default.relative(cwd, abs) || file;
    } catch {
    }
    locs.push({ file, line: Number.isFinite(line) && line > 0 ? line : 1 });
  }
  const top3 = locs.slice(0, 3);
  return { violations: viol.length, top3 };
}
function formatGateStdout(r, outDir) {
  const lines = [];
  if (r.violations <= 0) {
    lines.push("OK: no policy violations");
    lines.push(`Artifacts: ${import_path10.default.join(outDir, "report.md")} | ${import_path10.default.join(outDir, "aiopt.sarif")}`);
    return { text: lines.join("\n"), exitCode: 0 };
  }
  lines.push(`FAIL: policy violations=${r.violations}`);
  lines.push("Top3:");
  for (const x of r.top3) lines.push(`- ${x.file}:${x.line}`);
  lines.push("See artifacts: aiopt-output/report.md | aiopt-output/aiopt.sarif | aiopt-output/patches/");
  const text = lines.slice(0, 10).join("\n");
  return { text, exitCode: 1 };
}
var import_fs9, import_path10;
var init_gate = __esm({
  "src/gate.ts"() {
    "use strict";
    import_fs9 = __toESM(require("fs"));
    import_path10 = __toESM(require("path"));
  }
});

// src/fix.ts
var fix_exports = {};
__export(fix_exports, {
  runFix: () => runFix
});
function isTextLike2(p) {
  const ext = import_path11.default.extname(p).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext);
}
function walk2(root, out) {
  const items = import_fs10.default.readdirSync(root, { withFileTypes: true });
  for (const it of items) {
    if (it.name.startsWith(".")) continue;
    if (DEFAULT_EXCLUDES2.has(it.name)) continue;
    const full = import_path11.default.join(root, it.name);
    if (it.isDirectory()) walk2(full, out);
    else out.push(full);
  }
}
function insertModelConst(content) {
  if (/\bAIOPT_MODEL\b/.test(content)) return { changed: false, next: content };
  if (!/\bprocess\.env\.AIOPT_MODEL\b/.test(content)) {
  }
  const line = "const AIOPT_MODEL = process.env.AIOPT_MODEL || 'gpt-5.2-mini';";
  const lines = content.split(/\r?\n/);
  let i = 0;
  if (lines[0] && lines[0].startsWith("#!")) i++;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith("import ")) {
      i++;
      continue;
    }
    if (t.startsWith("const ") && t.includes("require(")) {
      i++;
      continue;
    }
    if (t === "" || t.startsWith("//") || t.startsWith("/*")) {
      i++;
      continue;
    }
    break;
  }
  lines.splice(i, 0, line, "");
  return { changed: true, next: lines.join("\n") };
}
function applyRetryCap(content) {
  let changed = false;
  let next = content;
  next = next.replace(/\b(maxRetries|maximumRetries|max_attempts|attempts)\s*:\s*(\d+)\b/gi, (m, key, num) => {
    const n = Number(num);
    if (!Number.isFinite(n) || n < 4) return m;
    changed = true;
    return `${key}: 3`;
  });
  next = next.replace(/\b(retries)\s*:\s*(\d+)\b/gi, (m, key, num) => {
    const n = Number(num);
    if (!Number.isFinite(n) || n < 4) return m;
    changed = true;
    return `${key}: 3`;
  });
  return { changed, next };
}
function applyModelRouting(content) {
  let changed = false;
  let next = content;
  const re = /(\bmodel\s*[:=]\s*)(['"])gpt-5\.2\2/g;
  if (re.test(next)) {
    const ins = insertModelConst(next);
    next = ins.next;
    next = next.replace(re, (_m, prefix) => {
      changed = true;
      return `${prefix}AIOPT_MODEL`;
    });
    const re2 = /(\bmodel\s*[:=]\s*)(['"])openai-codex\/gpt-5\.2\2/g;
    next = next.replace(re2, (_m, prefix) => {
      changed = true;
      return `${prefix}(process.env.AIOPT_MODEL_FULL || 'openai-codex/gpt-5.2-mini')`;
    });
  }
  return { changed, next };
}
function tmpFilePath(original) {
  const base = import_path11.default.basename(original);
  const rand = Math.random().toString(16).slice(2);
  return import_path11.default.join(import_os2.default.tmpdir(), `aiopt-fix-${base}-${rand}`);
}
function diffNoIndex(oldPath, newPath) {
  try {
    return (0, import_child_process.execSync)(`git diff --no-index -- ${JSON.stringify(oldPath)} ${JSON.stringify(newPath)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (e) {
    const out = String(e?.stdout || "");
    return out;
  }
}
function normalizePatchPaths(diffText, rel) {
  const raw = diffText.split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (line.startsWith("old mode ") || line.startsWith("new mode ")) continue;
    if (line.startsWith("diff --git ")) {
      lines.push(`diff --git a/${rel} b/${rel}`);
      continue;
    }
    if (line.startsWith("--- ")) {
      lines.push(`--- a/${rel}`);
      continue;
    }
    if (line.startsWith("+++ ")) {
      lines.push(`+++ b/${rel}`);
      continue;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
function runFix(cwd, opts) {
  const files = [];
  walk2(cwd, files);
  const patches = [];
  const changedFiles = [];
  for (const file of files) {
    if (!isTextLike2(file)) continue;
    let st;
    try {
      st = import_fs10.default.statSync(file);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > 1024 * 1024) continue;
    let content = "";
    try {
      content = import_fs10.default.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const r1 = applyRetryCap(content);
    const r2 = applyModelRouting(r1.next);
    const next = r2.next;
    if (next === content) continue;
    const tmp = tmpFilePath(file);
    import_fs10.default.writeFileSync(tmp, next);
    const rel = import_path11.default.relative(cwd, file).replace(/\\/g, "/");
    const d0 = diffNoIndex(file, tmp);
    const d = normalizePatchPaths(d0, rel);
    if (d && d.trim().length > 0) {
      patches.push(d);
      changedFiles.push(rel);
    }
    try {
      import_fs10.default.unlinkSync(tmp);
    } catch {
    }
    if (patches.join("\n").length > 5e5) break;
  }
  import_fs10.default.mkdirSync(opts.outDir, { recursive: true });
  const patchPath = import_path11.default.join(opts.outDir, "aiopt.patch");
  const header = [
    "# AIOpt patch (generated)",
    "# - retry cap: reduce high retry/attempt counts to 3",
    "# - model routing: cheap default via AIOPT_MODEL env override",
    ""
  ].join("\n");
  import_fs10.default.writeFileSync(patchPath, header + patches.join("\n"));
  if (opts.apply) {
    try {
      const inside = (0, import_child_process.execSync)("git rev-parse --is-inside-work-tree", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (inside !== "true") {
        return { ok: false, applied: false, patchPath, changedFiles, hint: "not inside a git work tree (run from your repo root, or omit --apply and apply manually)" };
      }
    } catch {
      return { ok: false, applied: false, patchPath, changedFiles, hint: "git not available or not a git repo (omit --apply and apply manually)" };
    }
    try {
      (0, import_child_process.execSync)(`git apply ${JSON.stringify(patchPath)}`, { stdio: "inherit" });
      return { ok: true, applied: true, patchPath, changedFiles };
    } catch {
      return { ok: false, applied: false, patchPath, changedFiles, hint: "git apply failed. Ensure a clean working tree, then re-run; or open aiopt.patch and apply manually." };
    }
  }
  return { ok: true, applied: false, patchPath, changedFiles };
}
var import_fs10, import_path11, import_os2, import_child_process, DEFAULT_EXCLUDES2;
var init_fix = __esm({
  "src/fix.ts"() {
    "use strict";
    import_fs10 = __toESM(require("fs"));
    import_path11 = __toESM(require("path"));
    import_os2 = __toESM(require("os"));
    import_child_process = require("child_process");
    DEFAULT_EXCLUDES2 = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      "dist",
      "aiopt-output",
      ".next",
      "build",
      "coverage"
    ]);
  }
});

// src/guard.ts
var guard_exports = {};
__export(guard_exports, {
  runGuard: () => runGuard
});
function accidentRiskFromMonthly(monthly) {
  if (!Number.isFinite(monthly)) return "Medium";
  if (monthly >= 100) return "High";
  if (monthly >= 10) return "Medium";
  return "Low";
}
function round23(n) {
  return Math.round(n * 100) / 100;
}
function windowDays(events) {
  let days = 1;
  try {
    const times = events.map((e) => Date.parse(e.ts)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    if (times.length >= 2) {
      const spanMs = Math.max(0, times[times.length - 1] - times[0]);
      const spanDays = spanMs / (1e3 * 60 * 60 * 24);
      days = Math.max(1, spanDays);
    }
  } catch {
    days = 1;
  }
  return days;
}
function monthEstimate(delta, events) {
  const days = windowDays(events);
  return delta * 30 / days;
}
function applyCandidate(events, cand) {
  const ctxM = cand.contextMultiplier ?? 1;
  const outM = cand.outputMultiplier ?? 1;
  const rDelta = cand.retriesDelta ?? 0;
  return events.map((ev) => ({
    ...ev,
    provider: cand.provider ? String(cand.provider).toLowerCase() : ev.provider,
    model: cand.model ? String(cand.model) : ev.model,
    input_tokens: Math.max(0, Math.round((ev.input_tokens || 0) * ctxM)),
    output_tokens: Math.max(0, Math.round((ev.output_tokens || 0) * outM)),
    retries: Math.max(0, Math.round((ev.retries || 0) + rDelta)),
    // clear billed_cost so pricing recalculates for new model/provider
    billed_cost: void 0
  }));
}
function confidenceFromChange(cand) {
  const reasons = [];
  if (cand.retriesDelta && cand.retriesDelta !== 0) reasons.push("retries change");
  if (cand.model) reasons.push("model change");
  if (cand.provider) reasons.push("provider change");
  if (cand.contextMultiplier && cand.contextMultiplier !== 1) reasons.push("context length change");
  if (cand.outputMultiplier && cand.outputMultiplier !== 1) reasons.push("output length change");
  if (cand.retriesDelta && cand.retriesDelta !== 0) return { level: "High", reasons };
  if (cand.model || cand.provider) return { level: "Medium", reasons };
  if (cand.contextMultiplier && cand.contextMultiplier !== 1 || cand.outputMultiplier && cand.outputMultiplier !== 1) {
    return { level: "Low", reasons };
  }
  return { level: "Medium", reasons: reasons.length ? reasons : ["unknown change"] };
}
function assessDataQuality(baselineEvents, base) {
  const reasons = [];
  const times = baselineEvents.map((e) => Date.parse(e.ts)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (times.length < 2) reasons.push("ts span unknown");
  else {
    const spanDays = Math.max(0, (times[times.length - 1] - times[0]) / (1e3 * 60 * 60 * 24));
    if (spanDays < 0.25) reasons.push("ts span too short");
  }
  const missingFt = baselineEvents.filter((e) => !e.feature_tag && !(e.meta && e.meta.feature_tag)).length;
  if (missingFt / Math.max(1, baselineEvents.length) > 0.2) reasons.push("feature_tag missing >20%");
  const unknown = (base.analysis.unknown_models || []).length;
  if (unknown / Math.max(1, baselineEvents.length) > 0.2) reasons.push("unknown model/provider >20%");
  let penalty = "none";
  if (reasons.length >= 2) penalty = "medium";
  else if (reasons.length === 1) penalty = "low";
  return { reasons, penalty };
}
function degrade(level, penalty) {
  if (penalty === "none") return level;
  if (penalty === "low") return level === "High" ? "Medium" : "Low";
  return "Low";
}
function runGuard(rt, input) {
  if (!input.baselineEvents || input.baselineEvents.length === 0) {
    const conf2 = { level: "Low", reasons: ["baseline empty"] };
    const msg2 = [
      "FAIL: baseline usage is empty (need aiopt-output/usage.jsonl)",
      "Impact (monthly est): +$0 (insufficient baseline)",
      `Accident risk: ${accidentRiskFromMonthly(100)}`,
      `Confidence: ${conf2.level} (${conf2.reasons.length ? conf2.reasons.join(", ") : "baseline empty"})`,
      "Recommendation: run the wrapper to collect baseline usage before using guard."
    ].join("\n");
    return { exitCode: 3, message: msg2 };
  }
  const baselineEvents = input.baselineEvents.map((e) => ({ ...e, billed_cost: void 0 }));
  const base = analyze(rt, baselineEvents);
  const candidateEvents = input.candidateEvents && input.candidateEvents.length > 0 ? input.candidateEvents.map((e) => ({ ...e, billed_cost: void 0 })) : applyCandidate(baselineEvents, input.candidate);
  const cand = analyze(rt, candidateEvents);
  const baseCost = base.analysis.total_cost;
  let candCost = cand.analysis.total_cost;
  const callMult = input.candidate.callMultiplier && input.candidate.callMultiplier > 0 ? input.candidate.callMultiplier : 1;
  if (callMult !== 1) {
    candCost = candCost * callMult;
  }
  const attemptLog = baselineEvents.some((e) => e.trace_id && String(e.trace_id).length > 0 || e.attempt !== void 0 && Number(e.attempt) > 0);
  if (attemptLog && input.candidate.retriesDelta && input.candidate.retriesDelta > 0) {
    let retryUnit = 0;
    let retryCount = 0;
    for (const ev of baselineEvents) {
      const attempt = Number(ev.attempt || 1);
      if (attempt >= 2) {
        retryUnit += costOfEvent(rt, ev).cost;
        retryCount += 1;
      }
    }
    if (retryCount > 0) {
      retryUnit = retryUnit / retryCount;
    } else {
      retryUnit = baseCost / Math.max(1, baselineEvents.length);
    }
    candCost += retryUnit * input.candidate.retriesDelta;
  }
  const delta = candCost - baseCost;
  const days = windowDays(baselineEvents);
  const baselineMonthly = baseCost * 30 / days;
  const candidateMonthly = candCost * 30 / days;
  const changeConf = input.candidateEvents ? { level: "High", reasons: ["actual logs diff (--baseline/--candidate)"] } : confidenceFromChange(input.candidate);
  const dq = assessDataQuality(baselineEvents, base);
  const conf = { level: degrade(changeConf.level, dq.penalty), reasons: [...changeConf.reasons, ...dq.reasons.map((r) => `data: ${r}`)] };
  const monthly = monthEstimate(Math.max(0, delta), baselineEvents);
  const monthlyRounded = round23(monthly);
  let exitCode = 0;
  let headline = "OK: no cost accident risk detected";
  if (monthly >= 100) {
    exitCode = 3;
    headline = "FAIL: high risk of LLM cost accident";
  } else if (monthly >= 10) {
    exitCode = 2;
    headline = "WARN: possible LLM cost accident";
  }
  const budget = input.candidate.budgetMonthlyUsd;
  if (budget && Number.isFinite(budget) && budget > 0 && candidateMonthly > budget) {
    exitCode = 3;
    headline = "FAIL: candidate exceeds monthly budget";
  }
  const reasons = conf.reasons.length ? conf.reasons.join(", ") : "n/a";
  function topCauses() {
    const out = [];
    if (!input.candidateEvents) {
      if (callMult !== 1) out.push("traffic spike (call-mult)");
      if (input.candidate.retriesDelta && input.candidate.retriesDelta !== 0) out.push("retry spike (retries-delta)");
      if (input.candidate.model || input.candidate.provider) out.push("model/provider change");
      if (input.candidate.contextMultiplier && input.candidate.contextMultiplier !== 1) out.push("context length change");
      if (input.candidate.outputMultiplier && input.candidate.outputMultiplier !== 1) out.push("output length change");
    } else {
      if (candidateEvents.length !== baselineEvents.length) out.push("traffic/call volume changed");
      const bTop = base.analysis.by_model_top?.[0]?.key;
      const cTop = cand.analysis.by_model_top?.[0]?.key;
      if (bTop && cTop && bTop !== cTop) out.push("model mix changed");
      if ((cand.savings?.retry_waste_usd || 0) > (base.savings?.retry_waste_usd || 0)) out.push("retry waste increased");
    }
    if (budget && Number.isFinite(budget) && budget > 0) out.push(`budget gate: $${round23(budget)}/mo`);
    return out.slice(0, 3);
  }
  const causes = topCauses();
  function sumTokens(events) {
    let input2 = 0;
    let output = 0;
    for (const e of events) {
      input2 += Number(e.input_tokens || 0);
      output += Number(e.output_tokens || 0);
    }
    return { input: input2, output, total: input2 + output };
  }
  function topDeltas(kind) {
    const b = kind === "model" ? base.analysis.by_model_top || [] : base.analysis.by_feature_top || [];
    const c = kind === "model" ? cand.analysis.by_model_top || [] : cand.analysis.by_feature_top || [];
    const bm = /* @__PURE__ */ new Map();
    const cm = /* @__PURE__ */ new Map();
    for (const x of b) bm.set(String(x.key), { cost: Number(x.cost || 0), events: Number(x.events || 0) });
    for (const x of c) cm.set(String(x.key), { cost: Number(x.cost || 0), events: Number(x.events || 0) });
    const keys = /* @__PURE__ */ new Set([...bm.keys(), ...cm.keys()]);
    const deltas = [...keys].map((k) => {
      const bb = bm.get(k) || { cost: 0, events: 0 };
      const cc = cm.get(k) || { cost: 0, events: 0 };
      return { key: k, deltaCost: cc.cost - bb.cost, deltaEvents: cc.events - bb.events };
    });
    return deltas.sort((a, b2) => Math.abs(b2.deltaCost) - Math.abs(a.deltaCost)).slice(0, 3).filter((x) => Math.abs(x.deltaCost) > 1e-9);
  }
  const tokB = sumTokens(baselineEvents);
  const tokC = sumTokens(candidateEvents);
  const msg = [
    headline,
    `Summary: baseline=$${round23(baseCost)} \u2192 candidate=$${round23(candCost)} (\u0394=$${round23(delta)})`,
    `Monthly est: baseline=$${round23(baselineMonthly)} \u2192 candidate=$${round23(candidateMonthly)}${budget ? ` (budget=$${round23(budget)})` : ""}`,
    input.candidateEvents ? `Tokens: input ${tokB.input}\u2192${tokC.input} (\u0394 ${tokC.input - tokB.input}), output ${tokB.output}\u2192${tokC.output} (\u0394 ${tokC.output - tokB.output})` : null,
    callMult !== 1 ? `Call volume multiplier: x${callMult}` : null,
    causes.length ? `Top causes: ${causes.join(" | ")}` : null,
    input.candidateEvents ? topDeltas("model").length ? `Top model deltas: ${topDeltas("model").map((x) => `${x.key} (${round23(x.deltaCost)})`).join(" | ")}` : null : null,
    input.candidateEvents ? topDeltas("feature").length ? `Top feature deltas: ${topDeltas("feature").map((x) => `${x.key} (${round23(x.deltaCost)})`).join(" | ")}` : null : null,
    `Impact (monthly est): +$${monthlyRounded}`,
    `Accident risk: ${accidentRiskFromMonthly(monthly)}`,
    `Confidence: ${conf.level} (${reasons})`,
    "Recommendation: review model/provider/retry/context changes before deploy."
  ].filter(Boolean).join("\n");
  return { exitCode, message: msg };
}
var init_guard = __esm({
  "src/guard.ts"() {
    "use strict";
    init_scan();
    init_cost();
  }
});

// src/cli.ts
var import_fs11 = __toESM(require("fs"));
var import_path12 = __toESM(require("path"));
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
  const inputTokens = x.input_tokens ?? x.prompt_tokens;
  const outputTokens = x.output_tokens ?? x.completion_tokens;
  const featureTag = x.feature_tag ?? x?.meta?.feature_tag ?? x.endpoint ?? "";
  const retries = x.retries ?? (x.attempt !== void 0 ? Math.max(0, toNum(x.attempt) - 1) : 0);
  const billed = x.billed_cost ?? x.cost_usd;
  return {
    ts: String(x.ts ?? ""),
    provider: String(x.provider ?? "").toLowerCase(),
    model: String(x.model ?? ""),
    input_tokens: toNum(inputTokens),
    output_tokens: toNum(outputTokens),
    feature_tag: String(featureTag ?? ""),
    retries: toNum(retries),
    status: String(x.status ?? ""),
    billed_cost: billed === void 0 || billed === "" ? void 0 : toNum(billed),
    trace_id: x.trace_id ? String(x.trace_id) : void 0,
    request_id: x.request_id ? String(x.request_id) : void 0,
    attempt: x.attempt === void 0 ? void 0 : toNum(x.attempt),
    endpoint: x.endpoint ? String(x.endpoint) : void 0
  };
}
function isCsvPath(p) {
  return import_path.default.extname(p).toLowerCase() === ".csv";
}

// src/cli.ts
init_scan();

// src/usage-path.ts
var import_fs5 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
var import_os = __toESM(require("os"));
function homeAioptUsagePath() {
  return import_path6.default.join(import_os.default.homedir(), ".aiopt", "aiopt-output", "usage.jsonl");
}
function resolveUsagePath(preferred) {
  const tried = [];
  const push = (p) => {
    if (!p) return;
    if (tried.includes(p)) return;
    tried.push(p);
  };
  push(preferred);
  push(homeAioptUsagePath());
  push("./aiopt-output/usage.jsonl");
  for (const p of tried) {
    try {
      if (import_fs5.default.existsSync(p)) return { path: p, tried };
    } catch {
    }
  }
  return { path: preferred, tried };
}

// src/cli.ts
var program = new import_commander.Command();
var DEFAULT_INPUT = "./aiopt-output/usage.jsonl";
var DEFAULT_OUTPUT_DIR = "./aiopt-output";
function loadRateTable() {
  const p = import_path12.default.join(__dirname, "..", "rates", "rate_table.json");
  return JSON.parse(import_fs11.default.readFileSync(p, "utf8"));
}
program.name("aiopt").description("AI \uBE44\uC6A9 \uC790\uB3D9 \uC808\uAC10 \uC778\uD504\uB77C \u2014 \uC11C\uBC84 \uC5C6\uB294 \uB85C\uCEEC CLI MVP").version(require_package().version);
program.command("init").description("aiopt-input/ \uBC0F \uC0D8\uD50C usage.jsonl, aiopt-output/ \uC0DD\uC131").action(() => {
  ensureDir("./aiopt-input");
  ensureDir("./aiopt-output");
  const sampleSrc = import_path12.default.join(__dirname, "..", "samples", "sample_usage.jsonl");
  const dst = import_path12.default.join("./aiopt-input", "usage.jsonl");
  if (!import_fs11.default.existsSync(dst)) {
    import_fs11.default.copyFileSync(sampleSrc, dst);
    console.log("Created ./aiopt-input/usage.jsonl (sample)");
  } else {
    console.log("Exists ./aiopt-input/usage.jsonl (skip)");
  }
  console.log("Ready: ./aiopt-output/");
});
program.command("scan").description("\uC785\uB825 \uB85C\uADF8(JSONL/CSV)\uB97C \uBD84\uC11D\uD558\uACE0 report.md/report.json + patches\uAE4C\uC9C0 \uC0DD\uC131").option("--input <path>", "input file path (default: ./aiopt-output/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).option("--json", "print machine-readable JSON to stdout").action(async (opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  if (!import_fs11.default.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { analysis, savings, policy, meta } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  writeOutputs(outDir, analysis, savings, policy, { ...meta, cwd: process.cwd(), cliVersion: program.version() });
  const { buildTopFixes: buildTopFixes2 } = await Promise.resolve().then(() => (init_solutions(), solutions_exports));
  const fixes = buildTopFixes2(analysis, savings).slice(0, 3);
  if (opts.json) {
    const payload = {
      ok: true,
      outDir,
      input: inputPath,
      report: {
        report_md: import_path12.default.join(outDir, "report.md"),
        report_json: import_path12.default.join(outDir, "report.json"),
        cost_policy_json: import_path12.default.join(outDir, "cost-policy.json"),
        sarif: import_path12.default.join(outDir, "aiopt.sarif")
      },
      summary: {
        total_cost_usd: analysis.total_cost,
        estimated_savings_usd: savings.estimated_savings_total,
        confidence: meta?.mode || null
      }
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log("Top Fix 3:");
  fixes.forEach((f, i) => {
    const tag = f.status === "no-issue" ? "(no issue detected)" : `($${Math.round(f.impact_usd * 100) / 100})`;
    console.log(`${i + 1}) ${f.title} ${tag}`);
  });
  console.log(`Report: ${import_path12.default.join(outDir, "report.md")}`);
});
program.command("policy").description("\uB9C8\uC9C0\uB9C9 scan \uACB0\uACFC \uAE30\uBC18\uC73C\uB85C cost-policy.json\uB9CC \uC7AC\uC0DD\uC131 (MVP: scan\uACFC \uB3D9\uC77C \uB85C\uC9C1)").option("--input <path>", "input file path (default: ./aiopt-input/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action((opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { policy } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  ensureDir(outDir);
  import_fs11.default.writeFileSync(import_path12.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
  console.log(`OK: ${outDir}/cost-policy.json`);
});
program.command("install").description("Install AIOpt guardrails: create aiopt/ + policies + usage.jsonl").option("--force", "overwrite existing files").option("--seed-sample", "seed 1 sample line into aiopt-output/usage.jsonl").action(async (opts) => {
  const { runInstall: runInstall2 } = await Promise.resolve().then(() => (init_install(), install_exports));
  const result = runInstall2(process.cwd(), { force: Boolean(opts.force), seedSample: Boolean(opts.seedSample) });
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
var licenseCmd = program.command("license").description("Offline license activate/verify (public key only; no server calls)");
licenseCmd.command("activate").argument("<KEY>", "license key (<payloadB64Url>.<sigB64Url>)").option("--out <path>", "output license.json path (default: ./aiopt/license.json)").action(async (key, opts) => {
  const { DEFAULT_PUBLIC_KEY_PEM: DEFAULT_PUBLIC_KEY_PEM2, defaultLicensePath: defaultLicensePath2, verifyLicenseKey: verifyLicenseKey2, writeLicenseFile: writeLicenseFile2 } = await Promise.resolve().then(() => (init_license(), license_exports));
  const outPath = opts.out ? String(opts.out) : defaultLicensePath2(process.cwd());
  const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM2;
  const v = verifyLicenseKey2(String(key), pub);
  if (!v.payload) {
    console.error(`FAIL: ${v.reason || "invalid license"}`);
    process.exit(3);
  }
  writeLicenseFile2(outPath, String(key), v.payload, v.ok);
  console.log(v.ok ? `OK: activated (${outPath})` : `WARN: saved but not verified (${v.reason}) (${outPath})`);
  process.exit(v.ok ? 0 : 2);
});
licenseCmd.command("verify").option("--path <path>", "license.json path (default: ./aiopt/license.json)").action(async (opts) => {
  const { DEFAULT_PUBLIC_KEY_PEM: DEFAULT_PUBLIC_KEY_PEM2, defaultLicensePath: defaultLicensePath2, readLicenseFile: readLicenseFile2, verifyLicenseKey: verifyLicenseKey2 } = await Promise.resolve().then(() => (init_license(), license_exports));
  const p = opts.path ? String(opts.path) : defaultLicensePath2(process.cwd());
  const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM2;
  if (!import_fs11.default.existsSync(p)) {
    console.error(`FAIL: license file not found: ${p}`);
    process.exit(3);
  }
  const f = readLicenseFile2(p);
  const v = verifyLicenseKey2(f.key, pub);
  if (v.ok) {
    console.log("OK: license verified");
    process.exit(0);
  }
  console.error(`FAIL: license invalid (${v.reason || "unknown"})`);
  process.exit(3);
});
licenseCmd.command("status").option("--path <path>", "license.json path (default: ./aiopt/license.json)").action(async (opts) => {
  const { DEFAULT_PUBLIC_KEY_PEM: DEFAULT_PUBLIC_KEY_PEM2, defaultLicensePath: defaultLicensePath2, readLicenseFile: readLicenseFile2, verifyLicenseKey: verifyLicenseKey2 } = await Promise.resolve().then(() => (init_license(), license_exports));
  const p = opts.path ? String(opts.path) : defaultLicensePath2(process.cwd());
  const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM2;
  if (!import_fs11.default.existsSync(p)) {
    console.log("NO_LICENSE");
    process.exit(2);
  }
  const f = readLicenseFile2(p);
  const v = verifyLicenseKey2(f.key, pub);
  if (v.ok) {
    console.log(`OK: ${f.payload.plan} exp=${f.payload.exp}`);
    process.exit(0);
  }
  console.log(`INVALID: ${v.reason || "unknown"}`);
  process.exit(3);
});
program.command("gate").description("Merge gate (CI-friendly): fail (exit 1) when policy violations are detected; prints <=10 lines").option("--input <path>", "input usage jsonl/csv (default: ./aiopt-output/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).option("--json", "print machine-readable JSON to stdout").action(async (opts) => {
  const preferredInput = String(opts.input);
  const outDir = String(opts.out);
  const resolved = resolveUsagePath(preferredInput);
  const inputPath = resolved.path;
  const defaultOut = "./aiopt-output";
  let finalOutDir = outDir;
  if (outDir === defaultOut) {
    try {
      const os3 = require("os");
      finalOutDir = import_path12.default.join(os3.homedir(), ".aiopt", "aiopt-output");
    } catch {
      finalOutDir = outDir;
    }
  }
  if (!import_fs11.default.existsSync(inputPath)) {
    if (opts.json) {
      console.log(JSON.stringify({
        ok: false,
        exitCode: 1,
        error: "input_not_found",
        message: `FAIL: input not found: ${preferredInput}`,
        tried: resolved.tried,
        hint: "Run: aiopt scan --input <usage.jsonl> (or pass --input <usage.jsonl>)"
      }, null, 2));
    } else {
      console.error(`FAIL: input not found: ${preferredInput}`);
      console.error(`Tried: ${resolved.tried.join(", ")}`);
      console.error("Hint: run `aiopt scan --input <usage.jsonl>` (or pass --input <usage.jsonl>)");
    }
    process.exit(1);
  }
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { analysis, savings, policy, meta } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  writeOutputs(finalOutDir, analysis, savings, policy, { ...meta, cwd: process.cwd(), cliVersion: program.version() });
  const { runGate: runGate2, formatGateStdout: formatGateStdout2 } = await Promise.resolve().then(() => (init_gate(), gate_exports));
  const r = runGate2(finalOutDir, process.cwd());
  if (opts.json) {
    const payload = {
      ok: r.violations <= 0,
      exitCode: r.violations <= 0 ? 0 : 1,
      violations: r.violations,
      top3: r.top3,
      artifacts: {
        report_md: import_path12.default.join(finalOutDir, "report.md"),
        sarif: import_path12.default.join(finalOutDir, "aiopt.sarif"),
        patches_dir: import_path12.default.join(finalOutDir, "patches")
      }
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(payload.exitCode);
  }
  const out = formatGateStdout2(r, finalOutDir);
  console.log(out.text);
  process.exit(out.exitCode);
});
program.command("fix").description("Auto-fix suggestions: generate aiopt.patch (and optionally apply it via git apply)").option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).option("--apply", "apply the generated patch via git apply").option("--json", "print machine-readable JSON to stdout").action(async (opts) => {
  const outDir = String(opts.out);
  const { runFix: runFix2 } = await Promise.resolve().then(() => (init_fix(), fix_exports));
  const r = runFix2(process.cwd(), { outDir, apply: Boolean(opts.apply) });
  if (opts.json) {
    const payload = {
      ok: r.ok,
      applied: r.applied,
      patchPath: r.patchPath,
      changedFiles: r.changedFiles,
      hint: r.hint || null
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(r.ok ? 0 : 1);
  }
  console.log(`Patch: ${r.patchPath}`);
  if (r.changedFiles.length) {
    console.log(`Files: ${r.changedFiles.slice(0, 10).join(", ")}${r.changedFiles.length > 10 ? " ..." : ""}`);
  } else {
    console.log("No changes suggested.");
  }
  if (r.applied) {
    console.log("OK: patch applied");
    process.exit(0);
  }
  if (!r.ok) {
    console.error(`FAIL: could not apply patch${r.hint ? ` (${r.hint})` : ""}`);
    process.exit(1);
  }
  process.exit(0);
});
program.command("guard").description("Pre-deploy guardrail: compare baseline usage vs candidate change (or diff two log sets) and print warnings (exit codes 0/2/3)").option("--input <path>", "baseline usage jsonl/csv (legacy alias for --baseline; default: ./aiopt-output/usage.jsonl)", DEFAULT_INPUT).option("--baseline <path>", "baseline usage jsonl/csv (diff mode when used with --candidate)").option("--candidate <path>", "candidate usage jsonl/csv (diff mode: compare two real log sets)").option("--provider <provider>", "candidate provider override (transform mode only)").option("--model <model>", "candidate model override (transform mode only)").option("--context-mult <n>", "multiply input_tokens by n (transform mode only)", (v) => Number(v)).option("--output-mult <n>", "multiply output_tokens by n (transform mode only)", (v) => Number(v)).option("--retries-delta <n>", "add n to retries (transform mode only)", (v) => Number(v)).option("--call-mult <n>", "multiply call volume by n (traffic spike)", (v) => Number(v)).option("--budget-monthly <usd>", "fail if estimated candidate monthly cost exceeds this budget", (v) => Number(v)).option("--json", "print machine-readable JSON to stdout").action(async (opts) => {
  const rt = loadRateTable();
  const baselinePath = String(opts.baseline || opts.input);
  const candidatePath = opts.candidate ? String(opts.candidate) : null;
  const diffMode = Boolean(opts.baseline || opts.candidate);
  if (diffMode && (!opts.baseline || !opts.candidate)) {
    console.error("FAIL: diff mode requires both --baseline and --candidate");
    process.exit(3);
  }
  if (!import_fs11.default.existsSync(baselinePath)) {
    console.error(`FAIL: baseline not found: ${baselinePath}`);
    process.exit(3);
  }
  if (candidatePath && !import_fs11.default.existsSync(candidatePath)) {
    console.error(`FAIL: candidate not found: ${candidatePath}`);
    process.exit(3);
  }
  const baselineEvents = isCsvPath(baselinePath) ? readCsv(baselinePath) : readJsonl(baselinePath);
  const candidateEvents = candidatePath ? isCsvPath(candidatePath) ? readCsv(candidatePath) : readJsonl(candidatePath) : void 0;
  const { runGuard: runGuard2 } = await Promise.resolve().then(() => (init_guard(), guard_exports));
  const r = runGuard2(rt, {
    baselineEvents,
    candidateEvents,
    candidate: {
      provider: opts.provider,
      model: opts.model,
      contextMultiplier: opts.contextMult,
      outputMultiplier: opts.outputMult,
      retriesDelta: opts.retriesDelta,
      callMultiplier: opts.callMult,
      budgetMonthlyUsd: opts.budgetMonthly
    }
  });
  if (opts.json) {
    const payload = {
      exitCode: r.exitCode,
      message: r.message,
      mode: candidateEvents ? "diff" : "transform",
      baseline: baselinePath,
      candidate: candidatePath,
      artifacts: {
        outDir: import_path12.default.resolve(DEFAULT_OUTPUT_DIR),
        guard_last_txt: import_path12.default.join(import_path12.default.resolve(DEFAULT_OUTPUT_DIR), "guard-last.txt"),
        guard_last_json: import_path12.default.join(import_path12.default.resolve(DEFAULT_OUTPUT_DIR), "guard-last.json"),
        guard_history_jsonl: import_path12.default.join(import_path12.default.resolve(DEFAULT_OUTPUT_DIR), "guard-history.jsonl")
      }
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(r.message);
  }
  try {
    const outDir = import_path12.default.resolve(DEFAULT_OUTPUT_DIR);
    import_fs11.default.mkdirSync(outDir, { recursive: true });
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    import_fs11.default.writeFileSync(import_path12.default.join(outDir, "guard-last.txt"), r.message);
    import_fs11.default.writeFileSync(import_path12.default.join(outDir, "guard-last.json"), JSON.stringify({ ts, exitCode: r.exitCode }, null, 2));
    const histLine = JSON.stringify({ ts, exitCode: r.exitCode, mode: candidateEvents ? "diff" : "transform", baseline: baselinePath, candidate: candidatePath }) + "\n";
    import_fs11.default.appendFileSync(import_path12.default.join(outDir, "guard-history.jsonl"), histLine);
  } catch {
  }
  process.exit(r.exitCode);
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map