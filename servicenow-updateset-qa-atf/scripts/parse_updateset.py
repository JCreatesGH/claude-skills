#!/usr/bin/env python3
"""
parse_updateset.py — deterministic inventory of one or more ServiceNow update set XML exports.

Builds a change manifest from the sys_update_xml records inside the file(s), detects the common
"container-only" mistake (a sys_remote_update_set / sys_update_set wrapper with no actual changes),
and surfaces risk-relevant artifact types (ACLs, scripts, full form-layout overrides, dictionary).

Usage:
    python parse_updateset.py <updateset1.xml> [<updateset2.xml> ...]

Output: a human-readable manifest + risk hints, followed by a JSON block (between BEGIN_JSON/END_JSON)
that an agent can parse directly.

This is intentionally dependency-free (standard library only) so it runs anywhere.
"""

import json
import sys
import xml.etree.ElementTree as ET

# Payload record root -> friendly label + risk flag
RISK_TYPES = {
    "sys_security_acl": ("ACL (access control)", "security"),
    "sys_script": ("Business Rule", "code"),
    "sys_script_client": ("Client Script", "code"),
    "sys_script_include": ("Script Include", "code"),
    "sys_script_fix": ("Fix Script", "code"),
    "sys_ui_action": ("UI Action", "code"),
    "sysevent_script_action": ("Script Action", "code"),
    "sys_ui_section": ("Form Layout (full-section override)", "form_override"),
    "sys_ui_list": ("List Layout", "config"),
    "sys_ui_policy": ("UI Policy", "config"),
    "sys_dictionary": ("Dictionary (field definition)", "schema"),
    "sys_documentation": ("Field Label / Help", "config"),
    "wf_workflow": ("Workflow", "code"),
    "sys_hub_flow": ("Flow", "code"),
}


def text(el, tag):
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else ""


def payload_root(update_xml_el):
    """Return the inner record type from the <payload> CDATA, e.g. 'sys_ui_section'."""
    payload = update_xml_el.find("payload")
    if payload is None or not payload.text:
        return ""
    try:
        inner = ET.fromstring(payload.text.strip())
        # payload is usually <record_update><actual_table ...>...; take first element child
        for child in inner:
            return child.tag
    except ET.ParseError:
        pass
    return ""


def parse_file(path):
    result = {
        "file": path,
        "container_records": [],   # sys_remote_update_set / sys_update_set wrappers
        "changes": [],             # sys_update_xml records
        "parse_error": None,
    }
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except Exception as e:  # noqa: BLE001
        result["parse_error"] = str(e)
        return result

    for el in root.iter():
        tag = el.tag
        if tag in ("sys_remote_update_set", "sys_update_set"):
            result["container_records"].append({
                "type": tag,
                "name": text(el, "name"),
                "sys_id": text(el, "sys_id"),
                "declared_updates": text(el, "update_count") or text(el, "updated") or text(el, "summary"),
                "state": text(el, "state"),
                "description": text(el, "description"),
            })
        elif tag == "sys_update_xml":
            inner_type = payload_root(el)
            friendly, risk = RISK_TYPES.get(inner_type, (inner_type or "(unknown)", ""))
            result["changes"].append({
                "name": text(el, "name"),
                "type_label": text(el, "type"),       # ServiceNow's own label, e.g. "Form Layout"
                "payload_record": inner_type,          # e.g. sys_ui_section
                "friendly_type": friendly,
                "risk": risk,
                "target_name": text(el, "target_name"),
                "table": text(el, "table"),
                "action": text(el, "action"),
                "sys_id": text(el, "sys_id"),
                "update_set": text(el, "update_set") or text(el, "remote_update_set"),
            })
    return result


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1

    files = [parse_file(p) for p in argv[1:]]

    total_changes = sum(len(f["changes"]) for f in files)
    print("=" * 72)
    print("UPDATE SET MANIFEST")
    print("=" * 72)

    container_only_files = []
    risk_hits = {}

    for f in files:
        print(f"\nFile: {f['file']}")
        if f["parse_error"]:
            print(f"  !! PARSE ERROR: {f['parse_error']}")
            continue
        for c in f["container_records"]:
            print(f"  Container: {c['type']} '{c['name']}' "
                  f"(declared changes: {c['declared_updates'] or '?'}, state: {c['state'] or '?'})")
        n = len(f["changes"])
        if n == 0 and f["container_records"]:
            container_only_files.append(f["file"])
            print("  !! CONTAINER ONLY — no sys_update_xml payloads in this file.")
            print("     This is the wrapper, not the changes. Re-export from the retrieved/remote")
            print("     update set (which carries its sys_update_xml children), or pull via a ServiceNow MCP.")
            continue
        print(f"  Changes ({n}):")
        for c in f["changes"]:
            print(f"    - [{c['type_label'] or c['friendly_type']}] {c['target_name'] or c['name']} "
                  f"(table={c['table'] or '-'}, payload={c['payload_record'] or '?'}, sys_id={c['sys_id']})")
            if c["risk"]:
                risk_hits.setdefault(c["risk"], []).append(c["friendly_type"])

    print("\n" + "-" * 72)
    print(f"TOTAL change records across all files: {total_changes}")
    for f in files:
        for c in f["container_records"]:
            if c["declared_updates"]:
                print(f"  {c['name']}: declared {c['declared_updates']} change(s)")

    if risk_hits:
        print("\nRISK HINTS (verify in Phase 1):")
        if "security" in risk_hits:
            print(f"  * SECURITY: {len(risk_hits['security'])} ACL change(s) — run the ACL/security pass.")
        if "code" in risk_hits:
            print(f"  * CODE: {len(risk_hits['code'])} scriptable artifact(s) — run the JavaScript code review.")
        if "form_override" in risk_hits:
            print(f"  * FORM OVERRIDE: {len(risk_hits['form_override'])} full form-layout capture(s) — "
                  "these replace the whole section on commit; diff against the target form.")
        if "schema" in risk_hits:
            print(f"  * SCHEMA: {len(risk_hits['schema'])} dictionary change(s) — confirm field "
                  "definitions exist on the target.")

    if container_only_files:
        print("\n!! ACTION NEEDED: container-only file(s) detected — request the full export before reviewing:")
        for cf in container_only_files:
            print(f"   - {cf}")

    print("\nBEGIN_JSON")
    print(json.dumps({
        "files": files,
        "total_changes": total_changes,
        "container_only_files": container_only_files,
        "risk_hits": {k: len(v) for k, v in risk_hits.items()},
    }, indent=2))
    print("END_JSON")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
