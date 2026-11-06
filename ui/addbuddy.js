// addbuddy.js — Randomize (the model invents a whole buddy from a one-line vibe) or Build your own.
// `api` is the global from preload.js (contextBridge makes it non-configurable, so it can't be redeclared).
let tab = "random";
let rolled = null; // the last randomized buddy, shown in the card
let blocked = ""; // why you can't add one: the free version is full
const editId = Number(new URLSearchParams(location.search).get("id")) || 0; // Buddy Info's Edit… opens this window on one buddy

const manual = () => ({
  name: $("m-name").value, screenName: $("m-sn").value, emoji: $("m-emoji").value, era: $("m-era").value,
  personaPrompt: $("m-persona").value, cadenceWeight: Number($("m-cad").value) / 10, nudge: $("m-nudge").checked,
  profile: { quote: $("m-quote").value, listening: $("m-listen").value, link: $("m-link").value },
});
const ready = () => (editId || !blocked) && (tab === "random" ? Boolean(rolled) : ["m-name", "m-sn", "m-persona"].every((id) => $(id).value.trim()));
const sync = () => { $("ok").disabled = !ready(); };

function show(t) {
  tab = t;
  for (const k of ["random", "manual"]) { $(`tab-${k}`).setAttribute("aria-selected", String(t === k)); $(k).hidden = t !== k; }
  say(editId ? "" : blocked, "err");
  sync();
}

function fill(b) {
  setText({
    "c-emoji": b.emoji, "c-sn": b.screenName, "c-who": `${b.name} · from ${b.era}`, "c-persona": b.personaPrompt,
    "c-quote": b.profile.quote ? `“${b.profile.quote}”` : "", "c-listen": b.profile.listening, "c-link": b.profile.link,
    "c-nudge": b.nudge ? "Checks in if you leave them hanging." : "Gives you space if you go quiet.",
  });
  $("card").hidden = false;
}

$("roll").onclick = async () => {
  const vibe = $("vibe").value.trim() || $("vibe").placeholder;
  $("roll").disabled = true; say("Rolling…");
  const r = await api.invoke("buddy:randomize", vibe);
  $("roll").disabled = false;
  if (!r.ok) return say(r.error, "err");
  fill(rolled = r.buddy);
  $("roll-label").textContent = "Roll again";
  show("random"); // clears "Rolling…", enables Add
};

$("ok").onclick = async () => {
  $("ok").disabled = true;
  const r = await api.invoke(editId ? "buddy:update" : "buddy:add", editId ? { id: editId, ...manual() } : tab === "random" ? rolled : manual());
  if (!r.ok) { sync(); return say(r.error, "err"); }
  api.invoke("win:close");
};

for (let y = 1997; y <= 2024; y++) $("m-era").add(new Option(String(y), String(y), false, y === 2003));
$("tab-random").onclick = () => show("random");
$("tab-manual").onclick = () => show("manual");
$("manual").oninput = sync;
$("vibe").onkeydown = (e) => { if (e.key === "Enter") $("roll").click(); };
if (editId) {
  api.invoke("chat:load", editId).then((r) => {
    if (!r) return api.invoke("win:close");
    const b = r.buddy, p = b.profile || {};
    document.title = `Edit ${b.screenName}`; $("title").textContent = document.title; $("ok").textContent = "Save"; $("tab-random").hidden = true;
    for (const [f, v] of [["m-name", b.name], ["m-sn", b.screenName], ["m-emoji", b.emoji], ["m-era", b.era], ["m-persona", b.personaPrompt], ["m-cad", Math.round(b.cadenceWeight * 10)], ["m-quote", p.quote || ""], ["m-listen", p.listening || ""], ["m-link", p.link || ""]]) $(f).value = v;
    $("m-nudge").checked = Boolean(b.nudge);
    show("manual"); $("m-name").focus();
  });
} else {
  // Randomize is a Plus thing, so the free version opens on Build your own.
  const plus = Boolean(api.settingsSync().licensedTo);
  if (!plus) $("tab-random").textContent = "Randomize · Plus";
  show(plus ? "random" : "manual");
  api.invoke("buddy:canAdd").then((why) => { blocked = why; show(tab); });
  $(plus ? "vibe" : "m-name").focus();
}
