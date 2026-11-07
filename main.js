// main.js — Netpals' main process. The parts live in main/, each registering the IPC channels for what it does:
//   windows   opening windows, where they were left, broadcast()     menus     the tray, the macOS menu bar, right-click
//   pictures  sending a picture, thumbnails                          account   password, signing on, Plus, away
//   buddies   the list, adding, IMs, Buddy Chat, notifications       settings  Setup, the brain, theme files
//   storage   how much room Netpals takes, a warning when the disk is nearly full
// This file wires them together, makes the scheduler that makes buddies talk, and decides what opens first.
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
// An installed copy keeps its data in AppData, not inside the read-only app bundle.
if (app.isPackaged) process.env.NETPALS_DATA ||= app.getPath("userData");

// Forgot your password? Start Netpals with --reset-password (Windows has a Start menu shortcut for it). It clears the
// password and sign-on choices; buddies, chats and everything else stay, and setup opens to pick a new one.
const RESET = "--reset-password";
const resetPassword = () => require("./lib/db").setSettings({ passHash: "", savePassword: false, autoLogin: false });

// One Netpals at a time: a second launch (a double-click, or starting it by hand after Windows already did) hands
// over to the first and quits, so two schedulers never share one database. The lock has already told the running
// copy by the time it returns false, so this copy stops on the spot (app.exit() this early doesn't take on macOS,
// and app.quit() waits for an app that never finishes starting). A reset is done here too: macOS doesn't always
// pass the flag on to the running copy.
if (!app.requestSingleInstanceLock()) {
  if (process.argv.includes(RESET)) resetPassword();
  process.exit(0);
}
if (process.argv.includes(RESET)) resetPassword();
const db = require("./lib/db");
const llm = require("./lib/llm");
const license = require("./lib/license");
const prompts = require("./lib/prompts");
const { createScheduler } = require("./lib/scheduler");

// ---- when something breaks: a plain dialog with details to copy, and a line in the data folder's netpals.log
const LOG = path.join(db.dir, "netpals.log");
function snag(e) {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${e?.stack || e}\n`); } catch { /* best effort */ }
  if (!app.isReady()) return;
  const r = dialog.showMessageBoxSync({ type: "error", title: "Netpals hit a snag", message: "Something went wrong. Your buddies and chats are safe.",
    detail: String(e?.message || e), buttons: ["Copy details", "Close"], defaultId: 1, noLink: true });
  if (r === 0) clipboard.writeText(`${e?.stack || e}\n\n${LOG}`);
}
process.on("uncaughtException", snag);
process.on("unhandledRejection", snag);

// Handlers the renderer shows errors from: { ok: true, ...result } or { ok: false, error }.
const attempt = (fn) => async (...args) => {
  try { return { ok: true, ...(await fn(...args)) }; } catch (e) { return { ok: false, error: e.message }; }
};
// An OPENROUTER_API_KEY in the environment stands in for a key never typed into Setup; it isn't copied to the database.
const llmCfg = (s = db.settings()) => ({ provider: s.provider, baseUrl: s.baseUrl, model: s.model,
  apiKey: s.apiKey || (s.provider === "openrouter" ? process.env.OPENROUTER_API_KEY || "" : "") });

// What the parts share. Each adds what it offers; anything used later (the scheduler, the tray) is looked up on ctx
// when it's called, so the order only matters for what runs while loading.
const ctx = { db, llm, license, prompts, attempt, llmCfg };
for (const part of [require("./main/windows"), require("./main/menus"), require("./main/pictures"), require("./main/account"),
  require("./main/buddies"), require("./main/settings"), require("./main/storage")]) Object.assign(ctx, part(ctx));
const { broadcast } = ctx;
ctx.scheduler = createScheduler({
  chat: (opts) => llm.chat(opts, llmCfg()),
  picture: ctx.picture,
  onMessage: ctx.onMessage,
  onPresence: (buddy, from) => broadcast("presence", { buddy, from }),
  onTyping: (id, on) => broadcast("typing", { id, on }),
  onError: (buddy, e) => broadcast("chat-error", { id: buddy.id, error: e.message }),
  onBack: () => broadcast("settings", db.settings()),
  onRoom: (msg, buddy) => broadcast("room", { msg, buddy }),
  onRoomTyping: (buddy, on) => broadcast("room-typing", { buddy, on }),
});

// ---- the window chrome every page draws itself, and links out (https only)
ipcMain.handle("win:open", (_e, kind, query) => { ctx.openWindow(kind, query); });
ipcMain.handle("win:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle("win:min", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle("external", (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

app.setAppUserModelId(app.isPackaged ? "com.netpals.app" : process.execPath); // Windows needs this for notifications
// First launch (or a cleared password): setup. After that: Sign On, or straight in with auto-login.
app.whenReady().then(async () => {
  const s = db.settings();
  const d = !s.provider && (await llm.detect());
  if (d) db.setSettings({ provider: d.provider, baseUrl: d.baseUrl, model: d.model, detect: { models: d.models, small: d.small } });
  if (!s.provider || !s.passHash) ctx.openWindow("welcome");
  else if (s.autoLogin) ctx.signOn();
  else ctx.openWindow("signon");
});
app.on("window-all-closed", () => app.quit());
app.on("second-instance", (_e, argv) => {
  if (argv.includes(RESET)) { // the reset shortcut while Netpals is already open (likely sitting at Sign On)
    resetPassword();
    if (!ctx.isSignedOn()) {
      ctx.wins.get("signon")?.close();
      return ctx.openWindow("welcome");
    }
    // On the Buddy List, so on a Mac it's a sheet on that window rather than a dialog that holds up the whole app.
    dialog.showMessageBox(ctx.openWindow("list"), { type: "info", message: "Your password is cleared.", detail: "Next time you sign on, Netpals asks you to pick a new one." });
  }
  const w = ctx.isSignedOn() ? ctx.openWindow("list") : BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
});

module.exports = ctx; // the tests reach openWindow, broadcast, scheduler, idleCheck, blinkTray and trayState through it
