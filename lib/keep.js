// lib/keep.js — remembers what a slow fetch (a calendar, the weather, Fieldy) returned, so buddies' answers never
// wait on it. keep(ms, fetch, empty) gives get(key, { fresh }): the last result for `key` while it's younger than ms;
// an older one straight away while a new one is fetched behind it; a new key (or `fresh`, for Check it) waits for the
// fetch. A failed fetch isn't tried again for ms, and keeps the last good result if there was one.
module.exports = function keep(ms, fetch, empty) {
  let cache = { key: "", at: 0, value: empty };
  return async function get(key, { fresh = false } = {}) {
    if (!key) return empty;
    const have = cache.key === key;
    if (!fresh && have && Date.now() - cache.at < ms) return cache.value;
    const got = fetch(key).then((value) => (cache = { key, at: Date.now(), value }).value, (e) => {
      if (cache.key !== key) cache = { key, at: Date.now(), value: empty };
      throw e;
    });
    if (fresh || !have) return got;
    cache.at = Date.now(); // what's here does until the new one lands; if that fails, it's tried again in `ms`
    got.catch((e) => console.warn(`[keep] ${e.message}`));
    return cache.value;
  };
};
