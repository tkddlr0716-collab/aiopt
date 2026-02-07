import fs from 'fs';
import path from 'path';

function canWrite(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `.aiopt-write-test-${Date.now()}`);
    fs.writeFileSync(p, 'ok');
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

function tailLines(filePath: string, n: number): string[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - n));
  } catch {
    return [];
  }
}

export type DoctorResult = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  last5: Array<{ status?: string; provider?: string; model?: string; endpoint?: string; attempt?: number }>;
};

export function runDoctor(cwd: string): DoctorResult {
  const aioptDir = path.join(cwd, 'aiopt');
  const policiesDir = path.join(aioptDir, 'policies');
  const outDir = path.join(cwd, 'aiopt-output');
  const usagePath = path.join(outDir, 'usage.jsonl');

  const checks: DoctorResult['checks'] = [];

  checks.push({ name: 'aiopt/ exists', ok: fs.existsSync(aioptDir) });
  checks.push({ name: 'aiopt/policies exists', ok: fs.existsSync(policiesDir) });
  checks.push({ name: 'aiopt-output/ writable', ok: canWrite(outDir) });
  checks.push({ name: 'usage.jsonl exists', ok: fs.existsSync(usagePath), detail: usagePath });

  const last5raw = tailLines(usagePath, 5);
  const last5 = last5raw.length === 0 ? [{ status: '(empty usage.jsonl)' }] as any : last5raw.map(l => {
    try {
      const j = JSON.parse(l);
      return {
        status: j.status,
        provider: j.provider,
        model: j.model,
        endpoint: j.endpoint,
        attempt: j.attempt
      };
    } catch {
      return {};
    }
  });

  const ok = checks.every(c => c.ok);
  return { ok, checks, last5 };
}

