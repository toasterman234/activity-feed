#!/usr/bin/env node
/**
 * Generate Web Push VAPID keys (ECDSA P-256, raw uncompressed format).
 *
 * web-push requires the public key as a 65-byte uncompressed EC point
 * (04 || x || y) in base64url, and the private key as the raw 32-byte
 * scalar d in base64url.
 *
 * Usage:
 *   node scripts/gen-vapid-keys.mjs
 */

import { generateKeyPairSync } from "crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

// Public: extract raw uncompressed point from JWK
const pubJwk = publicKey.export({ format: "jwk" });
const x = Buffer.from(pubJwk.x, "base64url");
const y = Buffer.from(pubJwk.y, "base64url");
const rawPub = Buffer.concat([Buffer.from([0x04]), x, y]);
const publicBase64 = rawPub.toString("base64url");

// Private: raw 32-byte scalar d from JWK
const privJwk = privateKey.export({ format: "jwk" });
const d = Buffer.from(privJwk.d, "base64url");
const privateBase64 = d.toString("base64url");

console.log("=== VAPID Keys (raw uncompressed, base64url) ===");
console.log(`VAPID_PUBLIC_KEY=${publicBase64}`);
console.log(`VAPID_PRIVATE_KEY=${privateBase64}`);
console.log("");
console.log("=== Env file lines (append to .env on OVH) ===");
console.log(`VAPID_PUBLIC_KEY="${publicBase64}"`);
console.log(`VAPID_PRIVATE_KEY="${privateBase64}"`);
console.log(`VAPID_SUBJECT="mailto:admin@bcharney.com"`);
console.log("");
console.log("Public key to expose to clients:", publicBase64);
