// tests/fake-model.js — a stand-in for Ollama that answers in milliseconds, so the window tests don't depend on a
// GPU or on what a real model happens to say. It speaks the same OpenAI chat-completions API the app uses and
// picks a canned answer from the prompt. The model name a test sets in Setup chooses how it behaves:
//   fake:7b       answers normally          fake:slow    answers after 3 s        fake:error   HTTP 500
//   fake:empty    answers with nothing       fake:huge    50 KB of rambling        fake:junk    tags, lists, emoji, quotes
const http = require("http");

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

function start(port = 0) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.method === "GET" && /\/(v1\/)?models$/.test(req.url)) return send(200, { data: [{ id: "fake:7b" }] });
      if (req.method === "GET" && req.url === "/api/tags") return send(200, { models: [{ name: "fake:7b", details: { parameter_size: "7B" } }] });
      if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) return send(404, { error: "not here" });
      let b = {};
      try { b = JSON.parse(body); } catch { return send(400, { error: "bad json" }); }
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
