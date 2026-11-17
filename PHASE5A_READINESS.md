# Phase 5A deployment readiness report

Assessment date: 17 November 2026 (Asia/Calcutta). Repository: `C:\Users\pkpar\OneDrive\Desktop\smart-pg-manager`.

Follow-up: the user has supplied existing production URLs. Read-only inspection confirms the deployed frontend still contains the old localhost API setting; the live backend health check and Vercel-origin CORS pass. The current local configuration now provides the supplied Render URL as the production fallback for missing/loopback values. This supersedes the original fail-on-missing frontend policy described in the historical assessment below. See [DEPLOYMENT.md](DEPLOYMENT.md#connectivity-fix-for-the-existing-production-deployment) for the current fix and manual redeployment steps. No push, deployment, seed, or data change was performed during this follow-up.

Follow-up verification: 15/15 frontend tests and 15/15 backend tests pass. Production builds pass with the original localhost development setting and with the API variable empty; compiled artifact checks verify the Render login URL, primary HTTPS overrides, no duplicated `/api`, receipts, and exports. Live `/rooms` and `/settings` still return 404; the verified local Vercel SPA configuration must be included in the next frontend deployment. The deployed backend's `/api/ready` is not yet available; `/api/health` returns 200. Full current findings and the follow-up file inventory are in the deployment runbook.

**Result: code and deployment configuration prepared; manual release prerequisites remain.** Nothing has been pushed or deployed. No seed script, record deletion, database reset, payment-history update, real WhatsApp message, paid purchase, or mobile development was performed.

## Repository evidence

- Branch: `main`; initial worktree status was clean.
- Origin: `https://github.com/amparkhi21/Smart_PG_Manager.git`.
- Initial HEAD: `d6a796d` (`Complete for PG owners`); previous commits included `efd4e22` and `64f99da`.
- Initial index: 3,518 tracked files, including `server/.env` and 3,399 files under `server/node_modules`.
- `server/.env` was present in the committed history, including the first commit `64f99da`. A secret-safe inspection confirmed a credential-bearing MongoDB URI and non-placeholder JWT secret; no values were printed.
- The secret file and dependency directory were removed from the current Git index only. Both remain on disk. These 3,400 staged path removals belong in the preparation commit. No history was rewritten.
- No applicable `AGENTS.md` files or saved Phase 4 result artifacts were found. Existing tests were read before execution and do not connect to or write to a real database.

## Verification of previous functionality

All requested feature modules are present and included in the production build. Coverage below distinguishes implemented source from automated evidence; it is not a claim of full browser/live-database acceptance.

| Module | Source evidence | Verification / limit |
| --- | --- | --- |
| Authentication | `authController.js`, `auth.js`, `Owner.js`, `AuthContext.jsx`, Login/Register, protected routes | JWT HTTP tests cover valid HS256, expiry, wrong secret/algorithm, malformed subject, and 401 behavior; owner lookup is mocked. Cross-host client tests cover bearer headers and session clearing. Live registration/login persistence was not exercised. |
| Dashboard | `dashboardController.js`, dashboard route and `Dashboard.jsx` | Source inspected, unauthenticated access returns 401, frontend compiles. Live summary accuracy needs acceptance testing. |
| Rooms | room routes/controller/model and `Rooms.jsx` | Capacity, duplicate and history/deletion restrictions inspected; route protection and build pass. Live CRUD was not run. |
| Residents | resident routes/controller/model, Residents/Profile/form | Ownership, capacity and history handling inspected; route protection and build pass. Live CRUD was not run. |
| Attendance | attendance routes/controller/model and daily/monthly components | Source inspected, protected daily and summary endpoints verified, frontend compiles. Live attendance updates were not run. |
| Rent | rent routes/controller/model and payment UI | Conditional atomic append/balance/idempotency filter tested with a model stub; route protection and build pass. Real concurrent database payments were not submitted. |
| Electricity | electricity routes/controller/model and payment UI | Meter/billing/payment code inspected; shared atomic payment helper, protection, build and receipt generation verified. Live bill/payment changes were not run. |
| Payment History | `PaymentHistory.jsx`, resident history, rent/electricity details | Production build and persisted-ID receipt tests pass. Historical payments were not modified. |
| WhatsApp Reminders | reminders routes/controller/model, Reminders/Preview, `reminders.js` | Phone normalization, encoding, templates, outstanding filtering, masked owner history and non-delivery statuses tested. Production utility link test passes; no links were opened and no messages sent. |
| Settings | settings routes/controller, Owner schema, `Settings.jsx` | Schema defaults and invalid billing settings tested; route protection and production build pass. Live settings were not changed. |
| PDF Receipts | `pdf.js` and receipt actions on payment screens | Rent/electricity PDFs generated from synthetic persisted payment IDs in source tests and minified browser-targeted utility builds. Native browser Save behavior still needs hosted verification. |
| Reports / CSV | reports controller/routes, `Reports.jsx`, `reports.js` | Owner-filtered read-only reporting query tested with stubs; billing/transaction date totals, UTF-8/formula guards and PDFs tested. All eight minified CSV export formats and a synthetic download anchor pass. |
| Phase 4 security/testing | Helmet, auth limit, validators, owner filters, atomic payments, existing test files | Baseline rerun: 7 backend and 10 frontend tests passed. No prior full Phase 4 report exists in the checkout, so prior blanket completion is unproven. New deployment/security regressions and dependency audits are documented below. |

## Bugs and deployment gaps fixed

1. Removed tracked secrets/dependencies from the current Git index and expanded ignore rules for logs, builds, backups, key material, temporary directories and sensitive test artifacts.
2. Bounded Node compatibility to `24.x` in both packages and locks; added `.node-version` and an explicit Render runtime selector.
3. Added fail-fast validation for MongoDB configuration, JWT secret/expiry, port, environment name, and exact production HTTPS frontend origins.
4. Configured one trusted Render proxy hop so auth rate limits distinguish forwarded client IPs; verified 50 attempts followed by 429, with another client unaffected.
5. Restricted CORS to configured origins, including Authorization/Content-Type preflight. Server-to-server health probes remain allowed. Browser bearer authentication does not require cross-site cookies.
6. Preserved `/api/health` liveness and added `/api/ready`, which requires a connected database and a successful bounded ping; Render is configured to use readiness.
7. Added safe production error/log handling, JSON-body error responses, non-cacheable API responses, generic database startup failures, bounded database connection selection, and graceful shutdown. No raw driver error or connection hostname/database is logged.
8. Limited JWT acceptance to HS256 and rejected malformed owner IDs before database lookup.
9. Required a valid production `VITE_API_BASE_URL` ending in `/api`; removed localhost API fallback from production browser code. Local development has a Vite proxy.
10. Added Vercel SPA rewrites and basic security headers so protected deep links resolve to the app. Actual provider behavior remains a post-deployment check.
11. Increased the client timeout to 90 seconds for Render Free cold starts. Temporary startup/network failures no longer erase a valid saved JWT; protected-API 401 responses still log out.
12. Fixed two moderate development-only dependency findings through a compatible audited lockfile change: nodemon `3.1.14` -> `3.1.11`, minimatch `10.2.6` -> `3.1.5`, with their dependency chain. Full audits now report zero findings.
13. Replaced outdated README statements about unfinished implemented modules with the actual functionality and verification limits; added a deployment runbook and CI checks without deployment privileges.

## Actual verification results

Runtime used: Node `v24.21.0`, npm `11.19.0`, Windows PowerShell with `npm.cmd`.

| Check | Result |
| --- | --- |
| Baseline backend `npm.cmd test` | 7/7 passed, 0 failures |
| Baseline frontend `npm.cmd test` | 10/10 passed, 0 failures |
| Final backend `npm.cmd test` | 14/14 passed, 0 failures |
| Final frontend `npm.cmd test` | 13/13 passed, 0 failures |
| Frontend `npm.cmd run build` | Passed: Vite 6.4.6, 2,370 transformed modules, `dist` produced; measured build 16.65 seconds |
| Production build configuration | Used non-secret `VITE_API_BASE_URL=https://deployment-check.invalid/api`; no production URL was invented |
| Frontend `npm.cmd run test:build` | Passed: two receipt PDFs, report PDF, eight CSV formats, CSV anchor handoff, encoded WhatsApp link, no loopback API URL in application JS |
| Backend full `npm.cmd audit` | 0 vulnerabilities after compatible fix; initial audit found 2 moderate development-only findings |
| Backend production-only `npm.cmd audit --omit=dev` | 0 vulnerabilities |
| Frontend full `npm.cmd audit` | 0 vulnerabilities |
| Git hygiene `node scripts/check-repository.mjs` | Passed after removal of tracked env/dependencies; checks current paths, not history |
| Package/config/source checks | Package/lockfile metadata matched; Vercel JSON parsed; tracked application source credential-pattern check and `git diff --check` passed |
| Local isolated HTTP health | `/api/health` 200; protected endpoints 401 without JWT; `/api/ready` 503 when disconnected and 200 with a mocked successful ping |
| Existing API at port 5000 | No process responded; no existing server was stopped or replaced |
| Real MongoDB `npm.cmd run check:db` | Passed outside the network sandbox; native-driver ping only, no model/index creation or records changed |
| Vercel rewrites/security config | JSON present and source-reviewed; actual hosted refresh behavior awaits manual deployment |
| Browser/live cloud acceptance | Not performed; no deployment was authorized |

Windows sandbox restrictions blocked the initial Vite path resolution and npm audit requests. Those checks were retried outside the sandbox with tool approval and passed. The first production artifact verifier run used category labels instead of the repository's exact CSV export names; the verifier was corrected to test all eight actual formats and passed. That was a verification-script correction, not an application CSV defect.

The database ping proves connectivity from this machine at verification time. Render connectivity, rotated credentials, and the chosen network access list must still be verified from the deployed service. Automated HTTP JWT tests use a mocked owner; they do not prove all authenticated business workflows against Atlas.

The GitHub workflow uses the current documented major versions of [actions/checkout](https://github.com/actions/checkout) and [actions/setup-node](https://github.com/actions/setup-node), with read-only repository permissions and credential persistence disabled. Its first hosted run and a fresh Linux `npm ci` have not been executed because no push was performed.

## Created and modified files

Created:

- `.node-version`, `render.yaml`, `.github/workflows/verify.yml`
- `DEPLOYMENT.md`, `PHASE5A_READINESS.md`
- `scripts/check-repository.mjs`
- `server/src/config/env.js`, `server/scripts/check-db.js`, `server/test/deployment.test.js`
- `frontend/vercel.json`, `frontend/scripts/verify-build.mjs`
- `frontend/src/api/config.js`, `frontend/src/api/http.js`, `frontend/src/api/deployment.test.js`

Modified:

- `.gitignore`, `README.md`
- `server/.env.example`, `server/package.json`, `server/package-lock.json`
- `server/src/app.js`, `server/src/server.js`, `server/src/config/db.js`
- `server/src/middleware/auth.js`, `server/src/middleware/errorHandler.js`, `server/src/utils/generateToken.js`
- `frontend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`
- `frontend/src/api/client.js`, `frontend/src/context/AuthContext.jsx`

Removed from tracking only: `server/.env` and 3,399 `server/node_modules` files. Local dependencies/config remain. Generated `frontend/dist` and `frontend/test-results` are ignored and must not be committed.

## Remaining release prerequisites

1. **Rotate committed credentials before pushing/deploying.** The historical MongoDB database password and JWT secret must be replaced. Retaining the current history is not a substitute for rotation. Any history cleanup needs separate approval.
2. **Supply real production URLs/configuration.** Set Render's rotated secrets and exact frontend `CLIENT_URL`; set Vercel's real `VITE_API_BASE_URL`. The local build-test `.invalid` hostname cannot serve an app.
3. **Configure Atlas access from Render.** Allow the service's outbound CIDRs, retain the existing database name/data, and verify `/api/ready` after deployment. This machine's ping does not prove Render network access.
4. **Confirm Vercel plan eligibility.** Hobby is intended for personal/non-commercial use; using this as a commercial PG operating system may require an eligible plan or a different host. No purchase is authorized or needed for preparation.
5. **Complete hosted acceptance.** Protected-route refresh, real login/session restoration, all read-only pages, PDF/CSV download behavior and reminder preview/popups need browser verification after manual deployment. Write, concurrency and owner-isolation acceptance should use synthetic accounts/records in an isolated database, preserving existing payments.

Exact GitHub push commands, Render settings, Vercel settings, environment variable names, hosting references and the complete manual sequence are in [DEPLOYMENT.md](DEPLOYMENT.md). No code/build/test failure remains in the checks completed above; these release prerequisites prevent claiming a verified live production deployment.
