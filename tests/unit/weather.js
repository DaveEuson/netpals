// Runnable check for lib/weather.js:  npm test -- weather
// Finding your town (the biggest by that name, or the one in the state or country you add), °F where people say °F,
// what buddies are told, and plain errors. Against the fake model's stand-in for Open-Meteo.
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  process.env.NETPALS_WEATHER = `http://127.0.0.1:${server.address().port}`;
  const weather = require("../../lib/weather");
  const told = async (place) => weather.say(await weather.load(place, { fresh: true }));
  const err = (place) => weather.load(place, { fresh: true }).then(() => "no error", (e) => e.message);

  check((await told("Springfield")) === "Where they are (Springfield, Missouri, US) it's 37°F, light rain. Today: high 60°F, low 36°F, 40% chance of rain.",
    `a town with no state gets the biggest one, in °F in the US: "${await told("Springfield")}"`);
  check(/Springfield, Illinois/.test(await told("Springfield, Illinois")) && /Springfield, Illinois/.test(await told("springfield, il")), "adding the state picks that one, spelled out or as its first letters");
  check((await told("Paris")) === "Where they are (Paris, Île-de-France, FR) it's 3°C, light rain. Today: high 16°C, low 2°C, 40% chance of rain.", "°C everywhere else");
  check(/Couldn't find "Nowhere"/.test(await err("Nowhere")) && /Type your town/.test(await err("x")) && /Type your town/.test(await err(" , Ohio")), "a place it can't find, or nothing typed, says so");
  check(weather.say({ place: "Here", temp: 70, sky: "clear", high: 75, low: 60, rain: 10, unit: "°F" }) === "Where they are (Here) it's 70°F, clear. Today: high 75°F, low 60°F.", "a small chance of rain isn't mentioned");
  check(weather.say(null) === "" && weather.say({ place: "Here", temp: null }) === "", "no weather tells them nothing");
  server.close();
  process.env.NETPALS_WEATHER = "http://127.0.0.1:1";
  delete require.cache[require.resolve("../../lib/weather")];
  check(/Couldn't reach the weather service/.test(await require("../../lib/weather").load("Paris", { fresh: true }).catch((e) => e.message)), "no answer from the weather service says so");

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
