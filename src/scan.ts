import fs from 'fs';
import path from 'path';
import { RateTable, UsageEvent } from './types';
import { costOfEvent, getRates } from './cost';

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

export function analyze(rt: RateTable, events: UsageEvent[]): { analysis: AnalysisJson; savings: Savings; policy: PolicyJson } {
  const byModel = new Map<string, { cost: number; events: number }>();
  const byFeature = new Map<string, { cost: number; events: number }>();
  const unknownModels: AnalysisJson['unknown_models'] = [];

  const perEventCosts: Array<{ ev: UsageEvent; cost: number }> = [];

  let total = 0;
  for (const ev of events) {
    const cr = costOfEvent(rt, ev);
    total += cr.cost;
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

  // --- Savings lever 1: routing (cheap features -> cheapest known model per provider)
  let routingSavings = 0;
  for (const { ev } of perEventCosts) {
    if (!ROUTE_TO_CHEAP_FEATURES.has(String(ev.feature_tag || '').toLowerCase())) continue;

    const provider = ev.provider;
    const p = rt.providers[provider];
    if (!p) continue;

    // Choose cheapest model by (input+output) average.
    const entries = Object.entries(p.models);
    if (entries.length === 0) continue;
    const cheapest = entries
      .map(([name, r]) => ({ name, score: (r.input + r.output) / 2, r }))
      .sort((a, b) => a.score - b.score)[0];

    // current cost vs cheapest cost
    const currentRate = getRates(rt, provider, ev.model);
    if (!currentRate) continue;
    if (currentRate.kind === 'estimated') continue; // unknown model: policy not applied

    const currentCost = (ev.input_tokens / 1e6) * currentRate.input + (ev.output_tokens / 1e6) * currentRate.output;
    const cheapCost = (ev.input_tokens / 1e6) * cheapest.r.input + (ev.output_tokens / 1e6) * cheapest.r.output;
    const diff = currentCost - cheapCost;
    if (diff > 0) routingSavings += diff;
  }

  // --- Savings lever 2: context reduction estimate
  // Deterministic: top 20% by input_tokens -> reduce input_tokens by 25%
  const sortedByInput = [...events].sort((a, b) => (b.input_tokens || 0) - (a.input_tokens || 0));
  const k = Math.max(1, Math.floor(sortedByInput.length * 0.2));
  const contextTargets = sortedByInput.slice(0, k);
  let contextSavings = 0;
  for (const ev of contextTargets) {
    const r = getRates(rt, ev.provider, ev.model);
    if (!r) continue;
    const inputPerM = r.input;
    const saveTokens = (ev.input_tokens || 0) * 0.25;
    contextSavings += (saveTokens / 1e6) * inputPerM;
  }

  // --- Savings lever 3: retry waste
  // retries>=1 -> wasted cost = base cost per call * retries
  let retryWaste = 0;
  for (const ev of events) {
    const retries = Number(ev.retries || 0);
    if (retries <= 0) continue;
    const base = costOfEvent(rt, { ...ev, retries: 0 }).cost;
    retryWaste += base * retries;
  }

  const estimatedSavingsTotal = routingSavings + contextSavings + retryWaste;

  const analysis: AnalysisJson = {
    total_cost: round2(total),
    by_model_top: topN(byModel, 10).map(x => ({ ...x, cost: round2(x.cost) })),
    by_feature_top: topN(byFeature, 10).map(x => ({ ...x, cost: round2(x.cost) })),
    unknown_models: uniqUnknown(unknownModels),
    rate_table_version: rt.version,
    rate_table_date: rt.date
  };

  const savings: Savings = {
    estimated_savings_total: round2(estimatedSavingsTotal),
    routing_savings: round2(routingSavings),
    context_savings: round2(contextSavings),
    retry_waste: round2(retryWaste),
    notes: [
      `a) 모델 라우팅 절감(추정): $${round2(routingSavings)}`,
      `b) 컨텍스트 감축(추정): $${round2(contextSavings)} (상위 20% input에 25% 감축 가정)`,
      `c) 재시도/오류 낭비: $${round2(retryWaste)} (retries 기반)`
    ]
  };

  const policy: PolicyJson = buildPolicy(rt, events);

  return { analysis, savings, policy };
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

export function writeOutputs(outDir: string, analysis: AnalysisJson, savings: Savings, policy: PolicyJson) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));

  const report = [
    `총비용: $${analysis.total_cost}`,
    `절감 가능 금액(Estimated): $${savings.estimated_savings_total}`,
    `절감 근거 3줄:`,
    savings.notes[0],
    savings.notes[1],
    savings.notes[2],
    ''
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'report.txt'), report);

  fs.writeFileSync(path.join(outDir, 'cost-policy.json'), JSON.stringify(policy, null, 2));
}
