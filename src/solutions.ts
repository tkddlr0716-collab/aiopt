import fs from 'fs';
import path from 'path';
import { AnalysisJson, Savings } from './scan';

export type Fix = {
  id: string;
  title: string;
  impact_usd: number;
  why: string;
  what_to_change: string[];
  status: 'action' | 'no-issue';
};

const EPS = 0.0001;

export function buildTopFixes(analysis: AnalysisJson, savings: Savings): Fix[] {
  const fixes: Fix[] = [];

  // Retry tuning
  fixes.push({
    id: 'fix-retry-tuning',
    title: 'Retry tuning',
    impact_usd: Number(savings.retry_waste || 0),
    status: Number(savings.retry_waste || 0) > EPS ? 'action' : 'no-issue',
    why: `Retry waste is estimated at $${round2(Number(savings.retry_waste || 0))}.`,
    what_to_change: [
      'aiopt/policies/retry.json: lower max_attempts or adjust backoff_ms',
      'Ensure idempotency keys are stable per trace_id',
      'Log error_code to identify retryable classes'
    ]
  });

  // Output cap (use context_savings as proxy impact)
  fixes.push({
    id: 'fix-output-cap',
    title: 'Output cap',
    impact_usd: Number(savings.context_savings || 0),
    status: Number(savings.context_savings || 0) > EPS ? 'action' : 'no-issue',
    why: `Context savings estimate: $${round2(Number(savings.context_savings || 0))}. Output caps prevent runaway completions.`,
    what_to_change: [
      'aiopt/policies/output.json: set max_output_tokens_default',
      'aiopt/policies/output.json: set per_feature caps (summarize/classify/translate)'
    ]
  });

  // Routing
  const topFeature = analysis.by_feature_top?.[0]?.key;
  fixes.push({
    id: 'fix-routing',
    title: 'Routing rule',
    impact_usd: Number(savings.routing_savings || 0),
    status: Number(savings.routing_savings || 0) > EPS ? 'action' : 'no-issue',
    why: `Routing savings estimate: $${round2(Number(savings.routing_savings || 0))}.`,
    what_to_change: [
      'aiopt/policies/routing.json: route summarize/classify/translate to cheap tier',
      `Consider adding feature_tag_in for top feature: ${topFeature || '(unknown)'}`
    ]
  });

  // sort by impact desc, deterministic tie-break
  fixes.sort((a, b) => (b.impact_usd - a.impact_usd) || a.id.localeCompare(b.id));
  return fixes;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function writePatches(outDir: string, fixes: Fix[]) {
  const patchesDir = path.join(outDir, 'patches');
  fs.mkdirSync(patchesDir, { recursive: true });

  const readme = [
    '# AIOpt patches (MVP)',
    '',
    'This folder contains suggested changes you can apply locally.',
    '',
    '## Top fixes',
    ...fixes.map((f, i) => `${i + 1}. ${f.title} — ${f.why}`),
    '',
    'Files are stubs (human review required).',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(patchesDir, 'README.md'), readme);

  // Minimal stub files to satisfy DoD naming.
  fs.writeFileSync(path.join(patchesDir, 'policies.updated.routing.json'), JSON.stringify({ note: 'apply changes to aiopt/policies/routing.json', fixes: fixes.filter(f => f.id.includes('routing')) }, null, 2));
  fs.writeFileSync(path.join(patchesDir, 'policies.updated.retry.json'), JSON.stringify({ note: 'apply changes to aiopt/policies/retry.json', fixes: fixes.filter(f => f.id.includes('retry')) }, null, 2));
  fs.writeFileSync(path.join(patchesDir, 'policies.updated.output.json'), JSON.stringify({ note: 'apply changes to aiopt/policies/output.json', fixes: fixes.filter(f => f.id.includes('output')) }, null, 2));
}
