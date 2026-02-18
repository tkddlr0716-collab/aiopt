#!/usr/bin/env node
/**
 * List non-done tasks from the local TaskTracker API (no jq required).
 *
 * Usage:
 *   node scripts/tasktracker-open.js
 *   TASKTRACKER_URL=http://localhost:3003/api/tasks node scripts/tasktracker-open.js
 */

const url = process.env.TASKTRACKER_URL || 'http://localhost:3003/api/tasks';

function normalizeTasks(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.tasks)) return json.tasks;
  return [];
}

function isDoneStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'done' || s === 'completed';
}

(async () => {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error(`[tasktracker-open] Failed to fetch ${url}`);
    console.error(`[tasktracker-open] ${err && err.message ? err.message : String(err)}`);
    console.error('[tasktracker-open] Is TaskTracker running? (expected: http://localhost:3003/api/tasks)');
    process.exit(2);
  }

  if (!res.ok) {
    console.error(`[tasktracker-open] HTTP ${res.status} ${res.statusText}`);
    process.exit(2);
  }
  const json = await res.json();
  const tasks = normalizeTasks(json);

  const open = tasks.filter((t) => !isDoneStatus(t.status));

  console.log(`open_count ${open.length}`);
  for (const t of open) {
    console.log(`${t.id}\t${t.status}\t${t.title}`);
  }
})();
