# E2E with the deployed backend

These Playwright tests create separate E2E reading plans via the real Netlify API, use Netlify Blobs, verify persisted progress through independent GET requests, and reload the browser. Pull requests run against their exact preview commit; pushes to develop run the entire browser and API suite against that develop commit. An outdated develop deployment is not used to assess a newer PR. They never use the application's localhost fallback.

Install and run:

```sh
npm ci
npm ci --prefix e2e
npm exec --prefix e2e -- playwright install --with-deps chromium
npm test
npm run build
E2E_BASE_URL=https://deploy-preview-2--plan-czytania.netlify.app npm run test:e2e
```

Use a preview containing the tested commit. CI checks public build-info.json against the exact PR head/push SHA before starting. Missing, stale, failed and production deployments fail the job. Fork PRs need a Netlify preview to run; there is no automatic success or skip if the backend is unavailable.

Coverage: create/validation, unauthorized writes, invalid segment, repeated check/uncheck, parallel writes, per-member isolation, duplicate join, member permissions/removal, secure session cookies, single-use transfer, immediate UI, rapid clicks, independent rollback/retry, recovery order, day navigation after activation (desktop and mobile), browsing completed plans, manual navigation after completing a day in both modes, extra/base dependency, tab switching during failure, reload after a backend commit while the response is pending, partial chapters, next day after reload and automatic midnight refresh, corrupt cache and completed plans.

The suite creates plans named E2E <run id> <scenario> <random suffix>, with only synthetic users. There is currently no group-deletion API, so the test plans remain in the Netlify store. Netlify stores may be shared between deployment contexts. They have unique UUIDs and no existing group is altered. Partial recovery chapters are currently saved only in the browser until a whole segment is complete. Durable pending writes across a page reload are not currently provided.

Reports and failure screenshots are uploaded for 7 days. Traces and stored credentials are disabled because request bodies contain member tokens. Do not add token values to test names or logs. Test reports are evidence of a real execution; source review or mocked harnesses are not E2E execution.

For every relevant change, maintain these tests and run the complete unit/build/E2E checks; see ../AGENTS.md.

## Required GitHub check

The workflow provides a stable **Required CI** check which fails unless both Unit tests and build and E2E with real backend pass. Configure Settings > Rules > Rulesets for develop and main, enable Require status checks to pass, select **Required CI**, and require the branch to be up to date. A reviewable REST ruleset payload is in ../.github/required-ci.ruleset.json.

Adding a workflow does not enable branch protection. The connected GitHub integration cannot edit administrative settings; an administrator must apply that ruleset once.

Progress writes use an immutable log per operation, instead of replacing the full group blob. Reads merge the log with existing progress; legacy plans need no migration. Independent concurrent writes do not overwrite one another. Repeated writes to the same reading use the latest server timestamp (ties use the operation UUID). The log is currently not compacted.
