# Developing Netpals

Netpals is an Electron app in plain HTML, CSS and JavaScript, with SQLite (better-sqlite3) for storage. There's no
build step for the code itself.

## Running it

You need Node 20 or newer.

```bash
npm install
npm start
```

Running from source keeps its data in `data/netpals.db` next to the code. Set `NETPALS_DATA` to keep it somewhere
else (a second profile, say), and `NETPALS_OLLAMA` to use an Ollama other than `http://localhost:11434`. Forgot the
password in a source copy?

```bash
npm run reset-password
```

## Where things live

| Path | What's there |
|---|---|
| `main.js` | Wires the main process together, makes the scheduler, decides what opens first |
| `main/` | One file per part of the main process, each registering its own IPC channels: `windows`, `menus`, `pictures`, `account`, `buddies`, `settings`, `storage` |
| `lib/scheduler.js` | When buddies talk, presence drift, replies, check-ins, Buddy Chat turns, away |
| `lib/prompts.js` | Every prompt a buddy sees, and the cleanup that holds their answers to the house rules |
| `lib/llm.js` | One `chat()` over Ollama, LM Studio and OpenRouter; model detection; whether a model can see; downloading a model into Ollama, and the models Setup suggests |
| `lib/db.js` | Settings, buddies and messages, the starting buddies, and migrations for older databases |
| `lib/context.js` | What every buddy reads as "what you know about their day" (Setup's Your day), and whether a meeting's on |
| `lib/calendar.js` | Reading a calendar's secret iCal link: repeats, skipped and moved ones, what's on now, what buddies are told |
| `lib/weather.js` | The weather where you are, from Open-Meteo (no key); `NETPALS_WEATHER` points it elsewhere |
| `lib/fieldy.js` | Today's conversation titles and summaries from Fieldy's public API (Plus, local brains only); `NETPALS_FIELDY` points it elsewhere |
| `lib/keep.js` | Remembers what a slow fetch returned, so a buddy's answer never waits on the calendar, the weather or Fieldy |
| `lib/license.js` | Netpals Plus keys (see [SELLING.md](SELLING.md)) |
| `ui/` | One HTML page and script per window; `chrome.js` and `xp.css` are shared by all of them |
| `preload.js` | The whole renderer-to-main surface |
| `tests/` | The test runner, the harness the window tests share, a fake model, and the tests |
| `scripts/` | Model checks, the smoke test, icons, sounds, license keys |

Model and user text only ever reaches a page through `textContent`. Windows never navigate away from their own page
or open other windows (`main/windows.js`), and `settings:set` ignores the settings only main may change.

## Tests

```bash
npm test
```

The license, calendar, weather, Fieldy and scheduler checks, then a window test for each part of the app (setup and
sign-on, Connecting, Plus, the Buddy List, Away, IMs, pictures, Buddy Chat, Setup, getting a model, Your day, window
polish, one copy at a time, security).
Each runs the real `main.js` under Electron in a throwaway data folder, with windows off-screen, against
`tests/fake-model.js`: an OpenAI-compatible stand-in that answers in milliseconds and misbehaves on request
(`fake:error`, `fake:slow`, `fake:empty`, `fake:huge`, `fake:junk`). It downloads too, the way Ollama's `/api/pull`
does, and the tests point `NETPALS_OLLAMA` at it. It's a calendar as well, at `/calendar.ics`, with an appointment
on right now, and stands in for Open-Meteo and Fieldy's API (the tests point `NETPALS_WEATHER` and `NETPALS_FIELDY` at
it). About four minutes; screenshots land in `tests/out`.

```bash
npm test -- room settings --verbose
```

Runs just those tests and shows everything they printed.

```bash
npm test -- --live
```

Adds the parts that need a real model on Ollama: whether `gemma3:4b` sees a picture, Setup's model list and Test it
(and OpenRouter's, when `OPENROUTER_API_KEY` is set), and a real ping from each starting buddy.

```bash
npm test -- stress
```

A year of heavy use at once (60 buddies, 50,000 IMs, 40 pictures), a misbehaving model, and 120 IM windows opened and
closed under a storm of presence changes.

```bash
npm test -- screenshots
```

Remakes the README's pictures in `docs/images` from the real app, with a staged conversation. Run on a Mac (the
test workflow does), `mac.png` shows Pinstripe in Lucida Grande, as Mac users see it.

Checks that need the seller's signing key (unlocking Plus) skip on machines that don't have it.

## Picking a brain

```bash
npm run check:models
```

Runs every chat model Ollama has (or the ones you name after `--`) through the real prompts: one ping and one reply
per starting buddy, with timings and which house rules the raw answers broke.

```bash
npm run check:chat -- llama3.1:8b
```

Plays an eight-line conversation at each starting buddy and prints it, so you can judge whether they stay coherent,
in character and remember things. A model with a slash in its name (`google/gemini-2.5-flash`) goes to OpenRouter.

## Building the installers

```bash
npm run dist
```

Builds `dist/Netpals Setup <version>.exe`, a classic wizard: welcome, license, folder, finish. Its words and the
Start menu's Reset Netpals password shortcut are in `build/installer.nsh`; its pictures are `build/*.bmp`. The
installer isn't code-signed yet; signing takes a certificate (or Azure Trusted Signing) and a few lines under
`build.win` in `package.json`.

```bash
node scripts/smoke.js dist/win-unpacked/Netpals.exe
```

Smoke-tests a packaged build (run `npx electron-builder --win --dir` first): it signs on, buddies come online, a
second launch hands over, `--reset-password` works, and nothing lands in the crash log.

**macOS** builds need a Mac. Two GitHub workflows do it on GitHub's Macs:

- `.github/workflows/test.yml` (run by hand from the Actions tab, or `gh workflow run test.yml`) runs the whole test
  suite and the smoke test on macOS and keeps the screenshots.
- `.github/workflows/build.yml` builds the Windows installer and the Mac disk images (Apple Silicon and Intel) when a
  `v*` tag is pushed, or by hand, and attaches them to a draft release.

Without an Apple Developer account the Mac app is ad-hoc signed: it runs, but macOS refuses it when downloaded until
the person runs `xattr -cr /Applications/Netpals.app`. With an account, add `CSC_LINK`, `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` as repository secrets and the workflow signs and
notarizes. macOS minutes count ten times against a private repository's Actions allowance.

## Icons and sounds

`npm run icon` redraws every icon from the Buddy List's speech-bubble mark: the app and installer icons, the Windows
tray icons (quiet and blinking), the macOS menu bar silhouettes, and the installer's sidebar and header. `npm run
sounds` remakes the original door and IM sounds in `assets/`.

## Themes

A theme file is plain JSON, six colors over one of the five presets:

```json
{ "base": "dialup", "win": "#ece9d8", "panel": "#ffffff", "ink": "#1b1b1b", "title": "#0a50cc", "accent": "#0b3fb0", "them": "#a3141c" }
```
