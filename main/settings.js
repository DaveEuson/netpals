// main/settings.js — Setup's side of things: reading and saving settings, the brain (model list, Test it, finding
// one, downloading one into Ollama), checking what buddies know about your day, and theme files.
const fs = require("fs");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const calendar = require("../lib/calendar");
const weather = require("../lib/weather");
const fieldy = require("../lib/fieldy");

const THEME_KEYS = ["win", "panel", "ink", "title", "accent", "them"]; // a theme file: { base, ...these six colors }
const BASES = ["dialup", "pinstripe", "olive", "silver", "midnight", "bubblegum"];
const FILTERS = [{ name: "Netpals theme", extensions: ["json"] }];
// Settings only main sets: the key goes through license:set, away through away:set, the room through room:members,
// and the rest is bookkeeping. A page asking to set one is ignored.
const MAIN_ONLY = ["license", "connected", "bounds", "autoAway", "awayMessage", "awaySince", "awayUntil", "lastAwayText", "lastAwayMinutes",
  "lastDropDay", "detect", "chatRoom"];

module.exports = function settings(ctx) {
  const { db, llm, license, attempt, broadcast, wins } = ctx;

  // Windows read settings synchronously before they paint. hasEnvKey (and hasEnvClaudeKey) ride along: a key from the
  // environment changes what the key fields say.
  ipcMain.on("settings:getSync", (e) => {
    const s = db.settings();
    e.returnValue = { ...s, hasEnvKey: Boolean(process.env.OPENROUTER_API_KEY), hasEnvClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY), licensedTo: ctx.licensedTo(s), buyUrl: license.BUY_URL,
      localHosts: llm.LOCAL_HOSTS, recommended: llm.RECOMMENDED, claudeModels: llm.CLAUDE_MODELS };
  });
  ipcMain.handle("settings:set", (_e, raw) => {
    const patch = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => !MAIN_ONLY.includes(k)));
    db.setSettings(patch);
    // An installed copy only: in development this would register electron.exe to start with Windows.
    if ("startWithWindows" in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: Boolean(patch.startWithWindows) });
    if ("alwaysOnTop" in patch) wins.get("list")?.setAlwaysOnTop(Boolean(patch.alwaysOnTop));
    broadcast("settings", db.settings());
  });

  // ---- the brain
  ipcMain.handle("llm:listLocal", async (_e, host) => {
    const models = llm.LOCAL_HOSTS.includes(host) && (await llm.listLocal(host)); // only ever asks Ollama or LM Studio
    return models ? { models, pick: llm.pickModel(models)?.id } : null;
  });
  // Look for a brain and use it: at first launch, after installing Ollama, and after a download (`prefer`).
  async function detectBrain(prefer) {
    const d = await llm.detect(prefer);
    db.setSettings({ provider: d.provider, baseUrl: d.baseUrl, model: d.model, detect: { models: d.models, small: d.small, ollama: d.ollama } });
    broadcast("settings", db.settings());
    return d;
  }
  ipcMain.handle("llm:detect", attempt(async (_e, prefer) => {
    const d = await detectBrain(typeof prefer === "string" ? prefer : undefined);
    return { provider: d.provider, model: d.model, ollama: d.ollama };
  }));
  // One download at a time, its progress sent to the window that asked (five times a second at most). Closing that
  // window stops it; so does llm:stopPull.
  let pulling = null;
  ipcMain.handle("llm:pull", async (e, name) => {
    if (pulling) return { ok: false, error: "A download is already running. Let it finish first." };
    const ac = (pulling = new AbortController());
    const stop = () => ac.abort();
    e.sender.once("destroyed", stop);
    let last = 0;
    const onProgress = (p) => {
      if (Date.now() - last < 200 || e.sender.isDestroyed()) return;
      last = Date.now();
      e.sender.send("pull", p);
    };
    try {
      await llm.pull(String(name || "").trim(), { signal: ac.signal, onProgress });
      return { ok: true };
    } catch (err) {
      return err.name === "AbortError" ? { ok: false, stopped: true } : { ok: false, error: err.message };
    } finally {
      pulling = null;
      if (!e.sender.isDestroyed()) e.sender.removeListener("destroyed", stop);
    }
  });
  ipcMain.handle("llm:stopPull", () => { pulling?.abort(); });
  ipcMain.handle("llm:test", attempt(async () => {
    const t0 = Date.now();
    const text = await llm.chat({ system: "You are a friend on an instant messenger. Reply with one short hello.",
      messages: [{ role: "user", content: "hi" }], maxTokens: 30 }, ctx.llmCfg());
    return { ms: Date.now() - t0, text };
  }));

  // ---- your day: each Check it reads its source now and says what buddies would be told.
  ipcMain.handle("calendar:check", attempt(async (_e, link) => {
    if (!calendar.links(link).length) throw new Error("Paste your calendar's secret iCal link first.");
    const events = await calendar.load(String(link), { fresh: true });
    const now = new Date(), today = calendar.today(events, now);
    return { events: events.length, today: today.length, says: calendar.sayDay(today, now) };
  }));
  ipcMain.handle("weather:check", attempt(async (_e, place) => {
    if (!String(place || "").trim()) throw new Error("Type your town, or your postal code.");
    return { says: weather.say(await weather.load(String(place).trim(), { fresh: true })) };
  }));
  ipcMain.handle("fieldy:check", attempt(async (_e, raw) => {
    if (!ctx.licensedTo()) throw new Error("Fieldy comes with Netpals Plus.");
    const key = String(raw || "").trim();
    if (!key) throw new Error("Paste your key from Developer Settings in the Fieldy app.");
    const [{ email }, list] = await Promise.all([fieldy.me(key), fieldy.load(key, { fresh: true })]);
    return { email, today: list.length, says: fieldy.say(list), local: llm.isLocal(db.settings()) };
  }));

  // ---- theme files. Loading checks every color before using any.
  ipcMain.handle("theme:save", async (e, theme) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: "my-netpals-theme.json", filters: FILTERS });
    if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(theme, null, 2));
    return !r.canceled;
  });
  ipcMain.handle("theme:load", async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ["openFile"], filters: FILTERS });
    if (r.canceled) return null;
    return attempt(() => {
      let t = {};
      try { t = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); } catch { /* checked below */ }
      if (!THEME_KEYS.every((k) => /^#[0-9a-f]{6}$/i.test(t[k]))) throw new Error("That file isn't a Netpals theme.");
      return { theme: { base: BASES.includes(t.base) ? t.base : "dialup", ...Object.fromEntries(THEME_KEYS.map((k) => [k, t[k].toLowerCase()])) } };
    })();
  });

  return { detectBrain };
};
