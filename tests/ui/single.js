// One Netpals at a time: a second launch hands over to the first and quits.
const { spawn } = require("child_process");
const t = require("../harness");
const { check, sleep, until } = t;
if (process.env.SECOND) { t.start(); } // the second copy: main.js should quit before doing anything
else {
  const main = t.start({ ...t.ACCOUNT });
  t.run(async () => {
    const list = await t.signedOn();
    list.minimize(); await sleep(300);
    const t0 = Date.now();
    const second = spawn(process.execPath, [__filename], { env: { ...process.env, SECOND: "1" } });
    const code = await new Promise((r) => { second.on("close", r); setTimeout(() => r("still running"), 15_000); });
    check(code === 0, `a second launch quits by itself (${code}, ${Date.now() - t0} ms)`);
    check(await until(() => !list.isMinimized() && list.isVisible(), 3000), "and brings the first one's Buddy List forward");
    check(require("electron").BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes("list.html")).length === 1, "still just one Buddy List");
  });
}
