# ServiceNow SDK (Fluent) ATF API — verified reference

Use these APIs when authoring ATF tests. They are verified against ServiceNow's own
`sdk-examples/test-atf-sample`. Do **not** invent method names; if you need a step type not shown here,
consult `npx @servicenow/sdk explain` or https://servicenow.github.io/sdk/ and flag the assumption.

> ATF authoring via Fluent requires the target instance on **Yokohama or later**.

## Test structure

```typescript
import { Test } from '@servicenow/sdk/core'

Test(
    {
        $id: Now.ID['unique-alias'],   // or a literal sys_id string
        active: true,
        name: 'Human-readable test name',
        description: 'What this test proves.',
    },
    (atf) => {
        // steps go here, each with a unique $id within the test ('step1', 'step2', ...)
    }
)
```

A `.now.ts` file may contain multiple `Test(...)` blocks. `Now.ID['alias']` generates a stable sys_id from
the alias.

## Verified steps

### Impersonation (server)
```typescript
atf.server.impersonate({ $id: 'step1', user: '<user sys_id>' })
```

### Open a new form
```typescript
atf.form.openNewForm({ $id: 'step2', table: 'sys_user', view: '', formUI: 'standard_ui' })
// view can be a specific form view name, e.g. 'itil'
```

### Set field values on the form
```typescript
atf.form.setFieldValue({
    $id: 'step3',
    table: 'sys_user',
    formUI: 'standard_ui',
    fieldValues: { user_name: 'atf_test_user', identity_type: 'Machine' },
})
```

### Validate a field's value on the form (encoded query)
```typescript
atf.form.fieldValueValidation({
    $id: 'step4',
    table: 'sys_user',
    formUI: 'standard_ui',
    conditions: 'identity_type=Human^EQ',   // <field>=<value>^EQ ; chain with ^
})
```

### Validate field STATE (visible / mandatory / read-only)
```typescript
atf.form.fieldStateValidation({
    $id: 'step5',
    table: 'sys_user',
    formUI: 'standard_ui',
    visible: ['identity_type'],
    notVisible: ['web_service_access_only'],
    readOnly: [],
    notReadOnly: ['identity_type'],
    mandatory: [],
    notMandatory: [],
})
```

### Submit the form
```typescript
atf.form.submitForm({ $id: 'step6', formUI: 'standard_ui' })   // optional: assert: ''
```

### Server-side record query (validate saved data — use when the field is NOT on the form)
```typescript
atf.server.recordQuery({
    $id: 'step7',
    table: 'sys_user',
    assert: 'records_match_query',
    enforceSecurity: false,
    fieldValues: 'user_name=atf_test_user^web_service_access_only=true^EQ',
})
```

## Other step categories available (consult the SDK docs for signatures)

Catalog steps (`atf.catalog.*`), email steps, REST steps (`atf.rest.*` / REST assert payload), reporting
steps, and additional server steps. The documented ATF test/step types include: `atf-appnav`,
`atf-catalog-action`, `atf-catalog-validation`, `atf-catalog-variable`, `atf-email`, `atf-form`,
`atf-form-action`, `atf-form-declarative-action`, `atf-form-field`, `atf-reporting`, `atf-rest-api`,
`atf-rest-assert-payload`, `atf-server`, `atf-server-catalog-item`, `atf-server-record`.

## Common patterns

- **Test as a specific user:** start with `atf.server.impersonate`. Use a dedicated, stable ATF test user
  sys_id (don't hardcode a person's account).
- **"Setting X drives Y" where Y was removed from the form:** set X on the form, `submitForm`, then verify Y
  with `atf.server.recordQuery` (you cannot validate a field that isn't on the form).
- **Field-state regression (guard against unintended form changes):** `fieldStateValidation` with `visible`
  to assert a field is still present. Note: ATF checks presence/state, not pixel position — call out that
  visual placement needs a manual check.
- **Encoded queries:** ServiceNow encoded-query syntax, `^` to chain, `^EQ` to end. e.g.
  `active=true^web_service_access_only=true^EQ`.
