// main/settings.js — Setup's side of things: reading and saving settings, the brain (model list, Test it), and
// theme files.
const fs = require("fs");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

const THEME_KEYS = ["win", "panel", "ink", "title", "accent", "them"]; // a theme file: { base, ...these six colors }
const BASES = ["dialup", "olive", "silver", "midnight", "bubblegum"];
const FILTERS = [{ name: "Netpals theme", extensions: ["json"] }];

module.exports = function settings(ctx) {
  const { db, llm, license, attempt, broadcast, wins } = ctx;

  // Windows read settings synchronously before they paint. hasEnvKey rides along: an OPENROUTER_API_KEY from the
  // environment changes what the key fields say.
  ipcMain.on("settings:getSync", (e) => {
    const s = db.settings();
    e.returnValue = { ...s, hasEnvKey: Boolean(process.env.OPENROUTER_API_KEY), licensedTo: ctx.licensedTo(s), buyUrl: license.BUY_URL };
  });
  ipcMain.handle("settings:set", (_e, patch) => {
    db.setSettings(patch);
    // An installed copy only: in development this would register electron.exe to start with Windows.
    if ("startWithWindows" in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: Boolean(patch.startWithWindows) });
    if ("alwaysOnTop" in patch) wins.get("list")?.setAlwaysOnTop(Boolean(patch.alwaysOnTop));
    broadcast("settings", db.settings());
  });

  // ---- the brain
  ipcMain.handle("llm:listLocal", async (_e, host) => {
    const models = await llm.listLocal(host);
    return models && { models, pick: llm.pickModel(models)?.id };
  });
  ipcMain.handle("llm:test", attempt(async () => {
    const t0 = Date.now();
    const text = await llm.chat({ system: "You are a friend on an instant messenger. Reply with one short hello.",
      messages: [{ role: "user", content: "hi" }], maxTokens: 30 }, ctx.llmCfg());
    return { ms: Date.now() - t0, text };
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

  return {};
};
