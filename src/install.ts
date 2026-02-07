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

## Wrapper usage (Node.js)

AIOpt 설치 후, 앱 코드에서 wrapper를 불러서 사용량 JSONL을 자동 기록할 수 있습니다.


a) 최소 형태(토큰을 직접 넘김)

\`\`\`js
const { guardedCall } = require('./aiopt/aiopt-wrapper.js');

await guardedCall(process.cwd(), {
  provider: 'openai',
  model: 'gpt-5-mini',
  endpoint: 'responses.create',
  feature_tag: 'summarize',
  prompt_tokens: 1200,
  trace_id: 'my-trace'
}, async (req) => {
  // req: { provider, model, endpoint, max_output_tokens, prompt_tokens, idempotency_key }
  // 여기서 실제 SDK 호출 후 결과를 반환
  return { status: 'ok', completion_tokens: 200 };
});
\`\`\`

b) OpenAI-style 응답(usage 자동 추출)

\`\`\`js
return {
  status: 'ok',
  response: {
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400 }
  }
};
\`\`\`
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

  // 4) wrapper template (T2: real guardrails wrapper)
  const wrapperPath = path.join(aioptDir, 'aiopt-wrapper.js');
  const wrapper = 
`// AIOpt Wrapper (guardrails) — local-only (CommonJS)

const fs = require('fs');

const path = require('path');

const crypto = require('crypto');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function appendJsonl(filePath,obj){ ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, JSON.stringify(obj)+'\\n'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function loadConfig(cwd){ return readJson(path.join(cwd,'aiopt','aiopt.config.json')); }
function loadPolicies(cwd,cfg){ const dir=path.isAbsolute(cfg.policies_dir)?cfg.policies_dir:path.join(cwd,cfg.policies_dir);
  return {
    retry: readJson(path.join(dir,'retry.json')) ,
    output: readJson(path.join(dir,'output.json'))
  };
}
function loadRates(cwd,cfg){
  const rp=path.isAbsolute(cfg.rate_table.path)?cfg.rate_table.path:path.join(cwd,cfg.rate_table.path);
  try{ return readJson(rp); }catch(e){
    // Fresh projects may not have a rates/ table yet. Fall back to a safe default.
    return { providers: {} };
  }
}

function costUsd(rt, provider, model, promptTokens, completionTokens){
  const p=rt.providers && rt.providers[provider];
  const r=(p && p.models && p.models[model]) || (p && p.default_estimated) || {input:1.0, output:4.0};
  return (promptTokens/1e6)*r.input + (completionTokens/1e6)*r.output;
}

function pickRoutedModel(rt, provider, featureTag, currentModel){
  const cheap=['summarize','classify','translate'];
  if(!cheap.includes(String(featureTag||'').toLowerCase())) return { model: currentModel, routed_from: null, hit: null };
  const p=rt.providers && rt.providers[provider];
  const entries=p && p.models ? Object.entries(p.models) : [];
  if(!entries.length) return { model: currentModel, routed_from: null, hit: null };
  const cheapest=entries.map(([name,r])=>({name,score:(r.input+r.output)/2})).sort((a,b)=>a.score-b.score)[0];
  if(!cheapest || cheapest.name===currentModel) return { model: currentModel, routed_from: null, hit: null };
  return { model: cheapest.name, routed_from: currentModel, hit: 'routing:cheap-feature' };
}

function outputCap(outputPolicy, featureTag, requested){
  const per=(outputPolicy && outputPolicy.per_feature) || {};
  const cap=per[String(featureTag||'').toLowerCase()] ?? (outputPolicy.max_output_tokens_default || 1024);
  const req=requested ?? cap;
  return Math.min(req, cap);
}

const IDEMPOTENCY=new Map();

function normalizeResult(out, input){
  // Accept either normalized return or provider raw.
  const o = (out && out.response) ? out.response : out;
  const status = (out && out.status) || o.status || (o.error ? 'error' : 'ok');
  const usage = o.usage || (o.data && o.data.usage) || null;

  const prompt_tokens = Number(
    (out && out.prompt_tokens) ??
    (o && o.prompt_tokens) ??
    (usage && usage.prompt_tokens) ??
    input.prompt_tokens ??
    0
  );
  const completion_tokens = Number(
    (out && out.completion_tokens) ??
    (o && o.completion_tokens) ??
    (usage && usage.completion_tokens) ??
    0
  );
  const total_tokens = Number(
    (out && out.total_tokens) ??
    (o && o.total_tokens) ??
    (usage && usage.total_tokens) ??
    (prompt_tokens + completion_tokens)
  );

  const error_code = status === 'ok' ? null : String((out && out.error_code) || (o && o.error_code) || (o && o.error && (o.error.code || o.error.type)) || status);
  const cost_usd = (out && typeof out.cost_usd === 'number') ? out.cost_usd : null;

  return { status, prompt_tokens, completion_tokens, total_tokens, error_code, cost_usd };
}

/**
 * guardedCall(cwd, input, fn)
 *
 * fn(req) can return either:
 *  1) Normalized shape:
 *     { status: 'ok'|'error'|'timeout', prompt_tokens?, completion_tokens?, total_tokens?, cost_usd?, error_code? }
 *  2) Provider raw response (OpenAI-style), e.g.:
 *     { status:'ok', response:{ usage:{prompt_tokens, completion_tokens, total_tokens} } }
 *     { usage:{prompt_tokens, completion_tokens, total_tokens} }
 *
 * If token fields are missing, AIOpt will fall back to input.prompt_tokens and/or 0.
 */
async function guardedCall(cwd, input, fn){
  const cfg=loadConfig(cwd);
  const pol=loadPolicies(cwd,cfg);
  const rt=loadRates(cwd,cfg);

  const request_id=crypto.randomUUID();
  const trace_id=input.trace_id || request_id;
  const idem=input.idempotency_key || trace_id;
  if(IDEMPOTENCY.has(idem)) return IDEMPOTENCY.get(idem);

  const routed=pickRoutedModel(rt, input.provider, input.feature_tag, input.model);
  const maxOut=outputCap(pol.output, input.feature_tag, input.max_output_tokens);
  const usagePath=path.isAbsolute(cfg.usage_path)?cfg.usage_path:path.join(cwd,cfg.usage_path);

  const maxAttempts=Math.max(1, Number(pol.retry.max_attempts||1));
  const backoffs=pol.retry.backoff_ms || [200];
  const retryOn=new Set(pol.retry.retry_on_status || ['error','timeout']);

  let last={status:'error', completion_tokens:0, error_code:'unknown'};

  for(let attempt=1; attempt<=maxAttempts; attempt++){
    const t0=Date.now();
    const policy_hits=[];
    if(routed.hit) policy_hits.push(routed.hit);
    policy_hits.push('outputcap:'+maxOut);
    try{
      const out=await fn({ provider: input.provider, model: routed.model, endpoint: input.endpoint, max_output_tokens: maxOut, prompt_tokens: input.prompt_tokens, idempotency_key: idem });
      const latency_ms=Date.now()-t0;
      const norm=normalizeResult(out, input);
      const cost_usd=(typeof norm.cost_usd==='number') ? norm.cost_usd : costUsd(rt, input.provider, routed.model, norm.prompt_tokens, norm.completion_tokens);
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: norm.status, error_code: norm.error_code, provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens: norm.prompt_tokens, completion_tokens: norm.completion_tokens, total_tokens: norm.total_tokens, cost_usd, latency_ms, meta:{ routed_from: routed.routed_from, policy_hits } });
      last={ status: norm.status, completion_tokens: norm.completion_tokens, error_code: norm.error_code };
      if(norm.status==='ok'){ IDEMPOTENCY.set(idem,out); return out; }
      if(retryOn.has(norm.status) && attempt<maxAttempts){ await sleep(Number(backoffs[Math.min(attempt-1, backoffs.length-1)]||200)); continue; }
      IDEMPOTENCY.set(idem,out); return out;
    }catch(e){
      const latency_ms=Date.now()-t0;
      const out={ status:'error', completion_tokens:0, error_code:String(e && (e.code||e.name) || 'exception') };
      appendJsonl(usagePath, { ts:new Date().toISOString(), request_id, trace_id, attempt, status: out.status, error_code: out.error_code, provider: input.provider, model: routed.model, endpoint: input.endpoint, prompt_tokens:Number(input.prompt_tokens||0), completion_tokens:0, total_tokens:Number(input.prompt_tokens||0), cost_usd:costUsd(rt, input.provider, routed.model, Number(input.prompt_tokens||0), 0), latency_ms, meta:{ routed_from: routed.routed_from, policy_hits:[routed.hit||'routing:none','outputcap:'+maxOut,'error:exception'] } });
      last=out;
      if(attempt<maxAttempts){ await sleep(Number(backoffs[Math.min(attempt-1, backoffs.length-1)]||200)); continue; }
      IDEMPOTENCY.set(idem,out); return out;
    }
  }
  IDEMPOTENCY.set(idem,last);
  return last;
}

module.exports = { guardedCall };
`;
;
  const w = writeFile(wrapperPath, wrapper, force);
  created.push({ path: 'aiopt/aiopt-wrapper.js', status: w.wrote ? 'created' : 'skipped' });

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
