# Development and verification

Work directly on `develop` unless the user explicitly requests another branch. Do not create a feature branch or pull request for routine changes.

API handler regression tests belong in `netlify/tests/`, outside the configured
functions directory. A top-level `*.test.ts` in `netlify/functions/` is deployed
as a function, and its dotted name breaks deployment. `npm run build` checks
function entry names before compiling.

## E2E execution policy

E2E runs automatically only after a push to `main`, against the immutable
production deployment of that exact SHA. This is explicitly authorized by the
user. Do not create an extra E2E branch. Develop pushes, all PRs and
manual CI runs execute unit tests and build without E2E. Do not run writable E2E
routinely on develop or previews. A failed post-push E2E must be fixed forward;
its result arrives after the main push and does not gate that merge.

## Scope changes around E2E coverage

- Before implementing, read the current scope-to-test mapping in [scripts/select-e2e.mjs](scripts/select-e2e.mjs) and identify the smallest coherent scope that satisfies the request. Use that file as the source of truth; do not infer scope from filenames alone.
- Prefer working within one mapped feature area per task: notifications, reading/catch-up, group access/identity, or the group recovery hint. Include the relevant unit and E2E tests in the same task. Shared onboarding spans multiple areas.
- Keep changes focused on the agreed scope. Avoid unrelated cleanup, refactoring, formatting or dependency updates that would expand the diff and trigger additional E2E suites.
- If the user's request crosses scopes or expands an existing task beyond its scope, suggest a concrete split into separate tasks and branches early, before making the cross-scope changes. Describe each task's scope, dependencies, proposed branch and expected E2E suites, including which parts require the full suite.
- Continue independent work within the agreed scope while the user considers the proposal. Use separate feature branches when the user accepts the split or explicitly requests them; routine single-scope changes still go directly to `develop`.
- Keep tightly coupled changes together when splitting would leave an incomplete or broken feature. Explain why they form one task and need broader tests. Necessary shared-code changes are valid; test selection must not dictate an incorrect implementation.
- The scope map is retained for coverage planning and explicitly requested targeted diagnostics. Automatic CI always runs the full suite after main pushes and no E2E for PR/develop/manual events.
- When introducing a new module or changing its consumers, maintain the selector's mapping and regression tests, including cross-feature dependencies. Never narrow coverage or move code merely to avoid required tests; unknown files retain the full-suite fallback.

For every change affecting frontend behavior, recovery/progress logic, sessions, or backend routes:
- Update the existing unit and E2E regression tests to cover the final behavior. Add a regression for each fixed defect.
- Run `npm test` and `npm run build`. Let the post-main-push CI run E2E on synthetic plans in production; run additional E2E only when explicitly requested.
- The E2E suite must use the real deployed API and Netlify Blobs. Do not replace API responses with successful mocks or use localhost's localStorage fallback.
- Do not merge while the `Required CI` check fails. Do not skip, weaken, or delete a failing scenario to obtain a green check.
- Keep test plans isolated: names start with E2E, plans are created by the suite, and no real user group is modified.
- Production E2E must use the runner and its random per-run cleanup capability. All created groups must be marked at creation and cleaned up in finally plus the always-run CI cleanup step. Never modify existing user plans or clean up by a name prefix alone. Test push subscriptions must be excluded from scheduled delivery. Never commit access tokens, cleanup capabilities, storageState, or request traces.

See [E2E testing](e2e/README.md) for setup and coverage. GitHub branch protection must require the stable `Required CI` check on develop and main.
