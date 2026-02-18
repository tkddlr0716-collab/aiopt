# AIOpt Launch Kit (free channels, no screenshots)

This file is a copy/paste kit for sharing AIOpt without images.

## 1) One‑liner
AIOpt is a local CLI + CI guardrail that catches LLM cost/token “accidents” before merge/deploy.

## 2) 30‑second pitch
LLM cost regressions don’t look like bugs — they look like quiet token drift and then a surprise bill.
AIOpt turns your observed usage into a baseline, models candidate changes, and produces deterministic artifacts (report + policy + SARIF) so you can gate risky PRs.

- Local‑only by default (no server, no upload)
- Works in CI (gate) and GitHub Code Scanning (SARIF)
- Fast local reports (`scan`) + merge guardrails (`guard`/`gate`)

Repo: https://github.com/tkddlr0716-collab/aiopt
npm: https://www.npmjs.com/package/aiopt

## 3) Quickstart snippet
```bash
npx --yes aiopt@latest scan
# outputs: ./aiopt-output/report.md ./aiopt-output/report.json ./aiopt-output/aiopt.sarif
```

## 4) “Show HN” draft
Title:
Show HN: AIOpt — pre-deploy guardrail for LLM cost accidents (local-only CLI + CI gate)

Body:
Hi HN — I built AIOpt after repeatedly seeing LLM cost regressions slip through review because nothing *crashes*.

AIOpt:
- takes your observed usage as baseline (usage.jsonl/csv)
- models candidate deltas (model/context/output/retry/traffic)
- emits deterministic artifacts + SARIF for GitHub code scanning
- can gate PRs (exit 1 on policy violations)

It’s local-only by default (no server/no upload). Feedback welcome.

Repo: https://github.com/tkddlr0716-collab/aiopt
npm: https://www.npmjs.com/package/aiopt

## 5) Reddit (r/devops / r/programming) draft
Title:
Local guardrail for LLM token/cost regressions (CLI + GitHub Actions gate)

Post:
LLM cost regressions are hard to catch in code review because they rarely break tests.
I made AIOpt: a local CLI that turns observed usage into a baseline, estimates candidate changes, and can gate PRs.
It also emits SARIF so results show up as annotations in GitHub Code Scanning.

Quickstart:
`npx --yes aiopt@latest scan`

Repo: https://github.com/tkddlr0716-collab/aiopt

## 6) Indie Hackers short post
I shipped AIOpt: a local CLI + CI gate that catches LLM cost accidents before deploy.
Local-only by default (no server/no upload). Outputs deterministic artifacts + SARIF for GitHub.

Repo: https://github.com/tkddlr0716-collab/aiopt
npm: https://www.npmjs.com/package/aiopt

## 7) GitHub Release notes draft
AIOpt v0.3.x
- SARIF output for GitHub Code Scanning
- CI gate command for merge blocking
- Fix command that generates patches

## 8) Answer templates
Q: “Does this send data anywhere?”
A: No. AIOpt is local-only by default. It reads local usage logs and produces local artifacts.

Q: “Does it work outside OpenClaw?”
A: Yes. You can provide usage.jsonl/csv from any source; OpenClaw auto-collect is optional.
