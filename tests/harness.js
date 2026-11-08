// tests/harness.js — what every window test shares. tests/run.js starts each test under Electron with a fresh
// NETPALS_DATA, the fake model's address and a folder for screenshots. Windows open off-screen, unfocusable and
// muted, and native dialogs are stubbed so nothing ever waits on a click.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const { app, BrowserWindow, dialog } = require("electron");

const ROOT = path.join(__dirname, "..");
const OUT = process.env.NETPALS_TEST_OUT || path.join(__dirname, "out");
const MODEL = process.env.NETPALS_TEST_MODEL || "http://127.0.0.1:9/v1";
const LIVE = process.env.NETPALS_TEST_LIVE === "1";
// Setup's Ollama, detection and downloads go to the fake model too, unless a test wants the real Ollama.
if (!LIVE) process.env.NETPALS_OLLAMA ||= MODEL.replace(/\/v1\/?$/, "");
// The weather, Fieldy and Claude always come from the fake, live or not.
process.env.NETPALS_WEATHER ||= MODEL.replace(/\/v1\/?$/, "");
process.env.NETPALS_ANTHROPIC ||= MODEL.replace(/\/v1\/?$/, "");
process.env.NETPALS_FIELDY ||= `${MODEL.replace(/\/v1\/?$/, "")}/api/public/v2`;
// Each test is its own Electron app as far as the single-instance lock goes, so tests never block each other.
app.setPath("userData", path.join(process.env.NETPALS_DATA || os.tmpdir(), "electron"));
const db = require(path.join(ROOT, "lib", "db"));
const license = require(path.join(ROOT, "lib", "license"));

// Dialogs: a message box answers Cancel (or whatever cancelId says); save and open dialogs use `files`, else cancel.
const files = { save: null, open: null };
dialog.showMessageBoxSync = (w, o) => { o = o || w; console.log(`[dialog] ${o.message} ${o.detail || ""}`); return o.cancelId ?? 1; };
dialog.showMessageBox = async (w, o) => ({ response: dialog.showMessageBoxSync(w, o) });
dialog.showSaveDialog = async () => (files.save ? { canceled: false, filePath: files.save } : { canceled: true });
dialog.showOpenDialog = async () => (files.open ? { canceled: false, filePaths: [files.open] } : { canceled: true, filePaths: [] });

app.on("browser-window-created", (_e, w) => {
  w.webContents.setAudioMuted(true);
  w.setFocusable(false);
  w.setPosition(-3000, -3000); // a window the app places itself (a remembered spot) moves after this
  w.webContents.setBackgroundThrottling(false);
  w.webContents.on("console-message", (ev) => { const m = ev.message ?? ev; if (!/Electron Security Warning/.test(m)) console.log("[renderer]", m); });
});

// Settings every test starts from (the fake model, quiet, no sounds), then main.js. An error the app doesn't catch
// fails the test instead of opening the "Netpals hit a snag" box and hanging.
function start(settings = {}) {
  db.setSettings({ provider: "local", baseUrl: MODEL, model: "fake:7b", darkWithSystem: false, theme: "dialup", chattiness: 0, sound: false, notify: false, ...settings });
  const main = require(path.join(ROOT, "main.js"));
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  const die = (e) => { console.log(`FAIL  the app threw: ${e?.stack || e}`); app.exit(1); };
  process.on("uncaughtException", die);
  process.on("unhandledRejection", die);
  return main;
}
// A signed-on starting point: an account, auto-login, and the dial-up already heard once so Connecting has Skip.
const ACCOUNT = { screenName: "tester", passHash: "x:y", autoLogin: true, connected: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (w, code) => w.webContents.executeJavaScript(code);
const win = (page) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes(page));
const shown = (w) => (w.isVisible() ? Promise.resolve() : new Promise((r) => w.once("show", r)));
async function until(fn, ms) {
  for (let t = 0; t < ms; t += 150) {
    try { if (await fn()) return true; } catch { /* the window may still be loading */ }
    await sleep(150);
  }
  return false;
}
const q = (id) => `document.getElementById(${JSON.stringify(id)})`;
const click = (w, id) => js(w, `${q(id)}.click()`);
const text = (w, id) => js(w, `${q(id)}.textContent`);
const value = (w, id) => js(w, `${q(id)}.value`);
const vis = (w, id) => js(w, `!${q(id)}.closest("[hidden]")`);
// Sets inputs, checkboxes and selects by id and fires input and change, as a person typing would.
const set = (w, vals) => js(w, `(() => { for (const [id, v] of Object.entries(${JSON.stringify(vals)})) {
  const e = document.getElementById(id); if (e.type === "checkbox") e.checked = v; else e.value = v;
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
async function open(main, kind, query) { const w = main.openWindow(kind, query); await shown(w); await sleep(500); return w; }
async function snap(w, name) {
  await sleep(300);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), (await w.capturePage()).toPNG());
}
// Past Connecting (Skip when it's offered) to the Buddy List.
async function signedOn() {
  await until(() => win("connect.html") || win("list.html"), 15_000);
  const c = win("connect.html");
  if (c && (await until(() => vis(c, "skip"), 1500))) await click(c, "skip");
  await until(() => win("list.html"), 15_000);
  await sleep(400);
  return win("list.html");
}
const buddy = (sn) => db.buddies().find((b) => b.screenName === sn);

// A Plus key, signed with the seller's private key when this machine has it; null elsewhere (Plus checks skip).
function plusKey(name = "Test Harness") {
  const pem = path.join(os.homedir(), ".netpals", "license-private.pem");
  if (!fs.existsSync(pem)) return null;
  return license.sign({ name, email: "test@example.com", issued: "2026-01-01" }, crypto.createPrivateKey(fs.readFileSync(pem)));
}

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const skip = (label) => console.log(`SKIP  ${label}`);
const done = () => app.exit(failed ? 1 : 0);
const run = (fn) => app.whenReady().then(fn).then(done, (e) => { console.log(`FAIL  the test threw: ${e?.stack || e}`); app.exit(1); });

module.exports = { app, BrowserWindow, ROOT, OUT, MODEL, LIVE, db, files, start, ACCOUNT, sleep, js, win, shown, until, click, text, value, vis, set, open, snap, signedOn, buddy, plusKey, check, skip, run };
