/**
 * Readable Capture PDF — Stripe fulfillment & activation worker (Cloudflare).
 *
 * THIS is where the Stripe SECRET key lives — never inside the extension.
 *
 * Routes:
 *   GET  /success?session_id=cs_…  Post-checkout page. Verifies the Checkout
 *                                  Session is paid via the Stripe API, mints
 *                                  (or re-shows) the license key, displays it,
 *                                  and emails it when Resend is configured.
 *   POST /webhook                  Stripe webhook (checkout.session.completed).
 *                                  Backup fulfillment path: mints + emails the
 *                                  key even if the customer closes the tab
 *                                  before the redirect.
 *   POST /activate                 {key, deviceId} → one-device enforcement.
 *   POST /deactivate               {key, deviceId} → frees the key to move it.
 *
 * Required configuration (wrangler secrets + KV binding, see README.md):
 *   STRIPE_SECRET_KEY        sk_live_… (or sk_test_… while testing)
 *   STRIPE_WEBHOOK_SECRET    whsec_… for the /webhook endpoint
 *   LICENSE_PRIVATE_KEY_JWK  contents of secrets/license-signing-key.json
 *   RESEND_API_KEY           optional — enables email delivery
 *   RESEND_FROM              optional — e.g. "Readable Capture <keys@yourdomain.com>"
 *   LICENSES                 KV namespace binding
 */

const KEY_PREFIX = 'RCPDF';
const PRODUCT_NAME = 'Readable Capture PDF';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return corsResponse(new Response(null, { status: 204 }));
      if (url.pathname === '/success' && request.method === 'GET') {
        return await handleSuccess(url, env);
      }
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env);
      }
      if (url.pathname === '/activate' && request.method === 'POST') {
        return corsResponse(await handleActivate(request, env));
      }
      if (url.pathname === '/deactivate' && request.method === 'POST') {
        return corsResponse(await handleDeactivate(request, env));
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response('Internal error', { status: 500 });
    }
  },
};

/* ------------------------------------------------------------------ *
 * Fulfillment.
 * ------------------------------------------------------------------ */
async function handleSuccess(url, env) {
  const sessionId = url.searchParams.get('session_id') ?? '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return htmlResponse(errorPage('Missing or malformed checkout session.'), 400);
  }
  const session = await stripeGet(env, `checkout/sessions/${sessionId}`);
  if (!session || session.payment_status !== 'paid') {
    return htmlResponse(
      errorPage(
        'This payment is not confirmed yet. If you just paid, wait a few seconds and refresh ' +
          'this page. If you were charged and this message persists, reply to your Stripe ' +
          'receipt email for support.',
      ),
      402,
    );
  }
  const record = await keyForSession(env, session);
  return htmlResponse(successPage(record.key, record.emailed ? record.email : null));
}

async function handleWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('Bad signature', { status: 400 });
  }
  const event = JSON.parse(payload);
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      await keyForSession(env, session);
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'content-type': 'application/json' },
  });
}

/** Idempotently mint (and email, once) the key for a paid Checkout Session.
 *  The payload id and timestamp are DERIVED from the session, so even if the
 *  webhook and the /success redirect race on eventually-consistent KV and
 *  both mint, the two key strings carry the identical payload — one purchase
 *  always maps to exactly one activation slot. */
async function keyForSession(env, session) {
  const kvKey = `sess:${session.id}`;
  const existing = await env.LICENSES.get(kvKey, 'json');
  if (existing && existing.key) {
    // Retry a failed/missing email once if email is now possible.
    if (!existing.emailed && existing.email && env.RESEND_API_KEY && env.RESEND_FROM) {
      existing.emailed = await sendKeyEmail(env, existing.email, existing.key);
      await env.LICENSES.put(kvKey, JSON.stringify(existing));
    }
    return existing;
  }

  const key = await mintLicenseKey(env, 'std', `stripe ${session.id.slice(0, 18)}`, {
    deterministicFrom: session.id,
    ts: (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
  });
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const record = { key, email, mintedAt: Date.now(), emailed: false };

  if (email && env.RESEND_API_KEY && env.RESEND_FROM) {
    record.emailed = await sendKeyEmail(env, email, key);
  }
  await env.LICENSES.put(kvKey, JSON.stringify(record));
  return record;
}

async function sendKeyEmail(env, to, key) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [to],
        subject: `Your ${PRODUCT_NAME} license key`,
        text:
          `Thanks for buying ${PRODUCT_NAME}!\n\n` +
          `Your license key (one device):\n\n${key}\n\n` +
          'To activate: click the extension icon -> paste the key under ' +
          '"Get the full license" -> Activate.\n\n' +
          'Keep this email — you can move the license to another machine by ' +
          'removing it in the extension Options first.\n',
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * License key minting & verification (must match the extension).
 * ------------------------------------------------------------------ */
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const b64urlToBytes = (value) => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function signingKey(env, usage) {
  const jwk = JSON.parse(env.LICENSE_PRIVATE_KEY_JWK);
  if (usage === 'verify') {
    // Strip the private scalar to import as a public key.
    const { d: _d, ...publicJwk } = jwk;
    return crypto.subtle.importKey('jwk', { ...publicJwk, key_ops: ['verify'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function mintLicenseKey(env, kind, note, options = {}) {
  let id;
  if (options.deterministicFrom) {
    // HMAC the session id with the private key material so the id is stable
    // across racing mints but not predictable from the public session id.
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JSON.parse(env.LICENSE_PRIVATE_KEY_JWK).d),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      new TextEncoder().encode(`rcpdf-id|${options.deterministicFrom}`),
    );
    id = b64url(new Uint8Array(mac).slice(0, 9));
  } else {
    id = b64url(crypto.getRandomValues(new Uint8Array(9)));
  }
  const payload = {
    v: 1,
    k: kind,
    id,
    ts: options.ts ?? Date.now(),
    ...(note ? { n: note.slice(0, 60) } : {}),
  };
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(env, 'sign'),
    new TextEncoder().encode(payloadB64),
  );
  return `${KEY_PREFIX}-${payloadB64}.${b64url(signature)}`;
}

async function verifyLicenseKey(env, raw) {
  // Same whitespace tolerance as the extension: emails hard-wrap long keys.
  const match = String(raw ?? '')
    .replace(/\s+/g, '')
    .match(new RegExp(`^${KEY_PREFIX}-([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`));
  if (!match) return null;
  const [, payloadB64, sigB64] = match;
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(env, 'verify'),
    b64urlToBytes(sigB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    return payload && payload.v === 1 && payload.id ? payload : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * One-device activation.
 * ------------------------------------------------------------------ */
async function handleActivate(request, env) {
  const { key, deviceId } = await request.json().catch(() => ({}));
  if (typeof deviceId !== 'string' || deviceId.length < 16) {
    return jsonResponse({ ok: false, error: 'Bad device id.' }, 400);
  }
  const payload = await verifyLicenseKey(env, key);
  if (!payload) return jsonResponse({ ok: false, error: 'Invalid key.' }, 400);
  if (payload.k === 'mst') return jsonResponse({ ok: true, master: true });
  const kvKey = `act:${payload.id}`;
  const current = await env.LICENSES.get(kvKey);
  if (current && current !== deviceId) {
    return jsonResponse({ ok: false, error: 'Already activated on another device.' }, 409);
  }
  await env.LICENSES.put(kvKey, deviceId);
  return jsonResponse({ ok: true });
}

async function handleDeactivate(request, env) {
  const { key, deviceId } = await request.json().catch(() => ({}));
  const payload = await verifyLicenseKey(env, key);
  if (!payload) return jsonResponse({ ok: false, error: 'Invalid key.' }, 400);
  if (payload.k === 'mst') return jsonResponse({ ok: true });
  const kvKey = `act:${payload.id}`;
  const current = await env.LICENSES.get(kvKey);
  if (current && current === deviceId) await env.LICENSES.delete(kvKey);
  return jsonResponse({ ok: true });
}

/* ------------------------------------------------------------------ *
 * Stripe helpers.
 * ------------------------------------------------------------------ */
async function stripeGet(env, path) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!response.ok) return null;
  return response.json();
}

/** Verify Stripe's `stripe-signature` header (t=…,v1=… HMAC-SHA256). */
async function verifyStripeSignature(payload, header, secret) {
  if (!secret) return false;
  // Stripe sends MULTIPLE v1 entries while a webhook secret is being rolled;
  // accept the event if ANY of them matches.
  let t = null;
  const v1s = [];
  for (const kv of header.split(',')) {
    const idx = kv.indexOf('=');
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  const timestamp = Number(t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  if (v1s.length === 0) return false;
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(`${t}.${payload}`),
  );
  const expected = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const matches = (provided) => {
    if (provided.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
  };
  return v1s.some(matches);
}

/* ------------------------------------------------------------------ *
 * Responses.
 * ------------------------------------------------------------------ */
function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAGE_STYLE = `
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #111827; color: #f3f4f6; display: flex; justify-content: center;
         padding: 48px 16px; margin: 0; }
  main { max-width: 560px; }
  h1 { font-size: 22px; }
  code.key { display: block; background: #1f2937; border: 1px solid #374151; border-radius: 10px;
             padding: 14px 16px; font-size: 13px; word-break: break-all; margin: 18px 0;
             user-select: all; }
  ol { color: #d1d5db; }
  .muted { color: #9ca3af; font-size: 14px; }
`;

function successPage(key, emailedTo) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${PRODUCT_NAME} — your license key</title><style>${PAGE_STYLE}</style></head><body><main>
<h1>Thanks! Here is your license key 🎉</h1>
<code class="key">${key}</code>
<ol>
  <li>Click the ${PRODUCT_NAME} icon in Chrome.</li>
  <li>Paste the key into the license box and press <strong>Activate</strong>.</li>
</ol>
<p class="muted">${
    emailedTo
      ? `A copy was emailed to ${escapeHtml(emailedTo)}.`
      : '<strong>Copy this key now and store it somewhere safe</strong> — it is shown only here.'
  } It works on one device — remove it in the extension Options if you want to move it to
another machine.</p>
</main></body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${PRODUCT_NAME}</title><style>${PAGE_STYLE}</style></head><body><main>
<h1>Hmm, that didn't work</h1><p>${message}</p></main></body></html>`;
}
