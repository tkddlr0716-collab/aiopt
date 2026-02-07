#!/usr/bin/env node
/* Offline license tests: generate RSA keypair, issue key, verify using env pubkey override.
 */
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function run(args, env) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT_FAIL:', msg);
    process.exit(1);
  }
}

// build already done by npm run test:license
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: 'test@example.com',
  plan: 'trial',
  iat: now,
  exp: now + 3600,
  features: { dashboard: true }
};

const payloadB64 = b64url(JSON.stringify(payload));
const signer = crypto.createSign('RSA-SHA256');
signer.update(payloadB64);
signer.end();
const sig = signer.sign(privateKey);
const key = payloadB64 + '.' + b64url(sig);

const outDir = path.join(__dirname, '..', '.tmp-license');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'license.json');

{
  const r = run(['license', 'activate', key, '--out', outPath], { AIOPT_LICENSE_PUBKEY: pubPem });
  assert(r.code === 0, 'activate should succeed');
  assert(fs.existsSync(outPath), 'license.json must exist');
}
{
  const r = run(['license', 'verify', '--path', outPath], { AIOPT_LICENSE_PUBKEY: pubPem });
  assert(r.code === 0, 'verify should succeed');
}
{
  const r = run(['license', 'status', '--path', outPath], { AIOPT_LICENSE_PUBKEY: pubPem });
  assert(r.code === 0, 'status should be ok');
}

console.log('license_tests_ok');
