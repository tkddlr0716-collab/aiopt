export type UsageEvent = {
  ts: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  feature_tag: string;
  retries: number;
  status: string;
  billed_cost?: number;
};

export type RateTable = {
  version: string;
  date: string;
  currency: string;
  units: string;
  notes?: string;
  providers: Record<string, {
    default_estimated: { input: number; output: number; cached_input?: number };
    models: Record<string, { input: number; output: number; cached_input?: number }>;
  }>;
};
