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

    writeOutputs(outDir, analysis, savings, policy, meta);

    // Console: Top Fix 3 (data-driven)
    const { buildTopFixes } = await import('./solutions');
    const fixes = buildTopFixes(analysis, savings).slice(0, 3);

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
  .command('guard')
  .description('Pre-deploy guardrail: compare baseline usage vs candidate change and print warnings (exit codes 0/2/3)')
  .option('--input <path>', 'baseline usage jsonl/csv (default: ./aiopt-output/usage.jsonl)', DEFAULT_INPUT)
  .option('--provider <provider>', 'candidate provider override')
  .option('--model <model>', 'candidate model override')
  .option('--context-mult <n>', 'multiply input_tokens by n', (v) => Number(v))
  .option('--output-mult <n>', 'multiply output_tokens by n', (v) => Number(v))
  .option('--retries-delta <n>', 'add n to retries', (v) => Number(v))
  .option('--call-mult <n>', 'multiply call volume by n (traffic spike)', (v) => Number(v))
  .action(async (opts) => {
    const rt = loadRateTable();
    const inputPath = String(opts.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`FAIL: baseline not found: ${inputPath}`);
      process.exit(3);
    }
    const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);

    const { runGuard } = await import('./guard');
    const r = runGuard(rt, {
      baselineEvents: events,
      candidate: {
        provider: opts.provider,
        model: opts.model,
        contextMultiplier: opts.contextMult,
        outputMultiplier: opts.outputMult,
        retriesDelta: opts.retriesDelta,
        callMultiplier: opts.callMult
      }
    });

    console.log(r.message);

    // Persist last guard output for local dashboard / CI attachments
    try {
      const outDir = path.resolve(DEFAULT_OUTPUT_DIR);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'guard-last.txt'), r.message);
      fs.writeFileSync(path.join(outDir, 'guard-last.json'), JSON.stringify({ ts: new Date().toISOString(), exitCode: r.exitCode }, null, 2));
    } catch {
      // ignore
    }

    process.exit(r.exitCode);
  });

// Local-only dashboard (no auth; binds to 127.0.0.1)
program
  .command('dashboard')
  .description('Local dashboard (localhost only): view last guard + last scan outputs')
  .option('--port <n>', 'port (default: 3010)', (v) => Number(v), 3010)
  .action(async (opts) => {
    const { startDashboard } = await import('./dashboard');
    await startDashboard(process.cwd(), { port: Number(opts.port || 3010) });
  });

program.parse(process.argv);
