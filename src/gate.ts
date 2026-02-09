import fs from 'fs';
import path from 'path';

type Sarif = {
  runs?: Array<{
    results?: Array<{
      level?: string;
      locations?: Array<{
        physicalLocation?: {
          artifactLocation?: { uri?: string };
          region?: { startLine?: number };
        };
      }>;
    }>;
  }>;
};

function parseFileUri(uri: string): string {
  // SARIF uses file:// URIs. Convert to local path when possible.
  // Keep stable output: prefer relative paths when under cwd.
  try {
    if (!uri) return '';
    const u = uri.replace(/^file:\/\//, '');
    // Windows: /C:/path
    const norm = u.replace(/^\/+/, '').replace(/%20/g, ' ');
    return norm;
  } catch {
    return uri;
  }
}

export type GateResult = {
  violations: number;
  top3: Array<{ file: string; line: number }>;
};

export function runGate(outDir: string, cwd: string): GateResult {
  const sarifPath = path.join(outDir, 'aiopt.sarif');
  if (!fs.existsSync(sarifPath)) {
    return { violations: 0, top3: [] };
  }

  let sarif: Sarif;
  try {
    sarif = JSON.parse(fs.readFileSync(sarifPath, 'utf8'));
  } catch {
    return { violations: 0, top3: [] };
  }

  const results = sarif.runs?.[0]?.results || [];

  const viol = results.filter(r => {
    const lvl = String(r.level || '').toLowerCase();
    return lvl === 'warning' || lvl === 'error';
  });

  const locs: Array<{ file: string; line: number }> = [];
  for (const r of viol) {
    const loc = r.locations?.[0]?.physicalLocation;
    const uri = loc?.artifactLocation?.uri || '';
    const line = Number(loc?.region?.startLine || 1);
    let file = parseFileUri(uri);
    // Best-effort: make relative to cwd for readable PR comments.
    try {
      const abs = path.isAbsolute(file) ? file : path.resolve(file);
      file = path.relative(cwd, abs) || file;
    } catch {
      // ignore
    }
    locs.push({ file, line: Number.isFinite(line) && line > 0 ? line : 1 });
  }

  const top3 = locs.slice(0, 3);
  return { violations: viol.length, top3 };
}

export function formatGateStdout(r: GateResult, outDir: string): { text: string; exitCode: 0 | 1 } {
  const lines: string[] = [];
  if (r.violations <= 0) {
    lines.push('OK: no policy violations');
    lines.push(`Artifacts: ${path.join(outDir, 'report.md')} | ${path.join(outDir, 'aiopt.sarif')}`);
    return { text: lines.join('\n'), exitCode: 0 };
  }

  lines.push(`FAIL: policy violations=${r.violations}`);
  lines.push('Top3:');
  for (const x of r.top3) lines.push(`- ${x.file}:${x.line}`);
  lines.push('See artifacts: aiopt-output/report.md | aiopt-output/aiopt.sarif | aiopt-output/patches/');

  // Keep <= 10 lines guarantee.
  const text = lines.slice(0, 10).join('\n');
  return { text, exitCode: 1 };
}
