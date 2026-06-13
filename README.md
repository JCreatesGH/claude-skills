# claude-skills

A small collection of [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) I built for Claude (Claude Code / Claude Desktop). Each skill is a self-contained folder with a `SKILL.md` that Claude loads **on demand** when your request matches what the skill does — plus the scripts, templates, and reference docs it needs to actually do the work.

These are real, battle-tested skills extracted from shipping projects. Where a skill needed a secret, a live URL, or anything account-specific, that value has been replaced with a clearly-marked placeholder — so everything here is safe to read, fork, and adapt. **You** supply your own keys/links.

| Skill | What it does | Best for |
| --- | --- | --- |
| [`chrome-store-assets`](chrome-store-assets/) | Generates exact-dimension Chrome Web Store graphics (icon, promo tiles, framed screenshots) on macOS with zero image libraries — pure SVG → PNG via the built-in `sips`. Includes a full Chrome Web Store listing-field cheat sheet. | Shipping a browser extension (or any app) to a store, or making pixel-exact PNGs on a Mac without ImageMagick/node-canvas. |
| [`paid-extension-stripe-licensing`](paid-extension-stripe-licensing/) | Turns a client-side app (extension/desktop/downloadable) into a paid product with a free tier and **offline-verified** signed license keys. The Stripe secret never ships in the client — a tiny Cloudflare Worker fulfills purchases and enforces one-device activation. | Monetizing downloadable software where you can't trust the client and don't want to run a heavy backend. |
| [`servicenow-updateset-qa-atf`](servicenow-updateset-qa-atf/) | Reviews a ServiceNow update set against its Jira story (change manifest, code/ACL review, AC traceability, risk score) and then authors deployable ATF tests as ServiceNow SDK (Fluent) code. | Pre-promotion QA of ServiceNow changes and auto-generating automated tests for them. |

---

## Installing a skill

A skill is just a folder containing a `SKILL.md`. To use one:

**Claude Code / Claude Desktop (personal skill, available everywhere):**

```bash
# clone, then copy the skill(s) you want into your personal skills directory
git clone https://github.com/JCreatesGH/claude-skills.git
cp -R claude-skills/chrome-store-assets ~/.claude/skills/
```

Restart your Claude client. The skill activates automatically when a request matches its `description` — you don't invoke it manually.

**Project-scoped (only inside one repo):** copy the folder into `<your-project>/.claude/skills/` instead.

**As a `.skill` bundle (for upload-based installs):** grab a prebuilt bundle from the [**Releases**](https://github.com/JCreatesGH/claude-skills/releases) page, or build one yourself (a `.skill` is just a zip with the skill folder at its root):

```bash
zip -r chrome-store-assets.skill chrome-store-assets -x '*.DS_Store'
```

---

## The skills

### 🎨 chrome-store-assets

Generate Chrome Web Store (and general app-store) graphics on macOS **without any image library** — store icon (128×128), small promo tile (440×280), marquee (1400×560), and framed 1280×800 screenshots — by designing in SVG and rasterizing with the built-in `sips` tool. Also ships a reference for the Chrome Web Store listing fields (permission justifications, privacy-practices answers, categories, character limits, and the "Title/Summary are locked to the manifest" gotcha).

**Use it when** you're preparing a Chrome extension (or any app) for store submission, or whenever you need exact-dimension PNGs with text/gradients/embedded images on a Mac and ImageMagick / node-canvas aren't available.

**What's inside**

- `SKILL.md` — the SVG → PNG technique, required asset sizes, and hard-won submission gotchas.
- `scripts/make-promo-tiles.mjs` — writes branded SVGs for the icon / small tile / marquee from a small config block, then rasterizes them. Pure Node + `sips`, no `npm install`.
- `scripts/frame-screenshots.mjs` — turns raw screenshots into store-spec 1280×800 PNGs (branded background, rounded frame + shadow, caption).
- `references/listing-fields.md` — ready-to-paste answers for the developer-dashboard Privacy practices tab and every common permission.

### 💳 paid-extension-stripe-licensing

Monetize a client-side app with a free tier and a paid license using **Stripe for payment** and **offline-verified signed license keys**. The design principle: never ship a payment secret in downloadable code. The Stripe secret lives only in a tiny Cloudflare Worker that fulfills purchases (mints + emails a signed key) and enforces one-device activation; the client bundles only a **public** key and verifies licenses offline with WebCrypto — no network needed to validate, and activation fails *open* so paying customers are never locked out.

**Use it when** you're asked to "make this extension/app paid," add a license/upgrade flow, gate features behind a purchase, or set up Stripe fulfillment for downloadable software.

**What's inside**

- `SKILL.md` — the architecture, build order, key format, and a list of correctness gotchas (each one was a real bug).
- `scripts/license-tools.mjs` — CLI to generate a signing keypair (`keygen`), mint keys (`issue [--master]`), and `verify` a key.
- `templates/worker.js` — the Cloudflare Worker: `/success` post-checkout page, `/webhook` backup fulfillment, `/activate` + `/deactivate` device binding. Holds the Stripe secret.
- `templates/license-client.ts` — the client-side offline verifier + activate/deactivate + free-tier gating.
- `references/deployment-runbook.md` — step-by-step `wrangler` deploy + Stripe wiring.

> ⚠️ **You supply the secrets.** The Stripe secret key, webhook secret, and your signing private key are read from Worker env vars / a gitignored `secrets/` file — none of them are in this repo. The example payment link and activation URL are placeholders; replace them with your own.

### 🛠️ servicenow-updateset-qa-atf

End-to-end ServiceNow update set QA review **and** ATF test generation. Given a Jira story and its ServiceNow update set(s), it produces a pre-promotion review (change manifest, code review, ACL/security pass, completeness/dependency check, acceptance-criteria traceability, risk score with test routing), then authors deployable ATF tests as ServiceNow SDK (Fluent) TypeScript. It complements ATF and Instance Scan; it doesn't replace runtime testing.

**Use it when** someone supplies a ServiceNow update set (XML export) and/or a Jira story key and wants it reviewed, QA'd, risk-assessed, promotion/CAB-checked, or wants ATF/automated tests generated — even if "ATF" or "review" isn't said explicitly.

**What's inside**

- `SKILL.md` — inputs, the two-phase workflow, and operating principles.
- `scripts/parse_updateset.py` — dependency-free parser that builds a change manifest from `sys_update_xml` records, catches the "container-only export" mistake, and flags risk-relevant artifact types.
- `references/analysis-workflow.md` — the full Phase 1 review + Phase 2 ATF instructions, risk rubric, and tunable code-review rule set.
- `references/fluent-atf-api.md` — verified ServiceNow SDK (Fluent) ATF API with examples.
- `references/deploy-and-run.md` — how to deploy the generated ATF via the ServiceNow SDK and run it.
- `examples/` — a worked review + ATF pair showing the expected shape and depth.

---

## A note on safety

These skills generate and run code, talk to paid APIs (Stripe), and touch external systems (ServiceNow, Chrome Web Store). Treat the templates as starting points:

- Replace every `REPLACE_WITH_…` / placeholder value with your own.
- Keep signing keys and API secrets out of version control (each skill says exactly where they belong).
- The ServiceNow skill does **static** analysis and is designed to deploy/run ATF against **non-production** instances only.

## License

[MIT](LICENSE) © Joshua John. Use them, fork them, adapt them. No warranty.
