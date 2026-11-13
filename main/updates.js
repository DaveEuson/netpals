// main/updates.js — a newer Netpals, and reporting a problem. Once you're signed on, and then once a day, Netpals asks
// GitHub whether a newer version is out (Setup can turn that off). The Buddy List shows it until you get it or press
// Not now, which skips that version. Report a problem (Setup, the tray, and Help on a Mac) opens a new GitHub issue
// with the version, system and brain filled in.
const os = require("os");
const { ipcMain, shell } = require("electron");
const github = require("../lib/github");

const VERSION = require("../package.json").version; // app.getVersion() is Electron's own under the tests
const SYSTEM = { win32: "Windows", darwin: "macOS", linux: "Linux" };
const BRAIN = { local: "on this computer", openrouter: "OpenRouter", anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini" };

module.exports = function updates({ db, broadcast }) {
  let available = null; // { version, url } once a check finds one you haven't skipped
  async function updateCheck() {
    const s = db.settings();
    if (!s.checkUpdates) return null;
    const found = await github.update(VERSION);
    available = found && found.version !== s.updateSkipped ? found : null;
    if (available) broadcast("update", available);
    return available;
  }
  function reportProblem() {
    const s = db.settings();
    const system = `${SYSTEM[process.platform] || process.platform} ${process.getSystemVersion?.() || os.release()} ${process.arch}`;
    const brain = `${BRAIN[s.provider] || "none yet"}${s.model ? ` (${s.model})` : ""}`;
    shell.openExternal(github.issueUrl({ version: VERSION, system, brain }));
  }

  ipcMain.handle("update:get", () => available);
  ipcMain.handle("update:skip", () => {
    if (available) db.setSettings({ updateSkipped: available.version });
    available = null;
    broadcast("update", null);
  });
  ipcMain.handle("problem:report", () => reportProblem());
  return { updateCheck, reportProblem, VERSION };
};
