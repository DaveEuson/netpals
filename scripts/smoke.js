// Smoke test for a packaged build, on Windows or macOS:  node scripts/smoke.js <path to the Netpals executable>
//   Windows: dist/win-unpacked/Netpals.exe          macOS: dist/mac-arm64/Netpals.app/Contents/MacOS/Netpals
// Starts it against a throwaway data folder and the fake model, then checks that it signs on, every buddy comes
// online, nothing lands in the crash log, a second launch hands over and quits, and --reset-password works on a
// running copy. Exit code 1 if anything failed.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const exe = path.resolve(process.argv[2] || "");
if (!fs.existsSync(exe)) { console.log(`No app at ${exe}`); process.exit(1); }
process.env.NETPALS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "netpals-smoke-"));
const db = require("../lib/db");
const fakeModel = require("../tests/fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { for (let t = 0; t < ms; t += 500) { if (fn()) return true; await sleep(500); } return false; }
let launches = 0;
const launch = (...args) => { // SMOKE_LOGS=<folder> keeps each launch's own output there
  const logs = process.env.SMOKE_LOGS, out = logs ? fs.openSync(path.join(logs, `launch-${++launches}.log`), "w") : "ignore";
  return spawn(exe, args, { env: process.env, stdio: process.env.SMOKE_VERBOSE ? "inherit" : ["ignore", out, out] });
};
const exited = (p, ms) => new Promise((r) => { p.on("exit", (code) => r(code)); setTimeout(() => r("still running"), ms); });

(async () => {
  const server = await fakeModel.start();
  db.setSettings({ screenName: "smoke_test", passHash: "x:y", autoLogin: true, connected: true, provider: "local",
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: "fake:7b", chattiness: 0, sound: false, notify: false });
  const launched = Date.now();
  const first = launch();
  let firstExit = null;
  let secondAt = 0;
  first.on("exit", (code, signal) => { firstExit = `${code ?? signal}, ${secondAt ? `${Date.now() - secondAt} ms after the second launch` : "before the second launch"}`; });
  // A new database already lists everyone online; signing on takes them offline and back, so look for that.
  check(await until(() => db.buddies().every((b) => b.status === "online" && b.statusAt > launched), 45_000), "it signs on and all three buddies come online");
  check(firstExit === null, "and keeps running");
  const t0 = secondAt = Date.now();
  const code = await exited(launch(), 15_000);
  check(code === 0, `a second launch hands over and quits (${code}, ${Date.now() - t0} ms)`);
  check(firstExit === null, `leaving the first one running${firstExit === null ? "" : ` (it exited: ${firstExit})`}`);
  const reset = await exited(launch("--reset-password"), 15_000);
  check(reset === 0 && (await until(() => db.settings().passHash === "", 5000)), "--reset-password clears the password on a running copy");
  const log = path.join(process.env.NETPALS_DATA, "netpals.log");
  check(!fs.existsSync(log), fs.existsSync(log) ? `the crash log has:\n${fs.readFileSync(log, "utf8")}` : "nothing in the crash log");
  first.kill();
  await exited(first, 5000);
  if (process.platform === "win32") spawn("taskkill", ["/IM", path.basename(exe), "/T", "/F"], { stdio: "ignore" });
  server.close();
  console.log(failed ? `${failed} FAILED` : "smoke test passed");
  process.exit(failed ? 1 : 0);
})();
