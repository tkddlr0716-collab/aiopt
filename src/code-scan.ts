import fs from 'fs';
import path from 'path';
import { Finding } from './sarif';

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
  return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.kt', '.rb', '.php'].includes(ext);
}

function walk(root: string, out: string[]) {
  const items = fs.readdirSync(root, { withFileTypes: true });
  for (const it of items) {
    if (DEFAULT_EXCLUDES.has(it.name)) continue;
    const full = path.join(root, it.name);
    if (it.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function findAllLines(content: string, re: RegExp): number[] {
  const lines: number[] = [];
  const parts = content.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (re.test(line)) lines.push(i + 1);
  }
  return lines;
}

export function runCodeScan(rootDir: string): Finding[] {
  // This is intentionally lightweight + heuristic:
  // We aim to generate PR annotations with file:line, not perfect static analysis.
  const files: string[] = [];
  walk(rootDir, files);

  const findings: Finding[] = [];

  for (const file of files) {
    if (!isTextLike(file)) continue;

    let st: fs.Stats;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.size > 1024 * 1024) continue; // skip huge files

    let content = '';
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }

    // Rule 1: obvious high retry counts (hardcoded)
    // e.g. retry: 10, maxRetries: 8, attempts: 12
    for (const ln of findAllLines(content, /\b(maxRetries|maximumRetries|retries|max_attempts|attempts)\s*[:=]\s*(\d{2,}|[6-9])\b/i)) {
      findings.push({
        ruleId: 'AIOPT.RETRY.EXPLOSION_RISK',
        level: 'warning',
        message: 'High retry/attempt count detected. Consider capping retries to prevent cost explosions.',
        file,
        line: ln,
        help: 'Cap retries (e.g. 2-3), add backoff, and fail fast on non-retriable errors.'
      });
      break; // one per file is enough
    }

    // Rule 2: hard-coded expensive model strings (heuristic)
    // Encourage cheap default + override routing.
    for (const ln of findAllLines(content, /(gpt-5\.?2|gpt-4\.?|o1-|o3-|claude-3|sonnet|opus)/i)) {
      findings.push({
        ruleId: 'AIOPT.MODEL.ROUTING.EXPENSIVE_DEFAULT',
        level: 'note',
        message: 'Possible expensive model hard-coded. Consider cheap default + explicit override for critical paths.',
        file,
        line: ln,
        help: 'Route cheap by default; allow overrides via env/config for high-impact tasks.'
      });
      break;
    }

    // Rule 3: missing timeout (very common cost/latency amplifier)
    // If openai client call exists but no timeout nearby.
    const hasOpenAI = /\bopenai\b|\bOpenAI\b|responses\.create|chat\.completions\.create/i.test(content);
    const hasTimeout = /\btimeout\b|\brequestTimeout\b|\bsignal\b/i.test(content);
    if (hasOpenAI && !hasTimeout) {
      findings.push({
        ruleId: 'AIOPT.TIMEOUT.MISSING',
        level: 'note',
        message: 'OpenAI/LLM call detected without obvious timeout. Add a timeout to reduce hanging retries and cost waste.',
        file,
        line: 1,
        help: 'Add request timeout / AbortSignal and handle retryable errors explicitly.'
      });
    }
  }

  // Keep SARIF small/deterministic
  return findings.slice(0, 200);
}
