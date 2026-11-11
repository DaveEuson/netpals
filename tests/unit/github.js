// Runnable check for lib/github.js:  npm test -- github
// Whether a newer Netpals is out (against the fake model's stand-in for GitHub), and the Report a problem link.
const fakeModel = require("../fake-model");
const github = require("../../lib/github");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const { newer } = github;
  check(newer("0.3.1", "0.3.0") && newer("v0.4.0", "0.3.9") && newer("1.0.0", "0.99.99") && newer("0.3.10", "0.3.9"), "a later version is newer, by number not by letter");
  check(!newer("0.3.0", "0.3.0") && !newer("0.2.9", "0.3.0") && !newer("0.3.0-beta", "0.3.0"), "the same, an older one, or a beta of this one isn't");

  const server = await fakeModel.start();
  const host = `http://127.0.0.1:${server.address().port}`;
  process.env.NETPALS_UPDATES = `${host}/new`;
  const u = await github.update("0.3.0");
  check(u?.version === "99.0.0" && u.url === "https://github.com/DaveEuson/netpals/releases/tag/v99.0.0", `a newer release comes back with its page (${JSON.stringify(u)})`);
  check((await github.update("99.0.0")) === null, "nothing when this copy is the latest");
  process.env.NETPALS_UPDATES = `${host}/old`;
  check((await github.update("0.3.0")) === null, "nothing when the latest release is older");
  process.env.NETPALS_UPDATES = `${host}/down`;
  check((await github.update("0.3.0")) === null, "GitHub answering an error: nothing, and no error");
  process.env.NETPALS_UPDATES = "http://127.0.0.1:9";
  check((await github.update("0.3.0")) === null, "offline: nothing, and no error");
  server.close();

  const url = github.issueUrl({ version: "0.3.0", system: "Windows 10.0.26300 x64", brain: "on this computer (llama3.1:8b)" });
  const body = new URL(url).searchParams.get("body");
  check(url.startsWith("https://github.com/DaveEuson/netpals/issues/new?body="), "Report a problem opens a new issue on Netpals' repo");
  check(/What happened\?/.test(body) && body.endsWith("Netpals 0.3.0 · Windows 10.0.26300 x64 · brain: on this computer (llama3.1:8b)"), "with room to say what happened, and the version, system and brain below");

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
