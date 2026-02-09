import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  'dist',
  'aiopt-output',
  '.next',
  'build',
  'coverage'
]);

function isTextLike(p: string) {
  const ext = path.extname(p).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext);
}

function walk(root: string, out: string[]) {
  const items = fs.readdirSync(root, { withFileTypes: true });
  for (const it of items) {
    // skip hidden dirs/files and common build folders
    if (it.name.startsWith('.')) continue;
    if (DEFAULT_EXCLUDES.has(it.name)) continue;
    const full = path.join(root, it.name);
    if (it.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function insertModelConst(content: string): { changed: boolean; next: string } {
  if (/\bAIOPT_MODEL\b/.test(content)) return { changed: false, next: content };
  if (!/\bprocess\.env\.AIOPT_MODEL\b/.test(content)) {
    // We'll still allow override by injecting a const that reads env.
  }
  const line = "const AIOPT_MODEL = process.env.AIOPT_MODEL || 'gpt-5.2-mini';";

  const lines = content.split(/\r?\n/);
  let i = 0;
  // Skip shebang
  if (lines[0] && lines[0].startsWith('#!')) i++;
  // Skip import/require headers
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('import ')) { i++; continue; }
    if (t.startsWith('const ') && t.includes("require(")) { i++; continue; }
    if (t === '' || t.startsWith('//') || t.startsWith('/*')) { i++; continue; }
    break;
  }
  lines.splice(i, 0, line, '');
  return { changed: true, next: lines.join('\n') };
}

function applyRetryCap(content: string): { changed: boolean; next: string } {
  let changed = false;
  let next = content;

  // Replace maxRetries: N (N>=4) -> 3
  next = next.replace(/\b(maxRetries|maximumRetries|max_attempts|attempts)\s*:\s*(\d+)\b/gi, (m, key, num) => {
    const n = Number(num);
    if (!Number.isFinite(n) || n < 4) return m;
    changed = true;
    return `${key}: 3`;
  });

  // Replace retry: { retries: N } etc
  next = next.replace(/\b(retries)\s*:\s*(\d+)\b/gi, (m, key, num) => {
    const n = Number(num);
    if (!Number.isFinite(n) || n < 4) return m;
    changed = true;
    return `${key}: 3`;
  });

  return { changed, next };
}

function applyModelRouting(content: string): { changed: boolean; next: string } {
  // Only target obvious "model: AIOPT_MODEL" patterns.
  let changed = false;
  let next = content;

  const re = /(\bmodel\s*[:=]\s*)(['"])gpt-5\.2\2/g;
  if (re.test(next)) {
    // ensure AIOPT_MODEL const exists
    const ins = insertModelConst(next);
    next = ins.next;

    next = next.replace(re, (_m, prefix) => {
      changed = true;
      return `${prefix}AIOPT_MODEL`;
    });

    // Also handle gpt-5.2-codex style names if present
    const re2 = /(\bmodel\s*[:=]\s*)(['"])openai-codex\/gpt-5\.2\2/g;
    next = next.replace(re2, (_m, prefix) => {
      changed = true;
      // Keep provider prefix if caller expects it; allow override still.
      return `${prefix}(process.env.AIOPT_MODEL_FULL || 'openai-codex/gpt-5.2-mini')`;
    });
  }

  return { changed, next };
}

function tmpFilePath(original: string) {
  const base = path.basename(original);
  const rand = Math.random().toString(16).slice(2);
  return path.join(os.tmpdir(), `aiopt-fix-${base}-${rand}`);
}

function diffNoIndex(oldPath: string, newPath: string): string {
  try {
    // --no-index works even outside git repos.
    return execSync(`git diff --no-index -- ${JSON.stringify(oldPath)} ${JSON.stringify(newPath)}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e: any) {
    // git diff returns exit code 1 when diff exists; stdout is still present.
    const out = String(e?.stdout || '');
    return out;
  }
}

function normalizePatchPaths(diffText: string, rel: string): string {
  // Make patch apply-able inside the repo by rewriting file paths to the repo-relative path.
  // Convert:
  //   diff --git a/<anything> b/<anything>
  //   --- a/<anything>
  //   +++ b/<anything>
  // into:
  //   diff --git a/<rel> b/<rel>
  //   --- a/<rel>
  //   +++ b/<rel>
  // This keeps hunks intact.
  const raw = diffText.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    // Avoid noisy mode diffs; they cause warnings and are not essential.
    if (line.startsWith('old mode ') || line.startsWith('new mode ')) continue;

    if (line.startsWith('diff --git ')) {
      lines.push(`diff --git a/${rel} b/${rel}`);
      continue;
    }
    if (line.startsWith('--- ')) {
      lines.push(`--- a/${rel}`);
      continue;
    }
    if (line.startsWith('+++ ')) {
      lines.push(`+++ b/${rel}`);
      continue;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export type FixOptions = {
  outDir: string;
  apply: boolean;
};

export function runFix(cwd: string, opts: FixOptions) {
  const files: string[] = [];
  walk(cwd, files);

  const patches: string[] = [];
  const changedFiles: string[] = [];

  for (const file of files) {
    if (!isTextLike(file)) continue;

    let st: fs.Stats;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.size > 1024 * 1024) continue;

    let content = '';
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }

    // Apply transforms (two required types):
    // 1) retry cap
    // 2) model routing (cheap default + env override)
    const r1 = applyRetryCap(content);
    const r2 = applyModelRouting(r1.next);

    const next = r2.next;
    if (next === content) continue;

    const tmp = tmpFilePath(file);
    fs.writeFileSync(tmp, next);

    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const d0 = diffNoIndex(file, tmp);
    const d = normalizePatchPaths(d0, rel);
    if (d && d.trim().length > 0) {
      patches.push(d);
      changedFiles.push(rel);
    }

    try { fs.unlinkSync(tmp); } catch {}

    // Keep patch sizes bounded
    if (patches.join('\n').length > 500_000) break;
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const patchPath = path.join(opts.outDir, 'aiopt.patch');

  const header = [
    '# AIOpt patch (generated)',
    '# - retry cap: reduce high retry/attempt counts to 3',
    '# - model routing: cheap default via AIOPT_MODEL env override',
    ''
  ].join('\n');

  fs.writeFileSync(patchPath, header + patches.join('\n'));

  if (opts.apply) {
    // Only attempt apply inside a git working tree.
    try {
      const inside = execSync('git rev-parse --is-inside-work-tree', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (inside !== 'true') {
        return { ok: false, applied: false, patchPath, changedFiles, hint: 'not inside a git work tree (run from your repo root, or omit --apply and apply manually)' };
      }
    } catch {
      return { ok: false, applied: false, patchPath, changedFiles, hint: 'git not available or not a git repo (omit --apply and apply manually)' };
    }

    try {
      execSync(`git apply ${JSON.stringify(patchPath)}`, { stdio: 'inherit' });
      return { ok: true, applied: true, patchPath, changedFiles };
    } catch {
      return { ok: false, applied: false, patchPath, changedFiles, hint: 'git apply failed. Ensure a clean working tree, then re-run; or open aiopt.patch and apply manually.' };
    }
  }

  return { ok: true, applied: false, patchPath, changedFiles };
}
