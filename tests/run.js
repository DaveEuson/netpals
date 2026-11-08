// npm test — every check, each in its own throwaway data folder, the window tests against tests/fake-model.js.
//   npm test                     everything that needs no real model
//   npm test -- --live           also the parts that need Ollama on localhost:11434 (picture vision, Test it, a real ping)
//   npm test -- room settings    just those (names below); add --verbose to see everything a test printed
// Screenshots land in tests/out. Exit code 1 if anything failed, crashed or ran out of time.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const electron = require("electron"); // under node, this is the path to Electron's binary
const fakeModel = require("./fake-model");

const TESTS = [
  { name: "license", node: "unit/license.js" },
  { name: "calendar", node: "unit/calendar.js" },
  { name: "weather", node: "unit/weather.js" },
  { name: "scheduler", electron: "unit/scheduler.js", args: (live) => (live ? ["--live"] : []), timeout: 240 },
  { name: "account", electron: "ui/account.js", phases: ["setup", "signon", "auto", { phase: "reset", args: ["--reset-password"] }] },
  { name: "connect", electron: "ui/connect.js" },
  { name: "plus", electron: "ui/plus.js" },
  { name: "list", electron: "ui/list.js" },
  { name: "away", electron: "ui/away.js" },
  { name: "chat", electron: "ui/chat.js" },
  { name: "pictures", electron: "ui/pictures.js", timeout: 300 },
  { name: "room", electron: "ui/room.js" },
  { name: "settings", electron: "ui/settings.js" },
  { name: "models", electron: "ui/models.js" },
  { name: "your-day", electron: "ui/day.js" },
  { name: "polish", electron: "ui/polish.js" },
  { name: "single", electron: "ui/single.js" },
  { name: "security", electron: "ui/security.js" },
  { name: "stress", electron: "ui/stress.js", timeout: 600, only: true }, // long: run it by name
  { name: "screenshots", electron: "ui/screenshots.js", only: true }, // the README's pictures, into docs/images
];

const argv = process.argv.slice(2);
const live = argv.includes("--live"), verbose = argv.includes("--verbose");
const named = argv.filter((a) => !a.startsWith("--"));
const chosen = named.length ? TESTS.filter((t) => named.includes(t.name)) : TESTS.filter((t) => !t.only);

// Runs one process; resolves { code, out }. Kills the whole tree on timeout (Electron starts helpers).
function runOne(cmd, args, env, seconds) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: __dirname, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      out += `\nFAIL  ran out of time after ${seconds} s`;
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]); else child.kill("SIGKILL");
    }, seconds * 1000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

(async () => {
  const server = await fakeModel.start();
  const env = { NETPALS_TEST_MODEL: `http://127.0.0.1:${server.address().port}/v1`, NETPALS_TEST_OUT: path.join(__dirname, "out"), NETPALS_TEST_LIVE: live ? "1" : "0" };
  let failures = 0, passes = 0, skips = 0;
  for (const t of chosen) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), `netpals-test-${t.name}-`));
    const steps = t.phases || [null];
    const started = Date.now();
    let bad = 0;
    for (const phase of steps) {
      const step = typeof phase === "string" ? { phase } : phase || {}; // a phase name, or { phase, args } or { node }
      const [cmd, file] = step.node || t.node ? [process.execPath, step.node || t.node] : [electron, t.electron];
      const args = [file, ...(t.args ? t.args(live) : []), ...(step.args || [])];
      const { code, out } = await runOne(cmd, args, { ...env, NETPALS_DATA: data, PHASE: step.phase || "" }, t.timeout || 180);
      const lines = out.split(/\r?\n/);
      const results = lines.filter((l) => /^(PASS|FAIL|SKIP)\b/.test(l));
      passes += results.filter((l) => l.startsWith("PASS")).length;
      skips += results.filter((l) => l.startsWith("SKIP")).length;
      const failed = results.filter((l) => l.startsWith("FAIL")).length;
      bad += failed + (code !== 0 && !failed ? 1 : 0);
      const label = step.phase ? `${t.name}:${step.phase}` : t.name;
      if (verbose) console.log(out.trim());
      else for (const l of lines.filter((l) => /^(FAIL|SKIP)\b|^\[dialog\]/.test(l))) console.log(`  ${label}  ${l}`);
      if (code !== 0 && !failed) console.log(`  ${label}  FAIL  exited with code ${code}${verbose ? "" : `\n${out.trim().split(/\r?\n/).slice(-8).map((l) => `      ${l}`).join("\n")}`}`);
    }
    failures += bad;
    console.log(`${bad ? "FAIL" : "ok  "}  ${t.name.padEnd(10)} ${((Date.now() - started) / 1000).toFixed(1)} s`);
    fs.rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  server.close();
  console.log(`\n${passes} passed, ${failures} failed, ${skips} skipped${live ? "" : " (add --live for the parts that need a real model)"}`);
  process.exit(failures ? 1 : 0);
})();
