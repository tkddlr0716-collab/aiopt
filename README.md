# AIOpt — pre-deploy LLM cost accident guardrail (local-only)

[![npm](https://img.shields.io/npm/v/aiopt)](https://www.npmjs.com/package/aiopt)
[![ci](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml/badge.svg)](https://github.com/tkddlr0716-collab/aiopt/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aiopt)](./LICENSE)

Links:
- Project page: https://tkddlr0716-collab.github.io/aiopt/
- Docs: ./docs/

AIOpt is a **pre-deploy cost accident guardrail** for LLM changes.
- baseline = your observed local usage log (`usage.jsonl` / `usage.csv`)
- candidate = estimated change (model/provider/context/output/retry/traffic deltas)
- output = deterministic verdict + monthly impact estimate + confidence

No server. No upload. No account. No payments inside the CLI.

## Why AIOpt exists
LLM cost accidents don’t show up as obvious bugs. They show up as **quiet drift** — then a surprise bill.
AIOpt makes cost visible **before merge** and gives you one place to sanity‑check usage.

What you get:
- A single **local dashboard** that is never empty (auto‑collects + auto‑reports).
- A CI‑friendly **gate** that can block risky changes.
- A safe **fix** path (patch suggestions) when you do find waste.

When teams keep it: it’s fast enough to run every day, and it reduces the “are we about to ship a cost spike?” anxiety to one screen.

## Fastest path (no docs)
### 1) Open the dashboard (recommended)
```bash
npx --yes aiopt@latest dashboard --port 3010
# open http://127.0.0.1:3010/
```
This is **consistent**: it always uses a single global data folder (`~/.aiopt`).

What happens automatically:
- If `usage.jsonl` is missing, AIOpt **auto-collects** OpenClaw session usage (local-only).
- If reports are missing, AIOpt **auto-runs** scan+guard once so the dashboard is never empty.

Optional (project-local):
```bash
npx --yes aiopt@latest dashboard --auto --port 3010
```

### 2) CI / PR gate (merge blocking)
```bash
npx --yes aiopt@latest gate
```
- exit `0`: OK
- exit `1`: policy violations found (top3 file:line)

## AI-friendly (for coding agents)
If you are an AI agent helping a developer:
- Prefer running **dashboard first** to show a single truth surface.
- Then use:
  - `aiopt scan` to generate `report.json` / `report.md`
  - `aiopt gate` to produce a merge decision (exit 0/1)
  - `aiopt fix --apply` to propose safe patches (retry cap + cheap default model routing)

Machine-readable outputs:
- `aiopt-output/report.json` (stable summary)
- `aiopt-output/aiopt.sarif` (PR annotations)
- `aiopt-output/aiopt.patch` (autofix suggestions)


## 3-line quickstart (Guardrail)
```bash
npx aiopt install --force
# baseline: your existing usage log
npx aiopt guard --context-mult 1.2 --call-mult 3 --budget-monthly 200
```

## 1-minute demo
```bash
npx aiopt quickstart --demo
npx aiopt dashboard --port 3010
# open http://127.0.0.1:3010/
```

Exit codes:
- `0` OK
- `2` WARN (cost accident possible)
- `3` FAIL (merge-blocking)

Common knobs (transform mode):
- `--context-mult <n>` (prompt/context grows)
- `--output-mult <n>` (output grows)
- `--retries-delta <n>` (more retries/attempts)
- `--call-mult <n>` (traffic spike / call volume)

Budget gate:
- `--budget-monthly <usd>` (FAIL if candidate monthly cost exceeds your budget)

Diff mode (real before/after logs):
```bash
npx aiopt guard --baseline ./usage-baseline.jsonl --candidate ./usage-candidate.jsonl
```

Output includes a short **Top causes** summary (1–3) to explain the biggest drivers.
In diff mode, it also prints **token deltas** and **top cost deltas** by model + feature.

## CI integration (GitHub Actions)
You can run `aiopt guard` in CI to catch accidental cost blow-ups before merge.

### Diff mode (recommended)
Compare two real log sets (no guesswork):
```bash
npx aiopt guard --baseline ./baseline.jsonl --candidate ./candidate.jsonl
```
Diff mode also prints:
- token deltas (input/output)
- top deltas by model and by feature

### 1) Non-blocking (report only)
```yaml
- name: AI cost guard (non-blocking)
  run: |
    npx aiopt guard --input ./aiopt-output/usage.jsonl --context-mult 1.2 || true
```

### 2) Merge-blocking (fail on high risk)
```yaml
- name: AI cost guard (blocking)
  run: |
    npx aiopt guard --input ./aiopt-output/usage.jsonl --context-mult 1.2
```

Tip: print guard output into the GitHub Actions **Step Summary** so you don’t need to scroll logs.

## Optional: local dashboard
```bash
npx aiopt dashboard --port 3010
```
- Binds to **127.0.0.1** (local-only)
- Shows: guard verdict + guard history + 7-day cost trend (sparkline)

## Optional: deeper local analysis (`scan`)
`scan` generates a more detailed local report + patch stubs (still local-only).

After `scan`, you will have:
1) `./aiopt-output/analysis.json`
2) `./aiopt-output/report.md`
3) `./aiopt-output/report.json`
4) `./aiopt-output/patches/*`
5) `./aiopt-output/cost-policy.json`

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
- The local dashboard binds to **127.0.0.1** only.
- Local providers are assumed **$0** by default (infra cost not included).

## License (offline)
If you have a signed license key:
```bash
npx aiopt license activate <LICENSE_KEY>
npx aiopt license status
npx aiopt license verify
```

## Docs
- Install-first guide: `aiopt/README.md`
- Platform support / caveats: `docs/PLATFORM_SUPPORT.md`
- Pricing/flow (internal): `docs/PRODUCT_PRICING_AND_FLOW.md`
- Payment/license ops: `docs/PAYMENT.md`

## Contact
- Instagram: **@sangikpp**
