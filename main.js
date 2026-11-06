// main.js — Electron main process: windows, IPC, first-launch detection, and the scheduler that makes buddies talk.
const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, dialog, Notification, nativeImage, screen, Tray, clipboard, powerMonitor } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
if (app.isPackaged) process.env.NETPALS_DATA ||= app.getPath("userData"); // an installed copy keeps its data in AppData, not inside the read-only app bundle
const db = require("./lib/db");
const llm = require("./lib/llm");
const license = require("./lib/license");
const prompts = require("./lib/prompts");
const { createScheduler } = require("./lib/scheduler");

// [width, height, resizable]
const SIZE = { welcome: [420, 560], signon: [280, 470], list: [260, 560, true], chat: [460, 480, true], settings: [420, 660], away: [340, 440], addbuddy: [400, 640], profile: [300, 490], connect: [360, 230], room: [520, 480, true] };
const wins = new Map(); // "list" | "settings" | "chat:3" -> BrowserWindow
let quitting = false; // set by Sign Off; until then closing the Buddy List only hides it

// ---- when something breaks: a plain dialog with details to copy, and a line in the data folder's netpals.log ----
const LOG = path.join(db.dir, "netpals.log");
function snag(e) {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${e?.stack || e}\n`); } catch { /* best effort */ }
  if (!app.isReady()) return;
  const r = dialog.showMessageBoxSync({ type: "error", title: "Netpals hit a snag", message: "Something went wrong. Your buddies and chats are safe.", detail: String(e?.message || e), buttons: ["Copy details", "Close"], defaultId: 1, noLink: true });
  if (r === 0) clipboard.writeText(`${e?.stack || e}\n\n${LOG}`);
}
process.on("uncaughtException", snag);
process.on("unhandledRejection", snag);

// Main only needs the theme for the window background shown before the page paints.
const isDark = (s) => (s.darkWithSystem && nativeTheme.shouldUseDarkColors) || s.theme === "midnight";
// An OPENROUTER_API_KEY in the environment stands in for a key never typed into Settings; it is not copied to the DB.
const llmCfg = (s = db.settings()) => ({ provider: s.provider, baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKey || (s.provider === "openrouter" ? process.env.OPENROUTER_API_KEY || "" : "") });

function openWindow(kind, query = {}) {
  const key = kind + (query.id ? `:${query.id}` : "");
  if (wins.has(key)) { const w = wins.get(key); if (w.isMinimized()) w.restore(); w.show(); w.focus(); return w; }
  const s = db.settings();
  const [width, height, resizable = false] = SIZE[kind];
  const b = s.bounds?.[kind]; // where you left this kind of window last time, if that spot is still on a screen
  const onScreen = b && screen.getAllDisplays().some(({ workArea: a }) => b.x >= a.x - 20 && b.y >= a.y && b.x < a.x + a.width - 60 && b.y < a.y + a.height - 60);
  const w = new BrowserWindow({ width, height, resizable, minWidth: Math.min(width, 220), minHeight: Math.min(height, 360), frame: false, show: false, icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: isDark(s) ? "#1f2433" : "#ece9d8", alwaysOnTop: kind === "list" && s.alwaysOnTop, webPreferences: { preload: path.join(__dirname, "preload.js") } });
  if (onScreen) { w.setPosition(b.x, b.y); if (resizable) w.setContentSize(b.width, b.height); } // set after making it: sizes passed to the constructor come out a few px off
  w.loadFile(path.join(__dirname, "ui", `${kind}.html`), { query });
  w.once("ready-to-show", () => w.show());
  w.on("closed", () => wins.delete(key));
  w.on("close", (e) => {
    db.setSettings({ bounds: { ...db.settings().bounds, [kind]: w.getContentBounds() } }); // content size round-trips; the outer size grows a few px each time
    if (kind === "list" && !quitting) { e.preventDefault(); w.hide(); } // the Buddy List lives on in the tray; Sign Off is in its menu
  });
  wins.set(key, w);
  return w;
}
const broadcast = (channel, payload) => { for (const w of wins.values()) if (!w.isDestroyed()) w.webContents.send(channel, payload); };
// Handlers the renderer shows errors from: { ok: true, ...result } or { ok: false, error }.
const attempt = (fn) => async (...args) => { try { return { ok: true, ...(await fn(...args)) }; } catch (e) { return { ok: false, error: e.message }; } };

// A buddy's message: every window hears it; if their IM window isn't in front, flash it and pop a desktop notification.
function onMessage(msg, buddy) {
  broadcast("message", { msg, buddy });
  if (msg.role === "buddy") blinkTray();
  const w = wins.get(`chat:${buddy.id}`);
  if (msg.role !== "buddy" || w?.isFocused()) return;
  w?.flashFrame(true);
  if (!db.settings().notify || !Notification.isSupported()) return;
  // Silent: the Buddy List plays the IM sound.
  new Notification({ title: buddy.screenName, body: msg.text, silent: true }).on("click", () => openWindow("chat", { id: String(buddy.id) })).show();
}

// ---- pictures: copied into data/files, shown as thumbnails, sent to the model shrunk to 1024px when it can see ----
// PNG and JPEG only: that's what nativeImage decodes. Thumbnails are made when a window asks, one at a time, and kept.
const FILES = path.join(db.dir, "files");
const shrink = (file, width) => { const i = nativeImage.createFromPath(path.join(FILES, file)); return i.getSize().width > width ? i.resize({ width }) : i; };
const thumbs = new Map();
const thumb = (file) => { if (!thumbs.has(file)) thumbs.set(file, shrink(file, 260).toDataURL()); return thumbs.get(file); };
ipcMain.handle("pic:thumb", (_e, file) => thumb(path.basename(String(file))));
async function sendFile(id, src) {
  const buddy = db.buddy(id);
  if (!buddy || !/\.(png|jpe?g)$/i.test(src)) throw new Error("Pictures only: a png or jpg.");
  if (fs.statSync(src).size > 20e6) throw new Error("That picture is over 20 MB.");
  fs.mkdirSync(FILES, { recursive: true });
  const file = `${Date.now()}-${path.basename(src).replace(/[^\w.-]/g, "_")}`;
  fs.copyFileSync(src, path.join(FILES, file));
  broadcast("message", { msg: db.addMessage(id, "me", "", Date.now(), file), buddy });
  scheduler.reply(id);
  return { seen: await llm.canSee(llmCfg()), model: db.settings().model };
}
ipcMain.handle("chat:sendFile", attempt((_e, id, src) => sendFile(id, String(src))));
ipcMain.handle("chat:pick", attempt(async (e, id) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Send a picture", properties: ["openFile"], filters: [{ name: "Pictures", extensions: ["png", "jpg", "jpeg"] }] });
  return r.canceled ? { canceled: true } : sendFile(id, r.filePaths[0]);
}));
ipcMain.handle("file:open", (_e, file) => shell.openPath(path.join(FILES, path.basename(String(file)))));

// ---- tray: the Buddy List closes to it, the icon blinks while IMs wait, and Sign Off is the way out ------------
let tray = null, blink = null;
const trayIcon = (name) => nativeImage.createFromPath(path.join(__dirname, "assets", `${name}.ico`));
const ICON = { quiet: trayIcon("tray"), waiting: trayIcon("tray-new") };
function makeTray() {
  tray = new Tray(ICON.quiet);
  tray.setToolTip("Netpals");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Buddy List", click: () => openWindow("list") }, { label: "Away…", click: () => openWindow("away") }, { type: "separator" }, { label: "Sign Off", click: () => { quitting = true; app.quit(); } }]));
  tray.on("click", () => openWindow("list"));
}
function blinkTray() { // blinks while any IM is unread; opening that IM window counts as reading it
  const waiting = db.unreadCounts().length > 0;
  if (waiting && !blink) { let on = false; blink = setInterval(() => tray?.setImage((on = !on) ? ICON.waiting : ICON.quiet), 600); }
  if (!waiting && blink) { clearInterval(blink); blink = null; tray?.setImage(ICON.quiet); }
}
const trayState = () => ({ tray: Boolean(tray), blinking: Boolean(blink) });

// ---- auto-away: no mouse or keyboard for a while and you're away, AIM-style; touch anything and you're back -----
// settings.autoAway remembers that Netpals set the away itself, so a restart in the middle still ends it.
function idleCheck(idle = powerMonitor.getSystemIdleTime()) {
  const s = db.settings();
  if (!s.awayMessage && s.autoAwayMinutes && idle >= s.autoAwayMinutes * 60) { db.setSettings({ autoAway: true }); scheduler.setAway("I am away from my computer right now."); broadcast("settings", db.settings()); }
  else if (s.autoAway && idle < 60) { db.setSettings({ autoAway: false }); scheduler.setAway(""); broadcast("settings", db.settings()); }
}

const scheduler = createScheduler({
  chat: (opts) => llm.chat(opts, llmCfg()), onMessage, onPresence: (buddy, from) => broadcast("presence", { buddy, from }),
  picture: async (file) => ((await llm.canSee(llmCfg())) === false ? null : `data:image/jpeg;base64,${shrink(file, 1024).toJPEG(80).toString("base64")}`),
  onTyping: (id, on) => broadcast("typing", { id, on }), onError: (buddy, e) => broadcast("chat-error", { id: buddy.id, error: e.message }),
  onBack: () => broadcast("settings", db.settings()),
  onRoom: (msg, buddy) => broadcast("room", { msg, buddy }), onRoomTyping: (buddy, on) => broadcast("room-typing", { buddy, on }),
});

// Ask for JSON twice before giving up; connection errors throw straight through with their own message.
async function askJson(p) {
  for (let i = 0; i < 2; i++) {
    try { return prompts.parseJson(await llm.chat({ ...p, temperature: 1, maxTokens: 700 }, llmCfg())); } catch (e) { if (!(e instanceof SyntaxError || e instanceof TypeError)) throw e; }
  }
  throw new Error("The model's answer didn't make sense. Roll again?");
}
const takenNames = () => db.buddies().map((b) => b.screenName);
const takenForBuddies = () => [...takenNames(), db.settings().screenName].filter(Boolean); // yours is taken too
const ownProfile = async (b) => prompts.toBuddy({ ...b, profile: await askJson(prompts.writeProfile(b)) }).profile;

// ---- Netpals Plus: free is 3 buddies (main checks) and two themes (Setup checks); a key unlocks the rest ----------
const licensedTo = (s = db.settings()) => { const l = license.verify(s.license); return l ? l.name || l.email || "you" : ""; };
const addBlocked = () => (!licensedTo() && db.buddies().length >= license.FREE_BUDDIES ? `The free version holds ${license.FREE_BUDDIES} buddies. Add a Netpals Plus key in Setup to make room for more.` : "");
ipcMain.handle("license:set", attempt((_e, key) => {
  if (!license.verify(key)) throw new Error("That key doesn't check out. Copy the whole thing from your receipt.");
  db.setSettings({ license: String(key).replace(/\s+/g, "") });
  return { name: licensedTo() };
}));

// ---- you -----------------------------------------------------------------------------------
// The password is kept only as a salted scrypt hash. It locks the Sign On window; it doesn't encrypt the data folder.
const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString("hex")}`;
const passwordOk = (pw, stored) => { const a = Buffer.from(hashPassword(pw, stored.split(":")[0])), b = Buffer.from(stored); return a.length === b.length && crypto.timingSafeEqual(a, b); };
let signedOn = false; // your buddies sign on after you do
const signOn = () => openWindow("connect"); // the dial-up moment; the Connecting window reports back when it's through
ipcMain.handle("connect:done", () => {
  openWindow("list");
  if (!signedOn) { scheduler.start(); makeTray(); setInterval(idleCheck, 30_000); }
  signedOn = true; db.setSettings({ connected: true }); wins.get("connect")?.close();
});

function buddyMenu(e, id) {
  const b = db.buddy(id);
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!b) return;
  Menu.buildFromTemplate([
    { label: "Send IM", click: () => openWindow("chat", { id: String(id) }) },
    { label: "Get Info", click: () => openWindow("profile", { id: String(id) }) },
    { type: "separator" },
    { label: `Remove ${b.screenName}…`, click: async () => {
      const { response } = await dialog.showMessageBox(win, { type: "question", buttons: ["Remove", "Cancel"], defaultId: 1, cancelId: 1,
        message: `Remove ${b.screenName} from your Buddy List?`, detail: "Your IMs with them and what they remember about you go too." });
      if (response === 0) { wins.get(`chat:${id}`)?.close(); db.removeBuddy(id); broadcast("buddies"); }
    } },
  ]).popup({ window: win });
}

// hasEnvKey rides along: an OPENROUTER_API_KEY from the environment changes what the key fields say.
ipcMain.on("settings:getSync", (e) => { const s = db.settings(); e.returnValue = { ...s, hasEnvKey: Boolean(process.env.OPENROUTER_API_KEY), licensedTo: licensedTo(s), buyUrl: license.BUY_URL }; });
ipcMain.handle("settings:set", (_e, patch) => {
  db.setSettings(patch);
  if ("startWithWindows" in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: Boolean(patch.startWithWindows) }); // an installed copy only; in development this would register electron.exe
  if ("alwaysOnTop" in patch) wins.get("list")?.setAlwaysOnTop(Boolean(patch.alwaysOnTop));
  broadcast("settings", db.settings());
});
ipcMain.handle("buddies:list", () => db.buddies());
ipcMain.handle("buddies:unread", () => db.unreadCounts());
ipcMain.handle("buddy:read", (_e, id) => { db.markRead(id); broadcast("read", id); blinkTray(); });
ipcMain.handle("buddy:menu", buddyMenu);
ipcMain.handle("msg:vote", (_e, msgId, v) => {
  const r = db.vote(msgId, v);
  if (r?.chattiness !== undefined) broadcast("settings", db.settings());
  if (r) broadcast("buddies"); // profile meters
  return r;
});
ipcMain.handle("buddy:nudge", (_e, id, on) => { db.updateBuddy(id, { nudge: on ? 1 : 0 }); broadcast("buddies"); });
ipcMain.handle("buddy:forget", (_e, id) => { db.updateBuddy(id, { notes: "" }); broadcast("buddies"); });
// Edit… in Buddy Info: the Add form again, on one buddy. A blank profile keeps the old one.
ipcMain.handle("buddy:update", attempt((_e, raw) => {
  const old = db.buddy(raw.id);
  if (!old) throw new Error("That buddy is gone.");
  const b = prompts.toBuddy(raw, takenForBuddies().filter((n) => n.toLowerCase() !== old.screenName.toLowerCase()));
  db.updateBuddy(old.id, { name: b.name, screenName: b.screenName, emoji: b.emoji, era: b.era, personaPrompt: b.personaPrompt, cadenceWeight: b.cadenceWeight, nudge: b.nudge, profile: prompts.blankProfile(b) ? old.profile : b.profile });
  broadcast("buddies");
}));
// Save a conversation as a text file, like an old IM log. `to` skips the dialog (tests).
ipcMain.handle("chat:save", async (e, id, to) => {
  const b = db.buddy(id);
  if (!b) return false;
  const file = to || (await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: "Save conversation", defaultPath: `${b.screenName} ${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] })).filePath;
  if (!file) return false;
  const me = db.settings().screenName || "me";
  const who = (m) => (m.role === "me" ? me : m.role === "auto" ? `${b.screenName} (auto response)` : b.screenName);
  fs.writeFileSync(file, db.lastMessages(id, 1e6).map((m) => `[${new Date(m.ts).toLocaleString()}] ${who(m)}: ${m.text}${m.file ? `${m.text ? " " : ""}[picture: ${m.file.replace(/^\d+-/, "")}]` : ""}`).join("\r\n") + "\r\n");
  return true;
});
// ---- Buddy Chat: one room; who's in it is settings.chatRoom, its lines have roomId 1 ---------------------------
ipcMain.handle("room:load", () => { const s = db.settings(); return { members: s.chatRoom, buddies: db.buddies(), messages: db.roomMessages(200), me: s.screenName }; });
ipcMain.handle("room:send", (_e, text) => {
  const said = String(text).trim().slice(0, 1000);
  if (!said) return;
  broadcast("room", { msg: db.addRoomMessage("me", said) });
  const s = db.settings(), around = db.buddies().some((b) => (s.chatRoom || []).includes(b.id) && ["online", "idle"].includes(b.status));
  if (!around) return broadcast("room", { msg: { id: 0, role: "sys", text: "Nobody in the room is around right now.", ts: Date.now(), fromId: 0 } }); // shown, not kept
  scheduler.roomReply();
});
ipcMain.handle("room:members", (_e, ids) => {
  const was = db.settings().chatRoom || [], now = [...new Set(ids.map(Number))].filter((id) => db.buddy(id));
  for (const id of now.filter((id) => !was.includes(id))) broadcast("room", { msg: db.addRoomMessage("sys", `${db.buddy(id).screenName} has entered the room.`, id) });
  for (const id of was.filter((id) => !now.includes(id))) broadcast("room", { msg: db.addRoomMessage("sys", `${db.buddy(id)?.screenName || "someone"} has left the room.`, id) });
  db.setSettings({ chatRoom: now }); broadcast("settings", db.settings());
});
ipcMain.handle("chat:load", (_e, id) => { const buddy = db.buddy(id); return buddy && { buddy, messages: db.lastMessages(id, 200) }; });
ipcMain.handle("chat:send", (_e, id, text) => {
  const buddy = db.buddy(id), said = String(text).trim().slice(0, 1000);
  if (!buddy || !said) return;
  broadcast("message", { msg: db.addMessage(id, "me", said), buddy });
  scheduler.reply(id); // the answer arrives as its own "message" event, after "typing"
});
ipcMain.handle("buddy:canAdd", addBlocked);
ipcMain.handle("buddy:randomize", attempt(async (_e, vibe) => {
  if (!licensedTo()) throw new Error("Randomize comes with Netpals Plus. Add your key in Setup, or build a buddy yourself.");
  const b = prompts.toBuddy(await askJson(prompts.randomBuddy(String(vibe).slice(0, 200))), takenForBuddies());
  if (prompts.blankProfile(b)) b.profile = await ownProfile(b); // the preview should be complete
  return { buddy: b };
}));
ipcMain.handle("buddy:add", attempt((_e, raw) => {
  if (addBlocked()) throw new Error(addBlocked());
  const b = prompts.toBuddy(raw, takenForBuddies());
  const id = db.addBuddy(b);
  broadcast("presence", { buddy: db.buddy(id), from: "offline" }); // new buddies sign on with a door sound
  // Left the profile blank? They write their own, in the background.
  if (prompts.blankProfile(b)) ownProfile(b).then((profile) => { db.updateBuddy(id, { profile }); broadcast("buddies"); }, (e) => console.warn(`[netpals] no profile: ${e.message}`));
  return { id };
}));
ipcMain.handle("account:save", attempt((_e, you) => {
  const screenName = String(you.screenName || "").trim();
  if (!/^[a-z][a-z0-9_ ]{2,15}$/i.test(screenName)) throw new Error("A screen name is 3 to 16 letters, numbers, spaces or underscores, starting with a letter.");
  if (takenNames().some((n) => n.toLowerCase() === screenName.toLowerCase())) throw new Error("One of your buddies already has that screen name.");
  const age = String(you.age ?? "").trim() ? Number(you.age) : null;
  if (age !== null && !(Number.isInteger(age) && age >= 13 && age <= 120)) throw new Error("Age is a whole number from 13 to 120, or leave it blank.");
  const patch = { screenName, age, gender: String(you.gender || "").trim().slice(0, 30), about: String(you.about || "").trim().slice(0, 300) };
  if (you.password) {
    if (you.password.length < 4) throw new Error("Pick a password at least 4 characters long.");
    patch.passHash = hashPassword(you.password);
  } else if (!db.settings().passHash) throw new Error("Pick a password.");
  db.setSettings(patch);
  broadcast("settings", db.settings());
}));
// A saved password means an empty box is fine. Auto-login only works with a saved password, as in the old days.
ipcMain.handle("account:signon", attempt((_e, { password = "", savePassword, autoLogin } = {}) => {
  const s = db.settings();
  if (!(s.savePassword && !password) && !passwordOk(password, s.passHash)) throw new Error("That password doesn't match. Try again?");
  if (savePassword !== undefined) db.setSettings({ savePassword: Boolean(savePassword || autoLogin), autoLogin: Boolean(autoLogin) });
  signOn();
}));
ipcMain.handle("llm:listLocal", async (_e, host) => { const models = await llm.listLocal(host); return models && { models, pick: llm.pickModel(models)?.id }; });
// Theme files: { base, win, panel, ink, title, accent, them }. Loading checks every color before using any.
const THEME_KEYS = ["win", "panel", "ink", "title", "accent", "them"];
const FILTERS = [{ name: "Netpals theme", extensions: ["json"] }];
ipcMain.handle("theme:save", async (e, theme) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: "my-netpals-theme.json", filters: FILTERS });
  if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(theme, null, 2));
  return !r.canceled;
});
ipcMain.handle("theme:load", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ["openFile"], filters: FILTERS });
  return r.canceled ? null : attempt(() => {
    let t = {};
    try { t = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); } catch { /* checked below */ }
    if (!THEME_KEYS.every((k) => /^#[0-9a-f]{6}$/i.test(t[k]))) throw new Error("That file isn't a Netpals theme.");
    const base = ["dialup", "olive", "silver", "midnight", "bubblegum"].includes(t.base) ? t.base : "dialup";
    return { theme: { base, ...Object.fromEntries(THEME_KEYS.map((k) => [k, t[k].toLowerCase()])) } };
  })();
});
ipcMain.handle("llm:test", attempt(async () => {
  const t0 = Date.now();
  const text = await llm.chat({ system: "You are a friend on an instant messenger. Reply with one short hello.", messages: [{ role: "user", content: "hi" }], maxTokens: 30 }, llmCfg());
  return { ms: Date.now() - t0, text };
}));
ipcMain.handle("away:set", (_e, text, minutes) => { db.setSettings({ autoAway: false }); scheduler.setAway(text, Number(minutes) || 0); broadcast("settings", db.settings()); });
ipcMain.handle("win:open", (_e, kind, query) => { openWindow(kind, query); });
ipcMain.handle("win:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle("win:min", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle("external", (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

app.setAppUserModelId(app.isPackaged ? "com.netpals.app" : process.execPath); // Windows needs this for notifications
// First launch (or a cleared password): setup. After that: Sign On, or straight in with auto-login.
app.whenReady().then(async () => {
  const s = db.settings();
  const d = !s.provider && (await llm.detect());
  if (d) db.setSettings({ provider: d.provider, baseUrl: d.baseUrl, model: d.model, detect: { models: d.models, small: d.small } });
  if (!s.provider || !s.passHash) openWindow("welcome");
  else if (s.autoLogin) signOn();
  else openWindow("signon");
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { quitting = true; });

module.exports = { openWindow, broadcast, llmCfg, scheduler, idleCheck, blinkTray, trayState };
