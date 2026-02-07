import fs from 'fs';
import path from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { UsageEvent } from './types';

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function readJsonl(filePath: string): UsageEvent[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const out: UsageEvent[] = [];
  for (const line of lines) {
    const obj = JSON.parse(line);
    out.push(normalizeEvent(obj));
  }
  return out;
}

export function readCsv(filePath: string): UsageEvent[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const records = parseCsv(raw, { columns: true, skip_empty_lines: true, trim: true });
  return records.map((r: any) => normalizeEvent(r));
}

function toNum(x: any, def = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function normalizeEvent(x: any): UsageEvent {
  // Supports two schemas:
  // 1) scan input schema: input_tokens/output_tokens/feature_tag/retries
  // 2) wrapper usage schema: prompt_tokens/completion_tokens/endpoint/attempt/trace_id/cost_usd

  const inputTokens = x.input_tokens ?? x.prompt_tokens;
  const outputTokens = x.output_tokens ?? x.completion_tokens;

  // feature_tag fallback: feature_tag -> meta.feature_tag -> endpoint
  const featureTag = x.feature_tag ?? x?.meta?.feature_tag ?? x.endpoint ?? '';

  // retries fallback: retries -> max(attempt-1,0)
  const retries = x.retries ?? (x.attempt !== undefined ? Math.max(0, toNum(x.attempt) - 1) : 0);

  // billed_cost fallback: billed_cost -> cost_usd
  const billed = x.billed_cost ?? x.cost_usd;

  return {
    ts: String(x.ts ?? ''),
    provider: String(x.provider ?? '').toLowerCase(),
    model: String(x.model ?? ''),
    input_tokens: toNum(inputTokens),
    output_tokens: toNum(outputTokens),
    feature_tag: String(featureTag ?? ''),
    retries: toNum(retries),
    status: String(x.status ?? ''),
    billed_cost: billed === undefined || billed === '' ? undefined : toNum(billed)
  };
}

export function isCsvPath(p: string) {
  return path.extname(p).toLowerCase() === '.csv';
}
