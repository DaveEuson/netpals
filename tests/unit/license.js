// Runnable check for lib/license.js:  npm test -- license
// Signs keys with a throwaway Ed25519 pair (never your real one) and checks that tampering, wrong keys and junk fail.
const crypto = require("crypto");
const { sign, verify } = require("../../lib/license");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const pair = () => { const k = crypto.generateKeyPairSync("ed25519"); return { pub: k.publicKey.export({ type: "spki", format: "der" }).toString("base64"), priv: k.privateKey }; };
const mine = pair();
const other = pair();

const key = sign({ name: "Pat Buyer", email: "pat@example.com", issued: "2026-11-05" }, mine.priv);
check(verify(key, mine.pub)?.name === "Pat Buyer", `a genuine key verifies (${key.length} characters)`);
check(verify(key.replace(/(.{40})/g, "$1\n  "), mine.pub)?.email === "pat@example.com", "line breaks and spaces from an email don't matter");
const [data, sig] = key.split(".");
const forged = Buffer.from(JSON.stringify({ name: "Freeloader", email: "x@y.z", issued: "2026-11-05" })).toString("base64url");
check(verify(`${forged}.${sig}`, mine.pub) === null, "changing the name breaks the signature");
const damaged = Buffer.from(sig, "base64url"); damaged[10] ^= 1; // flip one real bit: editing the last characters can land in padding
check(verify(`${data}.${damaged.toString("base64url")}`, mine.pub) === null, "a damaged signature fails");
check(verify(key, other.pub) === null, "a key signed by someone else fails");
check(verify(sign({ name: "Pat" }, other.priv), mine.pub) === null, "a key made with another private key fails");
check([undefined, "", "hello", "a.b", `${key}.extra`, "....", "{}"].every((k) => verify(k, mine.pub) === null), "junk, empty and extra parts fail");
check(verify(key, "") === null, "with no public key built in, nothing unlocks");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
