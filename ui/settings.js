// settings.js — every change saves at once, so themes and colors preview live in all windows.
// Cancel (or the X) puts back whatever this window changed; OK just closes.
const orig = api.settingsSync(), s = { ...orig }, touched = new Set();
const OPENROUTER = "https://openrouter.ai/api/v1";
const TITLE = { dialup: "#0a50cc", olive: "#5f7a2e", silver: "#c6c6d6", midnight: "#1c2c5e", bubblegum: "#b82c7a" }; // title bars are gradients; these are their middles
const COLORS = [["win", "Window"], ["panel", "Panels"], ["ink", "Text"], ["title", "Title bar"], ["accent", "Links, icons"], ["them", "Buddy names"]];

const save = (patch) => { Object.assign(s, patch); Object.keys(patch).forEach((k) => touched.add(k)); return api.invoke("settings:set", patch); };

// ---- you -----------------------------------------------------------------------------------
// Checked and saved by main (the password goes in hashed). Cancel puts the old values, hash included, back.
$("y-pw").placeholder = $("y-pw2").placeholder = "leave blank to keep";
$("you").onchange = async () => {
  const you = readYou();
  if (you.mismatch) return say($("y-pw2").value ? "The two passwords don't match." : "Type the new password again under Confirm.", "err", "you-result");
  const r = await api.invoke("account:save", you);
  if (!r.ok) return say(r.error, "err", "you-result");
  for (const k of ["screenName", "age", "gender", "about", "passHash"]) touched.add(k);
  say(you.password ? "Saved, with your new password." : "Saved.", "good", "you-result");
};
$("quiz").onchange = () => { save({ quiz: readQuiz() }); say("Saved.", "good", "you-result"); };

// ---- brain ---------------------------------------------------------------------------------
function showProvider() {
  const local = s.provider === "local";
  $("p-local").checked = $("or-fields").hidden = local;
  $("p-or").checked = $("local-fields").hidden = !local;
  say("", "muted", "test-result"); // a result for the other brain would mislead
}
async function loadModels() {
  const port = $("server").value;
  const r = await api.invoke("llm:listLocal", `http://localhost:${port}`);
  const models = r?.models || [];
  $("model").replaceChildren(...models.map((m) => new Option(m.b ? `${m.id} (${m.b}B)` : m.id, m.id)));
  if (!models.length) return $("model").add(new Option(`nothing answering on :${port}`, ""));
  $("model").value = models.some((m) => m.id === s.model) ? s.model : r.pick || models[0].id;
  save({ baseUrl: `http://localhost:${port}/v1`, model: $("model").value });
}
$("p-local").onchange = () => { save({ provider: "local" }); showProvider(); loadModels(); };
$("p-or").onchange = () => { save({ provider: "openrouter", baseUrl: OPENROUTER, model: $("or-model").value.trim() }); showProvider(); };
$("server").onchange = loadModels;
$("model").onchange = () => { save({ model: $("model").value }); say("", "muted", "test-result"); };
$("or-model").onchange = () => save({ model: $("or-model").value.trim() || "google/gemini-2.5-flash" });
$("key").onchange = () => save({ apiKey: $("key").value.trim() });
$("test").onclick = async () => {
  $("test").disabled = true; say("Dialing…", "muted", "test-result");
  const r = await api.invoke("llm:test");
  $("test").disabled = false;
  say(r.ok ? `${s.model} said hi in ${(r.ms / 1000).toFixed(1)} s` : `Couldn't connect: ${r.error}`, r.ok ? "good" : "err", "test-result");
};

// ---- quiet hours ---------------------------------------------------------------------------
for (const id of ["qs", "qe"]) for (let h = 0; h < 24; h++) $(id).add(new Option(new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" }), h));
for (const [id, key] of [["qs", "quietStart"], ["qe", "quietEnd"]]) { $(id).value = s[key]; $(id).onchange = () => save({ [key]: Number($(id).value) }); }

// ---- look ----------------------------------------------------------------------------------
// A new custom theme starts from the preset on screen right now (read from the live CSS variables).
function seedCustom() {
  const base = TITLE[s.theme] ? s.theme : "dialup";
  const css = getComputedStyle(document.documentElement);
  const v = (k) => css.getPropertyValue(`--${k}`).trim().toLowerCase();
  return { base, win: v("win"), panel: v("panel"), ink: v("ink"), title: TITLE[base], accent: v("accent"), them: v("them") };
}
function showCustom() {
  $("theme").value = s.theme;
  $("custom").hidden = s.theme !== "custom";
  $("save-theme").disabled = s.theme !== "custom";
  for (const [k] of COLORS) $(`c-${k}`).value = s.customTheme?.[k] || "#000000";
}
$("colors").replaceChildren(...COLORS.map(([k, label]) => {
  const l = el("label", "check");
  const input = el("input", "", null, { type: "color", id: `c-${k}` });
  input.oninput = () => save({ customTheme: { ...s.customTheme, [k]: input.value } });
  l.append(input, el("span", "", label));
  return l;
}));
$("theme").onchange = () => {
  const theme = $("theme").value;
  save(theme === "custom" && !s.customTheme ? { theme, customTheme: seedCustom() } : { theme });
  showCustom();
};
$("load-theme").onclick = async () => {
  const r = await api.invoke("theme:load");
  if (!r?.ok) return r && say(r.error, "err", "file-result");
  await save({ theme: "custom", customTheme: r.theme });
  showCustom();
  say("Loaded.", "good", "file-result");
};
$("save-theme").onclick = async () => { if (await api.invoke("theme:save", s.customTheme)) say("Saved.", "good", "file-result"); };
for (const [id, key] of [["autologin", "autoLogin"], ["nudges", "nudges"], ["dark", "darkWithSystem"], ["ontop", "alwaysOnTop"], ["sound", "sound"], ["notify", "notify"]]) {
  $(id).checked = s[key];
  $(id).onchange = () => save({ [key]: $(id).checked });
}

// ---- Netpals Plus --------------------------------------------------------------------------
// Free gets Dial-Up and Midnight. A key unlocks the other presets, custom colors and theme files (main gates buddies).
const FREE_THEMES = ["dialup", "midnight"];
function showPlus() {
  $("plus-status").textContent = s.licensedTo ? `Licensed to ${s.licensedTo}. Thanks for supporting Netpals!`
    : "You're on the free version: 3 buddies and the Dial-Up and Midnight themes. Plus adds unlimited buddies, Randomize and every theme.";
  $("plus-entry").hidden = Boolean(s.licensedTo);
  $("plus-buy").hidden = !s.buyUrl || Boolean(s.licensedTo); $("buy").dataset.href = s.buyUrl;
  for (const o of $("theme").options) o.disabled = !s.licensedTo && !FREE_THEMES.includes(o.value);
  $("load-theme").disabled = !s.licensedTo;
}
$("unlock").onclick = async () => {
  const r = await api.invoke("license:set", $("license").value);
  if (!r.ok) return say(r.error, "err", "plus-result");
  s.licensedTo = r.name;
  showPlus();
  say("Unlocked. Enjoy!", "good", "plus-result");
};

// ---- open / close --------------------------------------------------------------------------
// The title bar's X means Cancel here, not just close.
const x = document.querySelector(".tb-close");
x.removeAttribute("data-win");
$("cancel").onclick = x.onclick = async () => {
  await api.invoke("settings:set", Object.fromEntries([...touched].map((k) => [k, orig[k]])));
  api.invoke("win:close");
};
if (s.hasEnvKey) $("key").placeholder = "Using OPENROUTER_API_KEY from your environment";
$("server").value = (s.baseUrl.match(/:(\d+)\//) || [])[1] === "1234" ? "1234" : "11434";
$("or-model").value = s.provider === "openrouter" ? s.model : "google/gemini-2.5-flash";
$("key").value = s.apiKey;
fillYou(s); fillQuiz(s);
showProvider();
showCustom();
showPlus();
if (s.provider === "local") loadModels();
