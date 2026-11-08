// settings.js — every change saves at once, so themes and colors preview live in all windows.
// Cancel (or the X) puts back whatever this window changed; OK just closes.
const orig = api.settingsSync(), s = { ...orig }, touched = new Set();
const OPENROUTER = "https://openrouter.ai/api/v1";
const TITLE = { dialup: "#0a50cc", pinstripe: "#d9d9d9", olive: "#5f7a2e", silver: "#c6c6d6", midnight: "#1c2c5e", bubblegum: "#b82c7a" }; // title bars are gradients; these are their middles
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
const [OLLAMA, LMSTUDIO] = s.localHosts, bare = (u) => u.replace(/^https?:\/\//, "");
$("server").append(new Option(`Ollama · ${bare(OLLAMA)}`, OLLAMA), new Option(`LM Studio · ${bare(LMSTUDIO)}`, LMSTUDIO));
for (const m of s.recommended) $("get-list").append(new Option(`${m.gb} GB, ${m.note}`, m.id));
function showProvider() {
  const local = s.provider === "local";
  $("p-local").checked = $("or-fields").hidden = local;
  $("p-or").checked = $("local-fields").hidden = !local;
  $("get-fields").hidden = !local || $("server").value !== OLLAMA; // LM Studio downloads models in its own window
  say("", "muted", "test-result"); // a result for the other brain would mislead
}
// The models on the chosen server; `prefer` (one just downloaded, maybe listed as name:latest) gets picked if it's there.
async function loadModels(prefer) {
  const host = $("server").value;
  const r = await api.invoke("llm:listLocal", host);
  const models = r?.models || [];
  $("model").replaceChildren(...models.map((m) => new Option(m.b ? `${m.id} (${m.b}B)` : m.id, m.id)));
  if (!models.length) return $("model").add(new Option(`nothing answering on ${bare(host)}`, ""));
  const want = models.find((m) => m.id === prefer || m.id === `${prefer}:latest`);
  $("model").value = want ? want.id : models.some((m) => m.id === s.model) ? s.model : r.pick || models[0].id;
  save({ baseUrl: `${host}/v1`, model: $("model").value });
}
$("p-local").onchange = () => { save({ provider: "local" }); showProvider(); loadModels(); };
$("p-or").onchange = () => { save({ provider: "openrouter", baseUrl: OPENROUTER, model: $("or-model").value.trim() }); showProvider(); };
$("server").onchange = () => { showProvider(); loadModels(); };
$("get").onclick = async () => {
  const name = $("get-name").value.trim();
  if (!name) return say("Pick a model from the list, or type one's name.", "err", "get-result");
  $("get").disabled = true; say("", "muted", "get-result");
  const r = await pullModel(name, $("get-bar"));
  $("get").disabled = false;
  if (!r.ok) return say(r.stopped ? "Stopped. Download it again to pick up where it left off." : r.error, r.stopped ? "muted" : "err", "get-result");
  await loadModels(name);
  say(`Downloaded. Your buddies run on ${$("model").value} now.`, "good", "get-result");
};
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
if (/Mac/.test(navigator.userAgent)) {
  $("dark-label").textContent = "Go dark automatically when macOS does";
  $("startup-label").textContent = "Start Netpals when you log in";
}
$("idle").value = s.autoAwayMinutes;
$("idle").onchange = () => save({ autoAwayMinutes: Number($("idle").value) });
const CHECKBOXES = { autologin: "autoLogin", startup: "startWithWindows", nudges: "nudges", dark: "darkWithSystem", ontop: "alwaysOnTop", sound: "sound", notify: "notify" };
for (const [id, key] of Object.entries(CHECKBOXES)) {
  $(id).checked = s[key];
  $(id).onchange = () => save({ [key]: $(id).checked });
}

// ---- calendar: saved when the link changes; Check it reads it now and shows what buddies are told
$("cal").value = s.calendarUrl;
$("cal").onchange = () => { save({ calendarUrl: $("cal").value.trim() }); say("", "muted", "cal-result"); };
$("cal-check").onclick = async () => {
  $("cal-check").disabled = true; say("Reading it…", "muted", "cal-result");
  const r = await api.invoke("calendar:check", $("cal").value);
  $("cal-check").disabled = false;
  if (!r.ok) return say(r.error, "err", "cal-result");
  say(r.today ? `It works. Buddies are told: "${r.says}"` : "It works. Nothing on it today, so buddies hear nothing yet.", "good", "cal-result");
};

// ---- Netpals Plus --------------------------------------------------------------------------
// Free gets Dial-Up, Pinstripe and Midnight. A key unlocks the other presets, custom colors and theme files (main gates buddies).
const FREE_THEMES = ["dialup", "pinstripe", "midnight"];
function showPlus() {
  $("plus-status").textContent = s.licensedTo ? `Licensed to ${s.licensedTo}. Thanks for supporting Netpals!`
    : "You're on the free version: 3 buddies and the Dial-Up, Pinstripe and Midnight themes. Plus adds unlimited buddies, Randomize and every theme.";
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

// ---- storage -------------------------------------------------------------------------------
const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
api.invoke("storage:get").then((u) => {
  const low = u.free < u.low;
  say(`Your IMs take ${size(u.chats)} and pictures ${size(u.pictures)}. ${size(u.free)} free on this disk.${low ? " That's getting low: Netpals needs a little room to keep saving." : ""}`,
    low ? "err" : "muted", "storage");
});
$("show-data").onclick = () => api.invoke("storage:open");

// ---- open / close --------------------------------------------------------------------------
// The title bar's X means Cancel here, not just close.
const x = document.querySelector(".tb-close");
x.removeAttribute("data-win");
$("cancel").onclick = x.onclick = async () => {
  await api.invoke("settings:set", Object.fromEntries([...touched].map((k) => [k, orig[k]])));
  api.invoke("win:close");
};
if (s.hasEnvKey) $("key").placeholder = "Using OPENROUTER_API_KEY from your environment";
$("server").value = s.baseUrl.startsWith(LMSTUDIO) ? LMSTUDIO : OLLAMA;
$("or-model").value = s.provider === "openrouter" ? s.model : "google/gemini-2.5-flash";
$("key").value = s.apiKey;
fillYou(s); fillQuiz(s);
showProvider();
showCustom();
showPlus();
if (s.provider === "local") loadModels();
