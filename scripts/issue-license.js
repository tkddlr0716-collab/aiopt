#!/usr/bin/env node
/* Operator tool: issue an offline license key.

Usage:
  node scripts/issue-license.js --priv ./private.pem --sub user@example.com --plan pro --days 30

Outputs:
  <payloadB64Url>.<sigB64Url>

IMPORTANT: Do NOT commit private keys.
*/

const fs = require('fs');
const crypto = require('crypto');

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1];
}

const privPath = arg('--priv');
const sub = arg('--sub');
const plan = arg('--plan', 'trial');
const days = Number(arg('--days', '30'));

if (!privPath || !sub) {
  console.error('FAIL: require --priv and --sub');
  process.exit(1);
}

const privPem = fs.readFileSync(privPath, 'utf8');
const now = Math.floor(Date.now() / 1000);

const payload = {
  sub,
  plan,
  iat: now,
  exp: now + Math.max(1, days) * 86400,
  features: {
    pro: plan === 'pro' || plan === 'team',
    team: plan === 'team'
  }
};

const payloadB64 = b64url(JSON.stringify(payload));
const signer = crypto.createSign('RSA-SHA256');
signer.update(payloadB64);
signer.end();
const sig = signer.sign(privPem);

const key = payloadB64 + '.' + b64url(sig);
process.stdout.write(key);
