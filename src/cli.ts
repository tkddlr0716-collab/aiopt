#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { ensureDir, isCsvPath, readCsv, readJsonl } from './io';
import { RateTable } from './types';
import { analyze, writeOutputs } from './scan';

const program = new Command();

const DEFAULT_INPUT = './aiopt-input/usage.jsonl';
const DEFAULT_OUTPUT_DIR = './aiopt-output';

function loadRateTable(): RateTable {
  const p = path.join(__dirname, '..', 'rates', 'rate_table.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

program
  .name('aiopt')
  .description('AI 비용 자동 절감 인프라 — 서버 없는 로컬 CLI MVP')
  .version('0.0.1');

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
  .description('입력 로그(JSONL/CSV)를 분석하고 3개 산출물 생성')
  .option('--input <path>', 'input file path (default: ./aiopt-input/usage.jsonl)', DEFAULT_INPUT)
  .option('--out <dir>', 'output dir (default: ./aiopt-output)', DEFAULT_OUTPUT_DIR)
  .action((opts) => {
    const inputPath = String(opts.input);
    const outDir = String(opts.out);

    if (!fs.existsSync(inputPath)) {
      console.error(`Input not found: ${inputPath}`);
      process.exit(1);
    }

    const rt = loadRateTable();
    const events = isCsvPath(inputPath) ? readCsv(inputPath) : readJsonl(inputPath);

    const { analysis, savings, policy } = analyze(rt, events);
    // For reproducibility: embed input path & rate table meta
    policy.generated_from.input = inputPath;

    writeOutputs(outDir, analysis, savings, policy);

    console.log(`OK: ${outDir}/analysis.json`);
    console.log(`OK: ${outDir}/report.txt`);
    console.log(`OK: ${outDir}/cost-policy.json`);
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

program.parse(process.argv);
