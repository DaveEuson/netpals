// Netpals Plus keys, for the seller:
//   npm run license -- init                          make your signing key, once, and put its public half in lib/license.js
//   npm run license -- "Pat Buyer" pat@example.com   print a license key to send a buyer
// The private key is saved to ~/.netpals/license-private.pem, outside the repo. Back it up and never commit it: lose it
// and you can't make keys that already-shipped copies of the app accept.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const license = require("../lib/license");

const FILE = path.join(os.homedir(), ".netpals", "license-private.pem");
const LIB = path.join(__dirname, "..", "lib", "license.js");
const [name, email] = process.argv.slice(2);

if (name === "init") {
  const lib = fs.readFileSync(LIB, "utf8");
  if (fs.existsSync(FILE)) throw new Error(`There's already a signing key at ${FILE}. Not touching it.`);
  if (!lib.includes('const PUBLIC_KEY = "";')) throw new Error("lib/license.js already has a public key. Keys sold so far only work with its private half.");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(LIB, lib.replace('const PUBLIC_KEY = "";', `const PUBLIC_KEY = "${publicKey.export({ type: "spki", format: "der" }).toString("base64")}";`));
  console.log(`Signing key saved to ${FILE}. Back it up; never commit it.\nIts public half is now in lib/license.js.`);
} else if (name && email) {
  const key = license.sign({ name, email, issued: new Date().toISOString().slice(0, 10) }, crypto.createPrivateKey(fs.readFileSync(FILE)));
  if (!license.verify(key)) throw new Error("This signing key doesn't match lib/license.js.");
  console.log(key);
} else {
  console.log('Usage: npm run license -- init   |   npm run license -- "Buyer Name" buyer@example.com');
}
