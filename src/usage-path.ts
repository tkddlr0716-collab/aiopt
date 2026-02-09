import fs from 'fs';
import path from 'path';
import os from 'os';

export function homeAioptUsagePath() {
  return path.join(os.homedir(), '.aiopt', 'aiopt-output', 'usage.jsonl');
}

export function resolveUsagePath(preferred: string): { path: string; tried: string[] } {
  const tried: string[] = [];
  const push = (p: string | null) => {
    if (!p) return;
    if (tried.includes(p)) return;
    tried.push(p);
  };

  push(preferred);
  push(homeAioptUsagePath());
  push('./aiopt-output/usage.jsonl');

  for (const p of tried) {
    try {
      if (fs.existsSync(p)) return { path: p, tried };
    } catch {}
  }
  return { path: preferred, tried };
}
