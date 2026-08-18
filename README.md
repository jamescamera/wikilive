# wikilive

**AMBIENT** — teletext for whatever is being said around you.

Point your phone at the telly. It transcribes what it hears, and when a name goes
past that you didn't catch, you press `CATCH THAT` and it puts a short teletext
page on screen explaining what it was. Turn on `AMBIENT` and it surfaces things on
its own while you watch.

Live at [jamescamera.github.io/wikilive](https://jamescamera.github.io/wikilive/).

## How it works

`index.html` is the whole app — no build step, no dependencies, deployable to any
static host. Two moving parts:

- **Transcription** happens in the browser via the Web Speech API. Audio never
  leaves your machine as audio; only the resulting text is sent anywhere.
- **Lookups** go to the Anthropic API, which turns a scrap of messy transcript
  into a card: a corrected name, what it is, and why it came up.

`worker/` is an optional Cloudflare Worker that holds the API key server-side.

## Requirements

Chrome or Edge, on desktop or Android. The Web Speech API is what does the
transcribing and Safari and Firefox do not implement it.

It also needs **HTTPS** — browsers will not hand out a microphone otherwise — and
a working connection to an online speech service. Chrome does not transcribe
on-device; it streams audio to Google's servers. A VPN, private DNS, or blocker
in the way produces the confusing failure where the mic is clearly open and no
words ever arrive. The status strip has an input level meter for exactly this: if
it moves when you speak, the microphone is fine and anything still wrong is on
the network side.

## Running it

Open `index.html` over HTTPS or on localhost. A `file://` URL will not work —
it is not a secure context, so there is no microphone.

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Setting up the Claude side

You need an Anthropic API key either way. Get one from the
[Anthropic Console](https://console.anthropic.com), and while you are there:

- Put it in **its own workspace with a monthly budget**. A runaway loop or a
  leaked key then costs you the budget rather than the account.
- Note the **model picker** in `SETUP`. Haiku 4.5 is the default because cards
  should land while the programme is still on the thing being discussed; Sonnet 5
  and Opus 5 write richer cards more slowly.

Then pick one of two deployments:

**Bring-your-own-key (the default).** Every visitor pastes their own key under
`SETUP`. It is stored in their browser's localStorage and sent straight to
Anthropic. Nothing is stored on the site, so this is safe to host publicly — but
it only works for visitors who have a key, which is to say almost nobody.

**A shared key behind a proxy.** Deploy `worker/` and set `PROXY_URL` at the top
of `index.html`. The key stays on the server, the key field disappears from
`SETUP`, and the site works for anyone who opens it. You are then paying for
every visitor's lookups, so read [`worker/README.md`](worker/README.md) — it
covers the abuse guards, and the rate limit and spend cap you should add before
going public.

## Tests

```sh
node worker/test.mjs
```

The page itself has no test suite; it is verified by hand in a browser, since
what it does is microphone permissions and speech recognition.
