# servicenow-updateset-qa-atf

> Review a ServiceNow update set against its Jira story, then author deployable ATF tests as ServiceNow SDK (Fluent) code.

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills). Claude loads it when you supply a ServiceNow update set (XML export) and/or a Jira story key and want it reviewed, QA'd, risk-assessed, or want ATF tests generated. Full instructions in [`SKILL.md`](SKILL.md).

## What it does

Manual QA of ServiceNow update sets is slow and inconsistent, and most production escapes are either (a) regressions that rode along with the intended change, or (b) requirements/scope misses no test framework catches. This skill runs two phases:

1. **Phase 1 — Pre-promotion review:** static analysis of the update set against its Jira story — change manifest, code review, ACL/security pass, completeness/dependency check, acceptance-criteria traceability, and a risk score with test routing.
2. **Phase 2 — ATF generation:** deployable ATF tests written as ServiceNow SDK (Fluent) TypeScript.

It complements ATF and Instance Scan — it does **not** replace runtime testing, and it deploys/runs ATF against **non-production** instances only.

## Quick start

```bash
# Build a deterministic change manifest from one or more update-set XML exports
python scripts/parse_updateset.py <updateset1.xml> [<updateset2.xml> ...]
```

Then point Claude at the parser output + the Jira story (paste it, or let Claude pull it via a connected Atlassian/ServiceNow MCP). It produces a Phase 1 review, pauses for human review, then (on request) writes the ATF.

## Files

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Inputs, the two-phase workflow, operating principles. |
| `scripts/parse_updateset.py` | Dependency-free `sys_update_xml` manifest builder + risk flagger. |
| `references/analysis-workflow.md` | Full Phase 1 + Phase 2 instructions, risk rubric, code-review rules. |
| `references/fluent-atf-api.md` | Verified ServiceNow SDK (Fluent) ATF API reference. |
| `references/deploy-and-run.md` | Deploy the generated ATF via the ServiceNow SDK and run it. |
| `examples/` | A worked review + ATF pair (`SR-6364`) showing expected shape and depth. |

> Requires the target instance on **Yokohama or later** for Fluent ATF authoring. The risk rubric and code-review rules ship with sensible defaults — they get sharper when tuned to your environment's real prod-escape history.
