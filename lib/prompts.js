// lib/prompts.js — every prompt a buddy sees, and the cleanup that holds their output to the house rules.
// Persona preamble follows Good Day Sunshine's brief.js ("You are X... speak to them in first person"); the away
// line borrows sparko's buddyprofile.mjs rules (short, no quotes, nothing private).

// Buddies from 2010 on grew up with emoji; everyone older types :) and the IM window draws the face.
const EMOJI_ERA = 2010;
const usesEmoji = (buddy) => buddy.era >= EMOJI_ERA;
const RULES = (buddy) => [
  "Write 1 or 2 short sentences. That is the whole message.",
  "Never send a list, a plan, steps or a to-do. Never nag, remind, or tell them what they should do.",
  "Ask at most one question, and only if it comes naturally.",
  `Type like a real IM: lowercase is fine, ${usesEmoji(buddy) ? "an emoji or two is fine" : "classic emoticons like :) are fine. No emoji"}. No hashtags, no quotation marks around the message.`,
  "Never quote song lyrics. Never name real musicians, bands, songs, celebrities or other real people; make a name up if you need one.",
  "Never say you're an AI.",
];
// Small models drift out of character over a long prompt; restating who they are at the end pulls them back.
const who = (buddy) => `${buddy.name} (${buddy.personaPrompt.split(".")[0].replace(/^an?\s+/i, "").toLowerCase()})`;
const nudge = (buddy, minutes) => `You IMed them ${minutes} minutes ago and they haven't answered. Send one short follow-up checking if they're ` +
  `still there, in your own words, in character as ${who(buddy)}. Keep it light, no guilt trip, and don't just write "still there?".`;
const ping = (buddy) => `Send them a new IM out of the blue right now, in character as ${who(buddy)}. Don't repeat anything you already said.`;

const time = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (d) => d.toLocaleDateString([], { weekday: "long" });
const transcript = (recent) => recent.map((m) => `[${time(new Date(m.ts))}] ${m.role === "buddy" ? "you" : "them"}: ${m.text}`).join("\n");

// What they told setup about themselves, all optional. Their screen name stays out: small models greet you with it
// every single time, and an about line gets dragged into every message unless they're told to go easy on it.
const QUIZ = { work: "what they do all day", into: "what they're into right now", hours: "their hours", peeve: "pet peeve", bug: "what they asked their buddies to bug them about" };
const aboutYou = (u = {}) => {
  const quiz = Object.entries(u.quiz || {}).filter(([k, v]) => QUIZ[k] && v).map(([k, v]) => `${QUIZ[k]}: ${v}`).join("; ");
  return [u.age && `They're ${u.age} years old.`, u.gender && `Their gender: ${u.gender}.`, u.about && `Their profile says (bring it up only now and then): ${u.about}`,
    quiz && `From their setup questions (bring these up only now and then): ${quiz}.`].filter(Boolean).join(" ");
};

const NOTE_RULE = "If they just told you something about themselves worth remembering (a plan, a like, how they feel, a name), " +
  "end your reply with <note>a few words about it</note>. Usually there is nothing to note, so leave it out.";

// ctx: { now, recent (oldest first), context, you: settings, away: { text, minutes } | null, reply: true when answering them }
function buddySystem(buddy, ctx) {
  const now = ctx.now || new Date();
  return [
    `You are ${buddy.name}, screen name "${buddy.screenName}", a buddy on their instant messenger buddy list.`,
    `Who you are: ${buddy.personaPrompt}`,
    `Your slang, references and typing style are stuck in ${buddy.era}, but you know today's real date and time.`,
    `Right now it's ${time(now)} on ${day(now)} where they are.`,
    aboutYou(ctx.you),
    ctx.context && `What you know about their day: ${ctx.context}`,
    buddy.notes && `What you remember about them: ${buddy.notes}`,
    ctx.away && `They just came back after about ${ctx.away.minutes} minutes away. Their away message said: "${ctx.away.text}". You can nod to it.`,
    ctx.recent?.length ? `${ctx.reply ? "Your IM conversation so far" : "Your recent IMs with them"}, oldest first:\n${transcript(ctx.recent)}` : !ctx.reply && "You haven't IMed them before.",
    ctx.reply && `They just IMed you. Answer what they actually said, in character as ${who(buddy)}.`,
    "Rules:",
    ...RULES(buddy).map((r) => `- ${r}`),
    !ctx.you?.gender && "- You don't know their gender, so never call them girl, boy, man, bro or anything like that.",
    ctx.reply && `- ${NOTE_RULE}`,
  ].filter(Boolean).join("\n");
}

// The memory a reply may carry, and how it joins the buddy's running notes (oldest facts fall off past 500 chars).
const extractNote = (raw) => (String(raw).match(/<note>([\s\S]*?)<\/note>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 120);
function appendNote(notes, note) {
  const items = notes ? notes.split("; ") : [];
  if (note && !items.some((i) => i.toLowerCase() === note.toLowerCase())) items.push(note);
  while (items.join("; ").length > 500) items.shift();
  return items.join("; ");
}

const awayMessage = (buddy) => ({ system: `You are ${buddy.name} ("${buddy.screenName}"). ${buddy.personaPrompt} Your style is stuck in ${buddy.era}.`,
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
  let t = String(raw).replace(/<note>[\s\S]*?<\/note>/gi, ""); // llm.chat already dropped any <think> block
  t = t.split(/\n\s*(?:[-*•]|\d+[.)])\s/)[0];
  t = unquote((usesEmoji(buddy) ? t : noEmoji(t)).replace(/\s+/g, " ").trim());
  t = t.replace(new RegExp(`^(\\[[^\\]]*\\]\\s*)?(you|me|${escapeRe(buddy.screenName)}|${escapeRe(buddy.name)})\\s*:\\s*`, "i"), "");
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
"era": one year from 1997 to 2024 that suits the vibe; most buddies belong somewhere around 1999 to 2006.
"nudge": true only if they're impatient, clingy or hyper enough to send a "still there?" when you go quiet; false if they're calm, patient or laid-back and would give you space.
"personaPrompt": start with "A <who they are>." then 2 or 3 sentences on how they type, what they care about, and the slang and references of their era. They are warm, never nag, never give lists or advice, ask at most one question, and use classic emoticons like :) rather than emoji.
${PROFILE_RULES}
Everything is invented: no real people, musicians or songs.`,
  messages: [{ role: "user", content: `The vibe: ${vibe}` }],
});

const writeProfile = (buddy) => ({
  system: `You are ${buddy.name} ("${buddy.screenName}"). ${buddy.personaPrompt} Your style is stuck in ${buddy.era}.
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
    era: Math.min(2024, Math.max(1997, parseInt(o.era, 10) || 2003)),
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

module.exports = { buddySystem, awayMessage, cleanMessage, cleanAway, ping, nudge, randomBuddy, writeProfile, parseJson, toBuddy, blankProfile, extractNote, appendNote, usesEmoji };
