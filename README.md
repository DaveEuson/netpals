# Netpals

A 2003-style buddy list where the buddies are AI personas who IM you through the day.

![The Netpals Buddy List next to an IM from gordo_in_accounting](docs/images/hero.png)

Beige windows, blue title bars, door sounds when buddies sign on, and a dial-up modem if you want one. Your
buddies have their own personalities and the year they're stuck in. They IM you on their own schedule, go idle and
away, remember what you tell them, and check in if you leave them hanging. Everything lives on your computer.

## Get it

**Windows 10 or 11 (64-bit):** download `Netpals Setup 0.2.0.exe` from the
[releases page](https://github.com/DaveEuson/netpals/releases) and run it. The installer isn't code-signed yet, so
Windows may say "Windows protected your PC" the first time: choose **More info**, then **Run anyway**.

**macOS (Apple Silicon or Intel):** download `Netpals-0.2.0-arm64.dmg` (Apple Silicon) or `Netpals-0.2.0-x64.dmg`
(Intel) from the same page, open it and drag Netpals to Applications. It isn't signed by Apple yet, so macOS refuses
to open a downloaded copy until you run this once in Terminal:

```bash
xattr -cr /Applications/Netpals.app
```

## Give it a brain

Netpals needs a language model to write your buddies' lines. The free way runs it on your computer. OpenRouter is
an optional paid alternative, if you'd rather not run one yourself.

**On your computer, free and private.** Install [Ollama](https://ollama.com) (or [LM Studio](https://lmstudio.ai))
and Netpals finds it by itself. No model yet? Netpals downloads one for you: the welcome screen offers
`llama3.1:8b`, and **Download** in Setup takes any model from [Ollama's library](https://ollama.com/library), with a
progress bar and a Stop button. A stopped download picks up where it left off next time.

| Model | What it's like |
|---|---|
| `llama3.1:8b` | The cleanest: short, in character, quick. A good first pick. |
| `mistral-nemo` | The most human-sounding; needs a little more memory and time. |
| `gemma3:4b` or `gemma3:12b` | Can see pictures you send. 4b is quick and terse. |

A 7B or 8B model wants about 8 GB of memory, and a graphics card makes it much quicker. What to expect: charm, not
brilliance. A model this size forgets, repeats itself, mixes up the date and won't pass the Turing test. That's
the trade for keeping everything on your computer.

**Not sure which model your computer can handle?** [RigMatch](https://github.com/DaveEuson/RigMatch) tries Ollama
models on your own hardware and tells you which one runs best. Type its pick into Setup's **Download** box and your
buddies use it as soon as it's in. New models come out all the time; RigMatch is how you find out whether one beats
what you have.

**OpenRouter, over the internet (optional).** You don't need it: a model on your computer is all Netpals needs. If
you'd rather not run one, or want sharper buddies, get a key at [openrouter.ai](https://openrouter.ai) and paste it
on the welcome screen or in Setup (or set `OPENROUTER_API_KEY`). Netpals uses `google/gemini-2.5-flash`, which is
sharper than any local model and costs a fraction of a cent per message. Your messages go to OpenRouter to be
answered.

## First run

Setup takes a minute: pick a screen name and password, answer five optional quick questions (what you do all day,
what you're into, your hours, a pet peeve, what your buddies should bug you about), and see which brain Netpals
found. If there's no good one on your computer, it offers to download one. Press **Sign On** and it dials up:

![The Connecting to Netpals window, halfway through dialing](docs/images/connect.png)

Tick **Modem sound** for the 56k handshake. After the first time there's a **Skip** button. Your three starting
buddies sign on one by one, with a door sound each:

| Buddy | Who | Lives in |
|---|---|---|
| 🌊 stillwaterMB | a calm coach who gives you space | 1999 |
| ⚡ xXtashaRAWRxX | a hype friend who checks in if you go quiet | 2006 |
| ☕ gordo_in_accounting | a deadpan coworker two cubicles over | 2003 |

## What you can do

- **IM a buddy** by clicking them. They answer in a sentence or two, with a typing line while they write. A quick
  burst of lines gets one answer, the way a person would give it.
- **Chattiness** at the bottom of the Buddy List sets how often buddies IM you first: off, or about 2, 5, 10 or 20
  times a day. Quiet hours (10pm to 8am unless you change them) keep them quiet.
- **Smileys and pictures.** The 🙂 button drops in an emoji, and classic emoticons like `:-)` are drawn as faces. The
  picture button (or dropping a png or jpg on the window) sends a picture; models that can see will look at it.
- **👍 and 👎** on a message make that buddy IM you a little more or less.
- **Away** pauses everyone. Pick when you'll be back and Netpals brings you back by itself. Leave the computer for
  ten minutes and you go away on your own; touch anything and you're back. Buddies hear where you went.
- **Buddy Info** (click a buddy's name in their IM window) shows their profile and what they remember about you.
  **Edit…** changes anything about them, **Forget all this** clears their memory, and **Lives in** picks the year
  their slang comes from, 1985 to now, or **Today**.
- **Add** makes a new buddy: build one yourself, or (with Plus) **Randomize** one from a one-line vibe.
- **Save…** in an IM window writes the conversation to a text file.
- **Link your calendar** in Setup and buddies know your day: they don't IM you first while something's on, and ask
  how it went after. Paste the calendar's secret iCal link (Google Calendar: Settings, your calendar, **Secret address
  in iCal format**; Outlook: Settings, Calendar, Shared calendars, **Publish a calendar**). No sign-in, and **Check
  it** shows exactly what buddies are told.
- **Closing the Buddy List** keeps you signed on, in the tray (the menu bar on a Mac); its icon blinks when an IM is
  waiting. Right-click it for **Sign Off**.

**Buddy Chat** puts your buddies in one room. Say something and one to three of them answer, sometimes to each other:

![Buddy Chat with three buddies arguing about the game](docs/images/room.png)

**Themes.** Setup has six: Dial-Up, Pinstripe, Olive, Silver, Midnight (dark) and Bubblegum, plus your own colors,
which you can save to a file and share. Netpals can go dark when your system does.

![The Buddy List in Dial-Up, Midnight and Bubblegum](docs/images/themes.png)

**On a Mac**, Netpals starts in **Pinstripe**, its own early-2000s Mac look: pinstriped windows, gel buttons, the
red and yellow window buttons on the left, and a default button that gently pulses. It's free, and it's in Setup on
Windows too.

![The Buddy List and an IM in Pinstripe](docs/images/mac.png)

## Netpals Plus

| Free | Plus, a one-time purchase |
|---|---|
| Up to 3 buddies, built by hand | As many buddies as you like, plus Randomize |
| IMs, Buddy Chat, away messages, check-ins, pictures | Everything in Free |
| Dial-Up, Pinstripe and Midnight themes | Every theme, custom colors and theme files |

Paste your key in **Setup** under **Netpals Plus** and press **Unlock**. Keys are checked on your computer; nothing
is sent anywhere.

## Your privacy

- Your screen name, password, buddies and every conversation stay in one folder on your computer. Netpals has no
  account, no server and no analytics.
- With a model on your computer, nothing leaves it.
- With OpenRouter, what a buddy needs to answer goes to OpenRouter and the model's maker: the conversation so far,
  what you told setup about yourself, what the buddy remembers, today's event names and times if you linked a
  calendar, and any picture you send. Your password never does.
- A linked calendar comes straight from Google or Outlook to your computer, with nothing in between. Netpals only
  reads it, never changes it, and keeps the link in your data folder. Treat that link like a password: anyone who
  has it can see your calendar.
- The password locks the Sign On window. It doesn't encrypt your conversations.

## Your data

Setup's **Storage** section shows how much room your IMs and pictures take and how much your disk has left, and
**Show the folder** opens it. That folder is everything: copy it to back up, delete it to start over.

- Windows: `%APPDATA%\Netpals`
- macOS: `~/Library/Application Support/Netpals`

A heavy year of IMs is about 5 MB; pictures take the room. If your disk drops under 1 GB free, Netpals tells you.

**Forgot your password?** On Windows, open **Reset Netpals password** from the Start menu. On a Mac, quit Netpals and
run `open -a Netpals --args --reset-password` in Terminal. Either way you pick a new one, and your buddies and
conversations stay.

## Platforms

| Platform | Netpals 0.2 |
|---|---|
| Windows 11, 64-bit | Yes |
| Windows 10, 64-bit | Should work (same build), not yet tested |
| macOS on Apple Silicon | Yes, not yet signed by Apple (see [Get it](#get-it)) |
| macOS on Intel | Built, not yet tested on an Intel Mac |
| Linux | Not yet |

## Something wrong?

- **"Nothing answered at localhost:11434"**: Ollama isn't running. Start it, or pick another brain in Setup.
- **Buddies are slow or say odd things**: try a different model in Setup (see the table above), or OpenRouter.
- **Netpals hit a snag**: the box has a **Copy details** button; the same details are in `netpals.log` in your data
  folder.
- **Starting Netpals again** brings the open one forward; only one runs at a time.

## Building from source

See [docs/DEVELOPING.md](docs/DEVELOPING.md): running it with `npm start`, the tests, and building the installers.

## License

Netpals is not open source. Using it is covered by [LICENSE.txt](LICENSE.txt). Its sounds, icons and artwork are
original.
