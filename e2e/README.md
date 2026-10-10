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

Coverage: create/validation, unauthorized writes, invalid segment, repeated check/uncheck, parallel writes, per-member isolation, duplicate join, member permissions/removal, secure session cookies, single-use transfer, immediate UI, rapid clicks, independent rollback/retry, recovery order, day navigation after activation (desktop and mobile), browsing completed plans, future recovery forecasts (full daily quota, balanced parallel streams, ten days of three chapters caught up after thirty extras, partial ranges, reading ahead without saving assumed progress), manual navigation after completing a day in both modes, extra/base dependency, tab switching during failure, reload after a backend commit while the response is pending, partial chapters, next day after reload and automatic midnight refresh, corrupt cache and completed plans.

The suite creates plans named E2E <run id> <scenario> <random suffix>, with only synthetic users. There is currently no group-deletion API, so the test plans remain in the Netlify store. Netlify stores may be shared between deployment contexts. They have unique UUIDs and no existing group is altered. Partial recovery chapters, including individual chapters read ahead, are currently saved only in the browser until a whole segment is complete. Durable pending writes across a page reload are not currently provided.

Reports and failure screenshots are uploaded for 7 days. Traces and stored credentials are disabled because request bodies contain member tokens. Do not add token values to test names or logs. Test reports are evidence of a real execution; source review or mocked harnesses are not E2E execution.

Identity coverage: each invitation join creates a separate member and progress,
including duplicate names and the administrator's name. Recovery codes restore
the original member, role, progress and secure cookie on a fresh device while
preserving old device tokens. Tests cover format, unauthorized issuance, code
reuse, rotation, per-member isolation and removed-member rejection. Browser
scenarios cover creation, invitation entry, saving/hiding a code, logout
confirmation, invalid-code feedback, reload and cookie restoration on desktop
and mobile. Recovery UI tests disable screenshots so access codes are not
included in failure reports.

Administrator-assisted recovery coverage: restore the selected duplicate-name
profile without inheriting the issuer's invitation secret, 10-minute expiry
metadata, strict code length, single-use and simultaneous redemption,
unauthorized issuance/role changes, group scope, removed targets and demoted
issuers. Concurrent role changes cannot remove the last administrator. A second
administrator restores the original administrator without a saved personal
code. Desktop and mobile UI scenarios cover issuing links/QR, role confirmation
and cancellation, focus restoration, removal visibility, fresh-device recovery,
reload, preserved progress and explicit profile switching while the app is open.
Personal recovery codes remain covered as an optional, collapsed backup.
Metadata mutations claim an immutable, numbered revision with onlyIfNew,
rather than overwriting the group snapshot. Competing requests reload the
winner and recheck permissions and the last-administrator rule. Unit tests
cover concurrent changes and stale listings; E2E repeats the demotion race
four times on real Blobs. Single-use transfers claim a separate immutable
used marker. Revision history is not currently compacted.

For every relevant change, maintain these tests and run the complete unit/build/E2E checks; see ../AGENTS.md.

## Required GitHub check

Notification coverage: saved hour and time zone through the deployed API,
reload, disable, denied permission, iOS install guidance, mobile layout,
input/endpoint validation and per-member/device privacy. Synthetic push
subscriptions are created only in preview scope and deleted in finally blocks;
these tests do not claim delivery through a browser push provider. Scheduler
timing, local dates, deduplication, retries and expired subscriptions have unit tests.

Notification browser tests use full Chromium in its new headless mode, because
the separate headless shell reports notification permission as denied. Native
permission states are set for the test's own browser context; API responses and
settings persistence still use the real Netlify backend.

The workflow provides a stable **Required CI** check which fails unless both Unit tests and build and E2E with real backend pass. Configure Settings > Rules > Rulesets for develop and main, enable Require status checks to pass, select **Required CI**, and require the branch to be up to date. A reviewable REST ruleset payload is in ../.github/required-ci.ruleset.json.

Adding a workflow does not enable branch protection. The connected GitHub integration cannot edit administrative settings; an administrator must apply that ruleset once.

Progress writes use an immutable log per operation, instead of replacing the full group blob. Reads merge the log with existing progress; legacy plans need no migration. Independent concurrent writes do not overwrite one another. Repeated writes to the same reading use the latest server timestamp (ties use the operation UUID). The log is currently not compacted.

Recovery keeps the full normal chapter quota for each parallel CSV column/section. Earlier extras change which chapters fill that quota, rather than reducing it. Each date adds at most one extra from the parallel stream with the most unread chapters due by that date. Book changes within a column keep the same stream. Once no debt remains after the normal quota, the extra disappears. Daily assignments are cached and validated so checking or reloading a completed portion does not advance it.

Production pushes run unit/build checks and a read-only deployment check: exact commit, production context, HTML, application assets and a missing-plan API GET. Writable E2E runs on develop and PR previews before promotion. Cache/refresh regressions cover reconnecting after a failed read and preserving writes confirmed after a stale session read started.

The first persistence verification GET has its own 30-second HTTP deadline, followed by the unchanged persistence polling assertions. A failed HTTP request fails the test; no request retry or fallback is accepted. E2E jobs for the same commit run sequentially to avoid duplicated PR/push jobs putting simultaneous load on Netlify.

