# Release verification

Use Node.js 24 and the existing lockfiles. Run commands from the repository root
unless a command explicitly changes directory. On Windows, use `npm.cmd`.

```powershell
npm.cmd test --prefix frontend
npm.cmd test --prefix server -- --test-concurrency=1
npm.cmd run build --prefix frontend
npm.cmd run test:build --prefix frontend
npm.cmd run check:repository --prefix server
git diff --check
```

Backend integration tests create disposable local MongoDB instances with
`mongodb-memory-server-core`. Tests use `tmp/mongodb-binaries/` for cached binaries.
Root cleanup moved the existing binaries to the [external archive](../archive/README.md);
restore them to that path for offline testing, or let the test tooling download them.
Do not substitute a production database URI or run the seed script for regression
testing. Tests may set synthetic environment variables inside their own processes;
they must not rewrite `.env` files or hosting configuration.

Browser configurations in `frontend/` cover mocked route tests and isolated
database-backed portal, resident-persistence and AI-menu tests. Some specifications
import the server's installed dependencies, so both package roots must be installed.
Keep outputs under ignored artifact paths. Review traces before discarding them;
old failure screenshots do not establish the current test result.

For startup investigation, preserve `server/scripts/check-db.js`,
`server/src/config/loadEnv.js` and `server/src/utils/startupError.js`.
Database diagnostics can connect to the configured database; do not run them as an
isolated test substitute.

The repository hygiene check uses the repository's Git ignore rules to reject
tracked credential and artifact paths, including force-added files. It allows
the explicit `.env.example` exceptions. It checks current paths, not Git history
or every possible secret embedded inside an otherwise ordinary source file.
Review staged filenames and content with secret values redacted before release.

See [Android build and device testing](../android/build-and-device-testing.md).
Publishing, deployment, production data writes and release signing require a
separate authorized workflow.
