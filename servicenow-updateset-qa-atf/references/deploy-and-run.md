# Deploy & run the generated ATF tests

The generated `.now.ts` file is ServiceNow Fluent **source code**, not a runnable test. Deploy it with the
ServiceNow SDK, which creates the ATF test records (`sys_atf_test`) in an instance.

## Prerequisites
- **Node.js 20+**
- **ServiceNow SDK** `@servicenow/sdk` **v4.6.0+** (`npm install -g @servicenow/sdk`, or `npx @servicenow/sdk@latest …`)
- A **non-production** instance (Dev/Test/UAT) where the update set is (or will be) applied
- **ATF runner enabled:** system property `sn_atf.runner.enabled = true`
- Dedicated **ATF test users'** sys_ids (one admin, one non-admin)

## Steps
1. **Fill placeholders** in the `.now.ts`: test-user sys_ids, and confirm the stored choice values / field
   names the tests assume (the XML proves form presence, not always the stored value — check `sys_choice`).
2. **Put the file in an SDK project.** Existing project: copy into `src/`. New project: `now-sdk init`, then
   copy the file into `./src/`.
3. **Authenticate to a NON-prod instance:** `now-sdk auth` (add credential), `now-sdk auth --use <alias>`.
   Never run ATF deploys against production.
4. **Build & install:** `now-sdk build`, then `now-sdk install --auth <alias>`.
5. **Run:** in the instance, **Automated Test Framework → Tests** (or Test Suites) → run via the Test Runner,
   on the instance where the update set is applied. ATF rolls back records it creates.
6. **Gate it:** group the tests into a Test Suite and trigger it when this class of change reaches Test/UAT.

## Guardrails
- **Non-prod only.** ATF creates and rolls back data.
- **Code is source of truth.** Fluent ATF is one-way sync — maintain tests in code, not Test Designer.
- **Version differences.** Exact flags vary by SDK version — `now-sdk --help`, `now-sdk <cmd> --help`, or
  `npx @servicenow/sdk explain`.

## References
- SDK CLI commands (Yokohama): https://www.servicenow.com/docs/bundle/yokohama-application-development/page/build/servicenow-sdk/reference/servicenow-sdk-cli-commands.html
- Install the SDK: https://www.servicenow.com/docs/r//yokohama/application-development/servicenow-sdk/install-servicenow-sdk.html
- Fluent API docs: https://servicenow.github.io/sdk/
- SDK repo: https://github.com/ServiceNow/sdk · Examples: https://github.com/ServiceNow/sdk-examples
