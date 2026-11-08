// Getting a model. The welcome screen says where to get Ollama when there's none, finds it when you look again, and
// downloads a good model into an Ollama with nothing usable (or only something small). Setup downloads any model by
// name, with progress and Stop, one at a time. All against the fake model's /api/pull.
const t = require("../harness");
const { db, check, win, js, sleep, until, click, text, set, vis, open, snap } = t;
const OR = { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash" };
const OLLAMA = (process.env.NETPALS_OLLAMA ||= t.MODEL.replace(/\/v1\/?$/, "")); // the fake, even with --live: never pull into a real Ollama
delete process.env.OPENROUTER_API_KEY; // the welcome screen as someone without one sees it, and never a real OpenRouter call
const main = t.start({ ...OR, detect: { models: [], small: false, ollama: false } });
const brainState = (patch) => { db.setSettings(patch); main.broadcast("settings", db.settings()); return sleep(400); };
const barText = (w) => js(w, "document.querySelector('#get-bar span').textContent");

t.run(async () => {
  await until(() => win("welcome.html"), 15_000);
  const w = win("welcome.html");
  await t.shown(w); await sleep(400);
  await js(w, "go('brain')"); await sleep(200);

  // ---- welcome: no Ollama at all
  check((await vis(w, "get")) && (await vis(w, "get-look")) && (await vis(w, "get-ollama")) && !(await vis(w, "get-go")), "with no Ollama, the brain step offers Get Ollama and Look again");
  check(/\(optional\)/.test(await text(w, "brain-name")) && /\(optional\)/.test(await js(w, "document.querySelector('label[for=key]').textContent")), "OpenRouter and its key are marked optional");
  await set(w, { key: "" }); await click(w, "signon"); await sleep(200);
  check(/Get Ollama below, or paste an OpenRouter key/.test(await text(w, "status")), "Sign On with no key and no Ollama points at both ways");
  check(/Install Ollama/.test(await text(w, "get-text")), "and says what to do");
  check((await js(w, "document.getElementById('b-or').checked")) && /GB of memory/.test(await text(w, "machine-text")), "OpenRouter is ticked, and the note sizes up this computer without a model to time");
  check(/only work in their makers' own apps/.test(await text(w, "step-brain")), "and says a ChatGPT or Claude subscription isn't a key");
  check(!(await vis(w, "rigmatch")) && /RigMatch/.test(await text(w, "get")), "with RigMatch in the offer instead of under it");
  await snap(w, "models-no-ollama.png");
  await click(w, "get-look");
  check(await until(() => db.settings().provider === "local" && db.settings().model === "fake:7b", 5000), "Look again finds the Ollama that's there now");
  await sleep(300);
  check(/found a brain/.test(await text(w, "legend")) && (await vis(w, "step-brain")) && !(await vis(w, "get")), "and the brain step redraws where you are, with no download offer");
  check(/Found fake:7b/.test(await text(w, "status")), "saying what it found");

  // ---- welcome: Ollama, but nothing that fits
  await brainState({ ...OR, detect: { models: [], small: false, ollama: true } });
  check((await vis(w, "get-go")) && !(await vis(w, "get-look")) && (await text(w, "get-go")) === "Download llama3.1:8b", "with an empty Ollama, it offers to download llama3.1:8b");
  check(/no model that fits/.test(await text(w, "brain-where")) && /4\.9 GB/.test(await text(w, "get-text")), "says Ollama is there but empty, and how big the download is");
  await snap(w, "models-download.png");
  await click(w, "get-go");
  check(await until(() => db.settings().provider === "local" && db.settings().model === "llama3.1:8b", 8000), "Download gets it and switches the brain to it");
  await sleep(300);
  check(/Downloaded/.test(await text(w, "status")) && !(await vis(w, "get")) && (await vis(w, "rigmatch")) && (await vis(w, "step-brain")), "says so, swaps the offer for the RigMatch note, and stays on the brain step");
  check(await until(async () => /answers an IM in about 2 seconds/.test(await text(w, "machine-text")), 5000) && (await vis(w, "rec-local")), "then times the new model, and recommends it");
  await snap(w, "models-downloaded.png");
  check(!(await js(w, "document.getElementById('signon').disabled")) && (await text(w, "model")) === "llama3.1:8b", "with Sign On ready and the new model shown");

  // ---- welcome: only a small model
  await brainState({ provider: "local", baseUrl: `${OLLAMA}/v1`, model: "fake:7b", detect: { models: ["fake:7b"], small: true, ollama: true } });
  check((await vis(w, "get-go")) && /bigger model/.test(await text(w, "get-text")), "with only a small model, it offers a bigger one");

  // ---- Setup
  const before = db.settings();
  const st = await open(main, "settings");
  await until(() => js(st, "document.getElementById('model').options.length > 1"), 5000);
  check((await js(st, "document.getElementById('server').value")) === OLLAMA && (await vis(st, "get-fields")), "Setup shows Download for Ollama");
  check((await js(st, "[...document.getElementById('get-list').options].map((o) => o.value).join(' ')")) === "llama3.1:8b mistral-nemo gemma3:4b gemma3:12b", "and suggests the four models from the README");
  check(await vis(st, "get-fields") && Boolean(await js(st, "document.querySelector('#local-fields ~ rigmatch-note a')")), "with RigMatch right under it");

  const download = async (name) => { await set(st, { "get-name": name }); await click(st, "get"); };
  await download("");
  check(/Pick a model/.test(await text(st, "get-result")), "an empty name asks for one");
  await download("../../etc/passwd");
  await until(async () => (await text(st, "get-result")) !== "", 3000);
  check(/doesn't look like a model name/.test(await text(st, "get-result")), "a name that isn't one is refused");
  await download("fake:missing");
  await until(async () => /Ollama/.test(await text(st, "get-result")), 3000);
  check(/no model called fake:missing/.test(await text(st, "get-result")), "a model Ollama doesn't have says so");

  await download("fake:slowpull");
  check(await until(async () => /GB · \d+%/.test(await barText(st)), 5000) && (await vis(st, "get-bar")), "a download shows the bar and how much is done");
  await js(st, "document.getElementById('local-fields').scrollIntoView()");
  await snap(st, "models-setup-pull.png");
  const second = await js(st, "api.invoke('llm:pull', 'gemma3:4b')");
  check(!second.ok && /already running/.test(second.error), "a second download waits for the first");
  await js(st, "document.querySelector('#get-bar button').click()");
  check(await until(async () => /Stopped/.test(await text(st, "get-result")), 5000) && !(await vis(st, "get-bar")), "Stop stops it");
  check(!(await js(st, "[...document.getElementById('model').options].some((o) => o.value === 'fake:slowpull')")), "and a stopped model isn't listed");

  await download("mistral-nemo");
  check(await until(async () => /Downloaded/.test(await text(st, "get-result")), 8000), "a finished download says so");
  check((await js(st, "document.getElementById('model').value")) === "mistral-nemo:latest" && db.settings().model === "mistral-nemo:latest", "and switches to it, as Ollama lists it (name:latest)");

  await set(st, { server: (await js(st, "document.getElementById('server').options[1].value")) });
  check(!(await vis(st, "get-fields")), "LM Studio gets no Download (it has its own)");
  await until(() => db.settings().baseUrl === "http://localhost:1234/v1", 3000);
  check(db.settings().baseUrl === "http://localhost:1234/v1", "and with nothing answering there, the brain still points there, not at the old one");
  await set(st, { server: OLLAMA }); await sleep(300);
  check(await vis(st, "get-fields"), "and Ollama gets it back");

  check((await js(st, "api.invoke('llm:listLocal', 'http://example.com')")) === null, "the model list only ever asks Ollama or LM Studio");
  await click(st, "cancel");
  check(await until(() => !win("settings.html"), 3000) && db.settings().model === before.model && db.settings().baseUrl === before.baseUrl, "Cancel puts the old model back");

  // Closing the window stops its download, and the next one can start.
  const st2 = await open(main, "settings");
  await set(st2, { "get-name": "fake:slowpull" }); await click(st2, "get");
  await until(async () => /GB/.test(await barText(st2)), 5000);
  st2.close();
  await sleep(500);
  const after = await js(w, "api.invoke('llm:pull', 'gemma3:4b')");
  check(after.ok, "closing Setup stops its download, so another can start");
});
