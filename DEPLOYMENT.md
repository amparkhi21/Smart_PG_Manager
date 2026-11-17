# Manual deployment: GitHub, Render, Vercel, MongoDB Atlas

Prepared on 17 November 2026. No cloud resources were created and nothing was pushed or deployed during preparation. See [PHASE5A_READINESS.md](PHASE5A_READINESS.md) for evidence and remaining release work.

## Connectivity fix for the existing production deployment

The supplied production frontend is `https://smart-pg-manager.vercel.app`; the backend is `https://smart-pg-manager-backend.onrender.com`. Read-only inspection confirmed that the deployed frontend's `/assets/index-LD0hemMV.js` contains `http://localhost:5000/api` and no Render API URL. The backend's `/api/health` returns 200; the login preflight from the Vercel origin returns 204 with the correct `Access-Control-Allow-Origin`. The deployed `/api/rooms` returns 401 without authentication and includes the correct CORS header. No login credentials or database writes were used in those checks.

The local fix prefers `VITE_API_BASE_URL`, falling back to `https://smart-pg-manager-backend.onrender.com/api` in production when it is missing or contains a loopback URL. Vite explicitly embeds the resolved value, so the local development `.env` cannot put localhost into the production bundle. Development retains the `/api` proxy to localhost, and configured API URLs must end in a single `/api`.

The deployed `/rooms` and `/settings` URLs currently return 404. The existing local `frontend/vercel.json` contains the required SPA rewrite to `/index.html`; include it in the commit and redeploy with Vercel Root Directory set to `frontend`.

Verification for this fix:

| Check | Result |
| --- | --- |
| Frontend tests | 15/15 passed |
| Backend tests, including both CORS environments | 15/15 passed |
| Production build with existing local `.env` pointing at localhost | Passed, 2,370 modules; generated login URL targets Render |
| Production build with `VITE_API_BASE_URL` empty | Passed; generated login URL targets Render |
| Compiled API/export artifact checks | Passed; no loopback API URL or duplicated `/api` in application JavaScript; valid explicit API override remains primary |
| Live backend | `/api/health` 200; production-origin login preflight 204 with the matching origin; unauthenticated `/api/rooms` 401 with the matching origin |
| Local development CORS | Synthetic preflight test permits `http://localhost:5173`; the live production backend deliberately does not permit it |
| Existing live frontend | Old localhost bundle and deep-link 404s remain until a new deployment; no push/deploy was performed |

Files changed for this connectivity follow-up: `frontend/src/api/config.js`, `frontend/src/api/client.js`, `frontend/src/api/deployment.test.js`, `frontend/vite.config.js`, `frontend/.env.example`, `frontend/scripts/verify-build.mjs`, `server/test/deployment.test.js`, `.github/workflows/verify.yml`, `README.md`, `DEPLOYMENT.md`, and `PHASE5A_READINESS.md`. The pre-existing local `frontend/vercel.json` was verified without changing its SPA rewrite. Local secret `.env` files were left unchanged.

To publish this fix manually:

1. Review and push the prepared local changes using the Git commands below. Do not include ignored `.env` files.
2. In the existing Vercel project's Settings > Environment Variables, set `VITE_API_BASE_URL=https://smart-pg-manager-backend.onrender.com/api` for Production. Remove any Production value pointing at localhost. Configure Preview separately if used.
3. Keep Vercel Root Directory `frontend`, Install Command `npm ci`, Build Command `npm run build`, and Output Directory `dist`. Redeploy the latest commit; changing a variable alone cannot change already-built JavaScript. Use a fresh build without the old build cache for this verification.
4. Keep the existing Render `CLIENT_URL=https://smart-pg-manager.vercel.app`. Live CORS already permits that origin, so this frontend fix does not require changing database or JWT settings. Local development uses `CLIENT_URL=http://localhost:5173`; production deliberately does not allow localhost. Exact Preview origins can be configured separately.
5. After Vercel reports success, hard-refresh the application. Confirm the Network panel shows `https://smart-pg-manager-backend.onrender.com/api/auth/login`, with exactly one `/api`, and verify login using your existing account. No deployment or push was performed by the agent.

The currently deployed backend returns 404 for `/api/ready`, indicating that the newer local readiness endpoint has not reached that service. Its existing `/api/health` is available. Do not switch a live Render health check to `/api/ready` until deploying the backend code that provides it. The initial-deployment sections below describe that newer prepared backend configuration.

## Before pushing

`server/.env` was committed in the existing history. Its removal from the current Git index does not erase older versions. Rotate the MongoDB database-user password and JWT secret before pushing or exposing the app. Update the ignored local `.env` yourself and use the new values in Render. Changing the JWT secret invalidates saved sessions; owners will need to log in again. Rotate any other credentials that were stored in that historical file. No Git history has been rewritten.

Keep the existing database and records. Do not run seed scripts, import demo data, reset the database, edit historical payments, or use production data for write tests. Use an existing isolated test database for later write-based acceptance testing.

## Exact hosting settings

### Render backend

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/amparkhi21/Smart_PG_Manager.git` |
| Branch | `main` |
| Service type / runtime | Web Service / Node |
| Root directory | `server` |
| Region | Singapore, preferably close to the existing Atlas cluster |
| Instance | Free |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` (runs `node src/server.js`) |
| Node version | `24` (`NODE_VERSION`), also bounded to `24.x` in package.json |
| Health check path | `/api/ready` |
| Auto deploy | Off while performing manual deployment verification |
| Persistent disk / pre-deploy command | None |

The optional root `render.yaml` defines the same service. Choose either a manual Web Service or a Blueprint import; do not create both. A Blueprint import starts a deployment after you explicitly submit it. Its `JWT_SECRET` uses Render's generated random value; a manually configured service needs its own unique secret.

### Vercel frontend

| Setting | Value |
| --- | --- |
| Repository / branch | Same repository / `main` |
| Framework preset | Vite |
| Root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `24.x` |
| Environment variable | `VITE_API_BASE_URL=https://smart-pg-manager-backend.onrender.com/api` |
| Routing configuration | `frontend/vercel.json` rewrites application routes to `/index.html` |

Set the frontend variable for Production. Add Preview separately only if needed; approve each exact Preview origin in Render's `CLIENT_URL`. Do not allow all `*.vercel.app` hosts. Configure the project to avoid unintended future Git-triggered deployments while following this manual process. Vercel's import Deploy button itself initiates a deployment.

## Environment variables

Use placeholders in examples only. Never place backend secrets in Vercel or a `VITE_` variable: Vite embeds those values in public JavaScript.

| Location | Name | Production value / behavior |
| --- | --- | --- |
| Render | `NODE_ENV` | `production` |
| Render | `PORT` | Render supplies this, normally `10000`; app binds `0.0.0.0` and honors it. Local fallback: `5000`. |
| Render | `MONGO_URI` | `mongodb+srv://<db-user>:<url-encoded-password>@<atlas-host>/<existing-database>?retryWrites=true&w=majority` |
| Render | `JWT_SECRET` | New unique random secret, at least 32 characters; never a placeholder |
| Render | `JWT_EXPIRES_IN` | `7d` (default if omitted), or another positive duration such as `12h` |
| Render | `CLIENT_URL` | `https://smart-pg-manager.vercel.app`; comma-separated exact HTTPS origins if multiple, without paths |
| Render | `NODE_VERSION` | `24` (hosting runtime selector, not application configuration) |
| Vercel | `VITE_API_BASE_URL` | `https://smart-pg-manager-backend.onrender.com/api`, without a query or credentials |

The application requires `MONGO_URI` and `JWT_SECRET`; production also requires `CLIENT_URL`. `VITE_API_BASE_URL` is the primary frontend configuration; missing or loopback production values fall back to the supplied Render API URL. Set `NODE_ENV=production` explicitly. `PORT` and `JWT_EXPIRES_IN` have defaults. Node is pinned in both packages; `NODE_VERSION` makes Render's choice explicit. There are no WhatsApp provider tokens or API keys: reminders are manual click-to-chat links.

## Manual sequence

1. **Rotate the exposed credentials.** Retain the existing Atlas project, database name, and data. Update the local ignored file and Render values; do not paste credentials into Git commands, screenshots, issues, or logs. If the current history is already public, treat its old credentials as compromised. History cleanup is a separate operation requiring approval.
2. **Confirm hosting eligibility.** Render Free and an Atlas Free cluster are the intended backend/database tiers where existing capacity permits. Vercel Hobby is for personal/non-commercial use. A student portfolio/demo can fit that scope; operating a commercial PG business needs an eligible hosting plan or a different frontend host. Do not purchase services as part of this phase.
3. **Review and push the preparation commit.** The exact PowerShell commands are below. Review the staged paths and summary; keep `.env`, dependencies, artifacts, and backups untracked.
4. **Prepare Atlas access.** Use an application database user scoped to the existing database, with the access needed by the app, rather than an Atlas administrator. URL-encode special characters in the password. Match the existing database name exactly. If choosing a new Free cluster, migrate existing data only through a separately reviewed backup/migration procedure; pointing at an empty cluster will not carry your records over.
5. **Create the Render service with the settings above.** Set the intended Vercel production hostname as `CLIENT_URL`. Copy the service's **Connect > Outbound** CIDR ranges into the Atlas project IP access list. Avoid opening Atlas to `0.0.0.0/0`. If the initial start happens before access is configured, add the ranges and manually redeploy the same service. Keep auto deploy off.
6. **Verify the backend.** Check the deployment logs for successful configuration and database connection, then open `https://<render-service>.onrender.com/api/health` and `/api/ready`. Both should return HTTP 200 with `success: true`. `/api/health` is process liveness; `/api/ready` runs a database ping and returns 503 if unavailable. An unauthenticated `GET /api/rooms` must return 401.
7. **Import the frontend into Vercel.** Use the settings above and set the real backend URL in `VITE_API_BASE_URL` before clicking Deploy. Never use `https://deployment-check.invalid/api` from the local verification command: it is only a build-test value. If Vercel assigns a different production hostname, update Render's exact `CLIENT_URL` and manually redeploy the backend. Preview deployments need separate exact-origin configuration.
8. **Run hosted read-only acceptance checks.** Log in using an existing account. Visit the dashboard, rooms, residents/profile, attendance, rent, electricity, payments, reminders, settings, and reports. Refresh `/rooms`, `/residents/<existing-id>`, `/payments`, `/reports`, and `/settings` directly; the app should load rather than return a platform 404. Logged-out users should be redirected to login. Confirm authenticated network requests go to Render with `Authorization: Bearer ...`, and no request goes to localhost.
9. **Verify downloads and links.** Download a receipt for an existing rent payment and an existing electricity payment, a monthly report PDF, and each of the eight CSV formats. Receipts must reference persisted payment IDs and say Payment Recorded. Check the Asia/Kolkata transaction-date totals. Preview a reminder and inspect its encoded `wa.me` target without opening or sending a message. Do not mark a reminder as opened/sent merely to test it against production data. Native popup/download behavior needs a real browser.
10. **Verify outages and isolation.** Confirm session expiry logs out, a transient network error preserves the saved token, and the first request after Render sleeps can take about a minute. Test owner isolation and create/update/payment flows later with two test owners and synthetic records in an isolated database, without touching existing production records. Record the actual URLs and acceptance outcomes before declaring the release live.

## Exact Git commands (manual only)

Run after credential rotation and review. The current branch is already `main`, and `origin` is already configured. Do not add another remote, force-push, or print the historical `.env` diff.

```powershell
Set-Location 'C:\Users\pkpar\OneDrive\Desktop\smart-pg-manager'
git branch --show-current
git remote get-url origin
node scripts/check-repository.mjs
git add -- .gitignore .node-version .github README.md DEPLOYMENT.md PHASE5A_READINESS.md render.yaml scripts frontend server
git diff --cached --stat
git diff --cached --name-only --diff-filter=ACM
node scripts/check-repository.mjs
git commit -m "Prepare secure cloud deployment for Smart PG Manager"
git push origin main
```

`server/.env` and `server/node_modules` are staged for removal from tracking only; their local files remain. These removals must be included in the commit. The earlier historical versions remain until a separately authorized history cleanup.

## Repeat local verification on Windows

Use Node 24 and `npm.cmd`. `npm ci` in each package installs exactly the lockfile versions. The following checks do not seed or reset MongoDB. Automated tests use synthetic models/mocks, and `check:db` only pings the configured database with the native driver, without creating indexes.

```powershell
Set-Location 'C:\Users\pkpar\OneDrive\Desktop\smart-pg-manager'
node scripts/check-repository.mjs
Push-Location server
npm.cmd ci
npm.cmd test
npm.cmd audit
npm.cmd audit --omit=dev
npm.cmd run check:db
Pop-Location
Push-Location frontend
npm.cmd ci
npm.cmd test
$env:VITE_API_BASE_URL = 'https://smart-pg-manager-backend.onrender.com/api'
npm.cmd run build
npm.cmd run test:build
npm.cmd audit
Remove-Item Env:VITE_API_BASE_URL
Pop-Location
```

These tests and build checks use synthetic data and adapters; they do not submit real login or payment requests. A changed Vercel variable requires a new frontend build/deployment. Never run database connectivity checks in public CI with real credentials; the included GitHub workflow has no secrets and performs no deployment.

## Hosting constraints and sources

Render Free sleeps after 15 minutes idle and can take about a minute to resume; the frontend allows 90 seconds and preserves saved tokens on network errors. Free instances use ephemeral filesystems, so this app keeps records in MongoDB and generates exports in the browser. The in-memory auth limiter is suitable for the prepared single instance and resets on restarts; horizontal scaling would need shared rate-limit storage. See [Render Free](https://render.com/docs/free), [Node versions](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks), and [outbound IP ranges](https://render.com/docs/outbound-ip-addresses).

Vercel's Vite guidance requires SPA rewrites for deep links. Node 24 is supported. Confirm Hobby eligibility before using it for PG business operations. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and [Vercel pricing/plan eligibility](https://vercel.com/pricing).

Atlas Free has limited storage and throughput; retain the existing cluster if moving would risk data or exceed those limits. See [Atlas cluster types](https://www.mongodb.com/docs/atlas/manage-clusters/) and [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/). Provider requirements were checked on 17 November 2026; verify account-specific quotas and displayed plan choices before submitting any deployment.
