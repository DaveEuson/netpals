// lib/weather.js — the weather where you are, from Open-Meteo: free, no key, no sign-in. Only the town (or postal
// code) you typed in Setup, and then its map position, go out. From Good Day Sunshine's reader.
// NETPALS_WEATHER points both calls somewhere else (the tests point it at the fake model).
const keep = require("./keep");

const GEO = process.env.NETPALS_WEATHER || "https://geocoding-api.open-meteo.com";
const SKY = process.env.NETPALS_WEATHER || "https://api.open-meteo.com";
const WMO = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "drizzling", 53: "drizzling",
  55: "drizzling hard", 56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "raining", 65: "pouring", 66: "freezing rain",
  67: "freezing rain", 71: "light snow", 73: "snowing", 75: "snowing hard", 77: "snow grains", 80: "showers", 81: "showers",
  82: "heavy showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail" };
const FAHRENHEIT = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW"]); // where people say °F

async function getJSON(url) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); } catch {
    throw new Error("Couldn't reach the weather service. Check your internet connection.");
  }
  if (!r.ok) throw new Error(`The weather service answered ${r.status}.`);
  return r.json();
}

// "Springfield", "Springfield, Illinois", "Paris, France" or a postal code. With something after the comma, the
// first match whose state, region or country starts with it; otherwise the biggest place by that name.
async function find(place) {
  const [name, ...rest] = String(place).split(",").map((x) => x.trim());
  const want = rest.join(" ").toLowerCase();
  if (!name || name.length < 2) throw new Error("Type your town, or your postal code.");
  const all = (await getJSON(`${GEO}/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`)).results || [];
  const hit = (want && all.find((g) => [g.admin1, g.admin2, g.country, g.country_code].some((x) => x && x.toLowerCase().startsWith(want)))) || all[0];
  if (!hit) throw new Error(`Couldn't find "${place}". Try the nearest town, or add the country, like Paris, France.`);
  return { name: [hit.name, hit.admin1 !== hit.name && hit.admin1, hit.country_code].filter(Boolean).join(", "),
    lat: hit.latitude, lon: hit.longitude, f: FAHRENHEIT.has(hit.country_code) };
}

// Now and today, where you are: { place, temp, sky, high, low, rain, unit }.
async function fetchNow(place) {
  const p = await find(place);
  const w = await getJSON(`${SKY}/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1&temperature_unit=${p.f ? "fahrenheit" : "celsius"}`);
  const n = (x) => (Number.isFinite(x) ? Math.round(x) : null);
  return { place: p.name, temp: n(w.current?.temperature_2m), sky: WMO[w.current?.weather_code] || "", high: n(w.daily?.temperature_2m_max?.[0]),
    low: n(w.daily?.temperature_2m_min?.[0]), rain: n(w.daily?.precipitation_probability_max?.[0]), unit: p.f ? "°F" : "°C" };
}

// Fetched at most every 30 minutes (see keep.js).
const load = keep(30 * 60_000, fetchNow, null);

// What buddies are told: "Where they are (Chicago, Illinois, US) it's 37°F, clear. Today: high 60°F, low 36°F."
function say(w) {
  if (!w || w.temp == null) return "";
  const today = [w.high != null && `high ${w.high}${w.unit}`, w.low != null && `low ${w.low}${w.unit}`, w.rain >= 30 && `${w.rain}% chance of rain`].filter(Boolean);
  return `Where they are (${w.place}) it's ${w.temp}${w.unit}${w.sky ? `, ${w.sky}` : ""}.${today.length ? ` Today: ${today.join(", ")}.` : ""}`;
}

module.exports = { load, say, find };
