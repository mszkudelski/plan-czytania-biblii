# Development and verification

Work directly on `develop` unless the user explicitly requests another branch. Do not create a feature branch or pull request for routine changes.

## Scope changes around E2E coverage

- Before implementing, read the current scope-to-test mapping in [scripts/select-e2e.mjs](scripts/select-e2e.mjs) and identify the smallest coherent scope that satisfies the request. Use that file as the source of truth; do not infer scope from filenames alone.
- Prefer working within one mapped feature area per task: notifications, reading/catch-up, group access/identity, or the group recovery hint. Include the relevant unit and E2E tests in the same task. Shared onboarding spans multiple areas.
- Keep changes focused on the agreed scope. Avoid unrelated cleanup, refactoring, formatting or dependency updates that would expand the diff and trigger additional E2E suites.
- If the user's request crosses scopes or expands an existing task beyond its scope, suggest a concrete split into separate tasks and branches early, before making the cross-scope changes. Describe each task's scope, dependencies, proposed branch and expected E2E suites, including which parts require the full suite.
- Continue independent work within the agreed scope while the user considers the proposal. Use separate feature branches when the user accepts the split or explicitly requests them; routine single-scope changes still go directly to `develop`.
- Keep tightly coupled changes together when splitting would leave an incomplete or broken feature. Explain why they form one task and need broader tests. Necessary shared-code changes are valid; test selection must not dictate an incorrect implementation.
- Changes to shared app/API/storage code, global styles, configuration or unmapped files run the full suite. PRs to `main` and manual workflow runs also run the full suite regardless of scope. Explain this when it affects the proposed split; several branches do not guarantee fewer tests on promotion.
- When introducing a new module or changing its consumers, maintain the selector's mapping and regression tests, including cross-feature dependencies. Never narrow coverage or move code merely to avoid required tests; unknown files retain the full-suite fallback.

For every change affecting frontend behavior, recovery/progress logic, sessions, or backend routes:
- Update the existing unit and E2E regression tests to cover the final behavior. Add a regression for each fixed defect.
- Run `npm test`, `npm run build`, and `npm run test:e2e` against a Netlify non-production deployment of the same commit.
- The E2E suite must use the real deployed API and Netlify Blobs. Do not replace API responses with successful mocks or use localhost's localStorage fallback.
- Do not merge while the `Required CI` check fails. Do not skip, weaken, or delete a failing scenario to obtain a green check.
- Keep test plans isolated: names start with E2E, plans are created by the suite, and no real user group is modified.
- Never run writable E2E tests on production. Never commit access tokens, storageState, or request traces.

See [E2E testing](e2e/README.md) for setup and coverage. GitHub branch protection must require the stable `Required CI` check on develop and main.
