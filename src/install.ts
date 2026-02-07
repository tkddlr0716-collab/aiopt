import fs from 'fs';
import path from 'path';

export type InstallOptions = {
  force?: boolean;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(filePath: string, content: string, force?: boolean) {
  if (!force && fs.existsSync(filePath)) return { wrote: false, reason: 'exists' as const };
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  return { wrote: true as const };
}

export function runInstall(cwd: string, opts: InstallOptions) {
  const force = Boolean(opts.force);

  const aioptDir = path.join(cwd, 'aiopt');
  const policiesDir = path.join(aioptDir, 'policies');
  const outDir = path.join(cwd, 'aiopt-output');

  ensureDir(aioptDir);
  ensureDir(policiesDir);
  ensureDir(outDir);

  const created: Array<{ path: string; status: 'created' | 'skipped' }> = [];

  // 1) aiopt/README.md
  const readme = `# AIOpt

AIOpt는 **scan 툴이 아니라 설치형 비용 가드레일**입니다.

## Quick start
\`\`\`bash
npx aiopt install --force
npx aiopt doctor
# (your app runs, wrapper logs usage)
npx aiopt scan
\`\`\`

- 서버/대시보드/계정/업로드/결제/프록시 없음
- 로컬 파일 기반(정책 + usage.jsonl)
- LLM 호출 금지(수학/룰 기반)
`;

  const r1 = writeFile(path.join(aioptDir, 'README.md'), readme, force);
  created.push({ path: 'aiopt/README.md', status: r1.wrote ? 'created' : 'skipped' });

  // 2) aiopt/aiopt.config.json
  const config = {
    version: 1,
    installed_at: new Date().toISOString(),
    output_dir: './aiopt-output',
    usage_path: './aiopt-output/usage.jsonl',
    policies_dir: './aiopt/policies',
    rate_table: { path: './rates/rate_table.json' }
  };
  const r2 = writeFile(path.join(aioptDir, 'aiopt.config.json'), JSON.stringify(config, null, 2) + '\n', force);
  created.push({ path: 'aiopt/aiopt.config.json', status: r2.wrote ? 'created' : 'skipped' });

  // 3) policies
  const routing = {
    version: 1,
    rules: [
      { match: { feature_tag_in: ['summarize', 'classify', 'translate'] }, action: { tier: 'cheap', reason: 'cheap feature routing' } },
      { match: { feature_tag_in: ['coding', 'reasoning'] }, action: { tier: 'default', reason: 'keep for quality' } }
    ]
  };
  const retry = {
    version: 1,
    max_attempts: 2,
    backoff_ms: [200, 500],
    retry_on_status: ['error', 'timeout'],
    notes: 'MVP deterministic retry tuning'
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
    input_token_soft_cap: 12000,
    reduce_top_percentile: 0.2,
    assumed_reduction_ratio: 0.25
  };

  const p1 = writeFile(path.join(policiesDir, 'routing.json'), JSON.stringify(routing, null, 2) + '\n', force);
  const p2 = writeFile(path.join(policiesDir, 'retry.json'), JSON.stringify(retry, null, 2) + '\n', force);
  const p3 = writeFile(path.join(policiesDir, 'output.json'), JSON.stringify(output, null, 2) + '\n', force);
  const p4 = writeFile(path.join(policiesDir, 'context.json'), JSON.stringify(context, null, 2) + '\n', force);

  created.push({ path: 'aiopt/policies/routing.json', status: p1.wrote ? 'created' : 'skipped' });
  created.push({ path: 'aiopt/policies/retry.json', status: p2.wrote ? 'created' : 'skipped' });
  created.push({ path: 'aiopt/policies/output.json', status: p3.wrote ? 'created' : 'skipped' });
  created.push({ path: 'aiopt/policies/context.json', status: p4.wrote ? 'created' : 'skipped' });

  // 4) wrapper template (T2)
  const wrapperPath = path.join(aioptDir, 'aiopt-wrapper.ts');
  const wrapper = `// AIOpt Wrapper (local guardrail)
//
// Goals (MVP):
// - deterministic (no LLM calls)
// - local-file based (aiopt/aiopt.config.json + aiopt/policies/*.json)
// - logs every call to aiopt-output/usage.jsonl (JSONL)
// - optional routing/caps/retry based on policies
//
// Integration idea:
//   import { aioptWrap } from './aiopt/aiopt-wrapper';
//   const guarded = aioptWrap(callLLM);
//   const res = await guarded({ provider:'openai', model:'gpt-5', endpoint:'responses', feature_tag:'summarize', trace_id:'t1', meta:{...}, exec: () => client.responses.create(...) });

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type AioptConfig = {
  version: number;
  installed_at?: string;
  output_dir: string;
  usage_path: string;
  policies_dir: string;
  rate_table?: { path: string };
};

export type RoutingPolicy = {
  version: number;
  rules: Array<{
    match: { feature_tag_in?: string[] };
    action: { tier: 'cheap' | 'default'; reason?: string };
  }>;
};

export type RetryPolicy = {
  version: number;
  max_attempts: number;
  backoff_ms: number[];
  retry_on_status: Array<'error' | 'timeout'>;
};

export type OutputPolicy = {
  version: number;
  max_output_tokens_default: number;
  per_feature?: Record<string, number>;
};

export type ContextPolicy = {
  version: number;
  input_token_soft_cap: number;
  reduce_top_percentile: number;
  assumed_reduction_ratio: number;
};

export type UsageLine = {
  ts: string;
  request_id: string;
  trace_id: string;
  attempt: number;
  status: 'ok' | 'error' | 'timeout';
  error_code: string | null;
  provider: string;
  model: string;
  endpoint: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  meta: Record<string, any>;
};

export type AioptCallRequest<T> = {
  provider: string;
  model: string;
  endpoint: string;
  feature_tag?: string;
  trace_id?: string;
  request_id?: string;
  idempotency_key?: string;
  max_output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  meta?: Record<string, any>;
  exec: (patched: { model: string; max_output_tokens: number; idempotency_key: string }) => Promise<T>;
};

export type AioptWrapperOptions = {
  cwd?: string;
  configPath?: string;
  usagePath?: string;
  cheapModel?: string; // default: gpt-5-mini
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonSafe<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function resolveFrom(baseDir: string, maybeRel: string) {
  return path.isAbsolute(maybeRel) ? maybeRel : path.join(baseDir, maybeRel);
}

function loadConfig(cwd: string, explicitPath?: string): { cfg: AioptConfig; baseDir: string } {
  const baseDir = cwd;
  const cfgPath = explicitPath ? resolveFrom(baseDir, explicitPath) : path.join(baseDir, 'aiopt', 'aiopt.config.json');
  const cfg = readJsonSafe<AioptConfig>(cfgPath) || {
    version: 1,
    installed_at: new Date().toISOString(),
    output_dir: './aiopt-output',
    usage_path: './aiopt-output/usage.jsonl',
    policies_dir: './aiopt/policies'
  };
  return { cfg, baseDir };
}

function loadPolicies(baseDir: string, cfg: AioptConfig) {
  const policiesDir = resolveFrom(baseDir, cfg.policies_dir);
  const routing = readJsonSafe<RoutingPolicy>(path.join(policiesDir, 'routing.json'));
  const retry = readJsonSafe<RetryPolicy>(path.join(policiesDir, 'retry.json'));
  const output = readJsonSafe<OutputPolicy>(path.join(policiesDir, 'output.json'));
  const context = readJsonSafe<ContextPolicy>(path.join(policiesDir, 'context.json'));
  return { routing, retry, output, context };
}

function pickOutputCap(output: OutputPolicy | null, featureTag?: string) {
  if (!output) return 1024;
  if (featureTag && output.per_feature && typeof output.per_feature[featureTag] === 'number') return output.per_feature[featureTag];
  return output.max_output_tokens_default ?? 1024;
}

function applyRouting(routing: RoutingPolicy | null, featureTag: string | undefined, originalModel: string, cheapModel: string) {
  if (!routing || !featureTag) return { model: originalModel, routed_from: null as string | null, policy_hits: [] as string[] };
  for (const rule of routing.rules || []) {
    const inList = rule.match?.feature_tag_in?.includes(featureTag);
    if (!inList) continue;
    if (rule.action?.tier === 'cheap') {
      if (originalModel !== cheapModel) {
        return { model: cheapModel, routed_from: originalModel, policy_hits: ['routing:' + featureTag] };
      }
    }
    return { model: originalModel, routed_from: null, policy_hits: ['routing:' + featureTag] };
  }
  return { model: originalModel, routed_from: null, policy_hits: [] };
}

function makeId(prefix: string) {
  return prefix + '-' + crypto.randomBytes(8).toString('hex');
}

function classifyError(e: any): { status: 'error' | 'timeout'; code: string } {
  const msg = String(e?.message || e || 'error');
  const name = String(e?.name || 'Error');
  const isTimeout = /timeout|timed out|ETIMEDOUT/i.test(msg) || /timeout/i.test(name);
  return { status: isTimeout ? 'timeout' : 'error', code: (e?.code ? String(e.code) : isTimeout ? 'TIMEOUT' : 'ERROR') };
}

function appendUsageLine(usagePath: string, line: UsageLine) {
  ensureDir(path.dirname(usagePath));
  fs.appendFileSync(usagePath, JSON.stringify(line) + '\n');
}

export function aioptWrap<T>(fn: (req: AioptCallRequest<T>) => Promise<T>, opts?: AioptWrapperOptions) {
  const cwd = opts?.cwd || process.cwd();
  const cheapModel = opts?.cheapModel || 'gpt-5-mini';
  const { cfg, baseDir } = loadConfig(cwd, opts?.configPath);
  const policies = loadPolicies(baseDir, cfg);

  const usagePath = opts?.usagePath
    ? resolveFrom(baseDir, opts.usagePath)
    : resolveFrom(baseDir, cfg.usage_path);

  return async (req: AioptCallRequest<T>) => {
    const trace_id = req.trace_id || makeId('trace');
    const request_id = req.request_id || makeId('req');
    const idempotency_key = req.idempotency_key || crypto.createHash('sha256').update(trace_id + ':' + request_id).digest('hex');

    const cap = Math.max(1, pickOutputCap(policies.output, req.feature_tag));
    const desiredMax = typeof req.max_output_tokens === 'number' ? req.max_output_tokens : cap;
    const max_output_tokens = Math.min(desiredMax, cap);

    const routed = applyRouting(policies.routing, req.feature_tag, req.model, cheapModel);

    const retry = policies.retry;
    const maxAttempts = Math.max(1, retry?.max_attempts ?? 1);
    const backoff = retry?.backoff_ms ?? [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const res = await fn({
          ...req,
          model: routed.model,
          max_output_tokens,
          trace_id,
          request_id,
          idempotency_key
        });

        const latency_ms = Date.now() - t0;

        const prompt_tokens = Number(req.prompt_tokens ?? 0);
        const completion_tokens = Number(req.completion_tokens ?? 0);
        const total_tokens = Number(req.total_tokens ?? (prompt_tokens + completion_tokens));
        const cost_usd = Number(req.cost_usd ?? 0);

        appendUsageLine(usagePath, {
          ts: new Date().toISOString(),
          request_id,
          trace_id,
          attempt,
          status: 'ok',
          error_code: null,
          provider: req.provider,
          model: routed.model,
          endpoint: req.endpoint,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_usd,
          latency_ms,
          meta: {
            ...(req.meta || {}),
            feature_tag: req.feature_tag || null,
            routed_from: routed.routed_from,
            policy_hits: routed.policy_hits,
            max_output_tokens,
            idempotency_key
          }
        });

        return res;
      } catch (e) {
        const latency_ms = Date.now() - t0;
        const ce = classifyError(e);

        appendUsageLine(usagePath, {
          ts: new Date().toISOString(),
          request_id,
          trace_id,
          attempt,
          status: ce.status,
          error_code: ce.code,
          provider: req.provider,
          model: routed.model,
          endpoint: req.endpoint,
          prompt_tokens: Number(req.prompt_tokens ?? 0),
          completion_tokens: Number(req.completion_tokens ?? 0),
          total_tokens: Number(req.total_tokens ?? 0),
          cost_usd: Number(req.cost_usd ?? 0),
          latency_ms,
          meta: {
            ...(req.meta || {}),
            feature_tag: req.feature_tag || null,
            routed_from: routed.routed_from,
            policy_hits: routed.policy_hits,
            max_output_tokens,
            idempotency_key,
            error_message: String((e as any)?.message || e)
          }
        });

        const shouldRetry = attempt < maxAttempts && (retry?.retry_on_status || []).includes(ce.status);
        if (!shouldRetry) throw e;

        const waitMs = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 250;
        await sleep(waitMs);
        continue;
      }
    }

    // unreachable
    throw new Error('AIOpt wrapper: exhausted retries');
  };
}
`;
  const w = writeFile(wrapperPath, wrapper, force);
  created.push({ path: 'aiopt/aiopt-wrapper.ts', status: w.wrote ? 'created' : 'skipped' });

  // 5) usage.jsonl
  const usagePath = path.join(outDir, 'usage.jsonl');
  if (force || !fs.existsSync(usagePath)) {
    const header = {
      ts: new Date().toISOString(),
      request_id: 'sample',
      trace_id: 'sample',
      attempt: 1,
      status: 'ok',
      error_code: null,
      provider: 'openai',
      model: 'gpt-5-mini',
      endpoint: 'demo',
      prompt_tokens: 12,
      completion_tokens: 3,
      total_tokens: 15,
      cost_usd: 0.0,
      latency_ms: 1,
      meta: { routed_from: null, policy_hits: ['install-sample'] }
    };
    fs.writeFileSync(usagePath, JSON.stringify(header) + '\n');
    created.push({ path: 'aiopt-output/usage.jsonl', status: 'created' });
  } else {
    created.push({ path: 'aiopt-output/usage.jsonl', status: 'skipped' });
  }

  return { created };
}
