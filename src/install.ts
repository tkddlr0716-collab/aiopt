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

  // 4) wrapper template (placeholder for T2)
  const wrapperPath = path.join(aioptDir, 'aiopt-wrapper.ts');
  const wrapper = `// AIOpt Wrapper (skeleton)
// NOTE: This is a template file. T2 will implement real routing/retry/caps/logging.

export type AioptWrapperOptions = {
  usagePath?: string;
};

export function aioptWrap<T extends (...args: any[]) => Promise<any>>(fn: T, _opts?: AioptWrapperOptions): T {
  return (async (...args: any[]) => {
    return fn(...args);
  }) as T;
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
