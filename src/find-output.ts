import fs from 'fs';
import path from 'path';

export function findAioptOutputDir(startCwd: string): { cwd: string; outDir: string } {
  let cur = path.resolve(startCwd);
  while (true) {
    const outDir = path.join(cur, 'aiopt-output');
    if (fs.existsSync(outDir)) {
      try {
        if (fs.statSync(outDir).isDirectory()) return { cwd: cur, outDir };
      } catch {}
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  // If not found in parents, try one-level-down scan (common when user runs from a workspace root)
  try {
    const base = path.resolve(startCwd);
    const children = fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(base, d.name));
    for (const child of children) {
      const outDir = path.join(child, 'aiopt-output');
      if (fs.existsSync(outDir)) {
        try {
          if (fs.statSync(outDir).isDirectory()) return { cwd: child, outDir };
        } catch {}
      }
    }
  } catch {
    // ignore
  }

  return { cwd: path.resolve(startCwd), outDir: path.join(path.resolve(startCwd), 'aiopt-output') };
}
