// welcome.js — the setup wizard, on first launch and for each new screen name: a screen name, five quick questions, a
// brain, your day, and how it feels. The brain step checks what this computer can do and leans hard on OpenRouter or
// Claude when it's slow; its Next checks the brain really answers. Sign On at the end signs you on with the password you
// just chose. Choices save as you make them, and all of them are in Setup later.
const STEPS = ["you", "quiz", "brain", "day", "touches"];
const CHATTY = ["Never · nobody pings", "Quiet · about 2 a day", "Chatty · about 5 a day", "Gabby · about 10 a day", "Motormouth · about 20 a day"];
let s, local, claude, where;
let verdict = null, warned = false, choseOr = false;
const R = window.api.settingsSync().recommended[0]; // the model the download button gets
const set = (patch) => window.api.invoke("settings:set", patch);

// ---- the brain step -----------------------------------------------------------------------------
function draw() {
  s = window.api.settingsSync();
  local = s.provider === "local";
  claude = s.provider === "anthropic";
  where = (() => { try { return new URL(s.baseUrl).host; } catch { return s.baseUrl; } })();
  const app = /:1234$/.test(where) ? "LM Studio" : "Ollama";
  const n = s.detect?.models?.length ?? 0;
  setText({
    legend: local ? "We found a brain for your buddies" : claude ? "Your buddies run on Claude" : choseOr ? "Your buddies run on OpenRouter" : "No brain on this computer yet",
    "brain-name": local ? `${app}, right here on this computer` : claude ? "Claude, over the internet (optional)" : "OpenRouter, over the internet (optional)",
    "brain-where": local ? `${where} · ${n} model${n === 1 ? "" : "s"} found` : claude ? "With your Anthropic API key."
      : s.detect?.ollama ? "Ollama is running, but has no model that fits." : "Nothing answered on localhost:11434 or :1234.",
    model: s.model,
    why: s.detect?.small ? "No model 7B or bigger here, so this is the biggest you have. Buddies may sound a bit simple."
      : "Smallest instruct model 7B or bigger. Quick and still clever.",
    privacy: local ? "Nothing leaves this computer." : `Chats go to ${claude ? "Anthropic" : "OpenRouter"} to be answered.`,
    expect: local ? "Charming, a little dim. A model this size forgets, repeats itself and won't pass the Turing test. Bigger models help; OpenRouter helps more."
      : claude ? "The sharpest buddies. About a cent a message on Opus; pick Haiku in Setup for a fraction of that."
        : "Sharper than a local model; each message costs about a cent or less.",
  });
  $("b-local").checked = local; $("b-claude").checked = claude; $("b-or").checked = !local && !claude;
  $("ic-local").toggleAttribute("hidden", !local); // SVG has no .hidden property
  $("ic-cloud").toggleAttribute("hidden", local);
  $("why-label").hidden = $("why").hidden = !local;
  $("key-row").hidden = local || claude;
  $("claude-row").hidden = !claude;
  if (!local && s.hasEnvKey) {
    $("key").placeholder = "Using OPENROUTER_API_KEY from your environment";
    $("key-hint").textContent = "Leave it blank to keep using that key, or paste another.";
  } else if (s.apiKey) $("key").placeholder = "Saved. Paste another to change it.";
  $("claude-key").placeholder = s.claudeKey ? "Saved. Paste another to change it." : s.hasEnvClaudeKey ? "Using ANTHROPIC_API_KEY from your environment" : "sk-ant-…";

  // A download when Ollama is there but has nothing good, or where to get Ollama when it isn't. (LM Studio with a
  // small model gets neither: LM Studio downloads models in its own window.)
  const ollama = Boolean(s.detect?.ollama), want = (!local && !claude) || s.detect?.small;
  const weak = verdict && verdict.level !== "good" && verdict.level !== "ok";
  $("get").hidden = !want || (local && !ollama);
  $("rigmatch").hidden = !$("get").hidden; // the offer mentions RigMatch itself
  $("get-go").hidden = !ollama;
  $("get-ollama").hidden = $("get-look").hidden = ollama;
  $("get-go").textContent = `Download ${R.id}`;
  $("get-text").textContent = !ollama ? (weak ? "Would rather keep it on this computer anyway? Install Ollama, then press Look again."
    : "Rather keep it free and private? Install Ollama, then press Look again and Netpals can download a model into it.")
    : local ? `A bigger model makes sharper buddies. Netpals can download ${R.id} (${R.gb} GB) into Ollama for you.`
      : `Rather keep it free and private? Netpals can download ${R.id} (${R.gb} GB) into Ollama and use that instead.`;
}

// What this computer can do, from main: its memory and graphics, and how long the local model takes over one IM.
// When it's slow, the note turns red and OpenRouter and Claude get the Recommended tag.
let checking = "";
async function machineCheck() {
  const key = [s.provider, s.baseUrl, s.model].join("|");
  if (checking === key) return;
  checking = key;
  $("machine-text").textContent = local ? `Timing ${s.model} on this computer…` : "Checking what this computer can do…";
  const m = await window.api.invoke("machine:check");
  if (checking !== key) return; // the brain changed while it was timing
  verdict = m; warned = false;
  const weak = m.level === "poor" || m.level === "slow";
  $("machine-text").textContent = m.text;
  $("machine").classList.toggle("warn", weak);
  $("rec-local").hidden = m.level !== "good";
  $("rec-or").hidden = $("rec-claude").hidden = !weak;
  draw();
}

$("b-local").onchange = async () => {
  say("Looking on this computer…");
  const d = await window.api.invoke("llm:detect");
  if (d.provider === "local") return say(`Found ${d.model}.`, "good");
  draw();
  say(d.ollama ? "Ollama has no model that fits yet. Download one below." : "Nothing answered on this computer. Get Ollama below.", "err");
};
$("b-or").onchange = () => {
  choseOr = true;
  set({ provider: "openrouter", baseUrl: s.openrouter, model: s.provider === "openrouter" && s.model ? s.model : s.openrouterModel });
};
$("b-claude").onchange = () => set({ provider: "anthropic", baseUrl: "", model: claude ? s.model : s.claudeModels[0] });
$("claude-key").onchange = () => { const k = $("claude-key").value.trim(); if (k) set({ claudeKey: k }); };

$("get-go").onclick = async () => {
  $("get-buttons").hidden = true; $("signon").disabled = true; say("");
  const r = await pullModel(R.id, $("get-bar"));
  $("get-buttons").hidden = false; $("signon").disabled = false;
  if (!r.ok) return say(r.stopped ? "Stopped. Download it again to pick up where it left off." : r.error, r.stopped ? "muted" : "err");
  const d = await window.api.invoke("llm:detect", R.id);
  say(d.provider === "local" ? `Downloaded. Your buddies run on ${d.model} now.` : "Downloaded, but Ollama didn't list it. Press Next to try anyway.", d.provider === "local" ? "good" : "err");
};
$("get-look").onclick = async () => {
  say("Looking…");
  const d = await window.api.invoke("llm:detect");
  say(d.provider === "local" ? `Found ${d.model}.` : d.ollama ? "Found Ollama. Now download a model for it." : "Still nothing. Is Ollama running?", d.provider === "local" || d.ollama ? "good" : "err");
};

// Leaving the brain step: a key where one's needed, one warning when this computer is too slow, then a real hello.
async function leaveBrain() {
  if (claude) {
    const k = $("claude-key").value.trim();
    if (k) await set({ claudeKey: k });
    else if (!s.claudeKey && !s.hasEnvClaudeKey) return say("Paste your Anthropic API key, or pick another brain.", "err");
  } else if (!local) {
    const key = $("key").value.trim();
    if (key) await set({ apiKey: key });
    else if (!s.apiKey && !s.hasEnvKey) return say(s.detect?.ollama ? "Download a model below, or paste an OpenRouter key." : "Get Ollama below, or paste an OpenRouter key.", "err");
  }
  if (local && verdict?.level === "poor" && !warned) {
    warned = true;
    return say("This computer is too slow for buddies to feel right. Pick OpenRouter or Claude, or press Next again to keep it anyway.", "err");
  }
  $("signon").disabled = true;
  say(`Dialing ${local ? where : claude ? "Anthropic" : "OpenRouter"}…`);
  const r = await window.api.invoke("llm:test");
  $("signon").disabled = false;
  if (!r.ok) return say(`Couldn't connect: ${r.error}`, "err");
  go("day");
}

// ---- your day: saved once Check it says it works (Next checks anything not checked yet) ----------------------------
const DAY = [["cal", "calendar:check", "calendarUrl", (r) => (r.today ? told(r.says) : "It works. Nothing on it today, so buddies hear nothing yet.")],
  ["wx", "weather:check", "weatherPlace", (r) => told(r.says)]];
const told = (says) => `It works. Buddies are told: "${says}"`;
const checked = {};
async function checkDay([id, channel, key, ok]) {
  const v = $(id).value.trim();
  $(`${id}-check`).disabled = true; say("Checking…", "muted", `${id}-result`);
  const r = await window.api.invoke(channel, v);
  $(`${id}-check`).disabled = false;
  say(r.ok ? ok(r) : r.error, r.ok ? "good" : "err", `${id}-result`);
  if (r.ok) { checked[id] = v; await set({ [key]: v }); }
  return r.ok;
}
for (const part of DAY) {
  const [id, , key] = part;
  $(id).value = window.api.settingsSync()[key] || "";
  if ($(id).value) checked[id] = $(id).value;
  $(`${id}-check`).onclick = () => checkDay(part);
}
async function leaveDay() {
  for (const part of DAY) {
    const [id, , key] = part, v = $(id).value.trim();
    if (!v) { delete checked[id]; await set({ [key]: "" }); say("", "muted", `${id}-result`); } else if (checked[id] !== v && !(await checkDay(part))) return;
  }
  go("touches");
}

// ---- how it feels: each saves as it changes; Sign On takes auto-login with it ---------------------------------------
function fillTouches() {
  const t = window.api.settingsSync();
  CHATTY.forEach((label, i) => $("t-chat").add(new Option(label, i)));
  for (const id of ["t-qs", "t-qe"]) for (let h = 0; h < 24; h++) $(id).add(new Option(new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" }), h));
  for (const [id, key] of [["t-chat", "chattiness"], ["t-qs", "quietStart"], ["t-qe", "quietEnd"], ["t-theme", "theme"]]) {
    $(id).value = t[key];
    $(id).onchange = () => set({ [key]: id === "t-theme" ? $(id).value : Number($(id).value) });
  }
  for (const [id, key] of [["t-sound", "sound"], ["t-notify", "notify"], ["t-startup", "startWithWindows"]]) {
    $(id).checked = t[key];
    $(id).onchange = () => set({ [key]: $(id).checked });
  }
  $("t-auto").checked = t.autoLogin;
  if (/Mac/.test(navigator.userAgent)) $("t-startup-label").textContent = "Start Netpals when you log in";
  if (t.licensedTo) say(`Plus is on, for ${t.licensedTo}. Thanks!`, "good", "t-plus");
}
$("t-unlock").onclick = async () => {
  const r = await window.api.invoke("license:set", $("t-license").value);
  if (!r.ok) return say(r.error, "err", "t-plus");
  $("t-license").value = "";
  say(`Plus is on, for ${r.name}. Thanks!`, "good", "t-plus");
};

// Buddy rows are built with textContent: names and personas can be model-written.
window.api.invoke("buddies:list").then((list) => {
  $("buddy-count").textContent = `${list.length} ${list.length === 1 ? "buddy is" : "buddies are"} on your list`;
  for (const b of list) {
    const tag = b.personaPrompt.split(".")[0].replace(/^an?\s+/i, "").toLowerCase();
    const row = el("span", "buddy");
    row.append(el("span", "", b.emoji, { "aria-hidden": "true" }), el("b", "", b.screenName), el("span", "muted", `· ${tag}, ${b.era}`));
    $("buddies").append(row);
  }
});

async function signOn() {
  const auto = $("t-auto").checked;
  $("signon").disabled = true;
  const on = await window.api.invoke("account:signon", { password: $("y-pw").value, savePassword: auto, autoLogin: auto });
  if (on.ok) return window.api.invoke("win:close");
  $("signon").disabled = false;
  say(on.error, "err");
}

// ---- the steps ----------------------------------------------------------------------------------
let step = "you";
function go(to) {
  step = to;
  const i = STEPS.indexOf(to);
  for (const id of STEPS) $(`step-${id}`).hidden = to !== id;
  $("step-count").textContent = `Step ${i + 1} of ${STEPS.length}`;
  $("door").hidden = to !== "touches"; $("back").hidden = i === 0;
  $("go").textContent = to === "touches" ? "Sign On" : "Next";
  say("");
  if (to === "brain") machineCheck();
}
$("back").onclick = () => go(STEPS[STEPS.indexOf(step) - 1]);
document.onkeydown = (e) => {
  if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
  $({ cal: "cal-check", wx: "wx-check", "t-license": "t-unlock" }[e.target.id] || "signon").click();
};

$("signon").onclick = async () => {
  if (step === "you") {
    const you = readYou();
    if (you.mismatch) return say("The two passwords don't match.", "err");
    const saved = await window.api.invoke("account:save", you);
    return saved.ok ? go("quiz") : say(saved.error, "err");
  }
  if (step === "quiz") { await set({ quiz: readQuiz() }); return go("brain"); }
  if (step === "brain") return leaveBrain();
  if (step === "day") return leaveDay();
  return signOn();
};

// A different brain (picked here or in Setup, found, or just downloaded) redraws the brain step where you are.
const brain = (x) => JSON.stringify([x.provider, x.model, x.baseUrl, x.detect, Boolean(x.claudeKey), Boolean(x.apiKey)]);
window.api.on("settings", (n) => {
  if (brain(n) === brain(s)) return;
  draw();
  if (step === "brain") machineCheck();
});

// Other screen names on this computer: a way back to Sign On instead of making another.
window.api.invoke("account:list").then((r) => { $("have-one").hidden = !r?.names?.some((x) => x.dir !== r.current); }, () => {});
$("have-one").onclick = () => window.api.invoke("account:back");

const first = window.api.settingsSync();
fillYou(first); fillQuiz(first); fillTouches();
draw();
go("you");
