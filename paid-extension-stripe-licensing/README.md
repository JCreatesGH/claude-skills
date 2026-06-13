# paid-extension-stripe-licensing

> Turn a client-side app into a paid product with a free tier and **offline-verified** signed license keys. The payment secret never ships in the client.

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills). Claude loads it when you ask to make an extension/app paid, add a license/upgrade flow, or wire up Stripe fulfillment. Full instructions in [`SKILL.md`](SKILL.md).

## The design in one breath

- The **Stripe secret key** lives only in a Cloudflare Worker you control. The client never contains it and never calls Stripe.
- **License keys are ECDSA P-256 signatures** over a tiny JSON payload. The client bundles only the **public** key and verifies keys offline with WebCrypto — no network needed. Only the holder of the private key (you + your Worker) can mint keys, so they can't be forged.
- **One-device activation** is the only thing that needs the network, and it **fails open**: if the activation server is unreachable, a validly-signed key still activates so paying customers are never locked out.

Honest framing: this deters casual sharing, not a determined tamperer — the right trade-off for a low-price product.

## Build order

1. `node scripts/license-tools.mjs keygen` — generate the signing keypair (private key → gitignored `secrets/`, public key → client).
2. Wire `templates/license-client.ts` into your app (free-tier gating + verify/activate).
3. `node scripts/license-tools.mjs issue --master` — mint your own unlimited key.
4. Deploy `templates/worker.js` per [`references/deployment-runbook.md`](references/deployment-runbook.md).
5. Point `ACTIVATION_BASE_URL` at the Worker, rebuild, repackage.

## ⚠️ You supply the secrets

Nothing secret is in this repo. These come from **you**, via Worker env vars / a gitignored `secrets/` file:

| Value | Where it goes |
| --- | --- |
| Stripe secret key (`sk_live_…`) | `wrangler secret put STRIPE_SECRET_KEY` |
| Stripe webhook secret (`whsec_…`) | `wrangler secret put STRIPE_WEBHOOK_SECRET` |
| License signing private key | `secrets/license-signing-key.json` (gitignored) + Worker env |
| Your Stripe Payment Link | replace `PAYMENT_LINK_URL` in `license-client.ts` |
| Your Worker URL | set `ACTIVATION_BASE_URL` in `license-client.ts` |

## Files

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Architecture, build order, key format, correctness gotchas. |
| `scripts/license-tools.mjs` | `keygen` / `issue` / `verify` CLI. |
| `templates/worker.js` | Cloudflare Worker: fulfillment, webhook, activation. |
| `templates/license-client.ts` | Offline verifier + activate/deactivate + free-tier gating. |
| `references/deployment-runbook.md` | `wrangler` deploy + Stripe wiring, with gotchas. |
