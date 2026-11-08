// Netpals Plus keys, for the seller:
//   npm run license -- init                                      make your signing key, once, and put its public half in lib/license.js
//   npm run license -- "Pat Buyer" pat@example.com               print a free key to send someone
//   npm run license -- "Pat Buyer" pat@example.com --paid 1042   print a key for a paid order (the store's order number)
//   npm run license -- list                                      every key made so far, free and paid
//   npm run license -- list pat                                  just the ones for a name or email with "pat" in it, keys included (to send again)
// The private key is saved to ~/.netpals/license-private.pem, outside the repo. Back it up and never commit it: lose it
// and you can't make keys that already-shipped copies of the app accept. Every key made is added to keys.csv next to
// it (NETPALS_KEYS moves that list), since the app never reports back: the store's orders and this list are the record.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const license = require("../lib/license");

const FILE = path.join(os.homedir(), ".netpals", "license-private.pem");
const LIB = path.join(__dirname, "..", "lib", "license.js");
const LIST = process.env.NETPALS_KEYS || path.join(path.dirname(FILE), "keys.csv");
const COLUMNS = ["issued", "kind", "name", "email", "order", "key"];
const args = process.argv.slice(2);
const [name, email] = args;

// keys.csv: every field quoted, so names with commas and quotes survive, and it opens in any spreadsheet.
const csvLine = (row) => COLUMNS.map((c) => `"${String(row[c] ?? "").replace(/"/g, '""')}"`).join(",");
function readList() {
  if (!fs.existsSync(LIST)) return [];
  return fs.readFileSync(LIST, "utf8").split(/\r?\n/).slice(1).filter(Boolean)
    .map((line) => Object.fromEntries([...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m, i) => [COLUMNS[i], m[1].replace(/""/g, '"')])));
}
function addToList(row) {
  fs.mkdirSync(path.dirname(LIST), { recursive: true });
  if (!fs.existsSync(LIST)) fs.writeFileSync(LIST, `${COLUMNS.join(",")}\n`, { mode: 0o600 });
  fs.appendFileSync(LIST, `${csvLine(row)}\n`);
}

if (name === "init") {
  const lib = fs.readFileSync(LIB, "utf8");
  if (fs.existsSync(FILE)) throw new Error(`There's already a signing key at ${FILE}. Not touching it.`);
  if (!lib.includes('const PUBLIC_KEY = "";')) throw new Error("lib/license.js already has a public key. Keys sold so far only work with its private half.");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(LIB, lib.replace('const PUBLIC_KEY = "";', `const PUBLIC_KEY = "${publicKey.export({ type: "spki", format: "der" }).toString("base64")}";`));
  console.log(`Signing key saved to ${FILE}. Back it up; never commit it.\nIts public half is now in lib/license.js.`);
} else if (name === "list") {
  const find = (email || "").toLowerCase();
  const rows = readList().filter((r) => !find || `${r.name} ${r.email}`.toLowerCase().includes(find));
  if (!rows.length) console.log(find ? `No keys for "${email}".` : `No keys made yet (${LIST}).`);
  for (const r of rows) {
    console.log(`${r.issued}  ${r.kind.padEnd(4)}  ${r.name} <${r.email}>${r.order ? `  order ${r.order}` : ""}`);
    if (find) console.log(`  ${r.key}`);
  }
  const paid = rows.filter((r) => r.kind === "paid").length;
  if (rows.length) console.log(`\n${rows.length} key${rows.length === 1 ? "" : "s"}: ${paid} paid, ${rows.length - paid} free. The list: ${LIST}`);
} else if (name && email && !name.startsWith("--") && !email.startsWith("--")) {
  const at = args.indexOf("--paid");
  const order = at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : "";
  const issued = new Date().toISOString().slice(0, 10);
  const key = license.sign({ name, email, issued }, crypto.createPrivateKey(fs.readFileSync(FILE)));
  if (!license.verify(key)) throw new Error("This signing key doesn't match lib/license.js.");
  addToList({ issued, kind: at >= 0 ? "paid" : "free", name, email, order, key });
  console.log(key);
} else {
  console.log('Usage: npm run license -- init  |  "Buyer Name" buyer@example.com [--paid ORDER]  |  list [name or email]');
}
