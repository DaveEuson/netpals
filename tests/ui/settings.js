// Setup: themes repaint every window live, custom colors, theme files, always on top, and Cancel putting it all back.
// With --live, also the local model list and Test it against Ollama (and OpenRouter, given OPENROUTER_API_KEY).
const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");
const t = require("../harness");
const { db, check, skip, js, sleep, until, click, text, open, snap, files, OUT } = t;
const key = t.plusKey("Settings Test");
const main = t.start({ ...t.ACCOUNT, license: key || "" });
const pick = (w, id, v) => js(w, `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change')); })()`);

t.run(async () => {
  const list = await t.signedOn();
  const before = db.settings(); // before Setup opens: opening it re-reads the model list
  const st = await open(main, "settings");

  if (t.LIVE) {
    db.setSettings({ baseUrl: "http://localhost:11434/v1" });
    await until(() => js(st, "document.getElementById('model').options.length > 1"), 5000);
    const opts = await js(st, "[...document.getElementById('model').options].map((o) => o.value)");
    check(opts.length > 1, `the local model list loads (${opts.length} models)`);
    await click(st, "test");
    await until(async () => /said hi|Couldn't/.test(await text(st, "test-result")), 120_000);
    check(/said hi/.test(await text(st, "test-result")), `Test it, local: ${await text(st, "test-result")}`);
    if (process.env.OPENROUTER_API_KEY) {
      await click(st, "p-or"); await sleep(300);
      check(db.settings().provider === "openrouter" && db.settings().model === "google/gemini-2.5-flash", "switching to OpenRouter saves the provider and its default model");
      await click(st, "test");
      await until(async () => /said hi|Couldn't/.test(await text(st, "test-result")), 60_000);
      check(/said hi/.test(await text(st, "test-result")), `Test it, OpenRouter: ${await text(st, "test-result")}`);
      await click(st, "p-local"); await sleep(1500);
    } else skip("OpenRouter's Test it (no OPENROUTER_API_KEY)");
  } else skip("the local model list and Test it (--live)");

  await pick(st, "theme", "midnight"); await sleep(400);
  check((await js(list, "document.documentElement.className")) === "th-midnight", "a theme change repaints the Buddy List at once");
  await snap(st, "settings-midnight.png");

  if (!key) skip("custom colors and theme files are Plus; this machine can't sign a key");
  else {
    await pick(st, "theme", "custom"); await sleep(400);
    const seeded = db.settings().customTheme;
    check(seeded?.base === "midnight" && seeded.win === "#1f2433" && seeded.title === "#1c2c5e", "a custom theme starts from the one on screen");
    await js(st, "(() => { const e = document.getElementById('c-title'); e.value = '#7a1fa2'; e.dispatchEvent(new Event('input')); })()"); await sleep(400);
    check((await js(list, "document.documentElement.style.getPropertyValue('--title')")).includes("#7a1fa2"), "dragging a color repaints the Buddy List's title bar");
    files.save = path.join(OUT, "saved-theme.json");
    await click(st, "save-theme"); await sleep(400);
    const saved = JSON.parse(fs.readFileSync(files.save, "utf8"));
    check(saved.title === "#7a1fa2" && saved.base === "midnight", "Save theme file writes the colors");
    files.open = path.join(OUT, "gift.json");
    fs.writeFileSync(files.open, JSON.stringify({ base: "bubblegum", win: "#FFF4D6", panel: "#ffffff", ink: "#3a2a10", title: "#d2691e", accent: "#8b4513", them: "#b22222" }));
    await click(st, "load-theme"); await sleep(500);
    check(db.settings().customTheme.title === "#d2691e" && (await js(st, "document.getElementById('c-win').value")) === "#fff4d6", "Load theme file applies a friend's theme");
    files.open = path.join(OUT, "bad.json");
    fs.writeFileSync(files.open, JSON.stringify({ win: "red" }));
    await click(st, "load-theme"); await sleep(400);
    check(/isn't a Netpals theme/.test(await text(st, "file-result")), "a file that isn't a theme is refused");
  }

  // Some desktops won't keep any window on top (Wallpaper Engine, some remote sessions): only judge the app where it can work.
  const probe = new BrowserWindow({ width: 100, height: 100, show: true, frame: false });
  probe.setAlwaysOnTop(true); await sleep(200);
  const canTop = probe.isAlwaysOnTop(); probe.destroy();
  await js(st, "document.getElementById('ontop').click()"); await sleep(500);
  if (canTop) check(list.isAlwaysOnTop(), "Keep on top applies to the Buddy List at once");
  else skip("Keep on top: this desktop won't keep any window on top right now");
  await pick(st, "qs", "21");
  await click(st, "cancel"); await sleep(800);
  const s = db.settings();
  check(s.theme === before.theme && JSON.stringify(s.customTheme) === JSON.stringify(before.customTheme) && s.quietStart === 22 && !s.alwaysOnTop && s.model === before.model && s.baseUrl === before.baseUrl, "Cancel puts every changed setting back");
  check((await js(list, "document.documentElement.className")) === "th-dialup" && !list.isAlwaysOnTop(), "and the Buddy List goes back with it");
});
