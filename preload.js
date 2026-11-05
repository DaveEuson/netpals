// preload.js — the whole renderer<->main surface: invoke a channel, subscribe to one, or read settings
// synchronously (chrome.js needs them before first paint).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => { ipcRenderer.on(channel, (_e, ...args) => fn(...args)); },
  settingsSync: () => ipcRenderer.sendSync("settings:getSync"),
});
