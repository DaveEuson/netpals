// main/windows.js — every window: its size, where you left it, the color it opens with, and broadcast(), the one
// way to tell all of them something. Closing the Buddy List only hides it until you sign off.
const path = require("path");
const { app, BrowserWindow, nativeTheme, screen } = require("electron");

const ROOT = path.join(__dirname, "..");
const SIGNED_OFF = "--signed-off"; // started again by Sign Off: Sign On, even with auto-login
const SECRETS = ["apiKey", "claudeKey", "fieldyKey", "calendarUrl", "passHash", "license"];
const EDITORS = ["settings", "welcome"]; // the windows that edit those
// [width, height, resizable]
const SIZE = {
  welcome: [440, 680], signon: [280, 470], list: [260, 560, true], chat: [460, 480, true], settings: [420, 660],
  away: [340, 440], addbuddy: [400, 640], profile: [300, 520], connect: [360, 230], room: [520, 480, true],
};

module.exports = function windows(ctx) {
  const { db } = ctx;
  const wins = new Map(); // "list" | "settings" | "chat:3" -> BrowserWindow
  let quitting = false;
  app.on("before-quit", () => { quitting = true; });

  // Main only needs the theme for the background a window shows before its page paints.
  const isDark = (s) => (s.darkWithSystem && nativeTheme.shouldUseDarkColors) || s.theme === "midnight";
  // Where you left this kind of window last time, if that spot is still on a screen.
  const onScreen = (b) => b && screen.getAllDisplays().some(({ workArea: a }) =>
    b.x >= a.x - 20 && b.y >= a.y && b.x < a.x + a.width - 60 && b.y < a.y + a.height - 60);

  function openWindow(kind, query = {}) {
    const key = kind + (query.id ? `:${query.id}` : "");
    if (wins.has(key)) {
      const w = wins.get(key);
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      return w;
    }
    const s = db.settings();
    const [width, height, resizable = false] = SIZE[kind];
    const w = new BrowserWindow({
      width, height, resizable, minWidth: Math.min(width, 220), minHeight: Math.min(height, 360), frame: false, show: false,
      icon: path.join(ROOT, "assets", "icon.png"), backgroundColor: isDark(s) ? "#1f2433" : s.theme === "pinstripe" ? "#ececec" : "#ece9d8",
      alwaysOnTop: kind === "list" && s.alwaysOnTop, webPreferences: { preload: path.join(ROOT, "preload.js") },
    });
    const b = s.bounds?.[kind];
    if (onScreen(b)) { // set after making it: sizes passed to the constructor come out a few px off
      w.setPosition(b.x, b.y);
      if (resizable) w.setContentSize(b.width, b.height);
    }
    // A window only ever shows its own page: a file dropped outside an IM window, a link, or a script can't send it
    // somewhere else (where the page would keep the api bridge), and nothing opens windows but openWindow.
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.loadFile(path.join(ROOT, "ui", `${kind}.html`), { query });
    w.once("ready-to-show", () => w.show());
    w.on("closed", () => { wins.delete(key); if (!quitting) ctx.onClosed?.(kind); });
    w.on("close", (e) => {
      // The content size round-trips; the outer size would grow a few px every time.
      db.setSettings({ bounds: { ...db.settings().bounds, [kind]: w.getContentBounds() } });
      if (kind === "list" && !quitting) { e.preventDefault(); w.hide(); } // it lives on in the tray
    });
    wins.set(key, w);
    return w;
  }

  // Settings that unlock something (the OpenRouter, Claude and Fieldy keys, the calendar's secret link, the Plus key)
  // and the password's hash go only to the two windows that edit them: Setup and the setup wizard. Every other window
  // gets settings without them, so a page that goes wrong has nothing to give away. key: a wins key ("chat:3").
  const forWindow = (key, s) => (EDITORS.includes(String(key).split(":")[0]) ? s : Object.fromEntries(Object.entries(s).filter(([k]) => !SECRETS.includes(k))));
  const keyOf = (webContents) => [...wins].find(([, w]) => !w.isDestroyed() && w.webContents === webContents)?.[0] || "";
  const broadcast = (channel, payload) => {
    for (const [key, w] of wins) if (!w.isDestroyed()) w.webContents.send(channel, channel === "settings" ? forWindow(key, payload) : payload);
  };
  // Sign Off starts Netpals over at Sign On (where you can pick another screen name); Exit just quits.
  const signOff = () => {
    quitting = true;
    app.relaunch({ args: [...process.argv.slice(1).filter((a) => a !== SIGNED_OFF && a !== "--reset-password"), SIGNED_OFF] });
    app.quit();
  };
  const exit = () => { quitting = true; app.quit(); };
  return { wins, openWindow, broadcast, forWindow, keyOf, signOff, exit, SIGNED_OFF };
};
