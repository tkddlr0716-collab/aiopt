# npx aiopt scan → your LLM cost & savings in 5 seconds

[![npm](https://img.shields.io/npm/v/aiopt)](https://www.npmjs.com/package/aiopt)
[![ci](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml/badge.svg)](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aiopt)](./LICENSE)

```bash
npx aiopt init
npx aiopt scan
cat ./aiopt-output/report.txt
```

This is a **serverless local CLI MVP**.
- No signup, no upload, no dashboard, no server deployment.
- Reads local JSONL/CSV → writes local outputs.
- **No LLM calls** (math + deterministic rules only).

## What you get
After `scan`, you will have:
1) `./aiopt-output/analysis.json` (top cost by feature/model)
2) `./aiopt-output/report.txt` (total cost + estimated savings)
3) `./aiopt-output/cost-policy.json` (policy file)

### Sample `report.txt`
```
총비용: $0.23
절감 가능 금액(Estimated): $0.21
절감 근거 3줄:
a) 모델 라우팅 절감(추정): $0.07
b) 컨텍스트 감축(추정): $0.02 (상위 20% input에 25% 감축 가정)
c) 재시도/오류 낭비: $0.13 (retries 기반)
```

## Input (default)
- Default path: `./aiopt-input/usage.jsonl`
- Change: `npx aiopt scan --input <path>`
- Supported: JSONL (1 event per line), CSV

### Required fields (fixed)
`ts, provider, model, input_tokens, output_tokens, feature_tag, retries, status`

`billed_cost` is optional.

### JSONL example (5 lines)
```jsonl
{"ts":"2026-02-07T00:00:01Z","provider":"openai","model":"gpt-5-mini","input_tokens":12000,"output_tokens":1800,"feature_tag":"summarize","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:02Z","provider":"openai","model":"gpt-5.2","input_tokens":35000,"output_tokens":3000,"feature_tag":"coding","retries":1,"status":"ok"}
{"ts":"2026-02-07T00:00:03Z","provider":"anthropic","model":"claude-sonnet","input_tokens":22000,"output_tokens":2500,"feature_tag":"classify","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:04Z","provider":"gemini","model":"gemini-1.5-flash","input_tokens":9000,"output_tokens":1200,"feature_tag":"translate","retries":0,"status":"ok"}
{"ts":"2026-02-07T00:00:05Z","provider":"openai","model":"unknown-model-x","input_tokens":8000,"output_tokens":1000,"feature_tag":"summarize","retries":2,"status":"error"}
```

## Outputs (fixed)
- `analysis.json`
  - `total_cost`
  - `by_model_top` (top 10)
  - `by_feature_top` (top 10)
  - `unknown_models`
  - `rate_table_version`, `rate_table_date`
- `report.txt`
  - total cost
  - estimated savings
  - 3-line rationale
- `cost-policy.json`
  - `version, default_provider, rules, budgets, generated_from`

## Rate table
- `./rates/rate_table.json`
- Unknown models are marked as `Estimated` and listed in `unknown_models`.

## Contact
- Instagram: **@sangikpp**

## Local dev
```bash
cd aiopt
npm i
npm run build
node dist/cli.js init
node dist/cli.js scan --input ./aiopt-input/usage.jsonl
```
