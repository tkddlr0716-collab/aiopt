import http from 'http';
import fs from 'fs';
import path from 'path';
import { collectToUsageJsonl } from './collect';

export async function startDashboard(cwd: string, opts: { port: number }) {
  const host = '127.0.0.1';
  const port = opts.port || 3010;

  const outDir = path.join(cwd, 'aiopt-output');
  const file = (name: string) => path.join(outDir, name);

  // Auto-collect (best-effort): if usage.jsonl is missing, try to derive it from known local sources.
  let lastCollect: null | { ts: string; outPath: string; sources: any; eventsWritten: number } = null;
  let lastCollectError: null | string = null;

  function ensureUsageFile() {
    try {
      const usagePath = file('usage.jsonl');
      if (fs.existsSync(usagePath)) return;
      const r = collectToUsageJsonl(usagePath);
      lastCollect = { ts: new Date().toISOString(), outPath: r.outPath, sources: r.sources, eventsWritten: r.eventsWritten };
      lastCollectError = null;
    } catch (e: any) {
      lastCollectError = String(e?.message || e || 'collect failed');
    }
  }

  ensureUsageFile();

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
      <div>
        <div class="h1">AIOpt Local Dashboard</div>
        <div class="mini" id="baseDir">base: —</div>
        <div class="mini" id="missingHint" style="margin-top:4px">checking files…</div>
      </div>
      <div class="pill"><span class="dot"></span> local-only · reads <span class="k">./aiopt-output</span> · <span id="live" class="muted">live: off</span></div>
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
        <pre id="guard">loading… (if this stays, it usually means required files are missing — see the top “missing” line)</pre>
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
        <div class="mini" style="margin-top:8px">
          Quick actions (copy/paste):
          <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:8px">
            <span class="k">aiopt quickstart --demo</span>
            <span class="k">aiopt guard --help</span>
            <span class="k">aiopt scan</span>
          </div>
        </div>
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
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:900">Live usage (last 60m)</div>
          <div class="mini"><a href="/api/usage.jsonl" target="_blank">usage.jsonl</a></div>
        </div>
        <div id="liveSvg" style="margin-top:8px"></div>
        <pre id="liveText" style="margin-top:8px">loading…</pre>

        <div style="height:12px"></div>
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:900">Cost trend (last 7d)</div>
          <div class="mini">(from usage.jsonl)</div>
        </div>
        <div id="trendSvg" style="margin-top:8px"></div>
        <pre id="trend" style="margin-top:8px">loading…</pre>

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

let __live = false;
let __tick = 0;

async function load(){
  __tick++;
  // If fetch hangs / fails, do not leave “loading…” forever.
  const timer = setTimeout(()=>{
    const el = document.getElementById('missingHint');
    if(el && el.textContent && el.textContent.includes('checking')){
      el.textContent = 'still loading… (if this doesn\'t change, refresh. If it persists: run aiopt quickstart --demo or aiopt scan)';
    }
  }, 1500);

  let meta = null;
  try{
    meta = await fetch('/api/_meta', { cache: 'no-store' }).then(r=>r.ok?r.json():null);
  }catch{}
  clearTimeout(timer);

  if(meta && meta.baseDir){
    document.getElementById('baseDir').textContent = 'base: ' + meta.baseDir;
  }

  const miss = (meta && meta.missing) ? meta.missing : null;
  const hint = document.getElementById('missingHint');
  if(miss && miss.length){
    hint.textContent = 'missing: ' + miss.join(', ') + '  → not broken. Run: aiopt quickstart --demo (or aiopt scan)';
  } else if(miss && miss.length===0){
    hint.textContent = 'missing: (none)';
  } else {
    hint.textContent = 'missing: (unknown — failed to load /api/_meta)';
  }

  const guardTxt = await fetch('/api/guard-last.txt', { cache: 'no-store' }).then(r=>r.ok?r.text():null).catch(()=>null);
  const guardMeta = await fetch('/api/guard-last.json', { cache: 'no-store' }).then(r=>r.ok?r.json():null).catch(()=>null);

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

  const histTxt = await fetch('/api/guard-history.jsonl', { cache: 'no-store' }).then(r=>r.ok?r.text():null).catch(()=>null);
  if(histTxt){
    const lines = histTxt.trim().split('\n').filter(Boolean).slice(-15).reverse();
    const pretty = [];
    for(const l of lines){
      try{
        const j = JSON.parse(l);
        const code = Number(j.exitCode);
        const badge = (code===0?'OK':(code===2?'WARN':'FAIL'));
        const mode = j.mode || '—';
        const ts = (j.ts || '').replace('T',' ').replace('Z','');
        pretty.push(badge.padEnd(5) + ' ' + mode.padEnd(9) + ' ' + ts);
      }catch{pretty.push(l)}
    }
    document.getElementById('guardHist').textContent = pretty.join('\n');
  } else {
    document.getElementById('guardHist').textContent = '(no guard-history.jsonl yet — run: aiopt guard)';
  }

  const reportJson = await fetch('/api/report.json', { cache: 'no-store' }).then(r=>r.ok?r.json():null).catch(()=>null);
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

  // Use computed JSON endpoints to avoid downloading/parsing huge usage.jsonl in the browser.
  const live60 = await fetch('/api/live-60m.json', { cache: 'no-store' }).then(r=>r.ok?r.json():null).catch(()=>null);
  const sum7d = await fetch('/api/usage-summary.json', { cache: 'no-store' }).then(r=>r.ok?r.json():null).catch(()=>null);

  if(live60 && live60.bins){
    const pts = (live60.bins || []).slice().reverse();
    const W=520, H=120, P=12;
    const max = Math.max(...pts.map(b=>Number(b.cost)||0), 0.000001);
    const xs = pts.map((_,i)=> P + (i*(W-2*P))/59);
    const ys = pts.map(b=> H-P - (((Number(b.cost)||0)/max)*(H-2*P)) );
    let d = '';
    for(let i=0;i<xs.length;i++) d += (i===0?'M':'L') + xs[i].toFixed(1)+','+ys[i].toFixed(1)+' ';
    const area = 'M'+xs[0].toFixed(1)+','+(H-P).toFixed(1)+' ' + d + 'L'+xs[xs.length-1].toFixed(1)+','+(H-P).toFixed(1)+' Z';
    const svg =
      '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" xmlns="http://www.w3.org/2000/svg" style="background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.10); border-radius:14px">'+
        '<path d="'+area+'" fill="rgba(167,139,250,.10)" />'+
        '<path d="'+d+'" fill="none" stroke="rgba(167,139,250,.95)" stroke-width="2" />'+
        '<text x="'+P+'" y="'+(P+10)+'" fill="rgba(229,231,235,.75)" font-size="11">max/min '+money(max)+'</text>'+
      '</svg>';
    document.getElementById('liveSvg').innerHTML = svg;

    const rows = pts.slice(-10).map((b,idx)=>{
      const mAgo = 9-idx;
      const label = (mAgo===0 ? 'now' : (mAgo+'m'));
      const dollars = ('$' + (Math.round((Number(b.cost)||0)*100)/100).toFixed(2));
      return String(label).padEnd(5) + ' ' + String(dollars).padStart(9) + '  (' + (b.calls||0) + ' calls)';
    });
    document.getElementById('liveText').textContent = rows.join('\n');

    const liveEl = document.getElementById('live');
    if(liveEl){
      liveEl.textContent = 'live: on · last60m ' + money(live60.totalCostUsd || 0);
    }
  } else {
    document.getElementById('liveText').textContent = '(no live data yet)';
    document.getElementById('liveSvg').innerHTML = '';
  }

  if(sum7d && sum7d.dayBins){
    const bins = sum7d.dayBins || [];
    const W=520, H=120, P=12;
    const pts = bins.slice().reverse();
    const max = Math.max(...pts.map(b=>Number(b.cost)||0), 0.000001);
    const xs = pts.map((_,i)=> P + (i*(W-2*P))/6);
    const ys = pts.map(b=> H-P - (((Number(b.cost)||0)/max)*(H-2*P)) );
    let d = '';
    for(let i=0;i<xs.length;i++) d += (i===0?'M':'L') + xs[i].toFixed(1)+','+ys[i].toFixed(1)+' ';
    const area = 'M'+xs[0].toFixed(1)+','+(H-P).toFixed(1)+' ' + d + 'L'+xs[xs.length-1].toFixed(1)+','+(H-P).toFixed(1)+' Z';
    const circles = xs.map((x,i)=>'<circle cx="'+x.toFixed(1)+'" cy="'+ys[i].toFixed(1)+'" r="2.6" fill="rgba(52,211,153,.9)"/>').join('');
    const svg =
      '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" xmlns="http://www.w3.org/2000/svg" style="background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.10); border-radius:14px">'+
        '<path d="'+area+'" fill="rgba(96,165,250,.12)" />'+
        '<path d="'+d+'" fill="none" stroke="rgba(96,165,250,.95)" stroke-width="2" />'+
        circles+
        '<text x="'+P+'" y="'+(P+10)+'" fill="rgba(229,231,235,.75)" font-size="11">max '+money(max)+'</text>'+
      '</svg>';
    document.getElementById('trendSvg').innerHTML = svg;

    const rows = pts.map((b,idx)=>{
      const label = (idx===pts.length-1 ? 'd-6' : (idx===0 ? 'today' : ('d-'+idx)));
      const dollars = ('$' + (Math.round((Number(b.cost)||0)*100)/100).toFixed(2));
      return String(label).padEnd(7) + ' ' + String(dollars).padStart(9) + '  (' + (b.calls||0) + ' calls)';
    });
    document.getElementById('trend').textContent = rows.join('\n');
  } else {
    document.getElementById('trend').textContent = '(no 7d data yet)';
    document.getElementById('trendSvg').innerHTML = '';
  }

  const reportMd = await fetch('/api/report.md').then(r=>r.ok?r.text():null).catch(()=>null);
  document.getElementById('scan').textContent = reportMd || '(no report.md yet — run: aiopt scan)';
}

// Auto-refresh (simple polling): updates the dashboard as files change.
load();
setInterval(()=>{ load(); }, 2000);
const liveEl = document.getElementById('live');
if(liveEl) liveEl.textContent = 'live: on (polling)';
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

      if (name === '_meta') {
        ensureUsageFile();
        const expected = ['guard-last.txt', 'guard-last.json', 'report.json', 'report.md', 'usage.jsonl', 'guard-history.jsonl'];
        const missing = expected.filter(f => !fs.existsSync(file(f)));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ baseDir: cwd, outDir, missing, collect: lastCollect, collectError: lastCollectError }, null, 2));
        return;
      }

      const allow = new Set([
        'guard-last.txt', 'guard-last.json', 'guard-history.jsonl',
        'report.md', 'report.json',
        'usage.jsonl',
        'usage-summary.json',
        'live-60m.json'
      ]);
      // auto-collect hook for anything that depends on usage
      if (name === 'usage.jsonl' || name === 'usage-summary.json' || name === 'live-60m.json') ensureUsageFile();
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
