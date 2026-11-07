// lib/prompts.js — every prompt a buddy sees, and the cleanup that holds their output to the house rules.
// Persona preamble follows Good Day Sunshine's brief.js ("You are X... speak to them in first person"); the away
// line borrows sparko's buddyprofile.mjs rules (short, no quotes, nothing private).

// A buddy's era is the year their slang and references are stuck in, or 0 for someone living in the present day.
// Buddies from 2010 on grew up with emoji; everyone older types :) and the IM window draws the face.
const THIS_YEAR = () => new Date().getFullYear();
const yearOf = (buddy) => buddy.era || THIS_YEAR();
const EMOJI_ERA = 2010;
const usesEmoji = (buddy) => yearOf(buddy) >= EMOJI_ERA;
const eraLine = (buddy) => (buddy.era
  ? `Your slang, references and typing style are stuck in ${buddy.era}, but you know today's real date and time`
  : "You live in the present day: today's slang, today's references");
const styleLine = (buddy) => (buddy.era ? `Your style is stuck in ${buddy.era}.` : "Your style is today's.");
const RULES = (buddy) => [
  "Write 1 or 2 short sentences. That is the whole message.",
  "Never send a list, a plan, steps or a to-do. Never nag, remind, or tell them what they should do.",
  "Ask at most one question, and only if it comes naturally.",
  `Type like a real IM: lowercase is fine, ${usesEmoji(buddy) ? "an emoji or two is fine" : "classic emoticons like :) are fine. No emoji"}.` +
    " No hashtags, no quotation marks around the message.",
  "Never quote song lyrics. Never name real musicians, bands, songs, celebrities or other real people; make a name up if you need one.",
  "Never say you're an AI.",
];
// Small models drift out of character over a long prompt; restating who they are at the end pulls them back.
const who = (buddy) => `${buddy.name} (${buddy.personaPrompt.split(".")[0].replace(/^an?\s+/i, "").toLowerCase()})`;
const nudge = (buddy, minutes) => `You IMed them ${minutes} minutes ago and they haven't answered. Send one short follow-up checking if they're ` +
  `still there, in your own words, in character as ${who(buddy)}. Keep it light, no guilt trip, and don't just write "still there?".`;
const ping = (buddy) => `Send them a new IM out of the blue right now, in character as ${who(buddy)}. Don't repeat anything you already said.`;

const time = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
// With the year: asked "what year is it", small models guessed.
const date = (d) => d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const transcript = (recent) => recent
  .map((m) => `[${time(new Date(m.ts))}] ${m.role === "buddy" ? "you" : "them"}: ${m.text}${m.file ? " [a picture]" : ""}`).join("\n");
// What you just said, with any pictures: image parts when the model can look, otherwise a line about the one it can't open.
const picName = (m) => m.file.replace(/^\d+-/, "");
const saidWith = (said, pictures, urls) => {
  const text = said || (pictures.length ? "(sent you a picture)" : "");
  if (urls.length) return [{ type: "text", text }, ...urls.map((url) => ({ type: "image_url", image_url: { url } }))];
  if (!pictures.length) return said;
  return `${said ? said + "\n" : ""}(they sent you a picture called ${pictures.map(picName).join(", ")}, but your old computer can't open pictures. React to that.)`;
};

// What they told setup about themselves, all optional. Their screen name stays out: small models greet you with it
// every single time, and an about line gets dragged into every message unless they're told to go easy on it.
const QUIZ = { work: "what they do all day", into: "what they're into right now", hours: "their hours", peeve: "pet peeve",
  bug: "what they asked their buddies to bug them about" };
const aboutYou = (u = {}) => {
  const quiz = Object.entries(u.quiz || {}).filter(([k, v]) => QUIZ[k] && v).map(([k, v]) => `${QUIZ[k]}: ${v}`).join("; ");
  const facts = [
    u.age && `They're ${u.age} years old.`,
    u.gender && `Their gender: ${u.gender}.`,
    u.about && `Their profile says (bring it up only now and then): ${u.about}`,
    quiz && `From their setup questions (bring these up only now and then): ${quiz}.`,
  ].filter(Boolean);
  return facts.length ? `What you know about them, to know rather than recite back at them: ${facts.join(" ")}` : "";
};

const NOTE_RULE = "If they just told you something about themselves worth remembering (a plan, a like, how they feel, a name), " +
  "end your reply with <note>a few words about it</note>. Usually there is nothing to note, so leave it out.";

// ctx: { now, recent (oldest first), context, you: settings, away: { text, minutes } | null, reply: true when answering them }
function buddySystem(buddy, ctx) {
  const now = ctx.now || new Date();
  return [
    `You are ${buddy.name}, screen name "${buddy.screenName}", a buddy on their instant messenger buddy list.`,
    `Who you are: ${buddy.personaPrompt}`,
    `${eraLine(buddy)}.`,
    `Right now it's ${time(now)} on ${date(now)} where they are.`,
    aboutYou(ctx.you),
    ctx.context && `What you know about their day: ${ctx.context}`,
    buddy.notes && `What you remember about them: ${buddy.notes}`,
    ctx.away && `They just came back after about ${ctx.away.minutes} minutes away. Their away message said: "${ctx.away.text}". You can nod to it.`,
    ctx.recent?.length ? `${ctx.reply ? "Your IM conversation so far" : "Your recent IMs with them"}, oldest first:\n${transcript(ctx.recent)}`
      : !ctx.reply && "You haven't IMed them before.",
    ctx.reply && `They just IMed you. Answer what they actually said, in character as ${who(buddy)}.`,
    "Rules:",
    ...RULES(buddy).map((r) => `- ${r}`),
    !ctx.you?.gender && "- You don't know their gender, so never call them girl, boy, man, bro or anything like that.",
    ctx.reply && `- ${NOTE_RULE}`,
  ].filter(Boolean).join("\n");
}

// Buddy Chat. You are "the host" here, never a name, so small models don't greet you by it every line; the other
// buddies go by screen name. riff: the buddy line this one should answer, instead of taking a fresh turn.
function roomLine(m, byId, me) {
  if (m.role === "sys") return `[${time(new Date(m.ts))}] * ${m.text}`;
  const who = m.role === "me" ? "the host" : m.fromId === me.id ? "you" : byId.get(m.fromId)?.screenName || "someone";
  return `[${time(new Date(m.ts))}] ${who}: ${m.text}`;
}
function roomSystem(buddy, ctx) { // ctx: { now, members, recent (oldest first), you: settings, riff }
  const now = ctx.now || new Date();
  const byId = new Map(ctx.members.map((b) => [b.id, b]));
  const others = ctx.members.filter((b) => b.id !== buddy.id).map((b) => `${b.screenName} (${who(b)})`);
  return [
    `You are ${buddy.name}, screen name "${buddy.screenName}", in a chat room on an instant messenger with the host (whose buddy list you're on)` +
      `${others.length ? ` and ${others.join(", ")}` : ""}.`,
    `Who you are: ${buddy.personaPrompt}`,
    `${eraLine(buddy)}. It's ${time(now)} on ${date(now)}.`,
    aboutYou(ctx.you),
    ctx.recent.length ? `The room so far, oldest first:\n${ctx.recent.map((m) => roomLine(m, byId, buddy)).join("\n")}` : "Nobody has said anything yet.",
    ctx.riff ? `Answer or riff on what ${byId.get(ctx.riff.fromId)?.screenName || "the last buddy"} just said, in character as ${who(buddy)}. Teasing is fine.`
      : `Say your next line to the room, in character as ${who(buddy)}. Talk to the host or to another buddy. Don't repeat what anyone already said.`,
    "Rules:",
    ...RULES(buddy).map((r) => `- ${r}`),
    "- Don't start with anyone's name and a colon.",
    !ctx.you?.gender && "- You don't know the host's gender, so never call them girl, boy, man, bro or anything like that.",
  ].filter(Boolean).join("\n");
}

// The memory a reply may carry, and how it joins the buddy's running notes (oldest facts fall off past 500 chars).
const extractNote = (raw) => (String(raw).match(/<note>([\s\S]*?)<\/note>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 120);
// Some models (Llama 3.1 among them) never write the <note> tag however it's asked. For them, a second tiny call
// after the reply: one fact about the person from what they just said, or NONE.
// The line is quoted as data, not sent as a turn: sent bare, "are you a bot?" got answered instead of noted.
// Only lines in the first person can hold a fact about them; questions and trivia are skipped before any call.
const worthNoting = (said) => said.length >= 30 && /\b(i|i'm|im|i've|my|me|we|our|mine)\b/i.test(said);
const memoryPrompt = (said) => ({ system: "You keep a tiny notebook about a friend. From the line they just sent, write the one thing about them worth remembering later (a pet, a plan, a job, how they feel, a name): under 12 words, about them in the third person, no quotes. It must be about them, never an answer to them. If the line holds nothing about them, reply NONE.",
  messages: [{ role: "user", content: `They sent: "${said}"\nThe one thing about them, or NONE:` }], maxTokens: 30, temperature: 0.2 });
const cleanNote = (raw) => {
  const t = unquote(String(raw).split("\n")[0]).replace(/^note:\s*/i, "").replace(/\.$/, "").trim().slice(0, 120);
  return /^none\b/i.test(t) || t.length < 4 || /\b(language model|an ai|assistant|i am|i'm)\b/i.test(t) ? "" : t;
};
function appendNote(notes, note) {
  const items = notes ? notes.split("; ") : [];
  const lc = (t) => t.toLowerCase();
  // "They have a cat" after "They have a cat named Pixel" adds nothing; the more specific of the two is kept.
  const i = note ? items.findIndex((x) => lc(x).includes(lc(note)) || lc(note).includes(lc(x))) : -1;
  if (note && i < 0) items.push(note); else if (note && note.length > items[i].length) items[i] = note;
  while (items.join("; ").length > 500) items.shift();
  return items.join("; ");
}

const awayMessage = (buddy) => ({ system: `You are ${buddy.name} ("${buddy.screenName}"). ${buddy.personaPrompt} ${styleLine(buddy)}`,
  messages: [{ role: "user", content: "Write your instant-messenger away message: a short statement under 8 words, not a question. No quotes, no emoji, no song lyrics, no real people." }] });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Double quotes only, each end on its own: models often open a quote and never close it, and a trailing
// apostrophe is usually slang ("just thinkin'").
const unquote = (t) => t.replace(/^["“]+/, "").replace(/["”]+$/, "").trim();
// Emoji are against an older buddy's rules but small models slip; emoticons like :) are plain ASCII and survive.
const noEmoji = (t) => t.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]/gu, "").replace(/ {2,}/g, " ");
const sentencesOf = (t) => (t.match(/[\s\S]*?(?:[.!?…]+["')\]]*(?=\s|$)|$)/g) || []).map((x) => x.trim()).filter(Boolean);
const clip = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);

// Enforces what a prompt can only ask for: at most 2 sentences, at most 1 question (it ends the message), no list,
// no "name:" or "[time] you:" prefix echoed from the transcript.
function cleanMessage(raw, buddy) {
  let t = String(raw).replace(/<note>[\s\S]*?(?:<\/note>|$)/gi, ""); // llm.chat already dropped any <think> block; a note left unclosed goes too
  if (!t.trim()) t = String(raw).replace(/<\/?note>/gi, " "); // the whole reply was inside a note (small models): keep the words, lose the tags
  t = t.replace(/<\/?[a-z][^>]*>/gi, " "); // stray HTML like <br>; "<3" survives
  t = t.split(/\n\s*(?:[-*•]|\d+[.)])\s/)[0];
  t = unquote((usesEmoji(buddy) ? t : noEmoji(t)).replace(/\s+/g, " ").trim());
  t = t.replace(new RegExp(`^(\\[[^\\]]*\\]\\s*)?(you|me|${escapeRe(buddy.screenName)}|${escapeRe(buddy.name)})\\s*:\\s*`, "i"), "");
  // Greeting themselves by name ("Hey gordo_in_accounting, ...") happens with small models; keep the greeting, lose the name.
  t = t.replace(new RegExp(`^(hey|hi|hello|yo|sup)\\s+(there\\s+)?(${escapeRe(buddy.screenName)}|${escapeRe(buddy.name)})\\b[,!.]?\\s*`, "i"), "$1, ");
  t = unquote(t);
  const out = [];
  for (const p of sentencesOf(t)) { out.push(p); if (out.length === 2 || p.includes("?")) break; }
  return clip(out.join(" "), 320);
}

// One line, one sentence, 60 characters at most.
const cleanAway = (raw) => clip(sentencesOf(unquote(noEmoji(String(raw)).trim().split("\n")[0]))[0] || "", 60);

// ---- making buddies ------------------------------------------------------------------------
const PROFILE_RULES = `"quote": a short original line in their voice, not a lyric and not from a real person.
"listening": a band and song you invent, written as Band Name - 'Song Title'. No real musicians.
"link": a made-up web address that fits their era.`;

const randomBuddy = (vibe) => ({
  system: `You invent buddies for a nostalgic instant messenger set between 1997 and 2010. Reply with one JSON object and nothing else:
{"name":"...","screenName":"...","emoji":"...","era":2001,"nudge":false,"personaPrompt":"...","profile":{"quote":"...","listening":"...","link":"..."}}
"name": a first name. "screenName": true to their era, letters, numbers and underscores, under 20 characters.
"emoji": one real emoji picture that suits them, like 🎃 or 🛹 (not a text emoticon like :) ).
"era": one year from 1985 to ${THIS_YEAR()} that suits the vibe, or 0 for someone living in the present day; most buddies belong somewhere around 1999 to 2006.
"nudge": true only if they're impatient, clingy or hyper enough to send a "still there?" when you go quiet; false if they're calm, patient or laid-back and would give you space.
"personaPrompt": start with "A <who they are>." then 2 or 3 sentences on how they type, what they care about, and the slang and references of their era. They are warm, never nag, never give lists or advice, ask at most one question, and use classic emoticons like :) rather than emoji.
${PROFILE_RULES}
Everything is invented: no real people, musicians or songs.`,
  messages: [{ role: "user", content: `The vibe: ${vibe}` }],
});

const writeProfile = (buddy) => ({
  system: `You are ${buddy.name} ("${buddy.screenName}"). ${buddy.personaPrompt} ${styleLine(buddy)}
Write your instant-messenger profile. Reply with one JSON object and nothing else: {"quote":"...","listening":"...","link":"..."}
${PROFILE_RULES}`,
  messages: [{ role: "user", content: "Write it." }],
});

const parseJson = (raw) => JSON.parse(String(raw).match(/\{[\s\S]*\}/)[0]);

const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const firstGrapheme = (s) => [...new Intl.Segmenter().segment(s)][0]?.segment || "";
// Profile lines from a model often come wrapped in quotes or with a trailing comma left over from JSON.
const tidy = (v, n) => { const t = str(v, n + 4).replace(/[,;]+$/, ""); return (/^['"“‘].*['"”’]$/.test(t) ? t.slice(1, -1).trim() : t).slice(0, n); };
const blankProfile = (b) => !b.profile.quote && !b.profile.listening && !b.profile.link;

// Turns model output or form input into a buddy row, or throws a message fit to show the user.
// `taken` screen names get a number bumped on the end rather than clashing.
function toBuddy(o, taken = []) {
  const p = o.profile && typeof o.profile === "object" ? o.profile : o; // small models sometimes flatten the profile
  const icon = firstGrapheme(str(o.emoji, 16));
  const b = {
    name: str(o.name, 30), screenName: str(o.screenName, 24).replace(/[^\w .-]/g, ""),
    emoji: /\p{Extended_Pictographic}/u.test(icon) ? icon : "💬", // models sometimes answer with an emoticon like :)
    era: String(o.era).trim() === "0" ? 0 : Math.min(THIS_YEAR(), Math.max(1985, parseInt(o.era, 10) || 2003)), // 0: the present day
    personaPrompt: str(o.personaPrompt, 800).replace(/([.!?])[,;]/g, "$1"),
    cadenceWeight: Math.min(1, Math.max(0.05, Number(o.cadenceWeight ?? 0.5) || 0.5)),
    nudge: [true, 1, "true"].includes(o.nudge) ? 1 : 0,
    profile: { quote: tidy(p.quote, 140), listening: tidy(p.listening ?? p.listeningTo, 80), link: tidy(p.link ?? p.faveLink, 120) },
  };
  if (!b.name || !b.screenName || !b.personaPrompt) throw new Error("A buddy needs a name, a screen name and a personality.");
  // A quote signed by its own buddy ("... - dotmatrix97") reads like a forwarded email; drop the signature.
  const sig = new RegExp(`\\s*[-–—~]+\\s*(${escapeRe(b.name)}|${escapeRe(b.screenName)})\\s*$`, "i");
  b.profile.quote = tidy(b.profile.quote.replace(sig, ""), 140);
  const clash = (sn) => taken.some((t) => t.toLowerCase() === sn.toLowerCase());
  while (clash(b.screenName)) b.screenName = b.screenName.replace(/\d*$/, (d) => String((Number(d) || 0) + 1));
  return b;
}

module.exports = {
  buddySystem, roomSystem, ping, nudge, saidWith, awayMessage, usesEmoji,
  cleanMessage, cleanAway, extractNote, appendNote, memoryPrompt, cleanNote, worthNoting,
  randomBuddy, writeProfile, parseJson, toBuddy, blankProfile,
};
