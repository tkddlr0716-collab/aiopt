import fs from 'fs';
import path from 'path';
import os from 'os';

export type UsageEventV2 = {
  ts: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  retries: number;
  status: string;
  feature_tag?: string;
  // optional
  trace_id?: string;
  request_id?: string;
  attempt?: number;
  endpoint?: string;
  cost_usd?: number;
  meta?: Record<string, any>;
};

function exists(p: string) {
  try { return fs.existsSync(p); } catch { return false; }
}

function safeReadJsonl(p: string): any[] {
  const out: any[] = [];
  try {
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
  } catch {}
  return out;
}

function listJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let st: fs.Stats;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isFile() && name.endsWith('.jsonl')) out.push(full);
    }
  } catch {}
  return out;
}

function findOpenClawSessionLogs(): string[] {
  // OpenClaw stores per-session JSONL logs under ~/.openclaw/agents/*/sessions/*.jsonl
  const home = os.homedir();
  const root = path.join(home, '.openclaw', 'agents');
  if (!exists(root)) return [];

  const found: string[] = [];
  let agents: string[] = [];
  try { agents = fs.readdirSync(root); } catch { agents = []; }

  for (const a of agents) {
    const sessDir = path.join(root, a, 'sessions');
    if (!exists(sessDir)) continue;
    for (const f of listJsonlFiles(sessDir)) found.push(f);
  }
  return found;
}

function parseOpenClawSessionFile(p: string): UsageEventV2[] {
  const rows = safeReadJsonl(p);
  const events: UsageEventV2[] = [];

  for (const r of rows) {
    if (r && r.type === 'message' && r.message && typeof r.message === 'object') {
      const m = r.message;
      const u = m.usage;
      if (!u) continue;

      // Expected shape observed:
      // usage: { input, output, cacheRead, cacheWrite, totalTokens, cost: { total, input, output, cacheRead, cacheWrite } }
      const input = Number(u.input ?? u.prompt ?? u.prompt_tokens ?? 0);
      const output = Number(u.output ?? u.completion ?? u.completion_tokens ?? 0);
      const costTotal = u.cost && typeof u.cost === 'object' ? Number(u.cost.total ?? u.costTotal ?? u.cost_usd) : undefined;

      // OpenClaw stores timestamps as ms (number-like string). Normalize to ISO for downstream tools.
      let tsRaw: any = m.timestamp || r.timestamp || new Date().toISOString();
      let ts = String(tsRaw);
      if (String(tsRaw).match(/^\d{10,}$/)) {
        try { ts = new Date(Number(tsRaw)).toISOString(); } catch {}
      }
      const provider = String(m.provider || r.provider || 'openclaw');
      const model = String(m.model || r.modelId || 'unknown');

      if (!Number.isFinite(input) && !Number.isFinite(output) && !Number.isFinite(costTotal as any)) continue;

      events.push({
        ts,
        provider,
        model,
        input_tokens: Number.isFinite(input) ? input : 0,
        output_tokens: Number.isFinite(output) ? output : 0,
        retries: 0,
        status: 'ok',
        cost_usd: Number.isFinite(costTotal as any) ? Number(costTotal) : undefined,
        meta: {
          source: 'openclaw-session',
          session_file: p,
          cache_read_tokens: u.cacheRead,
          cache_write_tokens: u.cacheWrite,
          total_tokens: u.totalTokens
        }
      });
    }
  }

  return events;
}

function stableKey(e: UsageEventV2) {
  // best-effort de-dup key
  return `${e.ts}|${e.provider}|${e.model}|${e.input_tokens}|${e.output_tokens}|${e.cost_usd ?? ''}`;
}

export type CollectResult = {
  outPath: string;
  sources: Array<{ name: string; files: number; events: number }>;
  eventsWritten: number;
};

export function collectToUsageJsonl(outPath: string): CollectResult {
  const all: UsageEventV2[] = [];
  const sources: CollectResult['sources'] = [];

  // OpenClaw
  const ocFiles = findOpenClawSessionLogs();
  let ocEvents = 0;
  for (const f of ocFiles) {
    const evs = parseOpenClawSessionFile(f);
    ocEvents += evs.length;
    all.push(...evs);
  }
  sources.push({ name: 'openclaw', files: ocFiles.length, events: ocEvents });

  // Future: cursor, claude-code, etc. (best-effort adapters)

  // De-dup + sort by ts
  const seen = new Set<string>();
  const uniq: UsageEventV2[] = [];
  for (const e of all) {
    const k = stableKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  uniq.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = uniq.map(e => JSON.stringify(e)).join('\n') + (uniq.length ? '\n' : '');
  fs.writeFileSync(outPath, lines);

  return { outPath, sources, eventsWritten: uniq.length };
}
