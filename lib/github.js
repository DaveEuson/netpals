// lib/github.js — Netpals on GitHub: whether a newer version is out (the latest published release), and the link that
// opens a new issue with this copy's version and system filled in. NETPALS_UPDATES points the release check somewhere
// else (the tests point it at the fake model); it's read on every check.
const REPO = "DaveEuson/netpals";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

// "v0.3.10" -> [0, 3, 10]. Anything after the third number (a -beta) is ignored.
const parts = (v) => String(v).replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

async function latest() {
  const api = process.env.NETPALS_UPDATES || "https://api.github.com";
  const r = await fetch(`${api}/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Netpals" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const j = await r.json();
  return { version: String(j.tag_name || "").replace(/^v/i, ""), url: /^https:\/\//.test(j.html_url) ? j.html_url : RELEASES };
}
// { version, url } when a release newer than `current` is out, else null. Offline or any trouble: null.
async function update(current) {
  try {
    const l = await latest();
    return l.version && newer(l.version, current) ? l : null;
  } catch {
    return null;
  }
}

// A new issue with an empty what-happened, and below a line, the facts that help: version, system and brain.
// Nothing about you or your buddies. Nothing is sent until you press Submit on GitHub.
function issueUrl({ version, system, brain }) {
  const body = `**What happened?**\n\n\n**What did you expect?**\n\n\n---\nNetpals ${version} · ${system} · brain: ${brain}`;
  return `https://github.com/${REPO}/issues/new?body=${encodeURIComponent(body)}`;
}

module.exports = { newer, update, issueUrl, RELEASES, HOME: `https://github.com/${REPO}` };
