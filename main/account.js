// main/account.js — you: your screen name and password, signing on (the dial-up, then your buddies), the Netpals Plus
// key, and going away by yourself when you leave the computer.
const crypto = require("crypto");
const { ipcMain, powerMonitor } = require("electron");

module.exports = function account(ctx) {
  const { db, license, attempt, broadcast, openWindow, wins } = ctx;

  // ---- Netpals Plus: free is 3 buddies (checked here) and two themes (checked in Setup); a key unlocks the rest.
  const licensedTo = (s = db.settings()) => { const l = license.verify(s.license); return l ? l.name || l.email || "you" : ""; };
  const addBlocked = () => (!licensedTo() && db.buddies().length >= license.FREE_BUDDIES
    ? `The free version holds ${license.FREE_BUDDIES} buddies. Add a Netpals Plus key in Setup to make room for more.` : "");
  ipcMain.handle("license:set", attempt((_e, key) => {
    if (!license.verify(key)) throw new Error("That key doesn't check out. Copy the whole thing from your receipt.");
    db.setSettings({ license: String(key).replace(/\s+/g, "") });
    return { name: licensedTo() };
  }));

  // ---- the password is kept only as a salted scrypt hash. It locks the Sign On window; it doesn't encrypt anything.
  const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) => `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString("hex")}`;
  const passwordOk = (pw, stored) => {
    const a = Buffer.from(hashPassword(pw, stored.split(":")[0])), b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  ipcMain.handle("account:save", attempt((_e, you) => {
    const screenName = String(you.screenName || "").trim();
    if (!/^[a-z][a-z0-9_ ]{2,15}$/i.test(screenName)) throw new Error("A screen name is 3 to 16 letters, numbers, spaces or underscores, starting with a letter.");
    if (db.buddies().some((b) => b.screenName.toLowerCase() === screenName.toLowerCase())) throw new Error("One of your buddies already has that screen name.");
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

  // ---- signing on: Sign On (or auto-login) opens Connecting, which reports back here when the dial-up is through.
  // A saved password means an empty box is fine; auto-login only works with a saved password, as in the old days.
  let signedOn = false; // your buddies sign on after you do
  const signOn = () => openWindow("connect");
  ipcMain.handle("account:signon", attempt((_e, { password = "", savePassword, autoLogin } = {}) => {
    const s = db.settings();
    if (!(s.savePassword && !password) && !passwordOk(password, s.passHash)) throw new Error("That password doesn't match. Try again?");
    if (savePassword !== undefined) db.setSettings({ savePassword: Boolean(savePassword || autoLogin), autoLogin: Boolean(autoLogin) });
    signOn();
  }));
  ipcMain.handle("connect:done", () => {
    openWindow("list");
    if (!signedOn) {
      ctx.scheduler.start();
      ctx.makeTray();
      setInterval(idleCheck, 30_000);
      ctx.diskCheck();
      setInterval(() => ctx.diskCheck(), 6 * 3600_000);
    }
    signedOn = true;
    db.setSettings({ connected: true });
    wins.get("connect")?.close();
  });

  // ---- away. Auto-away: no mouse or keyboard for a while and you're away, AIM-style; touch anything and you're back.
  // settings.autoAway remembers that Netpals set the away itself, so a restart in the middle still ends it.
  function idleCheck(idle = powerMonitor.getSystemIdleTime()) {
    const s = db.settings();
    if (!s.awayMessage && s.autoAwayMinutes && idle >= s.autoAwayMinutes * 60) {
      db.setSettings({ autoAway: true });
      ctx.scheduler.setAway("I am away from my computer right now.");
      broadcast("settings", db.settings());
    } else if (s.autoAway && idle < 60) {
      db.setSettings({ autoAway: false });
      ctx.scheduler.setAway("");
      broadcast("settings", db.settings());
    }
  }
  ipcMain.handle("away:set", (_e, text, minutes) => {
    db.setSettings({ autoAway: false });
    ctx.scheduler.setAway(text, Number(minutes) || 0);
    broadcast("settings", db.settings());
  });

  return { licensedTo, addBlocked, signOn, isSignedOn: () => signedOn, idleCheck };
};
