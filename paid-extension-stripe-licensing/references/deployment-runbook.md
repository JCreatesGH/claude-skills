# Deployment runbook — Stripe fulfillment Worker (Cloudflare)

The Worker is the only place the Stripe secret lives. ~10 minutes.

Prereqs: a Stripe account with a **Payment Link** for the product, a free
Cloudflare account, Node available (`npx`). `templates/worker.js` +
a `wrangler.toml` go in a `server/stripe-worker/` folder.

`wrangler.toml`:
```toml
name = "PRODUCT-license"
main = "worker.js"
compatibility_date = "2026-01-01"
[[kv_namespaces]]
binding = "LICENSES"
id = "PASTE_KV_NAMESPACE_ID_HERE"
```

## Steps

1. **Log in:** `npx wrangler login` (opens browser → Allow). First run may
   prompt to install wrangler — accept.
2. **Create KV:** `npx wrangler kv namespace create LICENSES` → paste the
   printed `id` into `wrangler.toml`.
3. **Set secrets:**
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_… (match the link's mode!)
   # Pipe the multi-line JWK via stdin (interactive paste truncates at newline):
   npx wrangler secret put LICENSE_PRIVATE_KEY_JWK < ../../secrets/license-signing-key.json
   npx wrangler secret put RESEND_API_KEY           # optional: email via resend.com
   npx wrangler secret put RESEND_FROM              # e.g. Product <keys@yourdomain.com>
   ```
   Setting a secret before the first deploy prompts "create a Worker?" → yes.
4. **Deploy:** `npx wrangler deploy`. On first deploy it asks you to register a
   `*.workers.dev` subdomain (account-wide, hard to change later — pick
   deliberately). Final URL: `https://PRODUCT-license.<subdomain>.workers.dev`.
5. **Alive check:** open `…workers.dev/success` in a browser — a styled
   "Missing or malformed checkout session" page means it's live. (Type the URL
   by hand; copy-paste from a terminal sometimes mangles the scheme. The bare
   root returns 404 — that's normal, only specific paths respond.)
6. **Redirect the Payment Link:** Stripe → Payment Links → your link → Edit →
   After payment → "Don't show confirmation page → Redirect to your website":
   ```
   https://PRODUCT-license.<subdomain>.workers.dev/success?session_id={CHECKOUT_SESSION_ID}
   ```
   `{CHECKOUT_SESSION_ID}` is literal — Stripe fills it in.
7. **Webhook:** Stripe → Developers → Webhooks / Event destinations → Add →
   URL `…workers.dev/webhook`, scope "Your account", events
   **`checkout.session.completed`** AND
   **`checkout.session.async_payment_succeeded`**. Copy the signing secret:
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_…
   ```
   (Secrets apply live without redeploy.)
8. **Turn on activation in the client:** set `ACTIVATION_BASE_URL` to the
   Worker URL, rebuild, repackage, re-upload.

## Test

Cleanest end-to-end test of a live link: buy it once with your own card →
land on `/success` showing a `PRODUCT-…` key → paste in the app → unlocks →
**refund yourself** in Stripe (the fixed fee isn't returned). Or use full
Stripe test mode (test-mode link + `sk_test_…` + card `4242 4242 4242 4242`).

## Worker env summary

| Secret/binding | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Verify the Checkout Session is paid (`sk_live_…`). |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures (`whsec_…`). |
| `LICENSE_PRIVATE_KEY_JWK` | Sign (mint) license keys. Same key as the CLI. |
| `RESEND_API_KEY` / `RESEND_FROM` | Optional email delivery. |
| `LICENSES` (KV) | `sess:<id>` minted records, `act:<payloadId>` device bindings. |
