# AIOpt — pre-deploy LLM cost accident guardrail (local-only)

[![npm](https://img.shields.io/npm/v/aiopt)](https://www.npmjs.com/package/aiopt)
[![ci](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml/badge.svg)](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aiopt)](./LICENSE)

Links:
- Project page: https://tkddlr0716-collab.github.io/aiopt/
- Docs: ./docs/

AIOpt is a **pre-deploy cost accident guardrail** for LLM changes.
- baseline = your observed local usage log (`usage.jsonl` / `usage.csv`)
- candidate = estimated change (model/provider/context/output/retry/traffic deltas) or a second real log set (diff mode)
- output = deterministic verdict + monthly impact estimate + confidence

Common use cases:
- “We changed prompts / model routing — are we about to ship a cost spike?”
- “This PR increases tokens — show me the *why* and block if it breaks policy.”
- “Give me a SARIF report so GitHub shows annotations in Code Scanning.”

No server. No upload. No account. No payments inside the CLI.

## Why AIOpt exists
LLM cost accidents don’t show up as obvious bugs. They show up as **quiet drift** — then a surprise bill.
AIOpt makes cost visible **before merge** and gives you one place to sanity‑check usage.

What you get:
- A CI‑friendly **gate** that can block risky changes.
- A deterministic local **scan** report (MD/JSON/SARIF).
- A safe **fix** path (patch suggestions) when you do find waste.

## Fastest path (no docs)
### 1) Generate a local report
```bash
npx --yes aiopt@latest scan
```
Artifacts (default `./aiopt-output/`):
- `report.md` / `report.json`
- `aiopt.sarif` (PR annotations)
- `patches/*` (suggestions)

### 2) Guard / budget check (exit 0/2/3)
```bash
# transform mode (estimate candidate from baseline)
npx --yes aiopt@latest guard --context-mult 1.2 --call-mult 3 --budget-monthly 200

# diff mode (compare two real log sets)
npx --yes aiopt@latest guard --baseline ./baseline.jsonl --candidate ./candidate.jsonl
```

### 3) CI / PR gate (merge blocking)
```bash
npx --yes aiopt@latest gate
```
- exit `0`: OK
- exit `1`: policy violations found (top3 file:line)

## AI-friendly (for coding agents)
Use:
- `aiopt scan` to generate `report.json` / `report.md`
- `aiopt gate` to produce a merge decision (exit 0/1)
- `aiopt fix --apply` to propose safe patches (retry cap + cheap default model routing)

Machine-readable outputs:
- `aiopt-output/report.json` (stable summary)
- `aiopt-output/aiopt.sarif` (PR annotations)
- `aiopt-output/aiopt.patch` (autofix suggestions)

## Exit codes (`guard`)
- `0` OK
- `2` WARN (cost accident possible)
- `3` FAIL (merge-blocking)

## Input (default)
- Default path: `./aiopt-output/usage.jsonl`
- Change: `npx aiopt guard --input <path>`
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

## Rate table
- `./rates/rate_table.json`
- Unknown models/providers may be marked as `Estimated`.
- `provider=local` (or `ollama`/`vllm`) is treated as **$0** by default (CPU/GPU cost not included).

## Known caveats
- If your baseline log covers a very short `ts` span, confidence may be degraded (data quality).
- Local providers are assumed **$0** by default (infra cost not included).

## Docs
- Install-first guide: `aiopt/README.md`
- Platform support / caveats: `docs/PLATFORM_SUPPORT.md`
- Pricing/flow (internal): `docs/PRODUCT_PRICING_AND_FLOW.md`

## Contact
- Instagram: **@sangikpp**
