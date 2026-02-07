import { RateTable, UsageEvent } from './types';
import { analyze } from './scan';
import { costOfEvent } from './cost';

export type GuardInput = {
  // Required. Historical usage for comparison.
  baselineEvents: UsageEvent[];

  // Optional. If provided, guard compares two *actual* log sets.
  // When set, candidate transform knobs (model/context/retries multipliers) are ignored.
  candidateEvents?: UsageEvent[];

  candidate: {
    provider?: string;
    model?: string;
    contextMultiplier?: number; // multiplies input_tokens
    outputMultiplier?: number;  // multiplies output_tokens
    retriesDelta?: number;      // adds to retries
    callMultiplier?: number;    // multiplies call volume
  };
};

export type GuardResult = {
  exitCode: 0 | 2 | 3;
  message: string;
};

function accidentRiskFromMonthly(monthly: number): 'Low' | 'Medium' | 'High' {
  if (!Number.isFinite(monthly)) return 'Medium';
  if (monthly >= 100) return 'High';
  if (monthly >= 10) return 'Medium';
  return 'Low';
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function monthEstimate(delta: number, events: UsageEvent[]) {
  // Convert observed delta (over the sample window) into a monthly estimate.
  // Prefer timestamp-derived window length for determinism; fall back to 1 day.
  let days = 1;
  try {
    const times = events
      .map(e => Date.parse(e.ts))
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (times.length >= 2) {
      const spanMs = Math.max(0, times[times.length - 1] - times[0]);
      const spanDays = spanMs / (1000 * 60 * 60 * 24);
      // If logs cover <1 day (or identical timestamps), treat as 1 day.
      days = Math.max(1, spanDays);
    }
  } catch {
    days = 1;
  }
  return (delta * 30) / days;
}

function applyCandidate(events: UsageEvent[], cand: GuardInput['candidate']): UsageEvent[] {
  const ctxM = cand.contextMultiplier ?? 1;
  const outM = cand.outputMultiplier ?? 1;
  const rDelta = cand.retriesDelta ?? 0;

  return events.map(ev => ({
    ...ev,
    provider: cand.provider ? String(cand.provider).toLowerCase() : ev.provider,
    model: cand.model ? String(cand.model) : ev.model,
    input_tokens: Math.max(0, Math.round((ev.input_tokens || 0) * ctxM)),
    output_tokens: Math.max(0, Math.round((ev.output_tokens || 0) * outM)),
    retries: Math.max(0, Math.round((ev.retries || 0) + rDelta)),
    // clear billed_cost so pricing recalculates for new model/provider
    billed_cost: undefined
  }));
}

function confidenceFromChange(cand: GuardInput['candidate']): { level: 'High'|'Medium'|'Low'; reasons: string[] } {
  const reasons: string[] = [];

  if (cand.retriesDelta && cand.retriesDelta !== 0) reasons.push('retries change');
  if (cand.model) reasons.push('model change');
  if (cand.provider) reasons.push('provider change');
  if (cand.contextMultiplier && cand.contextMultiplier !== 1) reasons.push('context length change');
  if (cand.outputMultiplier && cand.outputMultiplier !== 1) reasons.push('output length change');

  // Spec rule:
  // High: retries/failed/dup calls (we only model retries here)
  // Medium: model/provider change
  // Low: context trimming / prompt structure
  if (cand.retriesDelta && cand.retriesDelta !== 0) return { level: 'High', reasons };
  if (cand.model || cand.provider) return { level: 'Medium', reasons };
  if ((cand.contextMultiplier && cand.contextMultiplier !== 1) || (cand.outputMultiplier && cand.outputMultiplier !== 1)) {
    return { level: 'Low', reasons };
  }
  return { level: 'Medium', reasons: reasons.length ? reasons : ['unknown change'] };
}

function assessDataQuality(baselineEvents: UsageEvent[], base: ReturnType<typeof analyze>) {
  const reasons: string[] = [];

  // ts span
  const times = baselineEvents
    .map(e => Date.parse(e.ts))
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) reasons.push('ts span unknown');
  else {
    const spanDays = Math.max(0, (times[times.length - 1] - times[0]) / (1000 * 60 * 60 * 24));
    if (spanDays < 0.25) reasons.push('ts span too short');
  }

  // feature tag coverage
  const missingFt = baselineEvents.filter(e => !e.feature_tag && !(e.meta && (e.meta as any).feature_tag)).length;
  if (missingFt / Math.max(1, baselineEvents.length) > 0.2) reasons.push('feature_tag missing >20%');

  // unknown model/provider
  const unknown = (base.analysis.unknown_models || []).length;
  if (unknown / Math.max(1, baselineEvents.length) > 0.2) reasons.push('unknown model/provider >20%');

  // Map to a confidence penalty.
  let penalty: 'none'|'low'|'medium' = 'none';
  if (reasons.length >= 2) penalty = 'medium';
  else if (reasons.length === 1) penalty = 'low';

  return { reasons, penalty };
}

function degrade(level: 'High'|'Medium'|'Low', penalty: 'none'|'low'|'medium'): 'High'|'Medium'|'Low' {
  if (penalty === 'none') return level;
  if (penalty === 'low') return level === 'High' ? 'Medium' : 'Low';
  // medium
  return 'Low';
}

export function runGuard(rt: RateTable, input: GuardInput): GuardResult {
  if (!input.baselineEvents || input.baselineEvents.length === 0) {
    const conf = { level: 'Low' as const, reasons: ['baseline empty'] };
    const msg = [
      'FAIL: baseline usage is empty (need aiopt-output/usage.jsonl)',
      'Impact (monthly est): +$0 (insufficient baseline)',
      `Accident risk: ${accidentRiskFromMonthly(100)}`,
      `Confidence: ${conf.level} (${(conf.reasons.length ? conf.reasons.join(', ') : 'baseline empty')})`,
      'Recommendation: run the wrapper to collect baseline usage before using guard.'
    ].join('\n');
    return { exitCode: 3, message: msg };
  }

  // For fair comparison, ignore billed_cost/cost_usd and recompute both sides from rate table.
  const baselineEvents = input.baselineEvents.map(e => ({ ...e, billed_cost: undefined }));
  const base = analyze(rt, baselineEvents);

  const candidateEvents = (input.candidateEvents && input.candidateEvents.length > 0)
    ? input.candidateEvents.map(e => ({ ...e, billed_cost: undefined }))
    : applyCandidate(baselineEvents, input.candidate);

  const cand = analyze(rt, candidateEvents);

  const baseCost = base.analysis.total_cost;
  let candCost = cand.analysis.total_cost;

  // call volume multiplier (traffic spike)
  const callMult = input.candidate.callMultiplier && input.candidate.callMultiplier > 0 ? input.candidate.callMultiplier : 1;
  if (callMult !== 1) {
    candCost = candCost * callMult;
  }

  // attempt-log baseline: retriesDelta should be interpreted as "extra attempts".
  const attemptLog = baselineEvents.some(e => (e.trace_id && String(e.trace_id).length > 0) || (e.attempt !== undefined && Number(e.attempt) > 0));
  if (attemptLog && input.candidate.retriesDelta && input.candidate.retriesDelta > 0) {
    // More accurate deterministic approximation:
    // - If baseline already has retry attempts (attempt>=2), use their average cost as retry unit.
    // - Else fall back to avg baseline attempt cost.
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

  const changeConf = input.candidateEvents
    ? ({ level: 'High' as const, reasons: ['actual logs diff (--baseline/--candidate)'] })
    : confidenceFromChange(input.candidate);

  const dq = assessDataQuality(baselineEvents, base);
  const conf = { level: degrade(changeConf.level, dq.penalty), reasons: [...changeConf.reasons, ...dq.reasons.map(r => `data: ${r}`)] };

  // Guard logic:
  // - Warning if delta > 0 and monthEstimate(delta) >= $10
  // - Fail if delta > 0 and monthEstimate(delta) >= $100 (merge-blocking)
  const monthly = monthEstimate(Math.max(0, delta), baselineEvents);
  const monthlyRounded = round2(monthly);

  let exitCode: 0 | 2 | 3 = 0;
  let headline = 'OK: no cost accident risk detected';

  if (monthly >= 100) { exitCode = 3; headline = 'FAIL: high risk of LLM cost accident'; }
  else if (monthly >= 10) { exitCode = 2; headline = 'WARN: possible LLM cost accident'; }

  const reasons = conf.reasons.length ? conf.reasons.join(', ') : 'n/a';

  const msg = [
    headline,
    `Summary: baseline=$${round2(baseCost)} → candidate=$${round2(candCost)} (Δ=$${round2(delta)})`,
    callMult !== 1 ? `Call volume multiplier: x${callMult}` : null,
    `Impact (monthly est): +$${monthlyRounded}`,
    `Accident risk: ${accidentRiskFromMonthly(monthly)}`,
    `Confidence: ${conf.level} (${reasons})`,
    'Recommendation: review model/provider/retry/context changes before deploy.'
  ].filter(Boolean).join('\n');

  return { exitCode, message: msg };
}
