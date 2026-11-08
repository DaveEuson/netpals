// Runnable check for scripts/license.js's list of keys:  npm test -- keys
// Every key made is added to keys.csv (free, or paid with the store's order number), names with commas and quotes
// survive, and `list` shows them all or finds one person's key to send again. Uses the seller's signing key only to
// sign (skips on machines without it) and writes the list to a throwaway file, never the real one.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const license = require("../../lib/license");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
if (!fs.existsSync(path.join(os.homedir(), ".netpals", "license-private.pem"))) {
  console.log("SKIP  making keys needs the seller's signing key on this machine");
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netpals-keys-"));
const LIST = path.join(dir, "keys.csv");
const run = (...args) => execFileSync(process.execPath, [path.join(__dirname, "..", "..", "scripts", "license.js"), ...args],
  { env: { ...process.env, NETPALS_KEYS: LIST }, encoding: "utf8" }).trim();

const free = run("Pat Buyer", "pat@example.com");
check(license.verify(free)?.email === "pat@example.com", "a free key prints and checks out");
const paid = run('Lee, Jr. "LJ"', "lee@example.com", "--paid", "1042");
check(license.verify(paid)?.name === 'Lee, Jr. "LJ"', "so does a paid one, for a name with a comma and quotes");

const lines = fs.readFileSync(LIST, "utf8").trim().split("\n");
check(lines[0] === "issued,kind,name,email,order,key" && lines.length === 3, "keys.csv has a header and one line per key");
check(lines[1].includes('"free","Pat Buyer","pat@example.com",""') && lines[1].endsWith(`"${free}"`), "the free one: kind, name, email, no order, and the key itself");
check(lines[2].includes('"paid","Lee, Jr. ""LJ""","lee@example.com","1042"'), "the paid one: with its order number, quotes doubled the way spreadsheets read them");

const all = run("list");
check(/Pat Buyer <pat@example\.com>/.test(all) && /paid  Lee, Jr\. "LJ" <lee@example\.com>  order 1042/.test(all) && /2 keys: 1 paid, 1 free/.test(all) && !all.includes(free),
  "list shows everyone and the count, without the keys");
const lee = run("list", "LEE@");
check(lee.includes(paid) && !lee.includes("Pat Buyer"), "list with a name or email finds just theirs, key included, to send again");
check(/No keys for "nobody"/.test(run("list", "nobody")), "and says when there's none");
check(/Usage/.test(run("--paid", "1042")), "flags alone print the usage instead of making a key");

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
