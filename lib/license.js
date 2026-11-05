// lib/license.js — Netpals Plus keys, checked offline. A key is base64url(JSON { name, email, issued }) + "." +
// base64url(Ed25519 signature of that first part). Only the public half lives here; the seller's private half stays
// at ~/.netpals/license-private.pem (see scripts/license.js). In code anyone can read, this keeps honest people honest.
const crypto = require("crypto");
const PUBLIC_KEY = "MCowBQYDK2VwAyEAz6WsGriD1mfec80bZGkqHsxL4rf3chRF1SEDS/KInQs="; // SPKI DER, base64, written by `npm run license -- init`. Empty: no key unlocks.
const FREE_BUDDIES = 3;
const BUY_URL = ""; // where a key is sold (https). Empty until there is a store; Setup then shows no buy link.

const sign = (payload, privateKey) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${crypto.sign(null, Buffer.from(data), privateKey).toString("base64url")}`;
};
// { name, email, issued } for a genuine key, else null. Spaces and line breaks from a pasted email are ignored.
function verify(key, publicKey = PUBLIC_KEY) {
  const [data, sig, extra] = String(key || "").replace(/\s+/g, "").split(".");
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    return data && sig && extra === undefined && crypto.verify(null, Buffer.from(data), pub, Buffer.from(sig, "base64url")) ? JSON.parse(Buffer.from(data, "base64url")) : null;
  } catch { return null; }
}

module.exports = { sign, verify, FREE_BUDDIES, BUY_URL };
