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
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_small.jsonl'), '--context-mult', '1.05', '--call-mult', '1']);
  assert([0,2,3].includes(r.code), 'exit code must be 0/2/3');
  mustContain(r.out, 'Impact (monthly est):');
  mustContain(r.out, 'Accident risk:');
  mustContain(r.out, 'Confidence:');
}

// 2) WARN/FAIL case: big baseline, force model upgrade to expensive model
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_big.jsonl'), '--model', 'gpt-5.2', '--context-mult', '5']);
  assert(r.code === 2 || r.code === 3, 'expected warn/fail for expensive model+context upgrade');
  mustContain(r.out, 'Accident risk:');
  // Confidence can be degraded by baseline data quality signals.
  mustContain(r.out, 'Confidence:');
}

// 3) WARN/FAIL case: retries delta high confidence and high impact
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_big.jsonl'), '--retries-delta', '200']);
  assert(r.code === 3 || r.code === 2, 'expected warn/fail for retries spike');
  mustContain(r.out, 'Accident risk:');
  mustContain(r.out, 'Confidence:');
}

// 4) WARN/FAIL: traffic spike (call-mult)
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_calls.jsonl'), '--call-mult', '50']);
  assert(r.code === 2 || r.code === 3, 'expected warn/fail for traffic spike');
  mustContain(r.out, 'Call volume multiplier: x50');
  mustContain(r.out, 'Top causes:');
}

// 5) Baseline empty: must still print Confidence + Accident risk and exit 3
{
  const r = run(['guard', '--input', path.join(__dirname, '..', 'fixtures', 'baseline_empty.jsonl')]);
  assert(r.code === 3, 'expected exit 3 for empty baseline');
  mustContain(r.out, 'baseline usage is empty');
  mustContain(r.out, 'Accident risk:');
  mustContain(r.out, 'Confidence: Low');
}

// 6) Diff mode: compare two real log sets (--baseline/--candidate)
{
  const r = run([
    'guard',
    '--baseline', path.join(__dirname, '..', 'fixtures', 'baseline_small.jsonl'),
    '--candidate', path.join(__dirname, '..', 'fixtures', 'candidate_small.jsonl')
  ]);
  assert(r.code === 2 || r.code === 3 || r.code === 0, 'exit code must be 0/2/3');
  mustContain(r.out, 'baseline=$');
  mustContain(r.out, 'candidate=$');
  mustContain(r.out, 'Confidence:');
}

console.log('guard_tests_ok');
