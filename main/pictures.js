// main/pictures.js — pictures you send a buddy: copied into the data folder, shown as thumbnails, and handed to the
// model shrunk to 1024px when it can see. PNG and JPEG only: that's what Electron's nativeImage decodes.
const path = require("path");
const fs = require("fs");
const { BrowserWindow, dialog, ipcMain, nativeImage, shell } = require("electron");

module.exports = function pictures(ctx) {
  const { db, llm, attempt } = ctx;
  const FILES = path.join(db.dir, "files");
  const shrink = (file, width) => {
    const i = nativeImage.createFromPath(path.join(FILES, file));
    return i.getSize().width > width ? i.resize({ width }) : i;
  };
  const thumbs = new Map(); // made when a window asks for one, then kept
  const thumb = (file) => {
    if (!thumbs.has(file)) thumbs.set(file, shrink(file, 260).toDataURL());
    return thumbs.get(file);
  };

  async function sendFile(id, src) {
    const buddy = db.buddy(id);
    if (!buddy || !/\.(png|jpe?g)$/i.test(src)) throw new Error("Pictures only: a png or jpg.");
    if (fs.statSync(src).size > 20e6) throw new Error("That picture is over 20 MB.");
    fs.mkdirSync(FILES, { recursive: true });
    const file = `${Date.now()}-${path.basename(src).replace(/[^\w.-]/g, "_")}`;
    fs.copyFileSync(src, path.join(FILES, file));
    ctx.broadcast("message", { msg: db.addMessage(id, "me", "", Date.now(), file), buddy });
    ctx.scheduler.reply(id);
    return { seen: await llm.canSee(ctx.llmCfg()), model: db.settings().model };
  }

  ipcMain.handle("pic:thumb", (_e, file) => thumb(path.basename(String(file))));
  ipcMain.handle("chat:sendFile", attempt((_e, id, src) => sendFile(id, String(src))));
  ipcMain.handle("chat:pick", attempt(async (e, id) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Send a picture", properties: ["openFile"],
      filters: [{ name: "Pictures", extensions: ["png", "jpg", "jpeg"] }] });
    return r.canceled ? { canceled: true } : sendFile(id, r.filePaths[0]);
  }));
  ipcMain.handle("file:open", (_e, file) => shell.openPath(path.join(FILES, path.basename(String(file)))));

  // What the scheduler hands the model: the picture as a JPEG data URL, or null when the model is known to be blind.
  const picture = async (file) => ((await llm.canSee(ctx.llmCfg())) === false ? null
    : `data:image/jpeg;base64,${shrink(file, 1024).toJPEG(80).toString("base64")}`);
  return { picture };
};
