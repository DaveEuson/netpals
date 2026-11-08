// Runnable check for lib/keep.js:  npm test -- keep
// Remembering a slow fetch: kept while fresh, an old copy served while a new one is fetched, callers sharing one
// fetch, a failure for an old key never wiping out a newer key's result, and nothing past its maximum age.
const keep = require("../../lib/keep");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // A fetch whose answers the test hands out: calls[key] counts them, settle[key](value | Error) finishes the last one.
  const calls = {}, settle = {};
  const fetch = (key) => { calls[key] = (calls[key] || 0) + 1; return new Promise((ok, no) => { settle[key] = (v) => (v instanceof Error ? no(v) : ok(v)); }); };

  const get = keep(100, fetch, "empty");
  const a1 = get("A"), a2 = get("A");
  settle.A("a");
  check((await a1) === "a" && (await a2) === "a" && calls.A === 1, "two callers asking for a new key at once share one fetch");
  check((await get("A")) === "a" && calls.A === 1, "a fresh result is kept");
  await sleep(150);
  check((await get("A")) === "a" && calls.A === 2, "an old one is served straight away while a new one is fetched");
  const b = get("B", { fresh: true });
  settle.B("b");
  check((await b) === "b", "a new key gets its own result");
  settle.A(new Error("A was revoked"));
  await sleep(0);
  check((await get("B")) === "b" && calls.B === 1, "the old key failing later doesn't wipe out the new key's result");

  const old = keep(100, fetch, "empty", 300);
  const c = old("C"); settle.C("c"); await c;
  await sleep(150);
  check((await old("C")) === "c", "within its maximum age an old copy still serves");
  settle.C(new Error("offline"));
  await sleep(200);
  const late = old("C");
  check((await late) === "empty", "past its maximum age it isn't passed off as current");

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
