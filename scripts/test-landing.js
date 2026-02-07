const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'site', 'index.html');
const buyPath = path.join(root, 'site', 'buy.html');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const buyHtml = fs.readFileSync(buyPath, 'utf8');

// 1) basic wiring
assert(indexHtml.includes('./buy.html'), 'site/index.html should link to ./buy.html');
assert(buyHtml.includes('id="proLink"'), 'site/buy.html missing #proLink');
assert(buyHtml.includes('id="teamLink"'), 'site/buy.html missing #teamLink');

// 2) verify the query-param injection script logic by executing it with a fake DOM
const scriptMatch = buyHtml.match(/<script>([\s\S]*?)<\/script>/);
assert(scriptMatch, 'site/buy.html missing <script> block');
const script = scriptMatch[1];

function runWithSearch(search) {
  const links = {
    proLink: { href: null, setAttribute: (k, v) => { if (k === 'href') links.proLink.href = v; } },
    teamLink: { href: null, setAttribute: (k, v) => { if (k === 'href') links.teamLink.href = v; } },
  };

  const sandbox = {
    URLSearchParams,
    location: { search },
    document: {
      getElementById: (id) => links[id],
    },
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function('URLSearchParams', 'location', 'document', script);
  fn(sandbox.URLSearchParams, sandbox.location, sandbox.document);

  return { pro: links.proLink.href, team: links.teamLink.href };
}

const injected = runWithSearch('?pro=https%3A%2F%2Fpolar.sh%2Fpro&team=https%3A%2F%2Fpolar.sh%2Fteam');
assert(injected.pro === 'https://polar.sh/pro', 'pro link injection failed');
assert(injected.team === 'https://polar.sh/team', 'team link injection failed');

const empty = runWithSearch('');
assert(empty.pro === null && empty.team === null, 'empty search should not inject links');

console.log('landing_tests_ok');
