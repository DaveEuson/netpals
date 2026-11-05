// The app icon, drawn from the Buddy List's own speech-bubble mark:  npm run icon
// Writes assets/icon.png (256px, for windows in development) and assets/icon.ico (16, 32, 48 and 256px, each a PNG
// inside the .ico, for the installer and the .exe). Runs under Electron because Electron does the drawing.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "assets");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 16 16">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7be0"/><stop offset="1" stop-color="#0a3f9e"/></linearGradient></defs>
  <rect width="16" height="16" rx="3.2" fill="url(#g)"/>
  <path d="M2.5 4C2.5 3.2 3.2 2.5 4 2.5h8c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5H7.3l-3 2.8V11H4c-.8 0-1.5-.7-1.5-1.5z" fill="#FFD54A" stroke="#6b4300" stroke-width="0.6"/>
  <circle cx="5.6" cy="6.8" r="0.85" fill="#6b4300"/><circle cx="8" cy="6.8" r="0.85" fill="#6b4300"/><circle cx="10.4" cy="6.8" r="0.85" fill="#6b4300"/>
</svg>`;

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

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await w.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;background:transparent">${SVG}</body>`)}`);
  await new Promise((r) => setTimeout(r, 800));
  let big = await w.capturePage();
  if (big.isEmpty()) throw new Error("Nothing was drawn.");
  if (big.getSize().width !== 256) big = big.resize({ width: 256, height: 256, quality: "best" }); // display scaling
  fs.writeFileSync(path.join(OUT, "icon.png"), big.toPNG());
  const pngs = [16, 32, 48, 256].map((size) => ({ size, png: (size === 256 ? big : big.resize({ width: size, height: size, quality: "best" })).toPNG() }));
  fs.writeFileSync(path.join(OUT, "icon.ico"), ico(pngs));
  console.log(`wrote assets/icon.png and assets/icon.ico (${pngs.map((p) => p.size).join(", ")}px)`);
  app.exit(0);
});
