// main/storage.js — how much room Netpals takes and how much the disk has left. SQLite keeps everything on disk and
// reads only what a window shows, so memory doesn't grow with your history; the disk is what can fill up, mostly with
// pictures. Setup shows the numbers; when the disk gets low, a notification says so, at most once a day.
const fs = require("fs");
const path = require("path");
const { Notification, ipcMain, shell } = require("electron");

const LOW = 1e9; // warn under 1 GB free
const size = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
const folderSize = (dir) => { try { return fs.readdirSync(dir).reduce((n, f) => n + size(path.join(dir, f)), 0); } catch { return 0; } };
const gb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

module.exports = function storage({ db }) {
  const free = () => { try { const s = fs.statfsSync(db.dir); return s.bavail * s.bsize; } catch { return Infinity; } };
  const usage = () => ({
    chats: ["netpals.db", "netpals.db-wal", "netpals.db-shm"].reduce((n, f) => n + size(path.join(db.dir, f)), 0),
    pictures: folderSize(path.join(db.dir, "files")),
    free: free(),
    low: LOW,
  });

  let warnedOn = "";
  function diskCheck(left = free()) {
    if (left >= LOW) return false;
    const today = new Date().toDateString();
    if (warnedOn !== today && Notification.isSupported()) {
      warnedOn = today;
      new Notification({ title: "Your disk is almost full", body: `${gb(left)} left. Netpals needs a little room to keep saving your IMs.` }).show();
    }
    return true;
  }

  ipcMain.handle("storage:get", usage);
  ipcMain.handle("storage:open", () => shell.openPath(db.dir)); // for backups: the whole folder is your Netpals
  return { diskCheck, storageUsage: usage };
};
