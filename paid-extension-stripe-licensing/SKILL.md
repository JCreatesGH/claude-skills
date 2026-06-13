---
name: paid-extension-stripe-licensing
description: Monetize a client-side app (Chrome/Firefox extension, desktop app, or any downloadable code) with a free tier and a paid license, using Stripe for payment and OFFLINE-verified signed license keys. The payment secret never ships in the client — a tiny Cloudflare Worker holds the Stripe secret, fulfills purchases (mints + emails a signed key), and enforces one-device activation; the client verifies keys offline against a bundled public key. Use when asked to "make this extension/app paid", add a license/upgrade flow, gate features behind a purchase, or set up Stripe fulfillment for downloadable software. Includes the key-signing CLI, a ready Cloudflare Worker, a client verifier, and the full wrangler deployment runbook.
---

# Paid client-side app with Stripe + offline license keys

## The one principle that drives the whole design

**Never ship a payment secret in downloadable code.** Anyone can unzip an
extension or decompile an app and read every file. So:

- The **Stripe secret key** lives ONLY in a server you control (here: a
  Cloudflare Worker). The client never contains it and never calls Stripe.
- **License keys are signatures, verified offline.** A key is an ECDSA P-256
  signature over a tiny JSON payload. The client bundles only the **public**
  key and verifies keys with WebCrypto — no network needed to validate. Only
  the holder of the **private** key (you + your Worker) can mint keys, so keys
  cannot be forged.
- **One-device enforcement is the only thing that needs the network**, and it
  fails OPEN: if the activation server is unreachable, a validly-signed key
  still activates so paying customers are never locked out.

Honest framing for the user: client-side licensing deters casual sharing, not
a determined tamperer. The signature stops forgery; the activation server
stops broad key-sharing. This is the right trade-off for a low-price product.

## Pieces (all in this skill)

| File | Role |
| --- | --- |
| `scripts/license-tools.mjs` | CLI: `keygen` (make signing keypair), `issue [--master]` (mint a key), `verify <key>`. Run with Node. |
| `templates/license-client.ts` | Client-side verifier + activate/deactivate + free-tier gating constants. Adapt paths/IDs to the target app. |
| `templates/worker.js` | Cloudflare Worker: `/success` (post-checkout page), `/webhook` (backup fulfillment), `/activate` + `/deactivate` (device binding). Holds the Stripe secret. |
| `references/deployment-runbook.md` | Step-by-step `wrangler` deploy + Stripe wiring, with the gotchas. |

## Build order

1. **Generate the signing keypair:** `node scripts/license-tools.mjs keygen`.
   Writes `secrets/license-signing-key.json` (PRIVATE — gitignore, back up; if
   lost you can never mint keys again) and the public key into the client. The
   keygen REFUSES to overwrite an existing private key or a live public key, so
   a fresh clone can't accidentally invalidate every sold key.
2. **Wire the client** (`license-client.ts`): `getLicenseStatus()` (re-verify
   the signature on every read so a hand-edited storage entry can't unlock the
   paid tier), gate features by an effective cap computed at use time —
   **never mutate the user's stored settings to enforce a limit** (it leaks
   into presets/saved state and silently caps a customer who pays later).
   Free-tier limits (watermark, page/usage cap) are applied at the
   point of output, checked against live license status, **failing closed**
   (treat a status-check error as unlicensed).
3. **Generate your own master key:** `node scripts/license-tools.mjs issue --master`
   (kind `mst` = unlimited devices). Keep it for yourself.
4. **Deploy the Worker** (see `references/deployment-runbook.md`).
5. **Set `ACTIVATION_BASE_URL`** in the client to the Worker URL, rebuild,
   repackage. Empty = keys validate offline with no device cap.

## Key payload & format

`RCPDF-<base64url(payloadJSON)>.<base64url(signature)>` where payload is
`{v, k:'std'|'mst', id, ts, n?}`. Sign with `dsaEncoding: 'ieee-p1363'` in
Node so the signature matches WebCrypto's ECDSA format in the client. Rename
the `RCPDF` prefix and storage keys per product.

## Correctness gotchas (each one was a real bug)

- **Mint deterministically per Checkout Session.** The `/webhook` and
  `/success` paths race on eventually-consistent KV and can both mint. Derive
  the payload `id` from an HMAC of `session.id` (and pin `ts` to
  `session.created`) so any number of concurrent mints produce the IDENTICAL
  key → one purchase = one activation slot.
- **Verify the Stripe webhook with ALL `v1` signatures**, not just the last —
  during webhook-secret rotation Stripe sends several; accept if any matches.
- **Handle `checkout.session.async_payment_succeeded`**, not only
  `checkout.session.completed`, or delayed payment methods never fulfill.
- **Normalize whitespace in pasted keys** (`raw.replace(/\s+/g,'')`) — emails
  hard-wrap ~200-char keys and break naive paste.
- **Don't promise an email you didn't send** on the success page — thread the
  actual `emailed` flag into the copy.
- **Re-verify the signature on every license read** in the client, not just at
  activation.
- **Both the Stripe dashboard AND the Chrome Web Store dashboard block browser
  automation** — guide the user click-by-click; supply copy-paste values.
- **The Stripe SECRET KEY must match the payment-link mode** (a live
  `buy.stripe.com` link needs `sk_live_…`). Rotate any secret ever pasted into
  a chat/doc.

## Activation enforcement note

`/activate` and `/deactivate` use KV get-then-put, which is eventually
consistent — two near-simultaneous activations can both succeed. Fine for a
cheap product; for strict enforcement move the `act:<id>` state to a Durable
Object (strongly consistent CAS). Support recovery: `verify` the key to get its
payload id, then `wrangler kv key delete --binding LICENSES "act:<id>"`.
