// welcome.js — first-launch setup in three steps: get a screen name, answer five quick questions, then see which brain auto-detect picked.
// Sign On checks the brain really answers, then signs you on with the password you just chose.
const s = window.api.settingsSync();
const local = s.provider === "local";
const where = (() => { try { return new URL(s.baseUrl).host; } catch { return s.baseUrl; } })();
const app = /:1234$/.test(where) ? "LM Studio" : "Ollama";

const n = s.detect?.models?.length ?? 0;
setText({
  legend: local ? "We found a brain for your buddies" : "No local brain found, so we went online",
  "brain-name": local ? `${app}, right here on this computer` : "OpenRouter, over the internet",
  "brain-where": local ? `${where} · ${n} model${n === 1 ? "" : "s"} found` : "Nothing answered on localhost:11434 or :1234.",
  model: s.model,
  why: s.detect?.small ? "No model 7B or bigger here, so this is the biggest you have. Buddies may sound a bit simple." : "Smallest instruct model 7B or bigger. Quick and still clever.",
  privacy: local ? "Nothing leaves this computer." : "Chats go to OpenRouter to be answered.",
});
$("ic-local").toggleAttribute("hidden", !local); // SVG has no .hidden property
$("ic-cloud").toggleAttribute("hidden", local);
$("why-label").hidden = $("why").hidden = !local;
$("key-row").hidden = local;

if (!local && s.hasEnvKey) {
  $("key").placeholder = "Using OPENROUTER_API_KEY from your environment";
  $("key-hint").textContent = "Leave it blank to keep using that key, or paste another.";
}

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

// Picking a different brain in Settings redraws this screen.
window.api.on("settings", (n) => { if (n.provider !== s.provider || n.model !== s.model || n.baseUrl !== s.baseUrl) location.reload(); });

$("pick").onclick = () => window.api.invoke("win:open", "settings");

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
  if (!local) {
    const key = $("key").value.trim();
    if (key) await window.api.invoke("settings:set", { apiKey: key });
    else if (!s.hasEnvKey) return say("Paste your OpenRouter key first.", "err");
  }
  $("signon").disabled = true;
  say(`Dialing ${local ? where : "OpenRouter"}…`);
  const r = await window.api.invoke("llm:test");
  const on = r.ok && (await window.api.invoke("account:signon", { password: $("y-pw").value }));
  if (on.ok) return window.api.invoke("win:close");
  $("signon").disabled = false;
  say(r.ok ? on.error : `Couldn't connect: ${r.error}`, "err");
};
