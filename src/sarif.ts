import path from 'path';

export type Finding = {
  ruleId: string;
  level: 'note' | 'warning' | 'error';
  message: string;
  file: string; // relative or absolute
  line: number; // 1-indexed
  help?: string;
};

function toUri(p: string) {
  // Prefer repo-relative URIs so GitHub code scanning can map results reliably.
  // If we can't compute relative, fall back to an absolute file:// URI.
  try {
    const rel = path.relative(process.cwd(), path.resolve(p)).replace(/\\/g, '/');
    if (rel && !rel.startsWith('..')) return rel;
  } catch {}

  const abs = path.resolve(p);
  const u = abs.replace(/\\/g, '/');
  return u.match(/^[A-Za-z]:\//) ? `file:///${u}` : `file://${u}`;
}

export function buildSarif(toolName: string, toolVersion: string, findings: Finding[]) {
  // Minimal SARIF v2.1.0 that GitHub code scanning can ingest.
  // We keep rule metadata tiny; details live in report/patch artifacts.
  const rulesMap = new Map<string, { id: string; shortDescription: string; help?: string }>();
  for (const f of findings) {
    if (!rulesMap.has(f.ruleId)) {
      rulesMap.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: f.ruleId,
        help: f.help
      });
    }
  }

  const rules = [...rulesMap.values()].map(r => ({
    id: r.id,
    shortDescription: { text: r.shortDescription },
    help: r.help ? { text: r.help } : undefined
  })).map(x => {
    // drop undefined fields
    const y: any = { ...x };
    if (!y.help) delete y.help;
    return y;
  });

  const results = findings.map(f => ({
    ruleId: f.ruleId,
    level: f.level,
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toUri(f.file) },
          region: { startLine: Math.max(1, Math.floor(f.line || 1)) }
        }
      }
    ]
  }));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version: toolVersion,
            informationUri: 'https://www.npmjs.com/package/aiopt',
            rules
          }
        },
        results
      }
    ]
  };
}
