# CLAUDE.md

## What this is

AMBIENT: a single-page app that listens to a room or a TV, transcribes it in the
browser, and asks Claude for short teletext-style explanations of names and
references it hears. Deployed to GitHub Pages from `main`.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The entire app — markup, styles and script in one file |
| `worker/index.js` | Optional Cloudflare Worker holding the API key server-side |
| `worker/test.mjs` | Worker tests; `node worker/test.mjs`, no network or key needed |

## Constraints that matter

**`index.html` stays a single file with no build step and no dependencies.** It
is meant to be readable, forkable, and droppable onto any static host. Do not
introduce a bundler, a framework, or an npm dependency for the page. The only
external fetches are Google Fonts and the API call.

**Both auth modes must keep working.** `PROXY_URL` at the top of the script is
the switch: empty means each visitor supplies their own key under `SETUP`;
non-empty means requests go to the worker and no key is asked for or sent. A
change that only works in one mode is incomplete. In proxy mode the client must
never send an `x-api-key` header.

**The worker must never forward the client's body.** It rebuilds the request from
`model`, `max_tokens` and one user message. Forwarding what arrives turns it into
an open relay billed to the owner's account. Anything added there needs a
matching guard and a test.

## Debugging the microphone

Most "it's not working" reports are one of three distinct failures that look
identical from outside, so identify which before changing anything:

1. **Mic never opens** — `getUserMedia` rejects. Permission, device, or a
   non-secure context.
2. **Mic opens, hears nothing** — level meter flat. Muted, wrong device, too far
   from the speaker.
3. **Mic hears fine, nothing transcribes** — level meter moves, no text. Chrome
   cannot reach its online speech service. A VPN, private DNS or blocker.

The input level meter in the status strip exists to separate 2 from 3. Keep it,
and keep error messages naming the specific cause: the previous version swallowed
every recogniser error except `not-allowed`, which is what made this
undiagnosable in the first place.

Two more traps worth knowing:

- **Interim vs final results.** `CATCH THAT` is pressed mid-sentence, when the
  tail is still interim. Anything reading the transcript buffer must include
  `interimText` or it will see nothing in the common case.
- **`continuous` is ignored on Android Chrome.** Recognition ends after each
  utterance, so the `onend` restart is load-bearing, not a safety net. It has a
  circuit breaker to stop it looping invisibly against a wall.

## Testing browser changes

Chromium and Playwright are available. Stub `SpeechRecognition` and `fetch` via
`addInitScript` to drive the app deterministically; launch with
`--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream` and
grant the `microphone` permission, or `getUserMedia` rejects and nothing starts.
Headless Chromium has no capture device, so the recogniser reports
`audio-capture` there — that is the environment, not a regression.

## Models

Model IDs carry no date suffix (`claude-haiku-4-5`, not
`claude-haiku-4-5-20251001`). The `SETUP` picker and the worker's allowlist both
enumerate models — changing one without the other means a selectable model the
worker silently downgrades.
