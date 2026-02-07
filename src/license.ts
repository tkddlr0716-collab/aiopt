import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type LicensePayload = {
  sub: string; // customer id/email/etc
  plan: 'pro' | 'team' | 'trial' | string;
  iat: number; // issued at (unix seconds)
  exp: number; // expires at (unix seconds)
  features?: Record<string, boolean>;
};

export type LicenseFile = {
  key: string;
  payload: LicensePayload;
  verified: boolean;
  verified_at: string;
};

// NOTE: Public key only. No servers.
// Replace this with your own RSA public key in PEM (SPKI) format.
export const DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz1LLE/pXIx5TloDa0LAf
jg9NSIW6STWhsAFP2ZzXgpWoQ3cCmW6xcB/4QNEmPpGlfMWhyRfkxsdKuhnjUMTg
8MpMAcbjjF8JrGS9iLnW4yrLm7jzsOcndjkGO7pH+32GopZk98dVzmIRPok2Je76
3MQRaxLi0jWytaCmacEB4R7HyuquOQlHPg0vD9NOEwrC/+br2GdQbD1lKPyLeLv3
RidwAs8Iw2xx5g8G+BsVSM/HRC3jQT5GynfnuDsvMHCvGLRct/76ajiR71/NFZEP
Z7liILNnZzCTlKGGZfZmG70t+zkg8HKdpRuWy8rZ0DPWyQg5MKm6TZOMV6dC0Rpg
DwIDAQAB
-----END PUBLIC KEY-----`;

function b64urlDecodeToBuffer(s: string): Buffer {
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

function safeJsonParse(buf: Buffer): any {
  const txt = buf.toString('utf8');
  return JSON.parse(txt);
}

export function parseLicenseKey(key: string): { payload: LicensePayload; signature: Buffer; payloadB64Url: string } {
  const parts = String(key).trim().split('.');
  if (parts.length !== 2) throw new Error('invalid license key format: expected <payloadB64Url>.<sigB64Url>');
  const [payloadB64Url, sigB64Url] = parts;
  const payloadBuf = b64urlDecodeToBuffer(payloadB64Url);
  const sigBuf = b64urlDecodeToBuffer(sigB64Url);
  const payload = safeJsonParse(payloadBuf) as LicensePayload;
  return { payload, signature: sigBuf, payloadB64Url };
}

export function verifyLicenseKey(key: string, publicKeyPem: string): { ok: boolean; reason?: string; payload?: LicensePayload } {
  let parsed: { payload: LicensePayload; signature: Buffer; payloadB64Url: string };
  try {
    parsed = parseLicenseKey(key);
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'parse error' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof parsed.payload?.exp !== 'number' || parsed.payload.exp < now) {
    return { ok: false, reason: 'expired', payload: parsed.payload };
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(parsed.payloadB64Url);
    verifier.end();
    const ok = verifier.verify(publicKeyPem, parsed.signature);
    if (!ok) return { ok: false, reason: 'bad signature', payload: parsed.payload };
    return { ok: true, payload: parsed.payload };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'verify error', payload: parsed.payload };
  }
}

export function defaultLicensePath(cwd: string): string {
  return path.join(cwd, 'aiopt', 'license.json');
}

export function writeLicenseFile(p: string, key: string, payload: LicensePayload, verified: boolean) {
  const out: LicenseFile = {
    key,
    payload,
    verified,
    verified_at: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
}

export function readLicenseFile(p: string): LicenseFile {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as LicenseFile;
}
