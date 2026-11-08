// welcome.js — first-launch setup in three steps: get a screen name, answer five quick questions, then see which brain auto-detect picked.
// Sign On checks the brain really answers, then signs you on with the password you just chose. When there's no good
// local brain, the brain step offers to download one into Ollama (or says where to get Ollama).
let s, local, claude, where;
const R = window.api.settingsSync().recommended[0]; // the model the download button gets

function draw() {
  s = window.api.settingsSync();
  local = s.provider === "local";
  claude = s.provider === "anthropic"; // only ever picked in Setup; its key lives there too
  where = (() => { try { return new URL(s.baseUrl).host; } catch { return s.baseUrl; } })();
  const app = /:1234$/.test(where) ? "LM Studio" : "Ollama";
  const n = s.detect?.models?.length ?? 0;
  setText({
    legend: local ? "We found a brain for your buddies" : claude ? "Your buddies run on Claude" : "No brain on this computer yet",
    "brain-name": local ? `${app}, right here on this computer` : claude ? "Claude, over the internet (optional)" : "OpenRouter, over the internet (optional)",
    "brain-where": local ? `${where} · ${n} model${n === 1 ? "" : "s"} found` : claude ? "Picked in Setup, with your Anthropic API key."
      : s.detect?.ollama ? "Ollama is running, but has no model that fits." : "Nothing answered on localhost:11434 or :1234.",
    model: s.model,
    why: s.detect?.small ? "No model 7B or bigger here, so this is the biggest you have. Buddies may sound a bit simple."
      : "Smallest instruct model 7B or bigger. Quick and still clever.",
    privacy: local ? "Nothing leaves this computer." : `Chats go to ${claude ? "Anthropic" : "OpenRouter"} to be answered.`,
    expect: local ? "Charming, a little dim. A model this size forgets, repeats itself and won't pass the Turing test. Bigger models help; OpenRouter helps more."
      : "Sharper than a local model; each message costs about a cent or less.",
  });
  $("ic-local").toggleAttribute("hidden", !local); // SVG has no .hidden property
  $("ic-cloud").toggleAttribute("hidden", local);
  $("why-label").hidden = $("why").hidden = !local;
  $("key-row").hidden = local || claude;
  if (!local && s.hasEnvKey) {
    $("key").placeholder = "Using OPENROUTER_API_KEY from your environment";
    $("key-hint").textContent = "Leave it blank to keep using that key, or paste another.";
  }

  // A download when Ollama is there but has nothing good, or where to get Ollama when it isn't. (LM Studio with a
  // small model gets neither: LM Studio downloads models in its own window.)
  const ollama = Boolean(s.detect?.ollama), want = (!local && !claude) || s.detect?.small;
  $("get").hidden = !want || (local && !ollama);
  $("buddy-block").hidden = $("rigmatch").hidden = !$("get").hidden; // no room for all three; the offer mentions RigMatch itself
  $("get-go").hidden = !ollama;
  $("get-ollama").hidden = $("get-look").hidden = ollama;
  $("get-go").textContent = `Download ${R.id}`;
  $("get-text").textContent = !ollama ? "Rather keep it free and private? Install Ollama, then press Look again and Netpals can download a model into it."
    : local ? `A bigger model makes sharper buddies. Netpals can download ${R.id} (${R.gb} GB) into Ollama for you.`
      : `Rather keep it free and private? Netpals can download ${R.id} (${R.gb} GB) into Ollama and use that instead.`;
}
draw();

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

// A different brain (picked in Setup, found, or just downloaded) redraws the brain step where you are.
const brain = (x) => JSON.stringify([x.provider, x.model, x.baseUrl, x.detect]);
window.api.on("settings", (n) => { if (brain(n) !== brain(s)) draw(); });

$("pick").onclick = () => window.api.invoke("win:open", "settings");

$("get-go").onclick = async () => {
  $("get-buttons").hidden = true; $("signon").disabled = true; say("");
  const r = await pullModel(R.id, $("get-bar"));
  $("get-buttons").hidden = false; $("signon").disabled = false;
  if (!r.ok) return say(r.stopped ? "Stopped. Download it again to pick up where it left off." : r.error, r.stopped ? "muted" : "err");
  const d = await window.api.invoke("llm:detect", R.id);
  say(d.provider === "local" ? `Downloaded. Your buddies run on ${d.model} now.` : "Downloaded, but Ollama didn't list it. Press Sign On to try anyway.", d.provider === "local" ? "good" : "err");
};
$("get-look").onclick = async () => {
  say("Looking…");
  const d = await window.api.invoke("llm:detect");
  say(d.provider === "local" ? `Found ${d.model}.` : d.ollama ? "Found Ollama. Now download a model for it." : "Still nothing. Is Ollama running?", d.provider === "local" || d.ollama ? "good" : "err");
};

let step = "you";
function go(to) {
  step = to;
  for (const id of ["you", "quiz", "brain"]) $(`step-${id}`).hidden = to !== id;
  $("door").hidden = to !== "brain"; $("back").hidden = to === "you";
  $("go").textContent = to === "brain" ? "Sign On" : "Next";
  say("");
}
fillYou(s); fillQuiz(s);
$("back").onclick = () => go(step === "brain" ? "quiz" : "you");
document.onkeydown = (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") $("signon").click(); };

$("signon").onclick = async () => {
  if (step === "you") {
    const you = readYou();
    if (you.mismatch) return say("The two passwords don't match.", "err");
    const saved = await window.api.invoke("account:save", you);
    return saved.ok ? go("quiz") : say(saved.error, "err");
  }
  if (step === "quiz") { await window.api.invoke("settings:set", { quiz: readQuiz() }); return go("brain"); }
  if (claude && !s.claudeKey && !s.hasEnvClaudeKey) return say("Add your Anthropic API key in Setup: Pick a different brain.", "err");
  if (!local && !claude) {
    const key = $("key").value.trim();
    if (key) await window.api.invoke("settings:set", { apiKey: key });
    else if (!s.hasEnvKey) return say(s.detect?.ollama ? "Download a model below, or paste an OpenRouter key." : "Get Ollama below, or paste an OpenRouter key.", "err");
  }
  $("signon").disabled = true;
  say(`Dialing ${local ? where : claude ? "Anthropic" : "OpenRouter"}…`);
  const r = await window.api.invoke("llm:test");
  const on = r.ok && (await window.api.invoke("account:signon", { password: $("y-pw").value }));
  if (on.ok) return window.api.invoke("win:close");
  $("signon").disabled = false;
  say(r.ok ? on.error : `Couldn't connect: ${r.error}`, "err");
};
