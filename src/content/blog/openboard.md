---
title: How I built OpenBoard to use Codex Micro with Claude and other agents
description: The Codex Micro ships wired to one vendor's agent. OpenBoard is a free, open-source Mac app that lets you use a Codex Micro with Claude and other agents instead. Here's why I built it, and how it works.
date: 2026-08-09
image: /images/openboard-hero.jpg
---

I bought a Work Louder Codex Micro because hardware for your agents seemed like a good idea. Then I plugged it in and found the lights only talk to one thing: Codex, through the ChatGPT app.

That's a car that only drives on one road. The hardware is fine. The LEDs are just LEDs. But the pad shipped with OpenAI's name on it and OpenAI's agent behind it, and if you run Claude Code — which I do, most of the day — you own a very expensive set of keys that light up for somebody else's sessions.

So I wrote [OpenBoard](https://openboardapp.com). It's a free Mac app that lets you use a Codex Micro with Claude and other agents — it points the same LEDs at Claude Code instead. The pad stays stock: no reflash, no remap, no firmware of mine. It's MIT licensed and the whole thing is on [GitHub](https://github.com/camwilso/openboard).

## The problem worth solving

When you run several Claude Code sessions at once, the expensive question is *which one is blocked on a permission prompt*. It's cheap to answer and costly to miss — a session sitting on a yes/no question for twenty minutes is twenty minutes you thought you were parallel and weren't.

That's one bit of ambient status per session. It's a bad fit for a screen and a great fit for six LEDs you can see without looking.

## What the colors mean

I kept OpenAI's own color legend, so a key means the same thing whether Codex or Claude painted it.

| State | Color | Meaning |
|---|---|---|
| idle | dim blue | session started, nothing running |
| working | blue, breathing | turn in progress |
| **awaiting** | **orange, breathing** | **blocked on a permission prompt — go here** |
| done | green | turn finished, and it holds until you go back |
| error | red, breathing | turn failed |

**Done holds.** Work that finished while you were making coffee is still green when you look, instead of having quietly reverted to idle while you weren't there.

## The ring fires and goes dark

Six small keys can't be read from across the room, so the outer ring summarizes the whole board. It's dark by default and only fires when something changes.

![The outer ring lit green, mid-lap, after a session finished](/images/openboard-ring.jpg)

A chat finishing gets one slow green lap. A chat stopping to ask something gets an orange lap. A failure gets a red heartbeat — a different *shape*, not just a different color, because peripheral vision reads motion before hue and a failure must never be mistakable for a completion.

A ring that's always lit is furniture. One that's dark until something happens is a notification.

## Keys that stay put

A session claims a key when it starts and keeps it. Keys get reused only after six newer sessions have cycled through, and never one that's currently signaling that it needs input.

This is deliberately unlike the pad's stock behavior, where the key number is your rank in a live recency sort — so typing in one chat can repaint four other keys. Status you can't trust is worse than no status.

![The menu bar popover: four live sessions, two waiting on a permission prompt](/images/openboard-popover.png)

Press an Agent key to jump to that chat. In Terminal it finds the exact tab; in VS Code it reveals the panel already holding that conversation. Nothing is ever *opened* by a jump — an approximate jump beats an unrequested one that rearranges your editor.

The same six states sit in the menu bar, so the board is still readable when the pad's across the room or in a bag.

![The status item — six dots mirroring the pad](/images/openboard-menubar.png)

## How I built it

The pad speaks an undocumented JSON-RPC over USB HID. Requests are chunked across 64-byte output reports — report ID `0x06`, channel `0x02`, then up to 61 bytes of payload — and responses come back the same way, reassembled by accumulating chunks until the buffer parses as JSON. Lighting a key is one `v.oai.thstatus` call carrying a slot index, a packed RGB color, brightness, an effect code and a speed.

Getting a key to light is the easy half. Everything between a Claude Code session and that light is the part that took the time.

It goes: Claude Code fires a hook, the hook runs a tiny helper, the helper writes one JSON object to a Unix socket at `~/.claude/openboard/hook.sock` and exits.

Three decisions in that sentence are load-bearing.

**A Unix socket, not a TCP port.** It can't be reached from off-host at all, it's protected by ordinary filesystem permissions, and it can't collide with whatever else is already listening on some port you picked.

**A helper that does nothing.** Hooks run inline with your session, so anything slow or wedged in there is felt as a stalled prompt. The helper forwards stdin and exits — it can't block on device I/O, a write lock, or a pad that's gone to sleep. An earlier pass ran the whole registry update and a device repaint inside the hook, which is exactly the wrong place for it.

**Fail-open, always.** If the app isn't running, the socket is missing, or the payload is malformed, the helper exits 0 and the session carries on unaware. A status light must never be able to break a session.

The app itself is Swift, a plain SwiftPM package with no runtime dependencies. The only network request it makes is a daily update check you can turn off. Nothing about your sessions leaves the machine.

## Almost everything is yours to change

I didn't want to ship six opinions welded shut. My defaults are a starting point, and the settings window opens up nearly all of it.

**The colors.** Every state — idle, working, awaiting, stalled, done, error — takes its own color, effect, brightness and speed. These are hardware colors: the swatch and the LED are the same number, so the editor offers the real presets and any hex besides, and deliberately not the system color picker, whose output is a screen color that only happens to look close.

**How long a color stays.** Done holding until you come back is the default, not the law. Give it a decay in seconds if you'd rather it fade, or leave it holding.

**The ring.** Which events fire a lap, in what color, at what speed — or none, if a dark ring is what you want. Ten built-in shows live on the same pane.

![Settings → Colors: the ring laps and the built-in shows](/images/openboard-shows.png)

**Every non-agent key.** Seven action keys, and 21 actions to put on them: approve the pending prompt with ⏎, reject with ⎋, type a snippet at the cursor, open a new Terminal tab, dictate by tap or hold or toggle, jump a tab forward or back, jump to the session on the next or previous occupied key, open the menu, open Settings, repaint the board, forget all sessions, everything off, the four arrows, and fun mode.

A good half of those aren't things a key remapper can hand you, whatever software you point at the pad. A remap sends a keystroke wherever focus happens to be. Approve has to know *which session is asking*, find that window — the exact Terminal tab, or the VS Code panel holding that conversation — and refuse to answer at all if it can't confirm what's in front of you. Same with jumping to the next occupied key: that's a fact about the board's state, not a keyboard event. Those actions only exist because something is already tracking sessions.

![Settings → Board: a key selected, with its action and the keycap picker](/images/openboard-settings.png)

Adding another is genuinely small. `KeyAction` is a string enum: add a case, give it a short label and a long one, and write what it does. The settings picker builds itself from `allCases`, so a new action shows up in the UI on the next build with no wiring. There's no plugin system and no config DSL — on purpose, since 21 actions is a list you read, not a language you learn. If a few more arrive and the flat picker starts to sag, it can grow groups or search. That's a UI problem, and a cheap one, which is the right kind of problem to leave until it's real.

**The joystick,** from a shorter list on purpose. A direction on a stick is a navigation gesture, so offering it "forget all sessions" is offering you a way to make a mistake with your thumb. It gets the arrows, tab and session movement, approve, reject and snippet.

**The dial** is press for the popover, hold for Settings. And key order gets calibrated once during setup, because colors are addressed per physical slot — ten seconds that stop the wrong key lighting for the wrong session.

## And other agents

Claude Code is wired end to end — OpenBoard writes its config, merging into `settings.json` so any other tool's hooks on the same events survive.

Two more are wired as far as they honestly can be: same helper, same socket, same payload. Their config is theirs to edit, so the app hands you the exact text rather than writing YAML into somebody's file.

Adding a fourth needs four things: a way to run a command on session events, a per-session ID that's stable for the life of the session, events for turn start / turn end / needs-a-human, and a local process. That's it. PRs welcome.

## Why it's open source

The thing I objected to was hardware that only answers to one vendor. Shipping the fix as a closed binary would have been a bit rich.

It's MIT. Clone it and `mac/tools/bootstrap.sh` builds it — you don't need an Apple Developer account to compile it yourself. Or install the signed build:

```sh
brew install --cask camwilso/tap/openboard
```

Open it and it walks you through the rest — permissions, key order, and the Claude Code hooks. It's a checklist rather than a wizard, because two of those only take effect after OpenBoard restarts. Stop and come back whenever; it works out what's left each time.

![Guided setup, three of five steps complete](/images/openboard-setup.png)

Each permission gets named for what it's actually for — Input Monitoring reads the pad, Accessibility types the ⏎ and the snippets — because they're granted separately and each one missing produces a differently shaped silent failure.

![Settings → Device: permissions and version](/images/openboard-device.png)

Fair warning: it rides a private HID command that can change with any ChatGPT, Work Louder, or firmware update. It's unofficial and experimental, and it isn't affiliated with or endorsed by OpenAI, Anthropic, or Work Louder.

Site: [openboardapp.com](https://openboardapp.com). Code: [github.com/camwilso/openboard](https://github.com/camwilso/openboard).
