# AIOpt v0.3.0 — State Diagnosis (Step 1) + Upgrade UX Contract (Step 2 draft)

> Scope of this doc
> - **Step 1 (required):** summarize current CLI/outputs/exit codes + determine input mode + CI/PR capabilities + 5 gaps.
> - **Step 2 (draft contract):** define the *new* UX/outputs we will add (without breaking existing commands/options).
>
---

## 1) Current surface area (commands / options / artifacts / exit codes)

| Command | Purpose (today) | Key options (today) | Main outputs (today) | Exit codes (today) |
|---|---|---|---|---|
| `aiopt init` | Create sample folders + sample input | *(none)* | `./aiopt-input/usage.jsonl` (sample), `./aiopt-output/` | `0` |
| `aiopt install` | Install guardrails scaffolding (local files) | `--force`, `--seed-sample` | `./aiopt/*` (policies), `./aiopt-output/usage.jsonl` (optional seed) | `0` |
| `aiopt doctor` | Verify install + print last 5 usage events | *(none)* | stdout only | `0` (always; prints OK/WARN) |
| `aiopt scan` | Analyze usage logs, generate report + policy + patch stubs | `--input <path>` (default `./aiopt-output/usage.jsonl`), `--out <dir>` (default `./aiopt-output`) | `aiopt-output/report.md`, `report.json`, `report.txt`, `analysis.json`, `cost-policy.json`, `patches/*` | `0` normally; `1` if input missing |
| `aiopt policy` | Regenerate `cost-policy.json` | `--input`, `--out` | `aiopt-output/cost-policy.json` | `0` |
| `aiopt guard` | Pre-deploy cost guardrail (transform or diff mode) | Transform: `--provider/--model/--context-mult/--output-mult/--retries-delta/--call-mult` + `--budget-monthly`<br>Diff: `--baseline <path> --candidate <path>` | stdout verdict; persists `aiopt-output/guard-last.{txt,json}` + `guard-history.jsonl` | `0` OK, `2` WARN, `3` FAIL |
| `aiopt dashboard` | Local-only dashboard (binds 127.0.0.1) | `--port`, `--dir`, `--auto` | serves UI; reads files from `aiopt-output/` | `0` unless startup fails |
| `aiopt quickstart --demo` | Demo: generate sample usage + run scan+guard (+ optional serve) | `--demo` (required), `--serve`, `--open`, `--port`, `--budget-monthly` | demo writes to `aiopt-output/*` and prints URL | exits with guard exit code |
| `aiopt license activate/verify/status` | Offline signed license handling | `--out`, `--path` | `./aiopt/license.json` | `0/2/3` (varies per subcmd) |

Notes:
- CI exists in `.github/workflows/ci.yml` and runs build + smoke + guard; it can post a **single PR comment** with `actions/github-script`, but not line-level annotations.

---

## 2) Current input mode: file-based vs code-scan

**AIOpt today is: (A) input-file based.**

- `scan` and `guard` operate on **usage logs** (`usage.jsonl` or `usage.csv`).
- There is **no repository code scanning** (AST/grep) and **no file:line mapping** in the analysis output.
- Some events can carry `meta.feature_tag`, but **location (file/line)** is not part of the event schema today.

So current classification:
- (A) Input file 기반: **YES**
- (B) 코드 스캔 기반: **NO**
- (C) 둘 다: **NO**

---

## 3) Current CI integration / PR comments / patch generation

### CI (today)
- ✅ build matrix (OS×Node)
- ✅ smoke: `install → doctor → generate fake usage.jsonl → scan`
- ✅ `guard` executed in multiple modes
- ✅ Step Summary printing exists
- ❌ **No artifact upload** for generated files

### PR comments (today)
- ✅ PR comment exists (if PR event and guard exit != 0)
- ❌ Not line-level annotations (no file:line)
- ❌ Not suggestion blocks / multi-line patch suggestions

### Patch generation (today)
- ✅ `scan` generates patch stubs under `aiopt-output/patches/*` (JSON policy updates etc.)
- ❌ No single unified `aiopt.patch`
- ❌ No `fix` command
- ❌ No `--apply` workflow (`git apply`) shipped

---

## 4) “빈 구멍” 5개 (must close)

1) **PR 라인 주석(Annotate) 불가**
   - Root cause: no file/line in findings + no SARIF/reviewdog output path.

2) **항상 생성되는 후속조치 산출물(Artifacts) 계약이 없음**
   - Today outputs differ from target: (required) `aiopt-report.md`, `cost-policy.json`, `aiopt.patch` (+ optional sarif).
   - CI artifact upload missing.

3) **Merge gate 전용 커맨드가 없음**
   - Today: `guard` returns `0/2/3` and prints >10 lines. Requested: `aiopt gate` exit `1` on violations, stdout ≤10 lines.

4) **자동 수정 제안/패치 생성 UX가 없음**
   - Today: patch stubs exist, but no `aiopt fix` / `fix --apply`, and no guarantee of “minimum 2 patch types”.

5) **산업 표준형 이벤트 스키마(관측/추적) 정리가 부족**
   - Today schema is ad-hoc for cost calc. Needs explicit fields for provider/model/tokens/latency/retries/status/tags + **location(file/line)**.

---

## 5) Upgrade UX Contract (Step 2 draft; compatibility-first)

### Compatibility rule
- **Do not break** existing commands/options/outputs.
- We only **add** new commands/outputs, and optionally add *new* files alongside existing ones.

### New commands to add (requested)

#### `npx aiopt gate`
- Purpose: CI merge-blocking gate.
- If policy violations exist → **exit code 1**.
- stdout **≤ 10 lines**:
  - violations count
  - Top3 `file:line`
  - “see artifacts: report/patch/sarif” hint

> Note: keep existing `guard` unchanged (0/2/3). `gate` becomes the strict binary gate.

#### `npx aiopt fix`
- Default: generate `aiopt.patch` (unified diff) in output dir.
- Option: `--apply` applies patch via `git apply` (or prints safe instructions when apply fails).
- Must provide at least 2 patch types:
  1) retry limitation (explosion prevention)
  2) model routing (cheap default + override)

### Always-generated artifacts from `scan` (requested)
- `aiopt-report.md` (1-screen summary)
- `cost-policy.json` (if absent, auto-create)
- `aiopt.patch` (best-effort)
- optional: `aiopt.sarif`

> Note: we will keep existing `aiopt-output/report.md` + `report.json` etc., but also emit the new names.

### PR annotations (requested)
Choose one implementation path:
1) **SARIF output** + (optional) reviewdog SARIF support to annotate PR, or
2) reviewdog action-suggester w/ multi-line suggestions.

Annotation text: exactly
- `file:line` + problem 1 line + fix direction 1 line

---

## 6) Definition of Done for Step 1 (this commit)
- This doc exists and reflects current repo reality.
- Next commits will implement: SARIF, workflow + artifacts, gate, fix, PR annotation.
