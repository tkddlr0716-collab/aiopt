# PR annotation verification (Commit 6)

Goal: prove that AIOpt can produce PR line annotations using SARIF.

## What we implemented (prior commits)
- `aiopt scan` always generates: `aiopt-output/aiopt.sarif`
- GitHub Actions workflow: `.github/workflows/aiopt.yml`
  - runs `scan`
  - uploads artifacts
  - uploads SARIF via `github/codeql-action/upload-sarif@v3`

## Verification PR
- PR: https://github.com/tkddlr0716-collab/aiopt/pull/1
- Branch: `verify/pr-annotations`
- Trigger file (should create findings): `pr-annotation-demo.js`
  - contains `model: 'gpt-5.2'` and `maxRetries: 10`

## Workflow runs
- PR run: https://github.com/tkddlr0716-collab/aiopt/actions/runs/21828438963 (workflow: `aiopt.yml`, event: pull_request)
- Push run: https://github.com/tkddlr0716-collab/aiopt/actions/runs/21828435288 (workflow: `aiopt.yml`, event: push)

## Expected evidence when runner executes
1) **Artifacts** uploaded:
   - `aiopt-output/report.md`
   - `aiopt-output/report.json`
   - `aiopt-output/cost-policy.json`
   - `aiopt-output/aiopt.sarif`
   - `aiopt-output/patches/**`

2) **SARIF uploaded** → GitHub Code Scanning shows results pointing to:
   - `pr-annotation-demo.js:4` (expensive model)
   - `pr-annotation-demo.js:4` (high retries)

## Current status (updated)
- GitHub Actions runner queue eventually cleared and the PR workflow executed.
- The workflow log shows SARIF upload succeeded:
  - "Successfully uploaded results"
  - "Analysis upload status is complete"

Log source: `gh run view 21828438963 --log`.

## Local proof (deterministic)
You can reproduce SARIF generation locally:

```bash
npm ci
npm run build
node dist/cli.js scan
ls -la aiopt-output/aiopt.sarif
```

This produces SARIF with file URIs + startLine regions, ready for reviewdog/code-scanning ingestion.
