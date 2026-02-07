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
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>AIOpt Local Dashboard</title>
  <style>
    :root{
      --bg:#070b16; --card:#0b1222; --card2:#0e1730; --txt:#e7eaf2; --muted:#a3acc2;
      --border:rgba(255,255,255,.10);
      --ok:#34d399; --warn:#fbbf24; --fail:#fb7185;
      --shadow:0 18px 70px rgba(0,0,0,.35);
    }
    *{box-sizing:border-box}
    body{margin:0; font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto; background:var(--bg); color:var(--txt)}
    a{color:#bfffe3; text-decoration:none} a:hover{text-decoration:underline}
    .wrap{max-width:1100px; margin:0 auto; padding:18px}
    .top{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap}
    .h1{font-size:22px; font-weight:950; letter-spacing:-.02em}
    .pill{display:inline-flex; align-items:center; gap:8px; padding:7px 10px; border-radius:999px; border:1px solid var(--border);
      background:rgba(255,255,255,.03); color:var(--muted); font-size:12px; line-height:1}
    .dot{width:8px;height:8px;border-radius:99px;background:linear-gradient(90deg,#60a5fa,#34d399)}

    .grid{display:grid; grid-template-columns:repeat(12,1fr); gap:12px; margin-top:12px}
    .card{grid-column: span 12; background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0)), var(--card);
      border:1px solid var(--border); border-radius:18px; padding:14px; box-shadow: var(--shadow)}
    @media(min-width: 920px){
      .c6{grid-column: span 6}
      .c4{grid-column: span 4}
      .c8{grid-column: span 8}
    }

    .k{padding:2px 6px; border-radius:8px; border:1px solid var(--border); font-family: ui-monospace; font-size:12px; color:#d7def2; background:rgba(255,255,255,.03)}
    .muted{color:var(--muted)}
    .row{display:flex; gap:10px; flex-wrap:wrap; align-items:center}

    .badge{display:inline-flex; align-items:center; gap:8px; padding:8px 10px; border-radius:14px; border:1px solid var(--border);
      background:rgba(255,255,255,.03); font-weight:900}
    .badge.ok{border-color:rgba(52,211,153,.35)}
    .badge.warn{border-color:rgba(251,191,36,.35)}
    .badge.fail{border-color:rgba(251,113,133,.35)}
    .badge .b{width:10px;height:10px;border-radius:99px}
    .badge.ok .b{background:var(--ok)}
    .badge.warn .b{background:var(--warn)}
    .badge.fail .b{background:var(--fail)}

    pre{margin:0; white-space:pre-wrap; word-break:break-word; background: rgba(3,6,14,.65);
      border:1px solid rgba(255,255,255,.12);
      padding:12px; border-radius:14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono"; font-size:13px; line-height:1.55}

    .bars{display:flex; flex-direction:column; gap:8px; margin-top:8px}
    .bar{display:grid; grid-template-columns: 1fr 64px; gap:10px; align-items:center}
    .track{height:10px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; border:1px solid rgba(255,255,255,.10)}
    .fill{height:100%; border-radius:999px; background:linear-gradient(90deg,#60a5fa,#34d399)}
    .label{font-size:13px}
    .val{font-family: ui-monospace; font-size:12px; color:#d7def2; text-align:right}

    .mini{font-size:12px; color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="h1">AIOpt Local Dashboard</div>
      <div class="pill"><span class="dot"></span> local-only · reads <span class="k">./aiopt-output</span></div>
    </div>

    <div class="grid">
      <div class="card c6">
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:950">Guard verdict</div>
          <div class="mini" id="guardMeta">—</div>
        </div>
        <div style="height:8px"></div>
        <div id="guardBadge" class="badge"><span class="b"></span><span id="guardBadgeText">loading…</span></div>
        <div style="height:10px"></div>
        <pre id="guard">loading…</pre>
        <div style="height:10px"></div>
        <div class="row">
          <a href="/api/guard-last.txt" target="_blank">raw txt</a>
          <span class="muted">·</span>
          <a href="/api/guard-last.json" target="_blank">raw json</a>
          <span class="muted">·</span>
          <a href="/api/guard-history.jsonl" target="_blank">history</a>
        </div>

        <div style="height:12px"></div>
        <div style="font-weight:900">Recent guard runs</div>
        <pre id="guardHist" style="max-height:220px; overflow:auto">loading…</pre>
      </div>

      <div class="card c6">
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:950">Scan summary</div>
          <div class="mini"><a href="/api/report.json" target="_blank">report.json</a> · <a href="/api/report.md" target="_blank">report.md</a></div>
        </div>
        <div style="height:8px"></div>
        <div class="row">
          <div class="badge" id="totalCostBadge"><span class="b" style="background:#60a5fa"></span><span id="totalCost">total: —</span></div>
          <div class="badge" id="savingsBadge"><span class="b" style="background:#a78bfa"></span><span id="savings">savings: —</span></div>
        </div>

        <div style="height:12px"></div>
        <div style="font-weight:900">Cost trend (last 7d)</div>
        <div class="mini"><a href="/api/usage.jsonl" target="_blank">usage.jsonl</a></div>
        <pre id="trend">loading…</pre>

        <div style="height:12px"></div>
        <div style="font-weight:900">Cost by model</div>
        <div id="byModel" class="bars"></div>

        <div style="height:12px"></div>
        <div style="font-weight:900">Cost by feature</div>
        <div id="byFeature" class="bars"></div>

        <div style="height:10px"></div>
        <div class="mini" id="scanMeta">—</div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:950">Latest report.md</div>
          <div class="mini">Tip: run <span class="k">aiopt scan</span> after collecting baseline</div>
        </div>
        <div style="height:8px"></div>
        <pre id="scan">loading…</pre>
      </div>
    </div>
  </div>

<script>
function money(x){
  if (x === null || x === undefined || Number.isNaN(Number(x))) return '—';
  return '$' + (Math.round(Number(x)*100)/100);
}
function renderBars(el, items){
  el.innerHTML='';
  if(!items || items.length===0){ el.innerHTML='<div class="mini">(no data)</div>'; return; }
  const max = Math.max(...items.map(i=>Number(i.cost)||0), 0.000001);
  for(const it of items.slice(0,8)){
    const w = Math.max(2, Math.round(((Number(it.cost)||0)/max)*100));
    const row = document.createElement('div');
    row.className='bar';
    row.innerHTML =
      '<div>'+
        '<div class="label">'+ String(it.key) +'</div>'+
        '<div class="track"><div class="fill" style="width:'+ w +'%"></div></div>'+
      '</div>'+
      '<div class="val">'+ money(it.cost) +'</div>';
    el.appendChild(row);
  }
}

async function load(){
  const guardTxt = await fetch('/api/guard-last.txt').then(r=>r.ok?r.text():null);
  const guardMeta = await fetch('/api/guard-last.json').then(r=>r.ok?r.json():null);

  document.getElementById('guard').textContent = guardTxt || '(no guard-last.txt yet — run: aiopt guard)';
  if(guardMeta){
    document.getElementById('guardMeta').textContent = 'exit=' + guardMeta.exitCode + ' · ' + guardMeta.ts;
    const badge = document.getElementById('guardBadge');
    const t = document.getElementById('guardBadgeText');
    const code = Number(guardMeta.exitCode);
    badge.classList.remove('ok','warn','fail');
    if(code===0){badge.classList.add('ok'); t.textContent='OK (0)';}
    else if(code===2){badge.classList.add('warn'); t.textContent='WARN (2)';}
    else {badge.classList.add('fail'); t.textContent='FAIL (3)';}
  }

  const histTxt = await fetch('/api/guard-history.jsonl').then(r=>r.ok?r.text():null);
  if(histTxt){
    const lines = histTxt.trim().split('\n').filter(Boolean).slice(-15).reverse();
    document.getElementById('guardHist').textContent = lines.join('\n');
  } else {
    document.getElementById('guardHist').textContent = '(no guard-history.jsonl yet — run: aiopt guard)';
  }

  const reportJson = await fetch('/api/report.json').then(r=>r.ok?r.json():null);
  if(reportJson){
    const total = reportJson.summary && reportJson.summary.total_cost_usd;
    const sav = reportJson.summary && reportJson.summary.estimated_savings_usd;
    document.getElementById('totalCost').textContent = 'total: ' + money(total);
    document.getElementById('savings').textContent = 'savings: ' + money(sav);
    renderBars(document.getElementById('byModel'), reportJson.top && reportJson.top.by_model);
    renderBars(document.getElementById('byFeature'), reportJson.top && reportJson.top.by_feature);
    document.getElementById('scanMeta').textContent = 'confidence=' + (reportJson.confidence || '—') + ' · generated_at=' + (reportJson.generated_at || '—');
  } else {
    document.getElementById('scanMeta').textContent = '(no report.json yet — run: aiopt scan)';
  }

  const usageTxt = await fetch('/api/usage.jsonl').then(r=>r.ok?r.text():null);
  if(usageTxt){
    // 7d cost trend: sum(cost_usd) per day from usage.jsonl (ev.ts).
    const now = Date.now();
    const bins = Array.from({length:7}, (_,i)=>({ day:i, cost:0, calls:0 }));
    for(const line of usageTxt.trim().split('\n')){
      if(!line) continue;
      try{
        const ev = JSON.parse(line);
        const t = Date.parse(ev.ts);
        if(!Number.isFinite(t)) continue;
        const d = Math.floor((now - t) / 86400000);
        if(d>=0 && d<7){
          bins[d].calls++;
          const c = Number(ev.cost_usd);
          if(Number.isFinite(c)) bins[d].cost += c;
        }
      }catch{}
    }
    const max = Math.max(...bins.map(b=>b.cost), 0.000001);
    const rows = bins.reverse().map((b,idx)=>{
      const w = Math.round((b.cost/max)*20);
      const bar = '█'.repeat(w) + '░'.repeat(20-w);
      const label = (idx===0 ? 'today' : ('d-'+idx));
      const dollars = ('$' + (Math.round(b.cost*100)/100).toFixed(2));
      return String(label).padEnd(7) + ' ' + bar + ' ' + String(dollars).padStart(9) + '  (' + b.calls + ' calls)';
    });
    document.getElementById('trend').textContent = rows.join('\n');
  } else {
    document.getElementById('trend').textContent = '(no usage.jsonl yet)';
  }

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
      const allow = new Set(['guard-last.txt', 'guard-last.json', 'guard-history.jsonl', 'report.md', 'report.json', 'usage.jsonl']);
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
