# AIOpt — pre-deploy LLM cost accident guardrail (local-only)

[![npm](https://img.shields.io/npm/v/aiopt)](https://www.npmjs.com/package/aiopt)
[![ci](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml/badge.svg)](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aiopt)](./LICENSE)

**3-line quickstart (Guardrail mode)**
```bash
npx aiopt install --force
# baseline: your existing usage log
npx aiopt guard --context-mult 1.2
```

Exit codes:
- `0` OK
- `2` WARN (cost accident possible)
- `3` FAIL (merge-blocking)

AIOpt is a **serverless local Guardrail CLI**.
- No signup, no upload, no dashboard, no server deployment.
- Reads local JSONL/CSV → writes local outputs.
- **No LLM calls** (math + deterministic rules only).

Landing (demo): https://scoopingly-subcancellous-sunny.ngrok-free.dev/landing/
Docs: `aiopt/README.md` (install-first guide)
Pricing/flow: `docs/PRODUCT_PRICING_AND_FLOW.md`

## What you get
After `scan`, you will have:
1) `./aiopt-output/analysis.json` (top cost by feature/model)
2) `./aiopt-output/report.md` (WHAT TO CHANGE)
3) `./aiopt-output/report.json` (machine-readable summary)
4) `./aiopt-output/patches/*` (policy patch stubs)
5) `./aiopt-output/cost-policy.json` (policy file)

### Sample `report.txt`
```
총비용: $0.23
절감 가능 금액(Estimated): $0.21
절감 근거 3줄:
a) 모델 라우팅 절감(추정): $0.07
b) 컨텍스트 감축(추정): $0.02 (상위 20% input에 25% 감축 가정)
c) 재시도/오류 낭비(상한 적용): $0.13
```

### Sample console output
```
Top Fix 3:
1) Retry tuning ($0.01)
2) Output cap (no issue detected)
3) Routing rule (no issue detected)
Report: aiopt-output/report.md
```

## Input (default)
- Default path: `./aiopt-output/usage.jsonl`
- Change: `npx aiopt scan --input <path>`
- Supported: JSONL (1 event per line), CSV

AIOpt supports both:
- aggregated logs: `input_tokens/output_tokens/feature_tag/retries`
- wrapper logs: `prompt_tokens/completion_tokens/endpoint/attempt/trace_id/cost_usd`

### Required fields (minimal)
For aggregated logs:
- `ts, provider, model, input_tokens, output_tokens, feature_tag, retries, status`

For wrapper logs:
- `ts, provider, model, prompt_tokens, completion_tokens, endpoint, attempt, trace_id, status`

Optional:
- `billed_cost` (aggregated) or `cost_usd` (wrapper)

### JSONL example (5 lines)
```jsonl
{"ts":"2026-02-07T00:00:01Z","provider":"openai","model":"gpt-5-mini","input_tokens":12000,"output_tokens":1800,"feature_tag":"summarize","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:02Z","provider":"openai","model":"gpt-5.2","input_tokens":35000,"output_tokens":3000,"feature_tag":"coding","retries":1,"status":"ok"}
{"ts":"2026-02-07T00:00:03Z","provider":"anthropic","model":"claude-sonnet","input_tokens":22000,"output_tokens":2500,"feature_tag":"classify","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:04Z","provider":"gemini","model":"gemini-1.5-flash","input_tokens":9000,"output_tokens":1200,"feature_tag":"translate","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:05Z","provider":"openai","model":"unknown-model-x","input_tokens":8000,"output_tokens":1000,"feature_tag":"summarize","retries":2,"status":"error"}
```

## Outputs
- `analysis.json`
  - `total_cost`
  - `by_model_top` (top 10)
  - `by_feature_top` (top 10)
  - `unknown_models`
  - `rate_table_version`, `rate_table_date`
- `report.md`
  - WHAT TO CHANGE (file paths + keys)
  - confidence + assumptions
- `report.json`
  - summary + warnings + assumptions
- `patches/*`
  - `policies.updated.*` stubs
- `cost-policy.json`
  - `version, default_provider, rules, budgets, generated_from`

## Rate table
- `./rates/rate_table.json`
- Unknown models/providers are marked as `Estimated` and listed in `unknown_models`.
- `provider=local` (or `ollama`/`vllm`) is treated as **$0** by default (CPU/GPU cost not included).

## Contact
- Instagram: **@sangikpp**

## Local dev
```bash
npm i
npm run build
node dist/cli.js install --force
node dist/cli.js doctor
node dist/cli.js scan
```
