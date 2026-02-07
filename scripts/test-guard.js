#!/usr/bin/env node
/* Minimal deterministic guard tests (no test framework).
 * Fails with exit code 1 if any assertion fails.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');

function run(args) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT_FAIL:', msg);
    process.exit(1);
  }
}

function mustContain(out, s) {
  assert(out.includes(s), `output must contain: ${s}`);
}

// 1) OK case: small baseline, minor change
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_small.jsonl'), '--context-mult', '1.05']);
  assert([0,2,3].includes(r.code), 'exit code must be 0/2/3');
  mustContain(r.out, 'Impact (monthly est):');
  mustContain(r.out, 'Confidence:');
}

// 2) WARN/FAIL case: big baseline, force model upgrade to expensive model
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_big.jsonl'), '--model', 'gpt-5.2', '--context-mult', '5']);
  assert(r.code === 2 || r.code === 3, 'expected warn/fail for expensive model+context upgrade');
  mustContain(r.out, 'Confidence: Medium');
}

// 3) WARN/FAIL case: retries delta high confidence and high impact
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_big.jsonl'), '--retries-delta', '25']);
  assert(r.code === 3 || r.code === 2, 'expected warn/fail for retries spike');
  mustContain(r.out, 'Confidence: High');
}

console.log('guard_tests_ok');
