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
  return {
    ts: String(x.ts ?? ''),
    provider: String(x.provider ?? '').toLowerCase(),
    model: String(x.model ?? ''),
    input_tokens: toNum(x.input_tokens),
    output_tokens: toNum(x.output_tokens),
    feature_tag: String(x.feature_tag ?? ''),
    retries: toNum(x.retries),
    status: String(x.status ?? ''),
    billed_cost: x.billed_cost === undefined || x.billed_cost === '' ? undefined : toNum(x.billed_cost)
  };
}

export function isCsvPath(p: string) {
  return path.extname(p).toLowerCase() === '.csv';
}
