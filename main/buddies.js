// main/buddies.js — your buddies and talking to them: the list, adding, Randomize, Edit…, votes, IMs, saving a
// conversation, Buddy Chat, and what happens when a buddy's message arrives.
const fs = require("fs");
const { BrowserWindow, Notification, dialog, ipcMain } = require("electron");

module.exports = function buddies(ctx) {
  const { db, llm, prompts, attempt, broadcast, openWindow, wins } = ctx;

  // A buddy's message: every window hears it; if their IM window isn't in front, flash it and pop a notification.
  function onMessage(msg, buddy) {
    broadcast("message", { msg, buddy });
    if (msg.role === "buddy") ctx.blinkTray();
    const w = wins.get(`chat:${buddy.id}`);
    if (msg.role !== "buddy" || w?.isFocused()) return;
    w?.flashFrame(true);
    if (!db.settings().notify || !Notification.isSupported()) return;
    new Notification({ title: buddy.screenName, body: msg.text, silent: true }) // silent: the Buddy List plays the IM sound
      .on("click", () => openWindow("chat", { id: String(buddy.id) })).show();
  }

  // Ask for JSON twice before giving up; connection errors throw straight through with their own message.
  async function askJson(p) {
    for (let i = 0; i < 2; i++) {
      try { return prompts.parseJson(await llm.chat({ ...p, temperature: 1, maxTokens: 700 }, ctx.llmCfg())); }
      catch (e) { if (!(e instanceof SyntaxError || e instanceof TypeError)) throw e; }
    }
    throw new Error("The model's answer didn't make sense. Roll again?");
  }
  const taken = () => [...db.buddies().map((b) => b.screenName), db.settings().screenName].filter(Boolean); // yours too
  const ownProfile = async (b) => prompts.toBuddy({ ...b, profile: await askJson(prompts.writeProfile(b)) }).profile;
  const changed = (id, patch) => { db.updateBuddy(id, patch); broadcast("buddies"); };

  // ---- the list and Buddy Info
  ipcMain.handle("buddies:list", () => db.buddies());
  ipcMain.handle("buddies:unread", () => db.unreadCounts());
  ipcMain.handle("buddy:read", (_e, id) => { db.markRead(id); broadcast("read", id); ctx.blinkTray(); });
  ipcMain.handle("buddy:nudge", (_e, id, on) => changed(id, { nudge: on ? 1 : 0 }));
  ipcMain.handle("buddy:forget", (_e, id) => changed(id, { notes: "" }));
  ipcMain.handle("buddy:era", (_e, id, era) => { const b = db.buddy(id); if (b) changed(id, { era: prompts.toBuddy({ ...b, era }).era }); });
  ipcMain.handle("msg:vote", (_e, msgId, v) => {
    const r = db.vote(msgId, v);
    if (r?.chattiness !== undefined) broadcast("settings", db.settings());
    if (r) broadcast("buddies"); // profile meters
    return r;
  });

  // ---- adding and editing
  ipcMain.handle("buddy:canAdd", () => ctx.addBlocked());
  ipcMain.handle("buddy:randomize", attempt(async (_e, vibe) => {
    if (!ctx.licensedTo()) throw new Error("Randomize comes with Netpals Plus. Add your key in Setup, or build a buddy yourself.");
    const b = prompts.toBuddy(await askJson(prompts.randomBuddy(String(vibe).slice(0, 200))), taken());
    if (prompts.blankProfile(b)) b.profile = await ownProfile(b); // the preview should be complete
    return { buddy: b };
  }));
  ipcMain.handle("buddy:add", attempt((_e, raw) => {
    if (ctx.addBlocked()) throw new Error(ctx.addBlocked());
    const b = prompts.toBuddy(raw, taken());
    const id = db.addBuddy(b);
    broadcast("presence", { buddy: db.buddy(id), from: "offline" }); // new buddies sign on with a door sound
    // Left the profile blank? They write their own, in the background.
    if (prompts.blankProfile(b)) ownProfile(b).then((profile) => changed(id, { profile }), (e) => console.warn(`[netpals] no profile: ${e.message}`));
    return { id };
  }));
  // Edit… in Buddy Info: the Add form again, on one buddy. A blank profile keeps the old one.
  ipcMain.handle("buddy:update", attempt((_e, raw) => {
    const old = db.buddy(raw.id);
    if (!old) throw new Error("That buddy is gone.");
    const b = prompts.toBuddy(raw, taken().filter((n) => n.toLowerCase() !== old.screenName.toLowerCase()));
    changed(old.id, { name: b.name, screenName: b.screenName, emoji: b.emoji, era: b.era, personaPrompt: b.personaPrompt,
      cadenceWeight: b.cadenceWeight, nudge: b.nudge, profile: prompts.blankProfile(b) ? old.profile : b.profile });
  }));

  // ---- IMs
  ipcMain.handle("chat:load", (_e, id) => { const buddy = db.buddy(id); return buddy && { buddy, messages: db.lastMessages(id, 200) }; });
  ipcMain.handle("chat:send", attempt((_e, id, text) => {
    const buddy = db.buddy(id), said = String(text).trim().slice(0, 1000);
    if (!buddy || !said) return;
    broadcast("message", { msg: db.addMessage(id, "me", said), buddy });
    ctx.scheduler.reply(id); // the answer arrives as its own "message" event, after "typing"
  }));
  // Save a conversation as a text file, like an old IM log. Always through the save dialog: a page never picks the path.
  ipcMain.handle("chat:save", async (e, id) => {
    const b = db.buddy(id);
    if (!b) return false;
    const file = (await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: "Save conversation",
      defaultPath: `${b.screenName} ${new Date().toISOString().slice(0, 10)}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] })).filePath;
    if (!file) return false;
    const me = db.settings().screenName || "me";
    const who = (m) => (m.role === "me" ? me : m.role === "auto" ? `${b.screenName} (auto response)` : b.screenName);
    const picture = (m) => (m.file ? `${m.text ? " " : ""}[picture: ${m.file.replace(/^\d+-/, "")}]` : "");
    const lines = db.lastMessages(id, 1e6).map((m) => `[${new Date(m.ts).toLocaleString()}] ${who(m)}: ${m.text}${picture(m)}`);
    fs.writeFileSync(file, lines.join("\r\n") + "\r\n");
    return true;
  });

  // ---- Buddy Chat: one room. Who's in it is settings.chatRoom; its lines are messages with roomId 1.
  const roomLine = (msg) => broadcast("room", { msg });
  ipcMain.handle("room:load", () => { const s = db.settings(); return { members: s.chatRoom, buddies: db.buddies(), messages: db.roomMessages(200), me: s.screenName }; });
  ipcMain.handle("room:send", attempt((_e, text) => {
    const said = String(text).trim().slice(0, 1000);
    if (!said) return;
    roomLine(db.addRoomMessage("me", said));
    const room = db.settings().chatRoom || [];
    if (!db.buddies().some((b) => room.includes(b.id) && ["online", "idle"].includes(b.status))) {
      return void roomLine({ id: 0, role: "sys", text: "Nobody in the room is around right now.", ts: Date.now(), fromId: 0 }); // shown, not kept
    }
    ctx.scheduler.roomReply();
  }));
  ipcMain.handle("room:members", (_e, ids) => {
    const was = db.settings().chatRoom || [], now = [...new Set(ids.map(Number))].filter((id) => db.buddy(id));
    for (const id of now.filter((id) => !was.includes(id))) roomLine(db.addRoomMessage("sys", `${db.buddy(id).screenName} has entered the room.`, id));
    for (const id of was.filter((id) => !now.includes(id))) roomLine(db.addRoomMessage("sys", `${db.buddy(id)?.screenName || "someone"} has left the room.`, id));
    db.setSettings({ chatRoom: now });
    broadcast("settings", db.settings());
  });

  return { onMessage };
};
