// profile.js — the AIM-style Buddy Info box: quote, listening to, fave link, what they remember, how often they ping.
const id = Number(new URLSearchParams(location.search).get("id"));
const STATUS = { online: "Online", idle: "Idle", away: "Away", offline: "Signed off" };

function render(b) {
  const p = b.profile || {};
  document.title = `Buddy Info: ${b.screenName}`;
  setText({
    title: `Buddy Info · ${b.screenName}`, emoji: b.emoji, sn: b.screenName, since: `${b.name} · ${b.era ? `lives in ${b.era}` : "lives in the present"}`,
    status: b.status === "away" ? `Away · ${b.statusText}` : STATUS[b.status] || "",
    quote: p.quote ? `“${p.quote}”` : "(still writing their profile…)", listen: p.listening || "—", link: p.link || "—",
    "mem-label": `What ${b.name} remembers`, notes: b.notes || "Nothing yet. They'll remember things you tell them.",
    "mem-count": `Kept on this computer only · ${b.notes.length} / 500`,
    often: b.cadenceWeight < 0.3 ? "rarely" : b.cadenceWeight < 0.6 ? "sometimes" : "often",
  });
  $("forget").hidden = !b.notes;
  $("nudge").checked = Boolean(b.nudge);
  eraOptions($("era"), b.era);
  const filled = Math.round(b.cadenceWeight * 5);
  $("meter").replaceChildren(...[1, 2, 3, 4, 5].map((i) => el("i", i <= filled ? "on" : "")));
}

const load = async () => { const r = await api.invoke("chat:load", id); if (r) render(r.buddy); else api.invoke("win:close"); };
api.on("buddies", load);
api.on("presence", ({ buddy }) => { if (buddy.id === id) render(buddy); });
api.on("message", ({ buddy }) => { if (buddy.id === id) render(buddy); }); // a reply may have added a memory
$("im").onclick = () => { api.invoke("win:open", "chat", { id: String(id) }); api.invoke("win:close"); };
$("nudge").onchange = () => api.invoke("buddy:nudge", id, $("nudge").checked);
$("era").onchange = () => api.invoke("buddy:era", id, $("era").value);
$("edit").onclick = () => { api.invoke("win:open", "addbuddy", { id: String(id) }); api.invoke("win:close"); };
$("forget").onclick = async () => { if (confirm("Clear everything this buddy remembers about you?")) await api.invoke("buddy:forget", id); };
load();
