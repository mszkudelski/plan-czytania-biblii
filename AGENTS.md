# Development and verification

Work directly on `develop` unless the user explicitly requests another branch. Do not create a feature branch or pull request for routine changes.

For every change affecting frontend behavior, recovery/progress logic, sessions, or backend routes:
- Update the existing unit and E2E regression tests to cover the final behavior. Add a regression for each fixed defect.
- Run `npm test`, `npm run build`, and `npm run test:e2e` against a Netlify non-production deployment of the same commit.
- The E2E suite must use the real deployed API and Netlify Blobs. Do not replace API responses with successful mocks or use localhost's localStorage fallback.
- Do not merge while the `Required CI` check fails. Do not skip, weaken, or delete a failing scenario to obtain a green check.
- Keep test plans isolated: names start with E2E, plans are created by the suite, and no real user group is modified.
- Never run writable E2E tests on production. Never commit access tokens, storageState, or request traces.

See [E2E testing](e2e/README.md) for setup and coverage. GitHub branch protection must require the stable `Required CI` check on develop and main.
