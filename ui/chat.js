// chat.js — one IM window per buddy: the conversation, a typing indicator, and the box you type in.
// Buddy text goes in via textContent only. Opening or focusing the window marks the conversation read.
const id = Number(new URLSearchParams(location.search).get("id"));
let buddy = null;
let lastTs = 0;
const me = api.settingsSync().screenName || "Me";

const markRead = () => { if (document.hasFocus()) api.invoke("buddy:read", id); };

const statusLine = (b) => ({ away: `Away · ${b.statusText || "be right back"}`, idle: `Idle ${Math.max(1, Math.round((Date.now() - b.statusAt) / 60_000))}m`,
  offline: "Signed off" })[b.status] || `Online · since ${time(b.statusAt)}`;

function header(b) {
  buddy = b;
  document.title = `${b.screenName} - Instant Message`;
  setText({ title: `${b.screenName} · Instant Message`, emoji: b.emoji, sn: b.screenName, status: statusLine(b), "text-label": `Message to ${b.screenName}` });
}

// A time divider when the day changes or 30 minutes pass, like an IM log.
function add(m) {
  const log = $("log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  if (new Date(m.ts).toDateString() !== new Date(lastTs).toDateString() || m.ts - lastTs > 30 * 60_000) log.append(el("div", "stamp", stamp(m.ts)));
  lastTs = m.ts;
  const row = el("div", `msg ${m.role}`);
  const body = el("div", "body");
  const head = el("span", "head");
  if (m.role === "me") head.append(el("span", "when", time(m.ts)), " ", el("b", "", me));
  else head.append(el("b", "", m.role === "auto" ? `Auto response from ${buddy.screenName}` : buddy.screenName), " ", el("span", "when", time(m.ts)));
  body.append(head);
  if (m.file) { // the thumbnail arrives on its own, so a log full of pictures opens at once
    const img = el("img", "pic", null, { alt: m.file.replace(/^\d+-/, ""), title: "Open the picture" });
    api.invoke("pic:thumb", m.file).then((src) => { img.src = src; });
    img.onclick = () => api.invoke("file:open", m.file); body.append(img);
  }
  if (m.text) body.append(el("span", "text", faces(m.text)));
  row.append(body);
  if (m.role === "buddy") row.append(thumbs(m));
  log.append(row);
  if (atBottom || m.role === "me") log.scrollTop = log.scrollHeight;
}

// 👍 / 👎 on a buddy message. Clicking the pressed one again takes the vote back.
const THUMB = {
  up: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 5.5h2v5h-2z M3.5 10h5.2l1.5-4.2V5H7.3l.5-2.5c0-.7-.5-1-1-1L4.5 5v5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5h2v5h-2z M3.5 2h5.2l1.5 4.2V7H7.3l.5 2.5c0 .7-.5 1-1 1L4.5 7V2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
};
const LEVELS = ["Off", "Quiet", "Chatty", "Gabby", "Motormouth"];
function thumbs(m) {
  const box = el("div", "thumbs");
  const btn = (kind, v, label) => {
    const b = el("button", kind, null, { "aria-label": label, "aria-pressed": m.feedback === v });
    b.innerHTML = THUMB[kind];
    b.onclick = async () => {
      const r = await api.invoke("msg:vote", m.id, m.feedback === v ? 0 : v);
      if (!r) return;
      m.feedback = r.vote;
      for (const x of box.children) x.setAttribute("aria-pressed", String(x === b && r.vote !== 0));
      if (r.chattiness !== undefined) note(`Got it, that's three thumbs down today. Chattiness is turned down to ${LEVELS[r.chattiness]}.`, "notice");
    };
    return b;
  };
  box.append(btn("up", 1, "Thumbs up: more like this"), btn("down", -1, "Thumbs down: less like this"));
  return box;
}

function note(text, kind = "err") { // a line that's shown, not saved
  const row = el("div", `msg ${kind}`);
  row.append(el("span", "text", text));
  $("log").append(row);
  $("log").scrollTop = $("log").scrollHeight;
}

function typing(on) {
  $("typing").innerHTML = on ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10l1-3 5.5-5.5 2 2L5 9z M7.5 2.5l2 2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>' : "";
  if (on) $("typing").append(el("span", "", `${buddy.screenName} is typing…`));
}

async function send() {
  const text = $("text").value.trim();
  if (!text) return;
  $("text").value = "";
  const r = await api.invoke("chat:send", id, text);
  if (!r.ok) { $("text").value = text; note(`Couldn't save that: ${r.error}`); } // a full disk, say; your line stays in the box
  else chime("im-send");
}

api.on("message", ({ msg, buddy: b }) => { if (b.id !== id) return; header(b); add(msg); markRead(); });
api.on("presence", ({ buddy: b }) => { if (b.id === id) header(b); });
api.on("typing", ({ id: who, on }) => { if (who === id) typing(on); });
api.on("chat-error", ({ id: who, error }) => { if (who === id) note(`${buddy.screenName} couldn't answer: ${error}`); });
api.on("buddies", async () => { const r = await api.invoke("chat:load", id); if (!r) api.invoke("win:close"); else header(r.buddy); });

smileys($("text"), $("smile"), $("picker"));

// ---- pictures: the button opens a file dialog, or drop one on the window ----------------------
function sent(r) {
  if (!r || r.canceled) return;
  if (!r.ok) return note(r.error);
  chime("im-send");
  if (r.seen === false) note(`${r.model} can't see pictures, so ${buddy.screenName} only hears the file name. Pick a model that can in Setup, like gemma3.`, "notice");
}
$("pic").onclick = async () => sent(await api.invoke("chat:pick", id));
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) sent(await api.invoke("chat:sendFile", id, api.pathFor(f)));
});

$("send").onclick = send;
$("text").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
$("sn").onclick = $("info").onclick = () => api.invoke("win:open", "profile", { id: String(id) });
$("save").onclick = async () => { if (await api.invoke("chat:save", id)) note("Saved.", "notice"); };
window.addEventListener("focus", markRead);
setInterval(() => buddy && ($("status").textContent = statusLine(buddy)), 30_000);

api.invoke("chat:load", id).then((r) => {
  if (!r) return api.invoke("win:close");
  header(r.buddy);
  for (const m of r.messages) add(m);
  $("log").scrollTop = $("log").scrollHeight;
  markRead();
  $("text").focus();
});
