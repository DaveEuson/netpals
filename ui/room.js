// room.js — Buddy Chat: one room for everyone you tick. Your line goes to the room; one to three buddies answer in
// turn, sometimes one riffs on another. "X has entered the room" lines are kept like any other. Text goes in via
// textContent only.
let me = "Me", buddies = new Map(), members = new Set(), lastTs = 0;
const typing = new Set();

function add(m) {
  const log = $("log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  if (new Date(m.ts).toDateString() !== new Date(lastTs).toDateString() || m.ts - lastTs > 30 * 60_000) log.append(el("div", "stamp", stamp(m.ts)));
  lastTs = m.ts;
  const row = el("div", `msg ${m.role}`), body = el("div", "body");
  if (m.role === "sys") body.append(el("span", "text", m.text));
  else {
    const head = el("span", "head"), b = buddies.get(m.fromId);
    if (m.role === "me") head.append(el("span", "when", time(m.ts)), " ", el("b", "", me));
    else head.append(el("span", "", b?.emoji || "💬", { "aria-hidden": "true" }), " ", el("b", "", b?.screenName || "someone"), " ",
      el("span", "when", time(m.ts)));
    body.append(head, el("span", "text", faces(m.text)));
  }
  row.append(body);
  log.append(row);
  if (atBottom || m.role === "me") log.scrollTop = log.scrollHeight;
}

// Tick a buddy to invite them, untick to show them the door. Away or signed-off buddies can be in the room; they just don't talk.
function renderMembers() {
  $("members").replaceChildren(...[...buddies.values()].map((b) => {
    const label = el("label", `check${b.status === "offline" ? " off" : ""}`);
    const box = el("input", "", null, { type: "checkbox" });
    box.checked = members.has(b.id);
    box.onchange = () => { box.checked ? members.add(b.id) : members.delete(b.id); api.invoke("room:members", [...members]); };
    label.append(box, el("span", "", `${b.emoji} ${b.screenName}${b.status === "online" ? "" : ` (${b.status === "offline" ? "signed off" : b.status})`}`));
    return label;
  }));
}
const showTyping = () => { $("typing").textContent = typing.size ? `${[...typing].join(", ")} ${typing.size > 1 ? "are" : "is"} typing…` : ""; };
function sysLine(text) {
  const row = el("div", "msg sys");
  row.append(el("span", "text", text));
  $("log").append(row);
  $("log").scrollTop = $("log").scrollHeight;
}
async function send() {
  const text = $("text").value.trim();
  if (!text) return;
  $("text").value = "";
  const r = await api.invoke("room:send", text);
  if (!r.ok) { $("text").value = text; sysLine(`Couldn't save that: ${r.error}`); }
  else chime("im-send");
}

async function load() {
  const r = await api.invoke("room:load");
  me = r.me || "Me";
  buddies = new Map(r.buddies.map((b) => [b.id, b]));
  members = new Set((r.members || []).filter((id) => buddies.has(id)));
  if (r.members === null) { // the first time ever, everyone who's around is in; an emptied room stays empty
    for (const b of r.buddies) if (b.status !== "offline") members.add(b.id);
    if (members.size) api.invoke("room:members", [...members]);
  }
  renderMembers();
  $("log").replaceChildren(); lastTs = 0;
  for (const m of r.messages) add(m);
  $("log").scrollTop = $("log").scrollHeight;
}

api.on("room", ({ msg }) => { add(msg); if (msg.role === "buddy") chime("im"); });
api.on("room-typing", ({ buddy, on }) => { typing[on ? "add" : "delete"](buddy.screenName); showTyping(); });
api.on("presence", ({ buddy }) => { buddies.set(buddy.id, buddy); renderMembers(); });
api.on("buddies", load);
api.on("chat-error", ({ id, error }) => { const b = buddies.get(id); if (b && members.has(id)) sysLine(`${b.screenName} couldn't answer: ${error}`); });
smileys($("text"), $("smile"), $("picker"));
$("send").onclick = send;
$("text").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
load().then(() => $("text").focus());
