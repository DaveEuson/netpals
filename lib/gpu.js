// lib/gpu.js — how hard the graphics card is working, so Netpals can go away by itself while a game, a render or another
// AI app keeps it busy (main/account.js; only when the brain is on this computer). Overall use only, read three times a
// fifth of a second apart and the median taken, because one reading of an ordinary desktop jumps around:
//   nvidia-smi         any NVIDIA card, on any system
//   Windows counters   any other card on Windows: the busiest engine, as Task Manager shows it
//   ioreg              Apple Silicon Macs ("Device Utilization %"), no sudo needed, unlike powermetrics
// Anything that can't be read is null, never "quiet". Adapted from RigMatch's gpuProbe and gpuContention, where these
// readers were checked against real output from an RTX 4070, a Windows PC with three adapters and an M4.
// NETPALS_GPU: a number to use instead of reading the card (the tests set it).
const { execFile } = require("child_process");
const path = require("path");

const BUSY = 60; // percent: a game, a render or a model at work. Video and the desktop stay well under.
const AWAY_AFTER = 2; // busy checks in a row before going away (main checks every 30 s: about a minute)
const BACK_AFTER = 4; // quiet checks in a row before coming back (about two minutes)
const SOFTWARE_RENDERER = "1414"; // Microsoft Basic Render Driver's vendor id: never the card to read

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, ms) => new Promise((resolve) => {
  try {
    execFile(cmd, args, { timeout: ms, windowsHide: true, maxBuffer: 8 << 20 }, (e, out) => resolve(e ? "" : String(out)));
  } catch { resolve(""); }
});
const percent = (v) => (Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
function median(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// `nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits`: one line per card ("31"). The busiest card.
function parseNvidia(output) {
  const lines = String(output || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const values = lines.map((l) => { const m = l.match(/^(\d+(?:\.\d+)?)\s*%?$/); return m ? percent(Number(m[1])) : null; });
  return values.length && values.every((v) => v !== null) ? Math.max(...values) : null;
}

// `ioreg -r -d 1 -w 0 -c AGXAccelerator` on Apple Silicon. "Device Utilization %" is the overall figure; the renderer
// and tiler are its parts, used only if it's missing.
function parseIoreg(output) {
  const text = String(output || "");
  if (!text.includes("PerformanceStatistics")) return null;
  const num = (key) => { const m = text.match(new RegExp(`"${key} Utilization %"\\s*=\\s*(\\d+)`)); return m ? Number(m[1]) : null; };
  const device = num("Device"), renderer = num("Renderer"), tiler = num("Tiler");
  return percent(device ?? (renderer === null && tiler === null ? null : Math.max(renderer ?? 0, tiler ?? 0)));
}

// The PowerShell that reads Windows' GPU counters: the adapters (from the DirectX registry key, the only place their
// LUIDs meet their memory size) and three samples of each engine's use. WMI rather than Get-Counter: Get-Counter wants
// the counter names in Windows' own language and took 5 s, where these classes answer in a third of a second.
const WINDOWS_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
function ToU64($v) { [BitConverter]::ToUInt64([BitConverter]::GetBytes([int64]$v), 0) }
$adapters = @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\DirectX\*' -ErrorAction SilentlyContinue | Where-Object { $_.AdapterLuid } | ForEach-Object {
  [ordered]@{ luid = ('{0:x}' -f (ToU64 $_.AdapterLuid)); vendor = ('{0:x4}' -f [int]$_.VendorId); bytes = (ToU64 $_.DedicatedVideoMemory) }
})
$samples = @()
for ($i = 0; $i -lt 3; $i++) {
  $mem = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | ForEach-Object { [string]$_.Name })
  $eng = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.UtilizationPercentage -gt 0 } | ForEach-Object { [ordered]@{ n = [string]$_.Name; u = [int]$_.UtilizationPercentage } })
  $samples += , [ordered]@{ mem = $mem; eng = $eng }
  if ($i -lt 2) { Start-Sleep -Milliseconds 200 }
}
ConvertTo-Json -InputObject ([ordered]@{ adapters = $adapters; samples = $samples }) -Depth 5 -Compress`;

// A LUID as the counters write it (luid_0x00000000_0x00017162) or the registry holds it (hex), as one comparable string.
const luidKey = (high, low) => { try { return ((BigInt(`0x${high}`) << 32n) | BigInt(`0x${low}`)).toString(16); } catch { return null; } };

// What WINDOWS_SCRIPT prints, as one percent per sample for the card with the most memory of its own. A card's use is
// its busiest engine, and an engine's is the sum of the programs on it. A sample with no memory row for the card is
// left out: the counters didn't answer for it, and no busy engines would wrongly read as an idle card.
function parseWindows(output) {
  const text = String(output || "");
  let data;
  try { data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return []; }
  const card = (Array.isArray(data?.adapters) ? data.adapters : [])
    .filter((a) => typeof a?.luid === "string" && /^[0-9a-f]+$/i.test(a.luid) && String(a.vendor).toLowerCase() !== SOFTWARE_RENDERER)
    .sort((a, b) => (Number(b.bytes) || 0) - (Number(a.bytes) || 0))[0];
  if (!card || !Array.isArray(data?.samples)) return [];
  const luid = BigInt(`0x${card.luid}`).toString(16);
  const out = [];
  for (const sample of data.samples) {
    const answered = (Array.isArray(sample?.mem) ? sample.mem : [sample?.mem]).some((name) => {
      const m = String(name ?? "").match(/^luid_0x([0-9a-f]+)_0x([0-9a-f]+)_phys_\d+$/i);
      return m && luidKey(m[1], m[2]) === luid;
    });
    if (!answered) continue;
    const engines = new Map();
    for (const row of Array.isArray(sample?.eng) ? sample.eng : [sample?.eng].filter(Boolean)) {
      const m = String(row?.n ?? "").match(/^pid_\d+_luid_0x([0-9a-f]+)_0x([0-9a-f]+)_phys_(\d+)_eng_(\d+)_engtype_/i);
      const u = Number(row?.u);
      if (!m || luidKey(m[1], m[2]) !== luid || !Number.isFinite(u) || u < 0) continue;
      engines.set(`${m[3]}:${m[4]}`, (engines.get(`${m[3]}:${m[4]}`) || 0) + u);
    }
    out.push(Math.min(100, Math.max(0, ...engines.values())));
  }
  return out;
}

// Windows PowerShell by its full path, so a powershell.exe earlier on the PATH isn't run instead.
const powershell = (env = process.env) => {
  const root = env.SystemRoot || env.windir;
  return root ? path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
};

async function samples(readOnce, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = await readOnce();
    if (v === null) break;
    out.push(v);
    if (i < n - 1) await sleep(200);
  }
  return out;
}

// The card's use right now in percent, or null when it can't be read.
async function load(platform = process.platform) {
  if (process.env.NETPALS_GPU !== undefined) return percent(Number(process.env.NETPALS_GPU));
  const nvidia = await samples(async () => parseNvidia(await run("nvidia-smi", ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], 4000)));
  if (nvidia.length) return median(nvidia);
  if (platform === "win32") return median(parseWindows(await run(powershell(), ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], 20_000)));
  if (platform === "darwin") return median(await samples(async () => parseIoreg(await run("ioreg", ["-r", "-d", "1", "-w", "0", "-c", "AGXAccelerator"], 5000))));
  return null;
}

// One check's verdict. runs: { busy, quiet } so far (kept by the caller); reading: this check's percent (null: unread);
// away: whether this already sent you away. "away" when it's time to go, "back" when it's time to return, else "".
// An unreadable card counts as quiet: never a reason to go away, and never a reason to keep you away.
function step(runs, reading, away) {
  if (reading !== null && reading >= BUSY) { runs.busy++; runs.quiet = 0; } else { runs.quiet++; runs.busy = 0; }
  if (!away && runs.busy >= AWAY_AFTER) return "away";
  if (away && runs.quiet >= BACK_AFTER) return "back";
  return "";
}

module.exports = { load, step, parseNvidia, parseIoreg, parseWindows, median, BUSY, AWAY_AFTER, BACK_AFTER, WINDOWS_SCRIPT };
