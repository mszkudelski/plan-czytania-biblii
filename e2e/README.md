# E2E after main pushes

Automatic E2E runs only after a push to `main`, in full, on the immutable URL
of that exact production deployment. No extra branch or deployment is created.
Develop, PR and manual CI runs execute unit tests/build only. Production also
retains read-only smoke checks before E2E starts.
E2E reports arrive after publishing, so failures require a fix-forward change.
Routine local E2E runs are deferred to main CI to conserve the shared quota.

Install and run:

```sh
npm ci
npm ci --prefix e2e
npm exec --prefix e2e -- playwright install --with-deps chromium
npm test
npm run build
E2E_BASE_URL=https://deploy-preview-2--plan-czytania.netlify.app E2E_MODE=all E2E_TEST_FILES='["backend.e2e.mjs"]' node scripts/run-selected-e2e.mjs
```

CI validates the exact main SHA and production context in build-info.json before starting. The runner refuses to create test data if the cleanup endpoint is unavailable. Direct Playwright runs require a random cleanup capability; use the runner, which creates and protects it automatically. Production additionally requires E2E_PRODUCTION=1 and EXPECTED_COMMIT. Extra local E2E runs require explicit user approval.

Coverage: create/validation, unauthorized writes, invalid segment, repeated check/uncheck, parallel writes, per-member isolation, duplicate join, member permissions/removal, secure session cookies, single-use transfer, immediate UI, rapid clicks, independent rollback/retry, recovery order, day navigation after activation (desktop and mobile), browsing completed plans, future recovery forecasts (full daily quota, balanced parallel streams, ten days of three chapters caught up after thirty extras, partial ranges, reading ahead without saving assumed progress), manual navigation after completing a day in both modes, extra/base dependency, tab switching during failure, reload after a backend commit while the response is pending, partial chapters, next day after reload and automatic midnight refresh, corrupt cache and completed plans.

The suite creates new E2E plans and synthetic users. A random per-run capability marks plans at creation; the server stores only its hash. Cleanup is authorized only for registered groups from that run, never by a name prefix or administrator token. It removes groups, all paginated progress/revisions, recovery codes and pointers, session transfers and used markers, and subscriptions. The runner cleans up in finally; CI has a second always-run cleanup step, including after test failure. Cleanup failures fail CI and retain the local capability for a retry with node scripts/cleanup-e2e.mjs. Never upload or commit .e2e-run.json. Hard runner loss can prevent any finalizer from running; it must not be reported as successful cleanup. Existing historical E2E plans are not touched. Partial recovery chapters remain browser-local until a whole segment is complete.

Reports and failure screenshots are uploaded for 7 days. Traces and stored credentials are disabled because request bodies contain member tokens. Do not add token values to test names or logs. Test reports are evidence of a real execution; source review or mocked harnesses are not E2E execution.

Reading home coverage: the plan name heads the reading screen; first unread
work stays in order, a finished reading survives reload until explicit navigation,
and overall progress plus five nearby dates stay visible in reading. Labeled backlog and ahead counts track whole
readings without cancelling unfinished debt. Weekly progress remains in Plan. Daily plans use past days; other
cadences use closed weeks. Current-week completion includes overdue readings finished this week and work
pre-read for this week, counts complete readings once, and stays capped at the
weekly goal. The bar updates on check/uncheck and survives reload. Tests cover both return-arrow
directions, disappearance at the personal position, transparent borderless controls,
44px touch targets, week rollover, future starts, rest days and completed plans.
Desktop/mobile checks retain real persistence, reload, one-day catch-up examples,
immediately editable future readings, rollback, partial-chapter and concurrent-write regressions.

Identity coverage: each invitation join creates a separate member and progress,
including duplicate names and the administrator's name. Legacy recovery API codes restore
the original member, role, progress and secure cookie on a fresh device while
preserving old device tokens. Tests cover format, unauthorized issuance, code
reuse, rotation, per-member isolation and removed-member rejection. Browser
scenarios cover creation, invitation entry, administrator-assisted recovery after logout,
confirmation, invalid-code feedback, reload and cookie restoration on desktop
and mobile. Personal codes are absent from settings, recovery and logout,
including profiles with an existing legacy code, and the browser makes no requests
to the personal-code endpoints. Recovery UI tests disable screenshots so access codes are not
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
Legacy personal recovery codes remain covered through the API for compatibility,
including rotation, while their browser options are hidden.
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
subscriptions are stored in a per-run E2E scope, excluded from the scheduler, and deleted by cleanup;
these tests do not claim delivery through a browser push provider. Scheduler
timing, local dates, deduplication, retries and expired subscriptions have unit tests.

Notification browser tests use full Chromium in its new headless mode, because
the separate headless shell reports notification permission as denied. Native
permission states are set for the test's own browser context; API responses and
settings persistence still use the real Netlify backend.

The workflow provides a stable **Required CI** check: unit/build on every event, plus full E2E and production smoke on main pushes. Configure Settings > Rules > Rulesets for develop and main, enable Require status checks to pass, select **Required CI**, and require the branch to be up to date. A reviewable REST ruleset payload is in ../.github/required-ci.ruleset.json.

Adding a workflow does not enable branch protection. The connected GitHub integration cannot edit administrative settings; an administrator must apply that ruleset once.

Progress writes use an immutable log per operation, instead of replacing the full group blob. Reads merge the log with existing progress; legacy plans need no migration. Independent concurrent writes do not overwrite one another. Repeated writes to the same reading use the latest server timestamp (ties use the operation UUID). The log is currently not compacted.

Recovery keeps the full normal chapter quota for each parallel CSV column/section. Earlier extras change which chapters fill that quota, rather than reducing it. Each date adds at most one extra from the parallel stream with the most unread chapters due by that date. Book changes within a column keep the same stream. Once no debt remains after the normal quota, the extra disappears. Daily assignments are cached and validated so checking or reloading a completed portion does not advance it.

Production pushes run unit/build and read-only deployment checks, then full writable E2E on newly created synthetic plans with cleanup. PR/develop/manual events do not launch E2E. Cache/refresh regressions cover reconnecting after a failed read and preserving writes confirmed after a stale session read started.

The first persistence verification GET has a 30-second HTTP deadline, followed by persistence polling assertions. No successful mocks or local fallback are used. Main workflows are serialized to avoid overlapping E2E runs.


Catch-up suggestion coverage: a bottom notice after more than three overdue readings,
short mobile overlap above navigation, one-day modal preview, activation without
progress writes, seven-day snooze, durable per-member/per-plan opt-out across
fresh devices, manual activation, rejected saves and retries, stale-cache startup,
real chapter completion on date buttons, API authentication and private preferences.

## Scope map

`scripts/select-e2e.mjs` retains the source-to-test map for coverage planning
and explicit targeted diagnostics. Event selection runs all E2E files only on
main pushes, and selects none for every other event. The stable Required CI
check requires E2E and production smoke success on main pushes; elsewhere it
requires unit/build success and verifies that E2E was skipped.

Plan replacement recovery: the real API snapshots owner and participant timestamps,
including unmatched readings; admin-only restoration rolls back later progress,
rejects stale/consumed requests, survives reload and accepts new progress writes.
The mobile UI checks expiry metadata, confirmation/cancellation and restored readings.
Exact seven-day expiry and removed/new member behavior are covered by unit/API tests
without changing production clocks or existing groups.
