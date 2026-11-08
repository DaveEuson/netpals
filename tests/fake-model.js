// tests/fake-model.js — a stand-in for Ollama that answers in milliseconds, so the window tests don't depend on a
// GPU or on what a real model happens to say. It speaks the same OpenAI chat-completions API the app uses and
// picks a canned answer from the prompt. The model name a test sets in Setup chooses how it behaves:
//   fake:7b       answers normally          fake:slow    answers after 3 s        fake:error   HTTP 500
//   fake:empty    answers with nothing       fake:huge    50 KB of rambling        fake:junk    tags, lists, emoji, quotes
// It also downloads, the way Ollama's /api/pull does: one JSON line per step, a big layer and a small one. A name with
// "missing" in it isn't in the library; one with "slow" takes 9 s, so a test can stop it. What finishes is listed
// from then on, untagged names as name:latest the way Ollama lists them.
// And it's a calendar, at /calendar.ics: a dentist appointment on right now, a team sync every day from 1 to 3 this
// computer's time, and a cancelled meeting that must never show. /page.html is a web page, not a calendar.
// And Open-Meteo, at /v1/search and /v1/forecast: two Springfields (Missouri is the bigger), a Paris, and no Nowhere;
// light rain at 37 °F (3 °C) with a 40% chance of more.
const http = require("http");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function pull(name, res, pulled) {
  let gone = false;
  res.on("close", () => { gone = true; });
  res.writeHead(200, { "Content-Type": "application/x-ndjson" });
  const line = (o) => res.write(`${JSON.stringify(o)}\n`);
  line({ status: "pulling manifest" });
  if (/missing/.test(name)) return res.end(`${JSON.stringify({ error: "pull model manifest: file does not exist" })}\n`);
  const steps = /slow/.test(name) ? 30 : 5, total = 4.9e9;
  line({ status: "pulling 1a2b", digest: "sha256:1a2b", total: 12_000, completed: 12_000 });
  for (let i = 1; i <= steps; i++) {
    await wait(/slow/.test(name) ? 300 : 60);
    if (gone) return; // the app stopped it
    line({ status: "pulling 3c4d", digest: "sha256:3c4d", total, completed: Math.round((total * i) / steps) });
  }
  line({ status: "verifying sha256 digest" });
  line({ status: "writing manifest" });
  pulled.add(name.includes(":") ? name : `${name}:latest`);
  res.end(`${JSON.stringify({ status: "success" })}\n`);
}

const BUDDY = { name: "Rae", screenName: "goth_baker04", emoji: "🎂", era: 2004, nudge: false,
  personaPrompt: "A goth kid who bakes elaborate cakes. Types in lowercase, very dry.",
  profile: { quote: "black frosting is a lifestyle", listening: "The Dusk Ovens - 'Proofing'", link: "http://goth-bakes.tripod.com" } };

function answer(model, system, user) {
  if (/tiny notebook/.test(system)) return /cat/i.test(user) ? "Has a cat named Pixel" : "NONE";
  if (/invent buddies/.test(system)) return JSON.stringify(BUDDY);
  if (/Write your instant-messenger profile/.test(system)) return JSON.stringify(BUDDY.profile);
  if (/away message/i.test(user)) return "out getting snacks";
  if (/one short hello/.test(system)) return "hi!";
  if (model === "fake:empty") return "";
  if (model === "fake:huge") return "so anyway ".repeat(5000);
  if (model === "fake:junk") return '"<note>unclosed note<br> hey!! 🎉🎉 here is a plan:\n1. eat\n2. sleep\n<script>alert(1)</script> as an AI i can\'t';
  if (/chat room/.test(system)) return "lol same here, what's everyone up to?";
  return "hey :) long day?";
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d+/g, "");
const calendar = (now = Date.now()) => ["BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:dentist", "SUMMARY:Dentist\\, Dr. Ruiz", `DTSTART:${stamp(now - 10 * 60_000)}`, `DTEND:${stamp(now + 50 * 60_000)}`, "END:VEVENT",
  "BEGIN:VEVENT", "UID:sync", "SUMMARY:Team sync", "DTSTART;TZID=Local:20260105T130000", "DTEND;TZID=Local:20260105T150000", "RRULE:FREQ=DAILY", "END:VEVENT",
  "BEGIN:VEVENT", "UID:gone", "SUMMARY:Cancelled meeting", `DTSTART:${stamp(now - 5 * 60_000)}`, `DTEND:${stamp(now + 60 * 60_000)}`, "STATUS:CANCELLED", "END:VEVENT",
  "END:VCALENDAR"].join("\r\n");

const PLACES = [
  { name: "Springfield", latitude: 37.2, longitude: -93.3, country_code: "US", country: "United States", admin1: "Missouri" },
  { name: "Springfield", latitude: 39.8, longitude: -89.6, country_code: "US", country: "United States", admin1: "Illinois" },
  { name: "Paris", latitude: 48.9, longitude: 2.35, country_code: "FR", country: "France", admin1: "Île-de-France" },
];
function sky(url) {
  const q = new URL(url, "http://x").searchParams;
  if (url.startsWith("/v1/search")) return { results: PLACES.filter((p) => p.name.toLowerCase() === q.get("name").toLowerCase()) };
  const f = q.get("temperature_unit") === "fahrenheit";
  return { current: { temperature_2m: f ? 37.3 : 2.9, weather_code: 61 },
    daily: { temperature_2m_max: [f ? 60.4 : 15.8], temperature_2m_min: [f ? 36.2 : 2.3], precipitation_probability_max: [40] } };
}

function start(port = 0) {
  const pulled = new Set();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      const names = ["fake:7b", ...pulled];
      if (req.method === "GET" && /\/(v1\/)?models$/.test(req.url)) return send(200, { data: names.map((id) => ({ id })) });
      if (req.method === "GET" && req.url === "/calendar.ics") { res.writeHead(200, { "Content-Type": "text/calendar" }); return res.end(calendar()); }
      if (req.method === "GET" && req.url === "/page.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><p>not a calendar"); }
      if (req.method === "GET" && /^\/v1\/(search|forecast)\?/.test(req.url)) return send(200, sky(req.url));
      if (req.method === "GET" && req.url === "/api/tags") return send(200, { models: names.map((n, i) => ({ name: n, details: { parameter_size: i ? "8B" : "7B" } })) });
      let b = {};
      try { b = JSON.parse(body || "{}"); } catch { return send(400, { error: "bad json" }); }
      if (req.method === "POST" && req.url === "/api/pull") return pull(String(b.model || b.name), res, pulled);
      if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) return send(404, { error: "not here" });
      server.calls = (server.calls || 0) + 1;
      if (b.model === "fake:error") return send(500, { error: { message: "the fake model fell over" } });
      if (b.model === "fake:slow") await new Promise((r) => setTimeout(r, 3000));
      const system = b.messages?.[0]?.content || "", user = JSON.stringify(b.messages?.slice(1) || []);
      send(200, { choices: [{ message: { role: "assistant", content: answer(b.model, system, user) } }] });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

module.exports = { start, BUDDY };
