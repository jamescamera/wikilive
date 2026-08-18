/* ══════════════════════════════════════════════════════════
   AMBIENT lookup service

   A Cloudflare Worker that stands between the page and the Anthropic API
   so the API key never reaches a browser. Without it every visitor has to
   bring their own key; with it the site works for anyone who opens it.

   It is deliberately narrow. It accepts one shape of request, rewrites it
   from scratch, and forwards only the fields it recognises — a proxy that
   passes the client's body straight through is an open relay billed to you.
   ══════════════════════════════════════════════════════════ */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// only these can be billed to your key
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-sonnet-5',
  'claude-opus-5'
]);

const MAX_TOKENS_CAP  = 1000;   // cards are short; nothing legitimate needs more
const MAX_PROMPT_CHAR = 12000;  // ~2 minutes of transcript, generously
const MAX_BODY_BYTES  = 32768;

function corsHeaders(origin, allowed){
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, headers){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export default {
  async fetch(request, env){
    // ALLOWED_ORIGINS is a comma-separated list, e.g. "https://jamescamera.github.io"
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST'){
      return json({ error: { message: 'Use POST.' } }, 405, cors);
    }

    // An allowlist is the whole point: without it anyone can spend your key.
    if (allowed.length === 0){
      return json({ error: { message: 'Service misconfigured: ALLOWED_ORIGINS is not set.' } }, 500, cors);
    }
    if (!origin || !allowed.includes(origin)){
      return json({ error: { message: 'Origin not allowed.' } }, 403, cors);
    }
    if (!env.ANTHROPIC_API_KEY){
      return json({ error: { message: 'Service misconfigured: ANTHROPIC_API_KEY is not set.' } }, 500, cors);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES){
      return json({ error: { message: 'Request too large.' } }, 413, cors);
    }

    let body;
    try { body = JSON.parse(raw); }
    catch { return json({ error: { message: 'Body is not valid JSON.' } }, 400, cors); }

    const model = ALLOWED_MODELS.has(body.model) ? body.model : 'claude-haiku-4-5';

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length !== 1 || messages[0].role !== 'user' || typeof messages[0].content !== 'string'){
      return json({ error: { message: 'Expected exactly one user message with string content.' } }, 400, cors);
    }
    const content = messages[0].content.slice(0, MAX_PROMPT_CHAR);

    const maxTokens = Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP);

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        // rebuilt from scratch, so nothing the client sent can leak through
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      });
    } catch (err){
      return json({ error: { message: 'Upstream request failed: ' + err.message } }, 502, cors);
    }

    const text = await upstream.text();

    // Upstream failures are logged with detail but reported thinly: an
    // Anthropic error body can name the account, and visitors cannot act on it.
    if (!upstream.ok){
      console.error('anthropic ' + upstream.status + ': ' + text);
      const msg = upstream.status === 429
        ? 'The lookup service is rate limited. Try again in a moment.'
        : 'The lookup service could not complete that request.';
      return json({ error: { message: msg } }, upstream.status === 429 ? 429 : 502, cors);
    }

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
};
