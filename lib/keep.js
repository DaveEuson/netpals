// lib/keep.js — remembers what a slow fetch (a calendar, the weather, Fieldy) returned, so buddies' answers never
// wait on it. keep(ms, fetch, empty, maxAge) gives get(key, { fresh }): the last result for `key` while it's younger
// than ms; an older one straight away while a new one is fetched behind it (but never one older than maxAge: then
// `empty`); a new key (or `fresh`, for Check it) waits for the fetch. Callers asking for the same key at once share
// one fetch. A failed fetch isn't tried again for ms, and keeps the last good result if there was one. A fetch that
// lands after a newer key took over doesn't overwrite it.
module.exports = function keep(ms, fetch, empty, maxAge = Infinity) {
  let cache = { key: "", at: 0, got: 0, value: empty }; // at: last fetch started or finished; got: when value was fetched
  const inflight = new Map();
  function start(key) {
    if (inflight.has(key)) return inflight.get(key);
    const before = cache;
    const p = fetch(key).then((value) => {
      if (cache === before || cache.key === key) cache = { key, at: Date.now(), got: Date.now(), value };
      return value;
    }, (e) => {
      if (cache === before && cache.key !== key) cache = { key, at: Date.now(), got: 0, value: empty }; // a new key that fails waits ms
      throw e;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return async function get(key, { fresh = false } = {}) {
    if (!key) return empty;
    const have = cache.key === key;
    if (!fresh && have && Date.now() - cache.at < ms) return Date.now() - cache.got <= maxAge ? cache.value : empty;
    const got = start(key);
    if (fresh || !have) return got;
    cache.at = Date.now(); // what's here does until the new one lands; if that fails, it's tried again in `ms`
    got.catch((e) => console.warn(`[keep] ${e.message}`));
    return Date.now() - cache.got <= maxAge ? cache.value : empty;
  };
};
