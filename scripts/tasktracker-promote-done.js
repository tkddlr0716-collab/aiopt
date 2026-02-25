#!/usr/bin/env node
/**
 * Promote legacy TaskTracker status "done" -> "completed" via upsert.
 *
 * Rationale:
 * - TaskTracker UI + aiopt runloop treat "completed" as the terminal status.
 * - Some older tasks used "done"; this clutters the focus view and breaks filtering.
 *
 * Usage:
 *   node scripts/tasktracker-promote-done.js
 *   TASKTRACKER_URL=http://localhost:3003/api/tasks node scripts/tasktracker-promote-done.js
 *   node scripts/tasktracker-promote-done.js --dry-run
 */

const baseUrl = process.env.TASKTRACKER_URL || 'http://localhost:3003/api/tasks';
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-n');

function normalizeTasks(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.tasks)) return json.tasks;
  return [];
}

function isLegacyDone(status) {
  return String(status || '').toLowerCase() === 'done';
}

async function main() {
  let res;
  try {
    res = await fetch(baseUrl);
  } catch (err) {
    console.error(`[tasktracker-promote-done] Failed to fetch ${baseUrl}`);
    console.error(`[tasktracker-promote-done] ${err && err.message ? err.message : String(err)}`);
    process.exit(2);
  }

  if (!res.ok) {
    console.error(`[tasktracker-promote-done] HTTP ${res.status} ${res.statusText}`);
    process.exit(2);
  }

  const json = await res.json();
  const tasks = normalizeTasks(json);
  const legacy = tasks.filter((t) => isLegacyDone(t.status));

  console.log(`legacy_done_count ${legacy.length}`);
  if (legacy.length === 0) return;

  for (const t of legacy) {
    const payload = {
      id: t.id,
      title: t.title || '작업',
      status: 'completed',
      progress: typeof t.progress === 'number' ? t.progress : 100,
      details: t.details || '',
    };

    if (DRY_RUN) {
      console.log(`[dry-run] promote ${payload.id} ${String(t.status)} -> completed :: ${payload.title}`);
      continue;
    }

    const up = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!up.ok) {
      console.error(`[tasktracker-promote-done] failed to promote ${payload.id}: HTTP ${up.status} ${up.statusText}`);
      process.exitCode = 2;
      continue;
    }

    console.log(`promoted ${payload.id}`);
  }
}

main();
