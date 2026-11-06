// chrome.js — loaded in <head> of every window, before its own script. Paints the theme before first paint and holds
// what every window shares: the $ / el / say helpers, the <title-bar>, <rigmatch-note> and <you-form> elements,
// title-bar buttons (data-win="close|min") and external links (data-href, https only).
// A preset is a .th-<id> class from xp.css. A custom theme is six picked colors; its lines, banner, buttons and muted
// text are mixed from those six so it hangs together whatever base it started from. "Go dark with Windows" swaps in Midnight.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const say = (text, kind = "muted", id = "status") => { $(id).textContent = text; $(id).className = `small ${kind}`; };
const setText = (byId) => { for (const id in byId) $(id).textContent = byId[id]; };

// Defined here in <head>, so each element is filled in the moment the parser reaches it, before page scripts run.
const tag = (name, fill) => customElements.define(name, class extends HTMLElement { connectedCallback() { fill(this); } });
const MARK = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5C2 2.7 2.7 2 3.5 2h9c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H7l-3 3v-3h-.5C2.7 11 2 10.3 2 9.5z" fill="#FFD54A" stroke="#6b4300" stroke-width="1"/><circle cx="5.5" cy="6.5" r="1" fill="#6b4300"/><circle cx="8" cy="6.5" r="1" fill="#6b4300"/><circle cx="10.5" cy="6.5" r="1" fill="#6b4300"/></svg>';
const MIN = '<button class="tb-min" data-win="min" aria-label="Minimize"><svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 7.5h6" stroke="#fff" stroke-width="2"/></svg></button>';
const CLOSE = '<button class="tb-close" data-win="close" aria-label="Close"><svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 1l7 7M8 1L1 8" stroke="#fff" stroke-width="1.8"/></svg></button>';
// <title-bar min> : app mark, the page's <title> (in #title, so a window can rename itself), minimize if asked, close.
tag("title-bar", (e) => {
  e.className = "titlebar";
  e.innerHTML = `${MARK}<span class="t" id="title"></span>${e.hasAttribute("min") ? MIN : ""}${CLOSE}`;
  e.querySelector(".t").textContent = document.title;
});
tag("rigmatch-note", (e) => {
  e.className = "note";
  e.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7 6v4 M7 3.8v.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
    '<span>Buddies feel slow or dumb? <a data-href="https://github.com/DaveEuson/RigMatch">Run RigMatch</a> to find a model that fits your machine.</span>';
});
// <you-form>: your screen name, password and the A/S/L-style bits your buddies get to read. Setup and Settings share it.
tag("you-form", (e) => {
  e.innerHTML = `<label for="y-sn">Screen name</label><input id="y-sn" type="text" maxlength="16" spellcheck="false" autocomplete="off">
    <label for="y-pw">Password</label><input id="y-pw" type="password" autocomplete="new-password">
    <label for="y-pw2">Confirm</label><input id="y-pw2" type="password" autocomplete="new-password">
    <label for="y-age">Age</label><span><input id="y-age" type="number" min="13" max="120"><label for="y-gender">Gender</label>
    <input id="y-gender" type="text" list="y-genders" maxlength="30" placeholder="rather not say"></span>
    <datalist id="y-genders"><option>Woman</option><option>Man</option><option>Nonbinary</option></datalist>
    <label for="y-about">About you</label><textarea id="y-about" rows="3" maxlength="300" placeholder="A few lines your buddies can read, like an old profile."></textarea>`;
});
// <quiz-form>: five quick questions, the kind an old profile asked. Buddies bring the answers up now and then.
const QUIZ = [["work", "What do you do all day?", "school, a job, the couch"], ["into", "What are you into right now?", "music, games, a show, a hobby"],
  ["hours", "Night owl or early bird?", "night owl"], ["peeve", "Pet peeve?", "slow walkers, loud chewers"], ["bug", "What should your buddies bug you about?", "a goal, a habit, a project"]];
tag("quiz-form", (e) => { e.innerHTML = QUIZ.map(([k, q, hint]) => `<label for="q-${k}">${q}</label><input id="q-${k}" type="text" maxlength="120" autocomplete="off" placeholder="${hint}">`).join(""); });
const fillQuiz = (s) => QUIZ.forEach(([k]) => { $(`q-${k}`).value = s.quiz?.[k] || ""; });
const readQuiz = () => Object.fromEntries(QUIZ.map(([k]) => [k, $(`q-${k}`).value.trim().slice(0, 120)]));
const fillYou = (s) => { $("y-sn").value = s.screenName; $("y-age").value = s.age ?? ""; $("y-gender").value = s.gender; $("y-about").value = s.about; };
const readYou = () => ({ screenName: $("y-sn").value, password: $("y-pw").value, age: $("y-age").value, gender: $("y-gender").value,
  about: $("y-about").value, mismatch: $("y-pw").value !== $("y-pw2").value });

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const stamp = (ts) => new Date(ts).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });
// A smiley picker that drops an emoji in at the cursor of a textarea. Instant Message and Buddy Chat both have one.
const EMOJI = "😀 😂 🙂 😉 😍 😘 😛 😎 🤔 😮 😢 😭 😠 🙄 😴 🤒 👍 👎 👋 🙏 👀 💀 ❤️ 💔 🔥 ✨ 🎉 ☕ 🍕 🎮 🎵 💤".split(" ");
function smileys(text, button, picker) {
  for (const e of EMOJI) {
    const b = el("button", "", e, { type: "button" });
    b.onclick = () => { text.setRangeText(e, text.selectionStart, text.selectionEnd, "end"); picker.hidden = true; text.focus(); };
    picker.append(b);
  }
  button.onclick = () => { picker.hidden = !picker.hidden; };
  document.addEventListener("click", (e) => { if (!e.target.closest("#picker, #smile")) picker.hidden = true; });
}
// Classic emoticons drawn as faces, the way IM clients did it. Display only: the text itself stays as typed.
const FACES = { ":-)": "🙂", ":)": "🙂", ":-(": "🙁", ":(": "🙁", ";-)": "😉", ";)": "😉", ":-P": "😛", ":P": "😛", ":-p": "😛", ":p": "😛", ":-D": "😀", ":D": "😀",
  ":-O": "😮", ":-o": "😮", ":O": "😮", ":o": "😮", ":'(": "😢", "B-)": "😎", ":-*": "😘", ":-|": "😐", "<3": "❤️", ">:(": "😠", "XD": "😆", "xD": "😆" };
const FACE_RE = new RegExp(`(^|\\s)(${Object.keys(FACES).map((k) => [...k].map((c) => `[${c}]`).join("")).join("|")})(?=[\\s.,!?]|$)`, "g"); // each char in [ ] needs no escaping
const faces = (t) => String(t).replace(FACE_RE, (_, pre, f) => pre + FACES[f]);

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-win], [data-href]");
  if (!t) return;
  e.preventDefault();
  window.api.invoke(t.dataset.win ? `win:${t.dataset.win}` : "external", t.dataset.href);
});

(() => {
  const root = document.documentElement;
  const osDark = matchMedia("(prefers-color-scheme: dark)");
  const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const isLight = (hex) => { const n = parseInt(String(hex).slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150; };

  function apply(s) {
    const auto = s.darkWithSystem && osDark.matches;
    const c = !auto && s.theme === "custom" && s.customTheme;
    root.className = "th-" + (auto ? "midnight" : c ? c.base || "dialup" : s.theme || "dialup");
    root.removeAttribute("style"); // a custom theme's colors live only in <html style>
    if (!c) return;
    const set = (k, v) => { if (v) root.style.setProperty(k, v); };
    set("--win", c.win); set("--panel", c.panel); set("--ink", c.ink); set("--them", c.them);
    if (c.title) {
      set("--title", `linear-gradient(180deg, ${mix(c.title, "white", 70)} 0%, ${c.title} 14%, ${c.title} 86%, ${mix(c.title, "black", 80)} 100%)`);
      set("--title-ink", isLight(c.title) ? "#1b1b1b" : "#ffffff"); set("--frame", mix(c.title, "black", 70));
    }
    if (c.accent) { set("--accent", c.accent); set("--icon", c.accent); set("--sel", c.accent); }
    const { win, panel, ink, title } = c;
    if (win && panel && ink && title) {
      set("color-scheme", isLight(win) ? "light" : "dark"); set("--muted", mix(ink, win, 70)); set("--line", mix(title, win, 45));
      set("--groove", mix(ink, win, 22)); set("--tile", mix(ink, win, 6)); set("--banner-line", mix(title, win, 30));
      set("--banner", `linear-gradient(180deg, ${panel} 0%, ${mix(title, win, 18)} 100%)`);
      set("--btn", `linear-gradient(180deg, ${panel} 0%, ${mix(win, panel, 50)} 60%, ${mix(win, ink, 88)} 100%)`);
      set("--btn-ink", ink); set("--btn-line", mix(title, ink, 55));
    }
  }

  let current = window.api.settingsSync();
  apply(current);
  window.api.on("settings", (s) => { current = s; apply(s); });
  osDark.addEventListener("change", () => apply(current));
})();
