// lib/accounts.js — more than one screen name on a computer. Each has its own folder: its buddies, chats, pictures and
// settings. The first lives in the data folder itself, where Netpals always kept it; the rest in screen-names/2, /3…
// screen-names.json lists them (folder and screen name) and remembers which signed on last, so Sign On starts there.
const fs = require("fs");
const path = require("path");

const ROOT = process.env.NETPALS_DATA || path.join(__dirname, "..", "data");
const INDEX = path.join(ROOT, "screen-names.json");
const SUB = "screen-names";

// dir is relative to ROOT ("" for the first); a name that's only been started (no screen name yet) isn't listed.
function read() {
  let x = {};
  try { x = JSON.parse(fs.readFileSync(INDEX, "utf8")); } catch { /* none yet, or damaged: start over */ }
  const names = Array.isArray(x.names) ? x.names.filter((n) => typeof n?.dir === "string" && typeof n.screenName === "string" && n.screenName) : [];
  return { last: typeof x.last === "string" ? x.last : "", names };
}
const write = (x) => { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(x, null, 2)); };
// Only folders under ROOT, and only ones that are there: a hand-edited index can't point Netpals anywhere else.
const safe = (dir) => dir === "" || (/^screen-names\/\d+$/.test(dir) && fs.existsSync(path.join(ROOT, dir)));
const abs = (dir) => path.join(ROOT, safe(dir) ? dir : "");

const lastDir = () => read().last;
const names = () => read().names.filter((n) => safe(n.dir));

// Note a screen name for a folder (after setup saves it), or that it just signed on (last).
function remember(dir, screenName, { last = false } = {}) {
  const x = read();
  const i = x.names.findIndex((n) => n.dir === dir);
  if (screenName) { if (i >= 0) x.names[i].screenName = screenName; else x.names.push({ dir, screenName }); }
  if (last) x.last = dir;
  write(x);
}

// A folder for a new screen name: the next number up, or one that was started and never finished.
function fresh() {
  const known = new Set(read().names.map((n) => n.dir));
  for (let i = 2; ; i++) {
    const dir = `${SUB}/${i}`;
    if (known.has(dir)) continue;
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
    return dir;
  }
}

// Another of your screen names already called that (any case)?
const taken = (screenName, dir) => names().some((n) => n.dir !== dir && n.screenName.toLowerCase() === String(screenName).toLowerCase());

module.exports = { ROOT, abs, lastDir, names, remember, fresh, taken, safe };
