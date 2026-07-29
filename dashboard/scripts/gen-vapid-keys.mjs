#!/usr/bin/env node
/**
 * Generate Web Push VAPID keys (ECDSA P-256).
 *
 * Usage:
 *   node scripts/gen-vapid-keys.mjs
 *
 * Prints public + private keys as base64url (unpadded).
 * Store private key in OVH env file: VAPID_PRIVATE_KEY=<value>
 * Store public key in OVH env file: VAPID_PUBLIC_KEY=<value>
 * Also printed as env-file lines for direct append.
 */

import { generateKeyPairSync } from "crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});

const publicBase64 = Buffer.from(publicKey).toString("base64url");
const privateBase64 = Buffer.from(privateKey).toString("base64url");

console.log("=== VAPID Keys (base64url, unpadded) ===");
console.log(`VAPID_PUBLIC_KEY=${publicBase64}`);
console.log(`VAPID_PRIVATE_KEY=${privateBase64}`);
console.log("");
console.log("=== Env file lines (append to .env on OVH) ===");
console.log(`VAPID_PUBLIC_KEY="${publicBase64}"`);
console.log(`VAPID_PRIVATE_KEY="${privateBase64}"`);
console.log(`VAPID_SUBJECT="mailto:admin@bcharney.com"`);
console.log("");
console.log("Public key to expose to clients:", publicBase64);
