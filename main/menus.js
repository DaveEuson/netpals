// main/menus.js — every menu: the tray icon (the Buddy List closes to it, and it blinks while an IM waits), the
// macOS menu bar, and the right-click menu on a buddy.
const path = require("path");
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage } = require("electron");

const mac = process.platform === "darwin";
const icon = (file) => nativeImage.createFromPath(path.join(__dirname, "..", "assets", file));

module.exports = function menus(ctx) {
  const { db, openWindow, broadcast, wins } = ctx;

  // ---- tray. Windows gets the colored .ico; macOS gets black "Template" PNGs the menu bar tints itself.
  const ICON = { quiet: icon(mac ? "trayTemplate.png" : "tray.ico"), waiting: icon(mac ? "tray-newTemplate.png" : "tray-new.ico") };
  let tray = null, blink = null;
  function makeTray() {
    tray = new Tray(ICON.quiet);
    tray.setToolTip("Netpals");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Buddy List", click: () => openWindow("list") },
      { label: "Away…", click: () => openWindow("away") },
      { type: "separator" },
      { label: "Sign Off", click: () => ctx.signOff() },
      { label: "Exit", click: () => ctx.exit() },
    ]));
    tray.on("click", () => openWindow("list"));
  }
  // Blinks while any IM is unread; opening that IM window counts as reading it.
  function blinkTray() {
    const waiting = db.unreadCounts().length > 0;
    if (waiting && !blink) {
      let on = false;
      blink = setInterval(() => tray?.setImage((on = !on) ? ICON.waiting : ICON.quiet), 600);
    }
    if (!waiting && blink) { clearInterval(blink); blink = null; tray?.setImage(ICON.quiet); }
  }
  const trayState = () => ({ tray: Boolean(tray), blinking: Boolean(blink) });

  // ---- menu bar. macOS needs a real one (Cmd+C, Cmd+V and Cmd+Q live there). On Windows the windows draw their own
  // chrome, so there's no menu at all, which also retires Electron's default Ctrl+R and Ctrl+Shift+I.
  const after = (kind) => () => { if (ctx.isSignedOn()) openWindow(kind); };
  app.whenReady().then(() => Menu.setApplicationMenu(mac ? Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "editMenu" },
    { label: "Buddies", submenu: [
      { label: "Buddy List", accelerator: "Cmd+L", click: after("list") },
      { label: "Buddy Chat", accelerator: "Cmd+R", click: after("room") },
      { label: "Away…", accelerator: "Cmd+Shift+A", click: after("away") },
      { type: "separator" },
      { label: "Setup…", accelerator: "Cmd+,", click: after("settings") },
      { type: "separator" },
      { label: "Sign Off", click: () => { if (ctx.isSignedOn()) ctx.signOff(); } },
    ] },
    { role: "windowMenu" },
  ]) : null));
  app.on("activate", after("list")); // the Dock icon brings the Buddy List back

  // ---- right-click on a buddy
  ipcMain.handle("buddy:menu", (e, id) => {
    const b = db.buddy(id);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!b) return;
    const remove = async () => {
      const { response } = await dialog.showMessageBox(win, { type: "question", buttons: ["Remove", "Cancel"], defaultId: 1, cancelId: 1,
        message: `Remove ${b.screenName} from your Buddy List?`, detail: "Your IMs with them and what they remember about you go too." });
      if (response !== 0) return;
      wins.get(`chat:${id}`)?.close();
      db.removeBuddy(id);
      broadcast("buddies");
    };
    Menu.buildFromTemplate([
      { label: "Send IM", click: () => openWindow("chat", { id: String(id) }) },
      { label: "Get Info", click: () => openWindow("profile", { id: String(id) }) },
      { type: "separator" },
      { label: `Remove ${b.screenName}…`, click: remove },
    ]).popup({ window: win });
  });

  return { makeTray, blinkTray, trayState };
};
