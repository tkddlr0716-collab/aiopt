import http from 'http';
import fs from 'fs';
import path from 'path';

export async function startDashboard(cwd: string, opts: { port: number }) {
  const host = '127.0.0.1';
  const port = opts.port || 3010;

  const outDir = path.join(cwd, 'aiopt-output');
  const file = (name: string) => path.join(outDir, name);

  function readOrNull(p: string) {
    try {
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  }

  const indexHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AIOpt Local Dashboard</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,Arial; margin:16px; max-width:980px}
    .row{display:flex; gap:12px; flex-wrap:wrap}
    .card{border:1px solid #ddd; border-radius:10px; padding:12px; flex:1; min-width:320px}
    pre{white-space:pre-wrap; word-break:break-word; background:#0b1020; color:#e6e6e6; padding:12px; border-radius:10px; overflow:auto}
    a{color:#2d6cdf}
  </style>
</head>
<body>
  <h1>AIOpt Local Dashboard</h1>
  <p>Local-only (bind: 127.0.0.1). Reads files from <code>./aiopt-output/</code>.</p>

  <div class="row">
    <div class="card">
      <h2>Last Guard</h2>
      <div id="guardMeta"></div>
      <pre id="guard">loading...</pre>
      <p><a href="/api/guard-last.txt" target="_blank">raw</a></p>
    </div>
    <div class="card">
      <h2>Last Scan</h2>
      <pre id="scan">loading...</pre>
      <p>
        <a href="/api/report.md" target="_blank">report.md</a> ·
        <a href="/api/report.json" target="_blank">report.json</a>
      </p>
    </div>
  </div>

<script>
async function load() {
  const guardTxt = await fetch('/api/guard-last.txt').then(r=>r.ok?r.text():null);
  const guardMeta = await fetch('/api/guard-last.json').then(r=>r.ok?r.json():null);
  document.getElementById('guard').textContent = guardTxt || '(no guard-last.txt yet)';
  document.getElementById('guardMeta').textContent = guardMeta ? ('exit=' + guardMeta.exitCode + ' @ ' + guardMeta.ts) : '';

  const reportMd = await fetch('/api/report.md').then(r=>r.ok?r.text():null);
  document.getElementById('scan').textContent = reportMd || '(no report.md yet — run: aiopt scan)';
}
load();
</script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
      return;
    }

    if (url.startsWith('/api/')) {
      const name = url.replace('/api/', '');
      const allow = new Set(['guard-last.txt', 'guard-last.json', 'report.md', 'report.json']);
      if (!allow.has(name)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }

      const p = file(name);
      const txt = readOrNull(p);
      if (txt === null) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('missing');
        return;
      }

      const ct = name.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
      res.writeHead(200, { 'content-type': ct });
      res.end(txt);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`OK: dashboard http://${host}:${port}/`);
  console.log('Tip: run `aiopt guard ...` and `aiopt scan` to populate aiopt-output files.');

  // keep alive
  await new Promise(() => {});
}
