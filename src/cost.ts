import { RateTable, UsageEvent } from './types';

export type CostResult = {
  cost: number;
  used_rate: {
    kind: 'billed_cost' | 'official' | 'estimated';
    provider: string;
    model: string;
    input_per_m: number;
    output_per_m: number;
  };
};

export function getRates(rt: RateTable, provider: string, model: string) {
  const p = rt.providers[provider];
  if (!p) return null;
  const m = p.models[model];
  if (m) return { kind: 'official' as const, input: m.input, output: m.output };
  return { kind: 'estimated' as const, input: p.default_estimated.input, output: p.default_estimated.output };
}

export function costOfEvent(rt: RateTable, ev: UsageEvent): CostResult {
  if (typeof ev.billed_cost === 'number' && Number.isFinite(ev.billed_cost)) {
    return {
      cost: ev.billed_cost,
      used_rate: {
        kind: 'billed_cost',
        provider: ev.provider,
        model: ev.model,
        input_per_m: 0,
        output_per_m: 0
      }
    };
  }

  const r = getRates(rt, ev.provider, ev.model);
  if (!r) {
    // Unknown provider: deterministic fallback estimate
    const input_per_m = 1.0;
    const output_per_m = 4.0;
    const cost = (ev.input_tokens / 1e6) * input_per_m + (ev.output_tokens / 1e6) * output_per_m;
    return {
      cost,
      used_rate: { kind: 'estimated', provider: ev.provider, model: ev.model, input_per_m, output_per_m }
    };
  }

  const cost = (ev.input_tokens / 1e6) * r.input + (ev.output_tokens / 1e6) * r.output;
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
