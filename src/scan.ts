import fs from 'fs';
import path from 'path';
import { RateTable, UsageEvent } from './types';
import { costOfEvent, getRates } from './cost';
import { buildTopFixes, writePatches } from './solutions';

export type AnalysisJson = {
  total_cost: number;
  by_model_top: Array<{ key: string; cost: number; events: number }>;
  by_feature_top: Array<{ key: string; cost: number; events: number }>;
  unknown_models: Array<{ provider: string; model: string; reason: string }>;
  rate_table_version: string;
  rate_table_date: string;
};

export type Savings = {
  estimated_savings_total: number;
  routing_savings: number;
  context_savings: number;
  retry_waste: number;
  notes: [string, string, string];
};

export type PolicyJson = {
  version: number;
  default_provider: string;
  rules: Array<any>;
  budgets: { currency: string; notes?: string };
  generated_from: { rate_table_version: string; input: string };
};

const ROUTE_TO_CHEAP_FEATURES = new Set(['summarize', 'classify', 'translate']);

function topN(map: Map<string, { cost: number; events: number }>, n: number) {
  return [...map.entries()]
    .map(([key, v]) => ({ key, cost: v.cost, events: v.events }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, n);
}

export function analyze(rt: RateTable, events: UsageEvent[]): { analysis: AnalysisJson; savings: Savings; policy: PolicyJson; meta: { mode: 'attempt-log'|'legacy' } } {
  const byModel = new Map<string, { cost: number; events: number }>();
  const byFeature = new Map<string, { cost: number; events: number }>();
  const unknownModels: AnalysisJson['unknown_models'] = [];

  const perEventCosts: Array<{ ev: UsageEvent; cost: number }> = [];

  // Detect wrapper attempt-log mode: each JSONL line is an attempt (trace_id/attempt present)
  const isAttemptLog = events.some(e => (e.trace_id && String(e.trace_id).length > 0) || (e.attempt !== undefined && Number(e.attempt) > 0));

  let baseTotal = 0;
  let total = 0;
  for (const ev of events) {
    const cr = costOfEvent(rt, ev);

    baseTotal += cr.cost;

    if (isAttemptLog) {
      // Each event line is already one attempt; do NOT multiply by retries.
      total += cr.cost;
    } else {
      // Legacy aggregate mode: one line represents a request with retries count.
      const retries = Math.max(0, Number(ev.retries || 0));
      total += cr.cost * (1 + retries);
    }

    perEventCosts.push({ ev, cost: cr.cost });

    const mk = `${ev.provider}:${ev.model}`;
    const fk = ev.feature_tag || '(none)';

    const mv = byModel.get(mk) || { cost: 0, events: 0 };
    mv.cost += cr.cost; mv.events += 1;
    byModel.set(mk, mv);

    const fv = byFeature.get(fk) || { cost: 0, events: 0 };
    fv.cost += cr.cost; fv.events += 1;
    byFeature.set(fk, fv);

    const rr = getRates(rt, ev.provider, ev.model);
    if (!rr) {
      unknownModels.push({ provider: ev.provider, model: ev.model, reason: 'unknown provider (estimated)' });
    } else if (rr.kind === 'estimated') {
      unknownModels.push({ provider: ev.provider, model: ev.model, reason: 'unknown model (estimated)' });
    }
  }

  // --- Savings simulator (refactor): per-event before/after with caps + no double counting
  type Pot = { routing: number; context: number; retry: number; total: number; waste: number };
  const potByIdx: Pot[] = [];

  // Potential routing/context computed per event
  for (const { ev, cost } of perEventCosts) {
    const retries = Math.max(0, Number(ev.retries || 0));
    const attempt = Number(ev.attempt || 1);

    const total_i = isAttemptLog ? cost : cost * (1 + retries);
    // Retry waste:
    // - attempt-log mode: attempts >= 2 are retry waste
    // - legacy mode: base_cost * retries
    const waste_i = isAttemptLog ? (attempt >= 2 ? cost : 0) : cost * retries;

    let routing_i = 0;
    if (ROUTE_TO_CHEAP_FEATURES.has(String(ev.feature_tag || '').toLowerCase())) {
      const provider = ev.provider;
      const p = rt.providers[provider];
      if (p) {
        const entries = Object.entries(p.models);
        if (entries.length > 0) {
          const cheapest = entries
            .map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r }))
            .sort((a, b) => a.score - b.score)[0];
          const currentRate = getRates(rt, provider, ev.model);
          if (currentRate && currentRate.kind !== 'estimated') {
            const currentCost = (ev.input_tokens / 1e6) * currentRate.input + (ev.output_tokens / 1e6) * currentRate.output;
            const cheapCost = (ev.input_tokens / 1e6) * cheapest.r.input + (ev.output_tokens / 1e6) * cheapest.r.output;
            const diff = (currentCost - cheapCost) * (1 + retries);
            routing_i = Math.max(0, diff);
          }
        }
      }
    }

    // context: top 20% rule is applied later by index set
    potByIdx.push({ routing: routing_i, context: 0, retry: waste_i, total: total_i, waste: waste_i });
  }

  // context potential assignment (deterministic): top 20% by input_tokens => 25% reduction
  // In attempt-log mode, only apply to attempt==1 to avoid overcounting retries.
  const sortedIdx = [...events.map((e, i) => ({ i, input: Number(e.input_tokens || 0), ok: !isAttemptLog || Number(e.attempt || 1) === 1 }))]
    .filter(x => x.ok)
    .sort((a, b) => b.input - a.input);
  const k = Math.max(1, Math.floor(sortedIdx.length * 0.2));
  const topIdx = new Set(sortedIdx.slice(0, k).map(x => x.i));
  for (let i = 0; i < events.length; i++) {
    if (!topIdx.has(i)) continue;
    const ev = events[i];
    const retries = Math.max(0, Number(ev.retries || 0));
    const r = getRates(rt, ev.provider, ev.model);
    if (!r) continue;
    const saveTokens = (Number(ev.input_tokens || 0)) * 0.25;
    const multiplier = isAttemptLog ? 1 : (1 + retries);
    const diff = (saveTokens / 1e6) * r.input * multiplier;
    potByIdx[i].context = Math.max(0, diff);
  }

  // Allocate savings without overlap (routing -> context -> retry), each capped by remaining cost.
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

    // Retry tuning can only save the waste portion, and cannot exceed remaining.
    const retrySave = Math.min(p.retry, remaining);
    retryWaste += retrySave;
  }

  const estimatedSavingsTotal = routingSavings + contextSavings + retryWaste;
  // Global guard
  const guardedSavingsTotal = Math.min(estimatedSavingsTotal, total);

  const analysis: AnalysisJson = {
    total_cost: round2(total),
    by_model_top: topN(byModel, 10).map(x => ({ ...x, cost: round2(x.cost) })),
    by_feature_top: topN(byFeature, 10).map(x => ({ ...x, cost: round2(x.cost) })),
    unknown_models: uniqUnknown(unknownModels),
    rate_table_version: rt.version,
    rate_table_date: rt.date
  };

  const savings: Savings = {
    estimated_savings_total: round2(guardedSavingsTotal),
    routing_savings: round2(routingSavings),
    context_savings: round2(contextSavings),
    retry_waste: round2(retryWaste),
    notes: [
      `a) 모델 라우팅 절감(추정): $${round2(routingSavings)}`,
      `b) 컨텍스트 감축(추정): $${round2(contextSavings)} (상위 20% input에 25% 감축 가정)` ,
      `c) 재시도/오류 낭비(상한 적용): $${round2(retryWaste)} (retries 기반)`
    ]
  };

  const policy: PolicyJson = buildPolicy(rt, events);

  return { analysis, savings, policy, meta: { mode: isAttemptLog ? 'attempt-log' : 'legacy' } };
}

function buildPolicy(rt: RateTable, events: UsageEvent[]): PolicyJson {
  // Default provider: most frequent
  const freq = new Map<string, number>();
  for (const ev of events) freq.set(ev.provider, (freq.get(ev.provider) || 0) + 1);
  const defaultProvider = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'openai';

  // For cheap features: recommend cheapest known model per provider.
  const rules: any[] = [];
  for (const provider of Object.keys(rt.providers)) {
    const p = rt.providers[provider];
    const entries = Object.entries(p.models);
    if (entries.length === 0) continue;
    const cheapest = entries
      .map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r }))
      .sort((a, b) => a.score - b.score)[0];

    rules.push({
      match: { provider, feature_tag_in: ['summarize', 'classify', 'translate'] },
      action: { recommend_model: cheapest.name, reason: 'cheap-feature routing' }
    });
  }

  // Unknown models: keep (no policy)
  rules.push({ match: { model_unknown: true }, action: { keep: true, reason: 'unknown model -> no policy applied' } });

  return {
    version: 1,
    default_provider: defaultProvider,
    rules,
    budgets: { currency: rt.currency, notes: 'MVP: budgets not enforced' },
    generated_from: { rate_table_version: rt.version, input: './aiopt-input/usage.jsonl' }
  };
}

function uniqUnknown(list: AnalysisJson['unknown_models']) {
  const seen = new Set<string>();
  const out: AnalysisJson['unknown_models'] = [];
  for (const x of list) {
    const k = `${x.provider}:${x.model}:${x.reason}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function writeOutputs(outDir: string, analysis: AnalysisJson, savings: Savings, policy: PolicyJson, meta?: { mode?: 'attempt-log'|'legacy' }) {
  const mode = meta?.mode || 'legacy';

  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));

  // report.json is the “one file to parse” summary for downstream tooling.
  const unknownCount = analysis.unknown_models?.length || 0;
  // confidence: downgrade if many unknowns; keep deterministic
  const confidence = unknownCount === 0 ? 'HIGH' : (unknownCount <= 3 ? 'MED' : 'LOW');
  const ratio = analysis.total_cost > 0 ? (savings.estimated_savings_total / analysis.total_cost) : 0;
  const warnings: string[] = [];
  if (ratio >= 0.9) warnings.push('estimated savings >= 90%');
  if (unknownCount > 0) warnings.push('unknown models/providers detected (estimated pricing used)');

  const reportJson = {
    version: 3,
    generated_at: new Date().toISOString(),
    confidence,
    warnings,
    assumptions: {
      no_double_counting: 'routing -> context -> retry allocation per-event with remaining-cost caps',
      retry_cost_model: mode === 'attempt-log'
        ? 'attempt-log mode: total_cost is sum of attempt lines; retry_waste is sum of attempts>=2'
        : 'legacy mode: total_cost includes retries as extra attempts (base_cost*(1+retries))',
      context_model: 'top 20% by input_tokens assume 25% input reduction',
      estimated_pricing_note: unknownCount > 0 ? 'some items use estimated rates; treat savings as a band' : 'all items used known rates'
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
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(reportJson, null, 2));

  // report.md: "what to change" guidance + confidence/assumptions (T4 DoD)
  const ratioMd = analysis.total_cost > 0 ? (savings.estimated_savings_total / analysis.total_cost) : 0;
  const warningsMd: string[] = [];
  if (ratioMd >= 0.9) warningsMd.push('WARNING: estimated savings >= 90% — check overlap/missing rate table');

  const reportMd = [
    '# AIOpt Report',
    '',
    `- Total cost: $${analysis.total_cost}`,
    `- Estimated savings: $${savings.estimated_savings_total} (guarded <= total_cost)`,
    `- Confidence: ${confidence}`,
    unknownCount > 0 ? `- Unknown models: ${unknownCount} (estimated pricing used)` : '- Unknown models: 0',
    ...warningsMd.map(w => `- ${w}`),
    '',
    '## ASSUMPTIONS',
    '- No double-counting: routing → context → retry savings allocated per-event with remaining-cost caps.',
    mode === 'attempt-log'
      ? '- Retry cost model: attempt-log mode (total_cost=sum attempts, retry_waste=sum attempt>=2).'
      : '- Retry cost model: legacy mode (total_cost=base_cost*(1+retries)).',
    '- Context savings: top 20% input_tokens events assume 25% input reduction.',
    '',
    '## WHAT TO CHANGE',
    '1) Retry tuning → edit `aiopt/policies/retry.json`',
    '2) Output cap → edit `aiopt/policies/output.json`',
    '3) Routing rule → edit `aiopt/policies/routing.json`',
    '',
    '## OUTPUTS',
    '- `aiopt-output/analysis.json`',
    '- `aiopt-output/report.json`',
    '- `aiopt-output/patches/*`',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'report.md'), reportMd);

  const reportTxt = [
    `총비용: $${analysis.total_cost}`,
    `절감 가능 금액(Estimated): $${savings.estimated_savings_total}`,
    `절감 근거 3줄:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ''
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'report.txt'), reportTxt);

  fs.writeFileSync(path.join(outDir, 'cost-policy.json'), JSON.stringify(policy, null, 2));

  // patches/*
  const fixes = buildTopFixes(analysis, savings);
  writePatches(outDir, fixes);
}
