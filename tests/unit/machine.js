// Runnable check for lib/machine.js:  npm test -- machine
// What the welcome screen says about this computer: its memory and graphics, the time one reply takes (from Ollama's
// own timings, or timed here for anything else), and when it says to use OpenRouter or Claude instead.
const fakeModel = require("../fake-model");
const machine = require("../../lib/machine");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const GB = 2 ** 30;

(async () => {
  const pc = (gpus, mem, platform = "win32", arch = "x64") => machine.hardware({ gpuDevice: gpus.map((vendorId) => ({ vendorId })) }, { mem: mem * GB, platform, arch });
  const gamer = pc([0x8086, 0x10de], 32), laptop = pc([0x8086], 8), mac = pc([], 16, "darwin", "arm64"), bare = machine.hardware(null, { mem: 16 * GB, platform: "win32", arch: "x64" });
  check(gamer.gpu === "NVIDIA" && gamer.fast && gamer.ramGB === 32, "a laptop with Intel and NVIDIA graphics counts the NVIDIA");
  check(laptop.gpu === "Intel" && !laptop.fast && mac.gpu === "Apple" && mac.fast && bare.gpu === "", "Intel graphics isn't fast, an Apple chip is, and no report means none");

  const v = (hw, s) => machine.verdict(hw, s);
  check(v(gamer, 3).level === "good" && /answers an IM in about 3 seconds/.test(v(gamer, 3).text) && /32 GB of memory, NVIDIA graphics/.test(v(gamer, 3).text), "a quick model: good, with the time and the hardware");
  check(v(gamer, 12).level === "slow" && /sluggish/.test(v(gamer, 12).text) && /OpenRouter or Claude/.test(v(gamer, 12).text), "12 seconds: slow, and it says what's quicker");
  check(v(laptop, 45).level === "poor" && /too slow/.test(v(laptop, 45).text) && v(laptop, Infinity).text.includes("more than a minute"), "45 seconds or a timeout: too slow, use the internet");
  check(v(laptop).level === "poor" && /no graphics card|Intel graphics/.test(v(laptop).text) && /isn't built for/.test(v(laptop).text), "no model yet on an 8 GB laptop: use the internet");
  check(v(gamer).level === "ok" && /Ollama, free and private/.test(v(gamer).text) && v(mac).level === "ok" && v(pc([0x8086], 16)).level === "poor",
    "no model yet on a good computer: it could run them; on 16 GB with only Intel graphics it couldn't");

  const server = await fakeModel.start();
  const host = `http://127.0.0.1:${server.address().port}`;
  const never = () => Promise.reject(new Error("shouldn't be called"));
  check(Math.round(await machine.replySeconds({ baseUrl: `${host}/v1`, model: "fake:7b" }, "a prompt", never)) === 2, "Ollama's own timings make 2 seconds, without the 5 s load");
  check(server.lastGenerate.options.num_predict === 40 && /a prompt$/.test(server.lastGenerate.prompt) && server.lastGenerate.prompt !== "a prompt", "asked for one IM's worth, with something fresh at the top");
  check(Math.round(await machine.replySeconds({ baseUrl: `${host}/v1`, model: "fake:slow" }, "p", never)) === 30, "a slow model: 30 seconds");
  const lmStudio = { baseUrl: "http://127.0.0.1:9/v1", model: "x" }; // nothing there answers /api/generate
  const s = await machine.replySeconds(lmStudio, "p", () => new Promise((r) => setTimeout(r, 300)));
  check(s >= 0.25 && s < 2, `anything else is timed from here (${s.toFixed(2)} s)`);
  check((await machine.replySeconds(lmStudio, "p", () => new Promise(() => {}), { timeoutMs: 200 })) === Infinity, "and one that never answers is past the limit");
  server.close();

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
