# Analysis workflow — Phase 1 review + Phase 2 ATF

This is the core logic of the skill. Phase 1 produces the pre-promotion review; Phase 2 authors the ATF.
Produce Phase 1, present it, and pause for human review by default — proceed to Phase 2 automatically only
if the user explicitly asked for an end-to-end run.

---

## PHASE 1 — Pre-promotion review

Produce a Markdown report with the sections below, in this order. Lead with the verdict.

### 1. Verdict (top)
- **Overall risk:** High / Medium / Low (rubric below).
- **Recommendation:** `Ready for QA` / `Needs fixes before QA` / `Block`.
- One or two sentences of rationale, plus a count of findings by severity.
- If inputs are incomplete (e.g., container-only update set, missing AC), say so here and state what's needed.

### 2. Change manifest
A table of every artifact in the set, from `scripts/parse_updateset.py`:

| # | Set | Type | Target | Table | Update name | sys_id |
|---|-----|------|--------|-------|-------------|--------|

Note the total artifact count, confirm it matches the set's declared update count, and list the distinct
tables touched. Across multiple sets, note when two records modify the **same** artifact (later set wins).

### 3. Acceptance-criteria traceability & scope check
- **Coverage:** for each acceptance criterion, list the artifact(s) that implement it. Flag any AC with
  **no implementing change**.
- **Scope creep:** flag any artifact that maps to **no** acceptance criterion or the story's stated scope.
- **Stale-story signal:** if the changes contradict or exceed the story, call it out.

This section catches the requirements/scope class of escape that pure testing misses — treat it as primary.

### 4. Code review (embedded JavaScript)
Review the script content of business rules, script includes, client scripts, UI actions, scheduled jobs,
transform scripts, etc. Report findings in a table with severity, artifact, location, finding, why it
matters, and suggested fix. Apply the rule set at the bottom of this file. If there is **no** scriptable
artifact, say so explicitly (a clean result is a real result).

### 5. ACL / security pass
Inspect every ACL (`sys_security_acl`) and security-relevant change: new/modified ACLs (table/field/operation
and roles), loosened access (removed roles, broadened operations, empty/always-true script conditions),
and missing protections (new tables/fields with no ACL). Treat data-exposure findings as high severity until
proven otherwise. If no ACL ships but the change affects a security-relevant field, note what platform
access control it relies on and what to verify on the target.

### 6. Completeness / dependency check
- List every reference (sys_id, table, field, script include, property, role) used by the set but **not
  contained in it**; classify each as likely-safe (platform/baseline) vs. risk (custom, may be missing in target).
- Flag **platform-version dependencies** (a feature/field that exists only on a given release/patch).
- Flag **full-record overrides** — e.g., a full form-layout (`sys_ui_section`) capture replaces the whole
  section on commit and can silently drop fields the target has but the capture doesn't. Recommend a diff
  against the target before commit.
- For multi-set stories, state the required **promotion order** and whether each set is cumulative.

### 7. Risk score + test recommendation
- **Risk score** with the rubric below, showing which factors triggered it.
- **Recommended test scenarios** derived from the manifest + ACs + findings, including the ACL/integration
  edge cases manual QA usually misses.
- **Routing:** mark each as **smoke** (fast path / candidate for low-risk auto-approval) vs. **full
  regression** (high-risk → human QA + UAT sign-off).

---

## PHASE 2 — Author ATF as ServiceNow SDK (Fluent) code

Read `references/fluent-atf-api.md` first and use only the verified API. If unsure of an exact signature,
note the assumption in a comment rather than guessing silently.

**Coverage** — for the changed artifacts, generate:
- **Happy path** proving each acceptance criterion.
- **Negative/edge** (invalid input, missing required fields, boundaries).
- **ACL/security assertions** where access changed (right role can, wrong role cannot).
- **Integration/server tests** where an interface is touched.
- **Regression** for the existing behavior most likely to break given what was touched (e.g., a field that
  was reordered should still be present).

**Important test-design rule:** if a field was **removed from the form** (common with controller fields),
you cannot validate it with a form-field step — validate it at the **record level** after submit
(`atf.server.recordQuery`). Read the manifest to catch this.

**Output requirements:**
- One logical test per `Test(...)` block; correct project layout.
- A header comment per file naming the source story/update set and stating: **"Source of truth: code. ATF in
  Fluent is one-way sync — do not edit in Test Designer; edits there are lost on next deploy."**
- Conventional names referencing the story key.
- A **test plan table** mapping each test to the AC/risk it covers and its routing (smoke/full).
- A note listing any API/field assumptions and anything that still needs an instance to confirm.

---

## Risk rubric (tunable)

Rate **High** if the set does any of: adds/modifies **ACLs or data policies**; touches **integrations**
(REST/SOAP, MID, inbound email, import/transform); modifies **core/security-sensitive tables**
(`sys_user`, SIR/HRSD/IRM/GRC tables, etc.); contains **global-scope server scripts**; or touches a large
number of artifacts/tables.

Rate **Medium** for server-side business-logic changes on standard tables without the High triggers, **or**
a full-record override (e.g., whole form layout) of a core, heavily-customized table.

Rate **Low** for cosmetic/config-only changes (UI policies, form/list layouts, labels) with no server logic,
ACL, or integration impact.

*(Adjust thresholds and the table list to the consumer's environment.)*

## Code-review rule set (tunable — escape patterns go here)

Defaults (severity in parentheses; tune to the consumer's real prod escapes):
- Hardcoded `sys_id`, instance URL/hostname, or **credential/token** (Critical for secrets, High for sys_ids).
- Leftover debug output: `gs.log`, `gs.print`, `console.log` (Low–Medium).
- `GlideRecord` query inside a loop, or query with no `addQuery`/`setLimit` (High — performance).
- `current.update()` / `gr.update()` inside a loop (High).
- `setWorkflow(false)` where business rules/notifications should fire (Medium–High).
- Missing error handling: results used without `.next()`/`.hasNext()`; no try/catch around integration calls (Medium).
- No input validation; query strings built by concatenation (injection risk) (High).
- Deprecated/removed APIs for the target release (Medium).
- Dot-walking through possibly-null references (Medium).
- Broad data access in scoped apps; `eval`; unrestricted `sys_user`/`sys_user_group` access (High).

> **Refine with real data:** pull the consumer's last N prod defects tied to releases, classify them, and add
> a rule per recurring pattern so the review catches *their* escapes, not generic ones.

## Self-check before finishing
- [ ] Manifest count matches the number of `sys_update_xml` records parsed (and the set's declared count).
- [ ] Every acceptance criterion appears in traceability (covered or flagged).
- [ ] Every code-review/ACL finding cites a specific artifact and location.
- [ ] No full secret echoed.
- [ ] Phase 2 used only verified Fluent APIs; assumptions flagged in comments.
- [ ] Each generated test maps to an AC or named risk in the test plan table.
