# Chrome Web Store listing-field reference

Ready-to-adapt answers for the developer dashboard. Reviewers scrutinize the
**Privacy practices** tab most — get those right.

## Title & Summary come FROM the manifest (not editable in dashboard)

The dashboard shows **Title** (= manifest `name`) and **Summary** (= manifest
`description`) as read-only "from package" fields. To change either, edit
`public/manifest.json`, rebuild, repackage, and re-upload the zip.
- Manifest `description` / store Summary cap: **132 characters** (over = upload rejected).
- The longer **Description** box IS editable in the dashboard (not from package).

## Single purpose (one sentence)

State what the extension does in one narrow sentence, e.g.:
> Captures a user-selected region of the active tab page by page and assembles a searchable PDF locally.

## Permission justifications (one box per declared permission)

| Permission | Justification |
| --- | --- |
| activeTab | Grants access to the page only after the user explicitly starts the action, to display the overlay and read/capture the visible tab. |
| scripting | Injects the on-page script into the active tab on user action. |
| tabs | Finds the active tab to start, and returns the user to the original tab. |
| storage | Stores user settings/preferences (and license key) locally on the device. |
| downloads | Saves the generated file to the user's Downloads folder. |
| offscreen | Runs local image/Canvas/OCR/PDF processing off the UI thread. |
| contextMenus | Adds an optional right-click menu entry to start the action. |
| host permissions | Justify the SPECIFIC matched hosts and why; avoid `<all_urls>` if `activeTab` suffices. Broad host permissions trigger deeper review. |

## Remote code

Almost always answer **"No, I am not using remote code."** Bundle every
library (OCR WASM, pdf-lib, etc.) in the package. If asked why: *all code is
bundled; nothing is fetched or executed from a remote source.* (Loading a
checkout page in a tab or calling a data-only API is NOT remote code.)

## Data usage

- **"What user data do you collect?"** Check only categories you actually
  transmit off-device. Local-only processing collects nothing. A software
  license key + a random install ID are not personal user data → check none.
  Disclose any category you genuinely send (PII, auth, web history, location,
  user activity, website content, financial, health, communications).
- **Three certification checkboxes** — check all that are true (usually all):
  - I do not sell or transfer user data to third parties (outside approved cases).
  - I do not use/transfer user data for purposes unrelated to the single purpose.
  - I do not use/transfer user data to determine creditworthiness or for lending.
- **Privacy policy URL** — required. Easiest: a public GitHub Gist named
  `PRIVACY.md`, or a link-shared Google Doc. Must be publicly reachable.

## Category

CWS categories were revamped in 2024. For a capture/archive/productivity tool,
**Workflow & Planning** or **Tools** fit best. Pick the one true primary
category; don't keyword-stuff.

## Registration & review

- One-time **$5** developer registration fee.
- First review: a few days to ~2 weeks. Google may email follow-ups about
  permissions or the privacy policy — the justifications above pre-answer them.
