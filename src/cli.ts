#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { ensureDir, isCsvPath, readCsv, readJsonl } from './io';
import { RateTable } from './types';
import { analyze, writeOutputs } from './scan';

const program = new Command();

const DEFAULT_INPUT = './aiopt-output/usage.jsonl';
const DEFAULT_OUTPUT_DIR = './aiopt-output';

function loadRateTable(): RateTable {
  const p = path.join(__dirname, '..', 'rates', 'rate_table.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

program
  .name('aiopt')
  .description('AI 비용 자동 절감 인프라 — 서버 없는 로컬 CLI MVP')
  // keep CLI version in sync with package.json
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  .version(require('../package.json').version);

program
  .command('init')
  .description('aiopt-input/ 및 샘플 usage.jsonl, aiopt-output/ 생성')
  .action(() => {
    ensureDir('./aiopt-input');
    ensureDir('./aiopt-output');

    const sampleSrc = path.join(__dirname, '..', 'samples', 'sample_usage.jsonl');
    const dst = path.join('./aiopt-input', 'usage.jsonl');

    if (!fs.existsSync(dst)) {
      fs.copyFileSync(sampleSrc, dst);
      console.log('Created ./aiopt-input/usage.jsonl (sample)');
    } else {
      console.log('Exists ./aiopt-input/usage.jsonl (skip)');
    }

    console.log('Ready: ./aiopt-output/');
  });

program
  .command('scan')
  .description('입력 로그(JSONL/CSV)를 분석하고 report.md/report.json + patches까지 생성')
  .option('--input <path>', 'input file path (default: ./aiopt-output/usage.jsonl)', DEFAULT_INPUT)
  .option('--out <dir>', 'output dir (default: ./aiopt-output)', DEFAULT_OUTPUT_DIR)
  .option('--json', 'print machine-readable JSON to stdout')
  .action(async (opts) => {
    const inputPath = String(opts.input);
    const outDir = String(opts.out);

    if (!fs.existsSync(inputPath)) {
      console.error(`Input not found: ${inputPath}`);
      process.exit(1);
    }

    const rt = loadRateTable();
    const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);

    const { analysis, savings, policy, meta } = analyze(rt, events);
    // For reproducibility: embed input path & rate table meta
    policy.generated_from.input = inputPath;

    // Pass cwd + cli version for optional SARIF generation (code scan)
    writeOutputs(outDir, analysis, savings, policy, { ...meta, cwd: process.cwd(), cliVersion: program.version() });

    // Console: Top Fix 3 (data-driven)
    const { buildTopFixes } = await import('./solutions');
    const fixes = buildTopFixes(analysis, savings).slice(0, 3);

    if (opts.json) {
      const payload = {
        ok: true,
        outDir,
        input: inputPath,
        report: {
          report_md: path.join(outDir, 'report.md'),
          report_json: path.join(outDir, 'report.json'),
          cost_policy_json: path.join(outDir, 'cost-policy.json'),
          sarif: path.join(outDir, 'aiopt.sarif')
        },
        summary: {
          total_cost_usd: analysis.total_cost,
          estimated_savings_usd: savings.estimated_savings_total,
          confidence: meta?.mode || null
        }
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log('Top Fix 3:');
    fixes.forEach((f, i) => {
      const tag = f.status === 'no-issue' ? '(no issue detected)' : `($${Math.round(f.impact_usd * 100) / 100})`;
      console.log(`${i + 1}) ${f.title} ${tag}`);
    });
    console.log(`Report: ${path.join(outDir, 'report.md')}`);
  });

program
  .command('policy')
  .description('마지막 scan 결과 기반으로 cost-policy.json만 재생성 (MVP: scan과 동일 로직)')
  .option('--input <path>', 'input file path (default: ./aiopt-input/usage.jsonl)', DEFAULT_INPUT)
  .option('--out <dir>', 'output dir (default: ./aiopt-output)', DEFAULT_OUTPUT_DIR)
  .action((opts) => {
    const inputPath = String(opts.input);
    const outDir = String(opts.out);
    const rt = loadRateTable();
    const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
    const { policy } = analyze(rt, events);
    policy.generated_from.input = inputPath;

    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, 'cost-policy.json'), JSON.stringify(policy, null, 2));
    console.log(`OK: ${outDir}/cost-policy.json`);
  });

// v0.2: install/doctor (no servers)
program
  .command('install')
  .description('Install AIOpt guardrails: create aiopt/ + policies + usage.jsonl')
  .option('--force', 'overwrite existing files')
  .option('--seed-sample', 'seed 1 sample line into aiopt-output/usage.jsonl')
  .action(async (opts) => {
    const { runInstall } = await import('./install');
    const result = runInstall(process.cwd(), { force: Boolean(opts.force), seedSample: Boolean(opts.seedSample) });
    for (const c of result.created) {
      console.log(`${c.status === 'created' ? 'CREATED' : 'SKIP'}: ${c.path}`);
    }
  });

program
  .command('doctor')
  .description('Check installation + print last 5 usage events')
  .action(async () => {
    const { runDoctor } = await import('./doctor');
    const r = runDoctor(process.cwd());
    console.log(r.ok ? 'OK: doctor' : 'WARN: doctor');
    for (const c of r.checks) {
      console.log(`${c.ok ? 'OK' : 'FAIL'}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    }
    console.log('--- last5 usage');
    for (const x of r.last5) {
      console.log(JSON.stringify(x));
    }
  });

// Offline license (no servers)
const licenseCmd = program
  .command('license')
  .description('Offline license activate/verify (public key only; no server calls)');

licenseCmd
  .command('activate')
  .argument('<KEY>', 'license key (<payloadB64Url>.<sigB64Url>)')
  .option('--out <path>', 'output license.json path (default: ./aiopt/license.json)')
  .action(async (key, opts) => {
    const { DEFAULT_PUBLIC_KEY_PEM, defaultLicensePath, verifyLicenseKey, writeLicenseFile } = await import('./license');
    const outPath = opts.out ? String(opts.out) : defaultLicensePath(process.cwd());
    const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM;
    const v = verifyLicenseKey(String(key), pub);
    if (!v.payload) {
      console.error(`FAIL: ${v.reason || 'invalid license'}`);
      process.exit(3);
    }
    writeLicenseFile(outPath, String(key), v.payload, v.ok);
    console.log(v.ok ? `OK: activated (${outPath})` : `WARN: saved but not verified (${v.reason}) (${outPath})`);
    process.exit(v.ok ? 0 : 2);
  });

licenseCmd
  .command('verify')
  .option('--path <path>', 'license.json path (default: ./aiopt/license.json)')
  .action(async (opts) => {
    const { DEFAULT_PUBLIC_KEY_PEM, defaultLicensePath, readLicenseFile, verifyLicenseKey } = await import('./license');
    const p = opts.path ? String(opts.path) : defaultLicensePath(process.cwd());
    const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM;
    if (!fs.existsSync(p)) {
      console.error(`FAIL: license file not found: ${p}`);
      process.exit(3);
    }
    const f = readLicenseFile(p);
    const v = verifyLicenseKey(f.key, pub);
    if (v.ok) {
      console.log('OK: license verified');
      process.exit(0);
    }
    console.error(`FAIL: license invalid (${v.reason || 'unknown'})`);
    process.exit(3);
  });

licenseCmd
  .command('status')
  .option('--path <path>', 'license.json path (default: ./aiopt/license.json)')
  .action(async (opts) => {
    const { DEFAULT_PUBLIC_KEY_PEM, defaultLicensePath, readLicenseFile, verifyLicenseKey } = await import('./license');
    const p = opts.path ? String(opts.path) : defaultLicensePath(process.cwd());
    const pub = process.env.AIOPT_LICENSE_PUBKEY || DEFAULT_PUBLIC_KEY_PEM;
    if (!fs.existsSync(p)) {
      console.log('NO_LICENSE');
      process.exit(2);
    }
    const f = readLicenseFile(p);
    const v = verifyLicenseKey(f.key, pub);
    if (v.ok) {
      console.log(`OK: ${f.payload.plan} exp=${f.payload.exp}`);
      process.exit(0);
    }
    console.log(`INVALID: ${v.reason || 'unknown'}`);
    process.exit(3);
  });

// vNext: guardrail mode (pre-deploy warning)
program
  .command('gate')
  .description('Merge gate (CI-friendly): fail (exit 1) when policy violations are detected; prints <=10 lines')
  .option('--input <path>', 'input usage jsonl/csv (default: ./aiopt-output/usage.jsonl)', DEFAULT_INPUT)
  .option('--out <dir>', 'output dir (default: ./aiopt-output)', DEFAULT_OUTPUT_DIR)
  .option('--json', 'print machine-readable JSON to stdout')
  .action(async (opts) => {
    const inputPath = String(opts.input);
    const outDir = String(opts.out);

    // Ensure scan artifacts exist (report + sarif). Keep deterministic, no network.
    if (!fs.existsSync(inputPath)) {
      console.error(`FAIL: input not found: ${inputPath}`);
      process.exit(1);
    }

    const rt = loadRateTable();
    const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);
    const { analysis, savings, policy, meta } = analyze(rt, events);
    policy.generated_from.input = inputPath;
    writeOutputs(outDir, analysis, savings, policy, { ...meta, cwd: process.cwd(), cliVersion: program.version() });

    const { runGate, formatGateStdout } = await import('./gate');
    const r = runGate(outDir, process.cwd());

    if (opts.json) {
      const payload = {
        ok: r.violations <= 0,
        exitCode: r.violations <= 0 ? 0 : 1,
        violations: r.violations,
        top3: r.top3,
        artifacts: {
          report_md: path.join(outDir, 'report.md'),
          sarif: path.join(outDir, 'aiopt.sarif'),
          patches_dir: path.join(outDir, 'patches')
        }
      };
      console.log(JSON.stringify(payload, null, 2));
      process.exit(payload.exitCode);
    }

    const out = formatGateStdout(r, outDir);
    console.log(out.text);
    process.exit(out.exitCode);
  });

program
  .command('fix')
  .description('Auto-fix suggestions: generate aiopt.patch (and optionally apply it via git apply)')
  .option('--out <dir>', 'output dir (default: ./aiopt-output)', DEFAULT_OUTPUT_DIR)
  .option('--apply', 'apply the generated patch via git apply')
  .option('--json', 'print machine-readable JSON to stdout')
  .action(async (opts) => {
    const outDir = String(opts.out);
    const { runFix } = await import('./fix');
    const r = runFix(process.cwd(), { outDir, apply: Boolean(opts.apply) });

    if (opts.json) {
      const payload = {
        ok: r.ok,
        applied: r.applied,
        patchPath: r.patchPath,
        changedFiles: r.changedFiles,
        hint: (r as any).hint || null
      };
      console.log(JSON.stringify(payload, null, 2));
      process.exit(r.ok ? 0 : 1);
    }

    console.log(`Patch: ${r.patchPath}`);
    if (r.changedFiles.length) {
      console.log(`Files: ${r.changedFiles.slice(0, 10).join(', ')}${r.changedFiles.length > 10 ? ' ...' : ''}`);
    } else {
      console.log('No changes suggested.');
    }
    if (r.applied) {
      console.log('OK: patch applied');
      process.exit(0);
    }
    if (!r.ok) {
      console.error(`FAIL: could not apply patch${(r as any).hint ? ` (${(r as any).hint})` : ''}`);
      process.exit(1);
    }
    process.exit(0);
  });

program
  .command('guard')
  .description('Pre-deploy guardrail: compare baseline usage vs candidate change (or diff two log sets) and print warnings (exit codes 0/2/3)')
  .option('--input <path>', 'baseline usage jsonl/csv (legacy alias for --baseline; default: ./aiopt-output/usage.jsonl)', DEFAULT_INPUT)
  .option('--baseline <path>', 'baseline usage jsonl/csv (diff mode when used with --candidate)')
  .option('--candidate <path>', 'candidate usage jsonl/csv (diff mode: compare two real log sets)')
  .option('--provider <provider>', 'candidate provider override (transform mode only)')
  .option('--model <model>', 'candidate model override (transform mode only)')
  .option('--context-mult <n>', 'multiply input_tokens by n (transform mode only)', (v) => Number(v))
  .option('--output-mult <n>', 'multiply output_tokens by n (transform mode only)', (v) => Number(v))
  .option('--retries-delta <n>', 'add n to retries (transform mode only)', (v) => Number(v))
  .option('--call-mult <n>', 'multiply call volume by n (traffic spike)', (v) => Number(v))
  .option('--budget-monthly <usd>', 'fail if estimated candidate monthly cost exceeds this budget', (v) => Number(v))
  .option('--json', 'print machine-readable JSON to stdout')
  .action(async (opts) => {
    const rt = loadRateTable();

    const baselinePath = String(opts.baseline || opts.input);
    const candidatePath = opts.candidate ? String(opts.candidate) : null;

    const diffMode = Boolean(opts.baseline || opts.candidate);
    if (diffMode && (!opts.baseline || !opts.candidate)) {
      console.error('FAIL: diff mode requires both --baseline and --candidate');
      process.exit(3);
    }

    if (!fs.existsSync(baselinePath)) {
      console.error(`FAIL: baseline not found: ${baselinePath}`);
      process.exit(3);
    }
    if (candidatePath && !fs.existsSync(candidatePath)) {
      console.error(`FAIL: candidate not found: ${candidatePath}`);
      process.exit(3);
    }

    const baselineEvents = isCsvPath(baselinePath) ? readCsv(baselinePath) : readJsonl(baselinePath);
    const candidateEvents = candidatePath
      ? (isCsvPath(candidatePath) ? readCsv(candidatePath) : readJsonl(candidatePath))
      : undefined;

    const { runGuard } = await import('./guard');
    const r = runGuard(rt, {
      baselineEvents,
      candidateEvents,
      candidate: {
        provider: opts.provider,
        model: opts.model,
        contextMultiplier: opts.contextMult,
        outputMultiplier: opts.outputMult,
        retriesDelta: opts.retriesDelta,
        callMultiplier: opts.callMult,
        budgetMonthlyUsd: opts.budgetMonthly
      }
    });

    if (opts.json) {
      // Minimal stable JSON for agents/tools
      const payload = {
        exitCode: r.exitCode,
        message: r.message,
        mode: candidateEvents ? 'diff' : 'transform',
        baseline: baselinePath,
        candidate: candidatePath,
        artifacts: {
          outDir: path.resolve(DEFAULT_OUTPUT_DIR),
          guard_last_txt: path.join(path.resolve(DEFAULT_OUTPUT_DIR), 'guard-last.txt'),
          guard_last_json: path.join(path.resolve(DEFAULT_OUTPUT_DIR), 'guard-last.json'),
          guard_history_jsonl: path.join(path.resolve(DEFAULT_OUTPUT_DIR), 'guard-history.jsonl')
        }
      };
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(r.message);
    }

    // Persist last guard output + history for local dashboard / CI attachments
    try {
      const outDir = path.resolve(DEFAULT_OUTPUT_DIR);
      fs.mkdirSync(outDir, { recursive: true });
      const ts = new Date().toISOString();
      fs.writeFileSync(path.join(outDir, 'guard-last.txt'), r.message);
      fs.writeFileSync(path.join(outDir, 'guard-last.json'), JSON.stringify({ ts, exitCode: r.exitCode }, null, 2));
      const histLine = JSON.stringify({ ts, exitCode: r.exitCode, mode: candidateEvents ? 'diff' : 'transform', baseline: baselinePath, candidate: candidatePath }) + '\n';
      fs.appendFileSync(path.join(outDir, 'guard-history.jsonl'), histLine);
    } catch {
      // ignore
    }

    process.exit(r.exitCode);
  });

// Local-only dashboard (no auth; binds to 127.0.0.1)
program
  .command('dashboard')
  .description('Local dashboard (localhost only): view usage + scan + guard (auto-collects OpenClaw usage)')
  .option('--port <n>', 'port (default: 3010)', (v) => Number(v), 3010)
  .option('--dir <path>', 'base directory (default: ~/.aiopt). Use this to pin a consistent data source.')
  .option('--auto', 'auto-detect by searching parents (and one-level children) for aiopt-output (use only if you really want project-local)')
  .action(async (opts) => {
    const { startDashboard } = await import('./dashboard');
    const os = await import('os');
    const defaultBase = require('path').join(os.homedir(), '.aiopt');

    const base = opts.dir ? String(opts.dir) : defaultBase;

    if (opts.auto && !opts.dir) {
      // Auto mode keeps previous behavior, but is opt-in to avoid confusing multi-source results.
      const { findAioptOutputDir } = await import('./find-output');
      const found = findAioptOutputDir(process.cwd());
      await startDashboard(found.cwd, { port: Number(opts.port || 3010) });
      return;
    }

    await startDashboard(base, { port: Number(opts.port || 3010) });
  });

program
  .command('quickstart')
  .description('1-minute demo: generate sample usage, run scan+guard, and print dashboard URL')
  .option('--demo', 'run demo workflow (writes to ./aiopt-output)')
  .option('--port <n>', 'dashboard port (default: 3010)', (v) => Number(v), 3010)
  .option('--budget-monthly <usd>', 'optional budget gate for the demo guard', (v) => Number(v))
  .option('--serve', 'start the local dashboard after generating demo outputs')
  .option('--open', 'best-effort open browser to the dashboard URL')
  .action(async (opts) => {
    if (!opts.demo) {
      console.error('FAIL: quickstart requires --demo');
      process.exit(3);
    }
    const port = Number(opts.port || 3010);
    const { runQuickstart } = await import('./quickstart');
    const r = runQuickstart(process.cwd(), { port, budgetMonthlyUsd: opts.budgetMonthly });
    console.log('OK: demo usage written:', r.usagePath);
    console.log('--- guard ---');
    console.log(r.guard.message);

    // persist guard-last + append guard history for dashboard
    try {
      const fs = await import('fs');
      const path = await import('path');
      fs.mkdirSync(r.outDir, { recursive: true });
      const ts = new Date().toISOString();
      fs.writeFileSync(path.join(r.outDir, 'guard-last.txt'), r.guard.message);
      fs.writeFileSync(path.join(r.outDir, 'guard-last.json'), JSON.stringify({ ts, exitCode: r.guard.exitCode }, null, 2));
      const histLine = JSON.stringify({ ts, exitCode: r.guard.exitCode, mode: 'quickstart', baseline: r.usagePath, candidate: null }) + '\n';
      fs.appendFileSync(path.join(r.outDir, 'guard-history.jsonl'), histLine);
    } catch {}

    console.log('--- next ---');
    console.log(`Open: http://127.0.0.1:${port}/`);

    if (opts.serve) {
      const { startDashboard } = await import('./dashboard');
      if (opts.open) {
        try {
          const { execSync } = await import('child_process');
          const url = `http://127.0.0.1:${port}/`;
          if (process.platform === 'darwin') execSync(`open "${url}"`);
          else if (process.platform === 'win32') execSync(`cmd.exe /c start "" "${url}"`);
          else execSync(`xdg-open "${url}"`);
        } catch {}
      }
      console.log('Serving dashboard. Press CTRL+C to stop.');
      await startDashboard(process.cwd(), { port });
      return;
    }

    console.log(`Run: npx aiopt dashboard --port ${port}`);
    process.exit(r.guard.exitCode);
  });

program.parse(process.argv);
