import fs from 'fs';
import path from 'path';
import { RateTable } from './types';

export function loadRateTableFromDistPath(): RateTable {
  // Works both in src/tsup and dist runtime.
  const p = path.join(__dirname, '..', 'rates', 'rate_table.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as RateTable;
}
