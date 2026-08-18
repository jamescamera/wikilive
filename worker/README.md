# AMBIENT lookup service

A Cloudflare Worker that sits between the page and the Anthropic API so the API
key never reaches a browser.

**This is optional.** Without it the app still works — but every visitor has to
paste their own Anthropic key under `SETUP`, which in practice means the site
only works for people who have one. Deploy this and it works for anyone who
opens it.

## What it does

The page POSTs a transcript; the worker attaches your key and forwards the
request. It does **not** pass the client's body through. It rebuilds the request
from scratch and forwards only three fields — `model`, `max_tokens` and a single
user message — because a proxy that forwards whatever it receives is an open
relay billed to your account.

Enforced on every request:

| Guard | Behaviour |
|---|---|
| Origin allowlist | Anything not in `ALLOWED_ORIGINS` gets a 403, with no CORS grant |
| Model allowlist | An unrecognised model falls back to Haiku 4.5, so nobody can bill you for Opus |
| `max_tokens` | Capped at 1000 |
| Prompt length | Truncated at 12,000 characters |
| Body size | Rejected over 32 KB |
| Request shape | Exactly one user message with string content, or 400 |
| Upstream errors | Logged in full, reported thinly — an Anthropic error body can name your account |

Misconfiguration fails closed: a missing `ALLOWED_ORIGINS` or `ANTHROPIC_API_KEY`
returns 500 rather than serving traffic unprotected.

## Deploy

```sh
cd worker

# 1. point it at the origin serving your page
#    edit ALLOWED_ORIGINS in wrangler.toml

# 2. store the key as a secret (never a var — vars are readable in the dashboard)
npx wrangler secret put ANTHROPIC_API_KEY

# 3. ship it
npx wrangler deploy
```

Then set the URL it prints as `PROXY_URL` at the top of `index.html`:

```js
const PROXY_URL = 'https://ambient-lookup.<your-subdomain>.workers.dev/';
```

The page picks it up on the next load: the API key field disappears from `SETUP`
and no key is asked for or sent.

## Before you deploy: two things worth doing

**Add a rate limit.** The guards above cap the cost of any *single* request; they
do not cap how *many* requests arrive. Anyone who can load your page can spend
your key. In the Cloudflare dashboard, add a Rate Limiting rule on the worker's
route — something like 20 requests per minute per IP is far above what a real
listener generates and well below what an abuser needs.

**Set a spend limit.** In the [Anthropic Console](https://console.anthropic.com),
create a dedicated key in its own workspace and give that workspace a monthly
budget. Then a mistake costs you the budget rather than the account, and you can
rotate the key without touching anything else.

## Tests

```sh
node test.mjs
```

21 checks covering origin enforcement, the abuse caps, request-shape validation,
fail-closed misconfiguration, and that upstream error detail is not echoed to the
browser. No network access and no key required — the upstream call is stubbed.
