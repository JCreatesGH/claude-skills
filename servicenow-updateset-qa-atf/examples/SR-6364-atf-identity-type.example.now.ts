/**
 * Example Phase 2 output (condensed) — SR-6364.
 * Shows the key patterns: impersonate, form state/value validation, and — importantly — validating a
 * field that was REMOVED from the form (web_service_access_only) at the RECORD level after submit.
 *
 * SOURCE OF TRUTH: CODE. ATF in Fluent is one-way sync — do not edit in Test Designer.
 */
import { Test } from '@servicenow/sdk/core'

const ADMIN_TEST_USER = 'REPLACE_WITH_ADMIN_TEST_USER_SYS_ID'
const TABLE = 'sys_user'
const UI = 'standard_ui'

// Smoke: Identity Type visible + editable, default Human, WSAO removed from form.
Test(
    { $id: Now.ID['sr6364-visible-editable'], active: true, name: 'SR-6364 | Identity Type editable; default Human; WSAO off form', description: '' },
    (atf) => {
        atf.server.impersonate({ $id: 'step1', user: ADMIN_TEST_USER })
        atf.form.openNewForm({ $id: 'step2', table: TABLE, view: '', formUI: UI })
        atf.form.fieldStateValidation({
            $id: 'step3', table: TABLE, formUI: UI,
            visible: ['identity_type'], notReadOnly: ['identity_type'], notVisible: ['web_service_access_only'],
            mandatory: [], notMandatory: [], readOnly: [],
        })
        atf.form.fieldValueValidation({ $id: 'step4', table: TABLE, formUI: UI, conditions: 'identity_type=Human^EQ' })
    }
)

// Full: Machine => saved record has web_service_access_only = true (record-level, since field is off the form).
Test(
    { $id: Now.ID['sr6364-machine-wsao-true'], active: true, name: 'SR-6364 | Machine => web_service_access_only = true', description: '' },
    (atf) => {
        atf.server.impersonate({ $id: 'step1', user: ADMIN_TEST_USER })
        atf.form.openNewForm({ $id: 'step2', table: TABLE, view: '', formUI: UI })
        atf.form.setFieldValue({ $id: 'step3', table: TABLE, formUI: UI, fieldValues: { user_name: 'atf_sr6364_machine', identity_type: 'Machine' } })
        atf.form.submitForm({ $id: 'step4', formUI: UI })
        atf.server.recordQuery({
            $id: 'step5', table: TABLE, assert: 'records_match_query', enforceSecurity: false,
            fieldValues: 'user_name=atf_sr6364_machine^web_service_access_only=true^EQ',
        })
    }
)

// Full / regression: manager field still present (guards the v1.0 unintended move).
Test(
    { $id: Now.ID['sr6364-manager-present'], active: true, name: 'SR-6364 | Regression: manager still present', description: '' },
    (atf) => {
        atf.server.impersonate({ $id: 'step1', user: ADMIN_TEST_USER })
        atf.form.openNewForm({ $id: 'step2', table: TABLE, view: '', formUI: UI })
        atf.form.fieldStateValidation({
            $id: 'step3', table: TABLE, formUI: UI,
            visible: ['manager'], mandatory: [], notMandatory: [], notReadOnly: [], notVisible: [], readOnly: [],
        })
    }
)
