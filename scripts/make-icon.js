// Every icon and installer picture, drawn from the Buddy List's own speech-bubble mark:  npm run icon
//   assets/icon.png (512px: windows in development, and electron-builder makes the macOS .icns from it)
//   assets/icon.ico (16, 32, 48, 256px: the Windows .exe and installer)
//   assets/tray.ico, assets/tray-new.ico (16, 32px)       the Windows tray icon, and the one it blinks to while IMs wait
//   assets/trayTemplate.png, tray-newTemplate.png (+@2x)  the macOS menu bar icons: black silhouettes macOS tints itself
//   build/sidebar.bmp (164x314), build/header.bmp (150x57) the installer wizard's pictures (NSIS wants plain BMP)
// Runs under Electron because Electron does the drawing.
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUBBLE = '<path d="M2.5 4C2.5 3.2 3.2 2.5 4 2.5h8c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5H7.3l-3 2.8V11H4c-.8 0-1.5-.7-1.5-1.5z" fill="#FFD54A" stroke="#6b4300" stroke-width="0.6"/>' +
  '<circle cx="5.6" cy="6.8" r="0.85" fill="#6b4300"/><circle cx="8" cy="6.8" r="0.85" fill="#6b4300"/><circle cx="10.4" cy="6.8" r="0.85" fill="#6b4300"/>';
const BLUE = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7be0"/><stop offset="1" stop-color="#0a3f9e"/></linearGradient></defs>';
const tile = (badge = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${BLUE}<rect width="16" height="16" rx="3.2" fill="url(#g)"/>${BUBBLE}${badge}</svg>`;
const NEW = '<circle cx="12.8" cy="3.2" r="3" fill="#e0321c" stroke="#fff" stroke-width="0.8"/>';
// macOS template icons: black on transparent, outline when quiet and solid while an IM waits.
const MONO = (filled) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2.5 4C2.5 3.2 3.2 2.5 4 2.5h8c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5H7.3l-3 2.8V11H4c-.8 0-1.5-.7-1.5-1.5z" fill="${filled ? "#000" : "none"}" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/>${filled ? "" : '<circle cx="5.6" cy="6.8" r="0.9" fill="#000"/><circle cx="8" cy="6.8" r="0.9" fill="#000"/><circle cx="10.4" cy="6.8" r="0.9" fill="#000"/>'}</svg>`;
// The wizard sidebar: the mark on the title-bar blue, the wordmark, and a tagline, in Tahoma like the app.
const SIDEBAR = `<div style="width:164px;height:314px;margin:0;background:linear-gradient(180deg,#3c86f2 0%,#0d5bd8 14%,#0a50cc 70%,#0842ad 100%);font-family:Tahoma,Verdana,sans-serif;color:#fff;position:relative;overflow:hidden">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="position:absolute;left:42px;top:34px;width:80px;height:80px">${BUBBLE}</svg>
  <div style="position:absolute;left:0;right:0;top:126px;text-align:center;font:italic bold 30px 'Trebuchet MS',Tahoma,sans-serif;letter-spacing:-0.5px">Netpals</div>
  <div style="position:absolute;left:14px;right:14px;top:170px;text-align:center;font-size:11px;line-height:1.5;color:#dfe8ff">Your buddies are warming up the modem.</div>
  <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:10px;color:#9fb8ee;letter-spacing:2px">~*~*~*~</div>
</div>`;
// The header strip on the inner pages: the mark on the window beige.
const HEADER = `<div style="width:150px;height:57px;margin:0;background:#ece9d8;position:relative"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style="position:absolute;right:12px;top:10px;width:38px;height:38px">${BUBBLE}</svg></div>`;

// Draw any HTML at an exact pixel size, whatever the display scaling.
async function draw(html, width, height, transparent) {
  const w = new BrowserWindow({ width, height, show: false, frame: false, transparent, webPreferences: { offscreen: true } });
  await w.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;overflow:hidden;background:${transparent ? "transparent" : "#fff"}">${html}</body>`)}`);
  await new Promise((r) => setTimeout(r, 700));
  let img = await w.capturePage();
  w.destroy();
  if (img.isEmpty()) throw new Error("Nothing was drawn.");
  const got = img.getSize();
  return got.width === width && got.height === height ? img : img.crop({ x: 0, y: 0, width: Math.min(width, got.width), height: Math.min(height, got.height) });
}
const svgAt = (svg, px) => svg.replace("<svg ", `<svg width="${px}" height="${px}" style="display:block" `); // block: no baseline gap under it

// An .ico is a 6-byte header, a 16-byte entry per image, then the images. Windows has read PNG entries since Vista.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = size % 256; // 0 means 256
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.png)]);
}
// A 24-bit bottom-up BMP, the one picture format NSIS reads.
function bmp(img) {
  const { width, height } = img.getSize(), src = img.toBitmap(); // BGRA, top-down
  const row = (width * 3 + 3) & ~3, size = row * height, out = Buffer.alloc(54 + size);
  out.write("BM", 0); out.writeUInt32LE(54 + size, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18); out.writeInt32LE(height, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(size, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4, o = 54 + (height - 1 - y) * row + x * 3; out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; }
  return out;
}

app.on("window-all-closed", () => {}); // each drawing closes its window; that mustn't end the app
app.whenReady().then(async () => {
  const out = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); console.log("wrote", path.relative(ROOT, p)); };
  const sizes = async (svg, list) => { const out = []; for (const size of list) out.push({ size, png: (await draw(svgAt(svg, size), size, size, true)).toPNG() }); return out; }; // one at a time: parallel loads fail
  out(path.join(ROOT, "assets", "icon.png"), (await draw(svgAt(tile(), 512), 512, 512, true)).toPNG());
  out(path.join(ROOT, "assets", "icon.ico"), ico(await sizes(tile(), [16, 32, 48, 256])));
  out(path.join(ROOT, "assets", "tray.ico"), ico(await sizes(tile(), [16, 32])));
  out(path.join(ROOT, "assets", "tray-new.ico"), ico(await sizes(tile(NEW), [16, 32])));
  for (const [name, svg] of [["trayTemplate", MONO(false)], ["tray-newTemplate", MONO(true)]]) {
    out(path.join(ROOT, "assets", `${name}.png`), (await draw(svgAt(svg, 16), 16, 16, true)).toPNG());
    out(path.join(ROOT, "assets", `${name}@2x.png`), (await draw(svgAt(svg, 32), 32, 32, true)).toPNG());
  }
  out(path.join(ROOT, "build", "sidebar.bmp"), bmp(await draw(SIDEBAR, 164, 314, false)));
  out(path.join(ROOT, "build", "header.bmp"), bmp(await draw(HEADER, 150, 57, false)));
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
