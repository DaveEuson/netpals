# Netpals

A 2003-style buddy list where the buddies are AI personas who IM you through the day. Beige windows, blue title
bars, door sounds when buddies sign on. It runs on your computer and talks to a model on your computer when it can.

## 60-second setup

You need Node 20 or newer. For a fully local brain, also run [Ollama](https://ollama.com) or
[LM Studio](https://lmstudio.ai) with an instruct model of 7B or more (for example `ollama pull mistral:7b`).

```bash
npm install
npm start
```

First launch is a three-step setup. Step one is **Get a screen name**: pick a screen name and password, and if you
like, your age, gender and a few lines about you. Step two is **Quick questions**: five one-liners (what you do all
day, what you're into, your hours, a pet peeve, what your buddies should bug you about), all optional. Step three
shows the brain. Netpals looks for a model server on
`localhost:11434` (Ollama) and `localhost:1234` (LM Studio), picks the smallest instruct model of 7B or more, and
shows you what it chose. Press **Sign On**.

After that, every launch opens the **Sign On** window. Tick **Save password** to sign on without typing it, or
**Auto-login** to skip the window.

Signing on dials up. A **Connecting to Netpals** window walks through five steps in about seven seconds. Tick
**Modem sound** for a synthesized 56k handshake; it's off by default and remembered once on. The first sign-on plays
the whole thing; after that the window has a **Skip** button, and Cancel takes you back to Sign On.

No local server? It falls back to OpenRouter with `google/gemini-2.5-flash`. Paste a key on the welcome screen, or
set `OPENROUTER_API_KEY` in your environment before `npm start`. A key from the environment is used but never saved.

Your three starting buddies are created the first time the app runs:

| Buddy | Who | Era |
|---|---|---|
| 🌊 stillwaterMB | a calm coach | 1999 |
| ⚡ xXtashaRAWRxX | a hype friend | 2006 |
| ☕ gordo_in_accounting | a dry-witted coworker | 2003 |

## You

Buddies read your age, gender, about lines and quick-question answers, but not your screen name or password. Leave gender blank and they're
told not to guess it. Change any of it, or your password, in **Setup** under **You**.

The password is kept only as a salted scrypt hash. It locks the Sign On window; it doesn't encrypt your chats.
Forgot it? Quit Netpals and run this, then start it again to pick a new one. Your buddies and chats stay.

```bash
npm run reset-password
```

## Using it

- **Chattiness** at the bottom of the Buddy List sets how often buddies IM you. The levels are off, about 2, 5, 10
  and 20 a day.
- **Away** pauses all pings. When you come back, the next buddy to IM you knows what your away message said.
- **Add** makes a new buddy. Randomize invents one from a one-line vibe, or Build your own fills in a form.
- **Setup** changes you, the brain, quiet hours (10pm to 8am by default), theme, sounds and notifications.
- Click a buddy to IM them. Click their name in the IM window for their profile and what they remember about you.
- 👍 and 👎 on a message make that buddy ping you a bit more or less. Three 👎 in one day also turns Chattiness
  down a notch.
- Right-click a buddy to remove them.
- **Still there?** Leave a buddy's IM unanswered for 4 to 7 minutes and a buddy who's the type checks in once, in
  their own words. Tasha and Gordon do this; Marisol gives you space. Randomize decides from the personality. Switch
  it per buddy in their profile or on the Add form, or for everyone in **Setup**. Away, quiet hours and Chattiness Off
  keep check-ins quiet too.

Buddies keep to 1 or 2 sentences, never send lists, and ask at most one question.

## Themes

Setup has five themes: Dial-Up, Olive, Silver, Midnight (dark) and Bubblegum. **Go dark automatically when Windows
does** switches to Midnight with your system. Pick **Custom** to change six colors and watch every window follow.
Save a custom theme to a file to share it, and load a file to use someone else's. A theme file is plain JSON:

```json
{ "base": "dialup", "win": "#ece9d8", "panel": "#ffffff", "ink": "#1b1b1b", "title": "#0a50cc", "accent": "#0b3fb0", "them": "#a3141c" }
```

## Netpals Plus

| Free | Plus, a one-time license |
|---|---|
| Up to 3 buddies, built by hand | As many buddies as you like, plus Randomize |
| Chat, away messages, check-ins, notifications | Everything in Free |
| Dial-Up and Midnight themes | Every theme, custom colors and theme files |

Paste a license key in **Setup** under **Netpals Plus** and press **Unlock**. Keys are checked on your computer;
nothing is sent anywhere.

### Selling keys

A key is the buyer's name, email and date, signed with your private key. The app holds only the public half, in
`lib/license.js`. Your private key is at `~/.netpals/license-private.pem`, outside this folder. Back it up and
never commit it. If you lose it, you can't make keys that copies already out there will accept.

To make a key for a buyer, run this and send them the line it prints:

```bash
npm run license -- "Buyer Name" buyer@example.com
```

Sell through a store like Gumroad or Lemon Squeezy, then send keys by hand for now. To make yourself a key for
your own copy, run the same command with your name.

Once you have a store page, put its address in `BUY_URL` at the top of `lib/license.js`. The free version's Setup
then shows a **Get Netpals Plus** link.

`npm run license -- init` made the key pair. It refuses to run again so it can't replace the key your sold licenses
depend on.

## Installing it

```bash
npm run dist
```

That builds `dist/Netpals Setup 0.1.0.exe`, a Windows installer that lets you pick the folder. An installed copy keeps
its data in `%APPDATA%\Netpals` instead of `data/`. The installer isn't code-signed yet, so Windows SmartScreen says
"unrecognized app" the first time; **More info, Run anyway** gets past it. Signing takes a certificate (or Azure
Trusted Signing) and a few lines under `build` in `package.json`.

`npm run icon` redraws `assets/icon.png` and `assets/icon.ico` from the Buddy List's speech-bubble mark.

## Buddies feel slow or dumb?

Run [RigMatch](https://github.com/DaveEuson/RigMatch) to find a model that fits your machine, then pick it in Setup.

## Where things live

- `data/netpals.db` holds settings, buddies and messages (an installed copy: `%APPDATA%\Netpals\netpals.db`). Delete
  it to start over. Set `NETPALS_DATA` to keep it somewhere else.
- `lib/context.js` is where calendar or meeting summaries can plug in. Whatever it returns, every buddy reads as
  "what you know about their day".
- `lib/scheduler.js` decides when buddies talk. `lib/prompts.js` holds every prompt and the cleanup rules.
- `assets/*.wav` are original sounds made by `npm run sounds`.

## Checks

```bash
npm run check:llm
```

```bash
npm run check:scheduler
```

```bash
npm run check:scheduler -- --live
```

```bash
npm run check:license
```

`check:llm` detects a server and asks it for one line. `check:scheduler` simulates 400 days of pings per chattiness
level and tests quiet hours, the 20-minute gap, away, cleanup and feedback, all in a throwaway data folder.
Add `-- --live` to also get one real ping from each starting buddy. `check:license` signs keys with a throwaway key
pair and checks that genuine keys pass and tampered or foreign ones don't.
