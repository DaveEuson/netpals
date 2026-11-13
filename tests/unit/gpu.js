// Runnable check for lib/gpu.js:  npm test -- gpu
// Reading the graphics card from each tool's real output (an RTX 4070's nvidia-smi line, Windows' GPU counters on a PC
// with three adapters, an M4's ioreg), refusing what isn't a reading, and when a run of readings means going away or
// coming back. Never runs the tools: NETPALS_GPU stands in for the card.
const gpu = require("../../lib/gpu");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

// nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits
check(gpu.parseNvidia("31\n") === 31 && gpu.parseNvidia("31 %\r\n") === 31, "nvidia-smi: a card's use, with or without the % sign");
check(gpu.parseNvidia("12\n88\n") === 88, "two cards: the busier one");
check(gpu.parseNvidia("") === null && gpu.parseNvidia("[N/A]") === null && gpu.parseNvidia("31\n[N/A]") === null && gpu.parseNvidia("140") === null,
  "nothing, [N/A], a half-readable pair or an impossible number is no reading");

// ioreg -r -d 1 -w 0 -c AGXAccelerator (an M4, cut down)
const ioreg = (device, renderer = 0) => `+-o AGXAcceleratorG16X  <class AGXAcceleratorG16X>\n  {\n    "PerformanceStatistics" = {"In use system memory (driver)"=0,"Tiler Utilization %"=0,"Renderer Utilization %"=${renderer},${device === null ? "" : `"Device Utilization %"=${device},`}"In use system memory"=763723776}\n  }`;
check(gpu.parseIoreg(ioreg(0)) === 0 && gpu.parseIoreg(ioreg(73)) === 73, "ioreg: Device Utilization %");
check(gpu.parseIoreg(ioreg(null, 41)) === 41, "the renderer's figure when the overall one is missing");
check(gpu.parseIoreg("no accelerator here") === null, "no PerformanceStatistics is no reading");

// Windows' counters, as WINDOWS_SCRIPT prints them: the software renderer, an RTX 4070 (12 GB) and AMD integrated
// graphics (2 GB); engine names as this PC's counters write them, hex in capitals.
const card = "luid_0x00000000_0x0001A25D", amd = "luid_0x00000000_0x0001D294";
const windows = (samples) => JSON.stringify({
  adapters: [{ luid: "1d225", vendor: "1414", bytes: 0 }, { luid: "1a25d", vendor: "10de", bytes: 12593397760 }, { luid: "1d294", vendor: "1002", bytes: 2119970816 }],
  samples,
});
const sample = (eng, mem = [`${card}_phys_0`, `${amd}_phys_0`]) => ({ mem, eng });
const out = gpu.parseWindows(`junk before ${windows([
  sample([{ n: `pid_32132_${card}_phys_0_eng_0_engtype_3D`, u: 40 }, { n: `pid_49088_${card}_phys_0_eng_0_engtype_3D`, u: 35 }, { n: `pid_1_${card}_phys_0_eng_3_engtype_Copy`, u: 9 }]),
  sample([{ n: `pid_77_${amd}_phys_0_eng_0_engtype_3D`, u: 99 }]),
  sample([{ n: `pid_77_${card}_phys_0_eng_0_engtype_3D`, u: 90 }], [`${amd}_phys_0`]),
])} junk after`);
check(out.length === 2 && out[0] === 75, "Windows: the card with the most memory, its busiest engine, programs on one engine added up");
check(out[1] === 0, "the integrated graphics working hard doesn't count for the card");
check(gpu.parseWindows(windows([sample([], [`${amd}_phys_0`])])).length === 0, "a sample where the counters didn't answer for the card is left out, not read as idle");
check(gpu.parseWindows("not json").length === 0 && gpu.parseWindows(JSON.stringify({ adapters: [{ luid: "1d225", vendor: "1414", bytes: 0 }], samples: [] })).length === 0,
  "no JSON, or only the software renderer, reads nothing");
check(gpu.parseWindows(JSON.stringify({ adapters: [{ luid: "1a25d", vendor: "10de", bytes: 1 }], samples: [{ mem: `${card}_phys_0`, eng: { n: `pid_5_${card}_phys_0_eng_0_engtype_3D`, u: 64 } }] }))[0] === 64,
  "PowerShell's one-item lists, written without brackets, still read");
check(gpu.median([31, 97, 12]) === 31 && gpu.median([10, 20]) === 15 && gpu.median([]) === null && gpu.median([null, 50]) === 50, "the median of a few readings");

// Going away and coming back
const run = (readings, away = false) => {
  const runs = { busy: 0, quiet: 0 };
  let state = away;
  const said = readings.map((r) => { const v = gpu.step(runs, r, state); if (v === "away") state = true; if (v === "back") state = false; return v || "-"; });
  return said.join(" ");
};
check(run([97]) === "-" && run([97, 97]) === "- away", `one busy check isn't enough; two in a row (about a minute) send you away`);
check(run([97, 30, 97, 30]) === "- - - -", "busy and quiet taking turns never does");
check(run([10, 10, 10, 10], true) === "- - - back" && run([10, 10, 97, 10, 10, 10], true) === "- - - - - -", "four quiet checks in a row bring you back; a busy one starts the count over");
check(run([null, null, null, null], true) === "- - - back" && run([null, null, null], false) === "- - -", "an unreadable card never sends you away, and never keeps you there");
check(gpu.BUSY === 60, "busy means 60% and up");

(async () => {
  process.env.NETPALS_GPU = "88";
  check((await gpu.load()) === 88, "NETPALS_GPU stands in for the card");
  process.env.NETPALS_GPU = "nope";
  check((await gpu.load()) === null, "and anything but a percent there reads as unreadable");
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
