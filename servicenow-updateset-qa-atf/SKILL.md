---
name: servicenow-updateset-qa-atf
description: >-
  End-to-end ServiceNow update set QA review and ATF test generation. Given a Jira story and its
  ServiceNow update set(s), it produces a pre-promotion review (change manifest, code review, ACL/security
  pass, completeness/dependency check, acceptance-criteria traceability, risk score with test routing) then
  authors deployable ATF tests as ServiceNow SDK (Fluent) code. Use WHENEVER the user supplies a ServiceNow
  update set (XML export) and/or a Jira story key (e.g. SR-1234) and wants it reviewed, QA'd, risk-assessed,
  promotion/CAB-checked, or wants ATF/automated tests generated — triggers include "review this update set",
  "is this ready to promote/release", "QA this ServiceNow change", "generate ATF for this story", "write
  tests for this update set", even if "ATF" or "review" isn't said. Auto-pulls the story via an
  Atlassian/Rovo MCP and the update set via a ServiceNow/Now Assist MCP when connected, or works from
  pasted/attached XML.
---

# ServiceNow Update Set → QA Review + ATF Generation

## What this does and why

Manual QA of ServiceNow update sets is slow and inconsistent, and a large share of production escapes are
either (a) regressions/unintended changes that rode along with the intended change, or (b) requirements/scope
misses that no test framework catches. This skill makes a single change **faster to review** and **safer to
ship** by doing two things in sequence:

1. **Phase 1 — Pre-promotion review:** a static analysis of the update set against its Jira story.
2. **Phase 2 — ATF generation:** deployable ATF tests written as ServiceNow SDK (Fluent) TypeScript.

It complements ATF and Instance Scan; it does not replace runtime testing.

## Inputs and how to acquire them

The skill needs two things: the **Jira story** (description + acceptance criteria + comments) and the
**update set payload(s)** (the actual `sys_update_xml` change records, not just the container).

Acquire them using whatever is available, in this order. **Detect what connections exist before asking the
user to paste anything** — the whole point is to let them pass just IDs when they can.

### Jira story
- **If an Atlassian / Rovo / Jira MCP is connected:** fetch the issue by key (e.g. `SR-6364`). Pull the
  description, the **Acceptance Criteria** field, comments, linked issues, and any linked KB references.
- **Otherwise:** ask the user to paste the Jira story XML/text (or the key plus the AC).

### Update set(s)
- **If a ServiceNow / Now Assist MCP is connected:** resolve the update set by **name** (e.g.
  `Global.SR-6364.BEC5471.v2.0`) or **sys_id**, then retrieve its **`sys_update_xml` child records**
  (query `sys_update_xml` where the update set / remote update set matches). You need the `payload` of each
  child record — that's where the actual change lives.
- **Otherwise:** ask the user to attach the exported update set XML.

> **Critical data-integrity check (learn from experience):** a `sys_remote_update_set` or `sys_update_set`
> record **on its own is just a container** — it does not contain the changes. The real changes are the
> `sys_update_xml` records (each with a `<payload>`). Always confirm you have those, and that the **count
> matches** the set's declared update count. If you only have the container, **say so and request the
> proper export** (from the retrieved/remote update set, which carries its `sys_update_xml` children, or via
> the ServiceNow MCP) — **do not fabricate a manifest.** Getting this wrong is the classic
> "passed in Test, broke in Prod" failure, so be strict here.

To inventory the changes deterministically, run the bundled parser instead of eyeballing large XML:

```bash
python scripts/parse_updateset.py <updateset1.xml> [<updateset2.xml> ...]
```

It prints a manifest table + JSON, flags container-only files, and highlights risk-relevant artifact
types (ACLs, scripts, full form-layout overrides). Use its output as the basis for the manifest.

## Workflow

1. **Acquire inputs** per the section above. Confirm you have real `sys_update_xml` payloads.
2. **Run `scripts/parse_updateset.py`** to build the manifest and surface risk hints.
3. **Phase 1 — produce the review.** Follow `references/analysis-workflow.md` exactly. Present the review
   and pause for human review by default (proceed straight to Phase 2 only if the user asked for an
   end-to-end run).
4. **Phase 2 — author the ATF.** Follow `references/analysis-workflow.md` (Phase 2 section) and
   `references/fluent-atf-api.md` for the verified Fluent API. Do not invent API methods.
5. **Deliver outputs** (below). If the user wants to deploy/run, point them to `references/deploy-and-run.md`.

## Operating principles (always)

- **Static analysis only.** You read code/config; you don't execute it. Never claim runtime behavior you
  can't see in the artifact — flag it for runtime confirmation instead.
- **No invented artifacts.** Report only what's actually in the set; cite each artifact's name/type/sys_id.
  A reference to something not in the set is a *dependency finding*, not an artifact.
- **Tie everything to the story.** Acceptance criteria are the source of truth — use them for traceability
  and scope-creep detection in Phase 1 and for test design in Phase 2.
- **Handle secrets/PII carefully.** Flag apparent credentials/tokens/PII; never echo a full secret.
- **Be specific.** Point to the exact artifact, field, and snippet/line.

## Output

Produce three files (name them after the story key, e.g. `SR-6364-...`):

1. **`<KEY>-phase1-review.md`** — the pre-promotion review.
2. **`<KEY>-atf-<short-name>.now.ts`** — the Fluent ATF tests, with a one-way-sync header and a test plan.
3. **`<KEY>-ATF-SETUP-README.md`** *(optional, on request)* — deploy/run steps from `references/deploy-and-run.md`.

See `examples/` for a worked SR-6364 pair (review + ATF) showing the expected shape and depth.

## Reference files

- `references/analysis-workflow.md` — the full Phase 1 + Phase 2 instructions, risk rubric, and tunable
  code-review rule set. **Read this before producing the review.**
- `references/fluent-atf-api.md` — verified ServiceNow SDK (Fluent) ATF API with examples. **Read this
  before writing any ATF code.**
- `references/deploy-and-run.md` — how to deploy the generated ATF via the ServiceNow SDK and run it.
- `examples/` — a worked SR-6364 review + ATF pair.

## Compatibility & tuning notes

- ATF authoring via Fluent requires the target instance on **Yokohama or later** (the ATF Test API is
  documented from Yokohama). Confirm the consumer's release.
- The risk rubric and code-review rules in `references/analysis-workflow.md` ship with sensible defaults;
  they get sharper when tuned to the consumer's **actual prod-escape history** — encourage that.
