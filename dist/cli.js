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
  import_fs3.default.mkdirSync(outDir, { recursive: true });
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
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
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "report.json"), JSON.stringify(reportJson, null, 2));
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
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "report.md"), reportMd);
  const reportTxt = [
    `\uCD1D\uBE44\uC6A9: $${analysis.total_cost}`,
    `\uC808\uAC10 \uAC00\uB2A5 \uAE08\uC561(Estimated): $${savings.estimated_savings_total}`,
    `\uC808\uAC10 \uADFC\uAC70 3\uC904:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ""
  ].join("\n");
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "report.txt"), reportTxt);
  import_fs3.default.writeFileSync(import_path3.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
  const fixes = buildTopFixes(analysis, savings);
  writePatches(outDir, fixes);
}
var import_fs3, import_path3, ROUTE_TO_CHEAP_FEATURES;
var init_scan = __esm({
  "src/scan.ts"() {
    "use strict";
    import_fs3 = __toESM(require("fs"));
    import_path3 = __toESM(require("path"));
    init_cost();
    init_solutions();
    ROUTE_TO_CHEAP_FEATURES = /* @__PURE__ */ new Set(["summarize", "classify", "translate"]);
  }
});

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "aiopt",
      version: "0.2.3",
      description: "Serverless local CLI MVP for AI API cost analysis & cost-policy generation",
      bin: {
        aiopt: "dist/cli.js"
      },
      type: "commonjs",
      main: "dist/cli.js",
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
        "test:npx": `npm pack --silent && node -e "const fs=require('fs');const p=fs.readdirSync('.').find(f=>/^aiopt-.*\\.tgz$/.test(f)); if(!p) throw new Error('tgz not found'); console.log('tgz',p);" && npx --yes ./$(ls -1 aiopt-*.tgz | tail -n 1) install --force && npx --yes ./$(ls -1 aiopt-*.tgz | tail -n 1) doctor && npx --yes ./$(ls -1 aiopt-*.tgz | tail -n 1) scan && test -f ./aiopt-output/report.md && echo OK`,
        "test:guard": "npm run build --silent && node scripts/test-guard.js",
        "test:license": "npm run build --silent && node scripts/test-license.js"
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
  import_fs4.default.mkdirSync(p, { recursive: true });
}
function writeFile(filePath, content, force) {
  if (!force && import_fs4.default.existsSync(filePath)) return { wrote: false, reason: "exists" };
  ensureDir2(import_path4.default.dirname(filePath));
  import_fs4.default.writeFileSync(filePath, content);
  return { wrote: true };
}
function runInstall(cwd, opts) {
  const force = Boolean(opts.force);
  const aioptDir = import_path4.default.join(cwd, "aiopt");
  const policiesDir = import_path4.default.join(aioptDir, "policies");
  const outDir = import_path4.default.join(cwd, "aiopt-output");
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
  const r1 = writeFile(import_path4.default.join(aioptDir, "README.md"), readme, force);
  created.push({ path: "aiopt/README.md", status: r1.wrote ? "created" : "skipped" });
  const config = {
    version: 1,
    installed_at: (/* @__PURE__ */ new Date()).toISOString(),
    output_dir: "./aiopt-output",
    usage_path: "./aiopt-output/usage.jsonl",
    policies_dir: "./aiopt/policies",
    rate_table: { path: "./rates/rate_table.json" }
  };
  const r2 = writeFile(import_path4.default.join(aioptDir, "aiopt.config.json"), JSON.stringify(config, null, 2) + "\n", force);
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
  const p1 = writeFile(import_path4.default.join(policiesDir, "routing.json"), JSON.stringify(routing, null, 2) + "\n", force);
  const p2 = writeFile(import_path4.default.join(policiesDir, "retry.json"), JSON.stringify(retry, null, 2) + "\n", force);
  const p3 = writeFile(import_path4.default.join(policiesDir, "output.json"), JSON.stringify(output, null, 2) + "\n", force);
  const p4 = writeFile(import_path4.default.join(policiesDir, "context.json"), JSON.stringify(context, null, 2) + "\n", force);
  created.push({ path: "aiopt/policies/routing.json", status: p1.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/retry.json", status: p2.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/output.json", status: p3.wrote ? "created" : "skipped" });
  created.push({ path: "aiopt/policies/context.json", status: p4.wrote ? "created" : "skipped" });
  const wrapperPath = import_path4.default.join(aioptDir, "aiopt-wrapper.js");
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
  const usagePath = import_path4.default.join(outDir, "usage.jsonl");
  if (force || !import_fs4.default.existsSync(usagePath)) {
    import_fs4.default.writeFileSync(usagePath, "");
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
      import_fs4.default.appendFileSync(usagePath, JSON.stringify(sample) + "\n");
    }
  } else {
    created.push({ path: "aiopt-output/usage.jsonl", status: "skipped" });
  }
  return { created };
}
var import_fs4, import_path4;
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
    import_fs4 = __toESM(require("fs"));
    import_path4 = __toESM(require("path"));
  }
});

// src/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  runDoctor: () => runDoctor
});
function canWrite(dir) {
  try {
    import_fs5.default.mkdirSync(dir, { recursive: true });
    const p = import_path5.default.join(dir, `.aiopt-write-test-${Date.now()}`);
    import_fs5.default.writeFileSync(p, "ok");
    import_fs5.default.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}
function tailLines(filePath, n) {
  try {
    const raw = import_fs5.default.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - n));
  } catch {
    return [];
  }
}
function runDoctor(cwd) {
  const aioptDir = import_path5.default.join(cwd, "aiopt");
  const policiesDir = import_path5.default.join(aioptDir, "policies");
  const outDir = import_path5.default.join(cwd, "aiopt-output");
  const usagePath = import_path5.default.join(outDir, "usage.jsonl");
  const checks = [];
  checks.push({ name: "aiopt/ exists", ok: import_fs5.default.existsSync(aioptDir) });
  checks.push({ name: "aiopt/policies exists", ok: import_fs5.default.existsSync(policiesDir) });
  checks.push({ name: "aiopt-output/ writable", ok: canWrite(outDir) });
  checks.push({ name: "usage.jsonl exists", ok: import_fs5.default.existsSync(usagePath), detail: usagePath });
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
var import_fs5, import_path5;
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    import_fs5 = __toESM(require("fs"));
    import_path5 = __toESM(require("path"));
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
  return import_path6.default.join(cwd, "aiopt", "license.json");
}
function writeLicenseFile(p, key, payload, verified) {
  const out = {
    key,
    payload,
    verified,
    verified_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  import_fs6.default.mkdirSync(import_path6.default.dirname(p), { recursive: true });
  import_fs6.default.writeFileSync(p, JSON.stringify(out, null, 2));
}
function readLicenseFile(p) {
  return JSON.parse(import_fs6.default.readFileSync(p, "utf8"));
}
var import_crypto, import_fs6, import_path6, DEFAULT_PUBLIC_KEY_PEM;
var init_license = __esm({
  "src/license.ts"() {
    "use strict";
    import_crypto = __toESM(require("crypto"));
    import_fs6 = __toESM(require("fs"));
    import_path6 = __toESM(require("path"));
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
function monthEstimate(delta, events) {
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
  const candidateEvents = applyCandidate(baselineEvents, input.candidate);
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
  const changeConf = confidenceFromChange(input.candidate);
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
  const reasons = conf.reasons.length ? conf.reasons.join(", ") : "n/a";
  const msg = [
    headline,
    `Summary: baseline=$${round23(baseCost)} \u2192 candidate=$${round23(candCost)} (\u0394=$${round23(delta)})`,
    callMult !== 1 ? `Call volume multiplier: x${callMult}` : null,
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

// src/dashboard.ts
var dashboard_exports = {};
__export(dashboard_exports, {
  startDashboard: () => startDashboard
});
async function startDashboard(cwd, opts) {
  const host = "127.0.0.1";
  const port = opts.port || 3010;
  const outDir = import_path7.default.join(cwd, "aiopt-output");
  const file = (name) => import_path7.default.join(outDir, name);
  function readOrNull(p) {
    try {
      if (!import_fs7.default.existsSync(p)) return null;
      return import_fs7.default.readFileSync(p, "utf8");
    } catch {
      return null;
    }
  }
  const indexHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AIOpt Local Dashboard</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,Arial; margin:16px; max-width:980px}
    .row{display:flex; gap:12px; flex-wrap:wrap}
    .card{border:1px solid #ddd; border-radius:10px; padding:12px; flex:1; min-width:320px}
    pre{white-space:pre-wrap; word-break:break-word; background:#0b1020; color:#e6e6e6; padding:12px; border-radius:10px; overflow:auto}
    a{color:#2d6cdf}
  </style>
</head>
<body>
  <h1>AIOpt Local Dashboard</h1>
  <p>Local-only (bind: 127.0.0.1). Reads files from <code>./aiopt-output/</code>.</p>

  <div class="row">
    <div class="card">
      <h2>Last Guard</h2>
      <div id="guardMeta"></div>
      <pre id="guard">loading...</pre>
      <p><a href="/api/guard-last.txt" target="_blank">raw</a></p>
    </div>
    <div class="card">
      <h2>Last Scan</h2>
      <pre id="scan">loading...</pre>
      <p>
        <a href="/api/report.md" target="_blank">report.md</a> \xB7
        <a href="/api/report.json" target="_blank">report.json</a>
      </p>
    </div>
  </div>

<script>
async function load() {
  const guardTxt = await fetch('/api/guard-last.txt').then(r=>r.ok?r.text():null);
  const guardMeta = await fetch('/api/guard-last.json').then(r=>r.ok?r.json():null);
  document.getElementById('guard').textContent = guardTxt || '(no guard-last.txt yet)';
  document.getElementById('guardMeta').textContent = guardMeta ? ('exit=' + guardMeta.exitCode + ' @ ' + guardMeta.ts) : '';

  const reportMd = await fetch('/api/report.md').then(r=>r.ok?r.text():null);
  document.getElementById('scan').textContent = reportMd || '(no report.md yet \u2014 run: aiopt scan)';
}
load();
</script>
</body>
</html>`;
  const server = import_http.default.createServer((req, res) => {
    const url = req.url || "/";
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(indexHtml);
      return;
    }
    if (url.startsWith("/api/")) {
      const name = url.replace("/api/", "");
      const allow = /* @__PURE__ */ new Set(["guard-last.txt", "guard-last.json", "report.md", "report.json"]);
      if (!allow.has(name)) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      const p = file(name);
      const txt = readOrNull(p);
      if (txt === null) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("missing");
        return;
      }
      const ct = name.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8";
      res.writeHead(200, { "content-type": ct });
      res.end(txt);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  console.log(`OK: dashboard http://${host}:${port}/`);
  console.log("Tip: run `aiopt guard ...` and `aiopt scan` to populate aiopt-output files.");
  await new Promise(() => {
  });
}
var import_http, import_fs7, import_path7;
var init_dashboard = __esm({
  "src/dashboard.ts"() {
    "use strict";
    import_http = __toESM(require("http"));
    import_fs7 = __toESM(require("fs"));
    import_path7 = __toESM(require("path"));
  }
});

// src/cli.ts
var import_fs8 = __toESM(require("fs"));
var import_path8 = __toESM(require("path"));
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
var program = new import_commander.Command();
var DEFAULT_INPUT = "./aiopt-output/usage.jsonl";
var DEFAULT_OUTPUT_DIR = "./aiopt-output";
function loadRateTable() {
  const p = import_path8.default.join(__dirname, "..", "rates", "rate_table.json");
  return JSON.parse(import_fs8.default.readFileSync(p, "utf8"));
}
program.name("aiopt").description("AI \uBE44\uC6A9 \uC790\uB3D9 \uC808\uAC10 \uC778\uD504\uB77C \u2014 \uC11C\uBC84 \uC5C6\uB294 \uB85C\uCEEC CLI MVP").version(require_package().version);
program.command("init").description("aiopt-input/ \uBC0F \uC0D8\uD50C usage.jsonl, aiopt-output/ \uC0DD\uC131").action(() => {
  ensureDir("./aiopt-input");
  ensureDir("./aiopt-output");
  const sampleSrc = import_path8.default.join(__dirname, "..", "samples", "sample_usage.jsonl");
  const dst = import_path8.default.join("./aiopt-input", "usage.jsonl");
  if (!import_fs8.default.existsSync(dst)) {
    import_fs8.default.copyFileSync(sampleSrc, dst);
    console.log("Created ./aiopt-input/usage.jsonl (sample)");
  } else {
    console.log("Exists ./aiopt-input/usage.jsonl (skip)");
  }
  console.log("Ready: ./aiopt-output/");
});
program.command("scan").description("\uC785\uB825 \uB85C\uADF8(JSONL/CSV)\uB97C \uBD84\uC11D\uD558\uACE0 report.md/report.json + patches\uAE4C\uC9C0 \uC0DD\uC131").option("--input <path>", "input file path (default: ./aiopt-output/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action(async (opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  if (!import_fs8.default.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { analysis, savings, policy, meta } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  writeOutputs(outDir, analysis, savings, policy, meta);
  const { buildTopFixes: buildTopFixes2 } = await Promise.resolve().then(() => (init_solutions(), solutions_exports));
  const fixes = buildTopFixes2(analysis, savings).slice(0, 3);
  console.log("Top Fix 3:");
  fixes.forEach((f, i) => {
    const tag = f.status === "no-issue" ? "(no issue detected)" : `($${Math.round(f.impact_usd * 100) / 100})`;
    console.log(`${i + 1}) ${f.title} ${tag}`);
  });
  console.log(`Report: ${import_path8.default.join(outDir, "report.md")}`);
});
program.command("policy").description("\uB9C8\uC9C0\uB9C9 scan \uACB0\uACFC \uAE30\uBC18\uC73C\uB85C cost-policy.json\uB9CC \uC7AC\uC0DD\uC131 (MVP: scan\uACFC \uB3D9\uC77C \uB85C\uC9C1)").option("--input <path>", "input file path (default: ./aiopt-input/usage.jsonl)", DEFAULT_INPUT).option("--out <dir>", "output dir (default: ./aiopt-output)", DEFAULT_OUTPUT_DIR).action((opts) => {
  const inputPath = String(opts.input);
  const outDir = String(opts.out);
  const rt = loadRateTable();
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { policy } = analyze(rt, events);
  policy.generated_from.input = inputPath;
  ensureDir(outDir);
  import_fs8.default.writeFileSync(import_path8.default.join(outDir, "cost-policy.json"), JSON.stringify(policy, null, 2));
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
  if (!import_fs8.default.existsSync(p)) {
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
  if (!import_fs8.default.existsSync(p)) {
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
program.command("guard").description("Pre-deploy guardrail: compare baseline usage vs candidate change and print warnings (exit codes 0/2/3)").option("--input <path>", "baseline usage jsonl/csv (default: ./aiopt-output/usage.jsonl)", DEFAULT_INPUT).option("--provider <provider>", "candidate provider override").option("--model <model>", "candidate model override").option("--context-mult <n>", "multiply input_tokens by n", (v) => Number(v)).option("--output-mult <n>", "multiply output_tokens by n", (v) => Number(v)).option("--retries-delta <n>", "add n to retries", (v) => Number(v)).option("--call-mult <n>", "multiply call volume by n (traffic spike)", (v) => Number(v)).action(async (opts) => {
  const rt = loadRateTable();
  const inputPath = String(opts.input);
  if (!import_fs8.default.existsSync(inputPath)) {
    console.error(`FAIL: baseline not found: ${inputPath}`);
    process.exit(3);
  }
  const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
  const { runGuard: runGuard2 } = await Promise.resolve().then(() => (init_guard(), guard_exports));
  const r = runGuard2(rt, {
    baselineEvents: events,
    candidate: {
      provider: opts.provider,
      model: opts.model,
      contextMultiplier: opts.contextMult,
      outputMultiplier: opts.outputMult,
      retriesDelta: opts.retriesDelta,
      callMultiplier: opts.callMult
    }
  });
  console.log(r.message);
  try {
    const outDir = import_path8.default.resolve(DEFAULT_OUTPUT_DIR);
    import_fs8.default.mkdirSync(outDir, { recursive: true });
    import_fs8.default.writeFileSync(import_path8.default.join(outDir, "guard-last.txt"), r.message);
    import_fs8.default.writeFileSync(import_path8.default.join(outDir, "guard-last.json"), JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), exitCode: r.exitCode }, null, 2));
  } catch {
  }
  process.exit(r.exitCode);
});
program.command("dashboard").description("Local dashboard (localhost only): view last guard + last scan outputs").option("--port <n>", "port (default: 3010)", (v) => Number(v), 3010).action(async (opts) => {
  const { startDashboard: startDashboard2 } = await Promise.resolve().then(() => (init_dashboard(), dashboard_exports));
  await startDashboard2(process.cwd(), { port: Number(opts.port || 3010) });
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map