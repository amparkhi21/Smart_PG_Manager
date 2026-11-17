# Smart PG Manager

A responsive application for paying guest (PG) property owners to manage rooms, residents, attendance, rent, electricity bills, payments, and reports.

[Frontend](https://smart-pg-manager.vercel.app) · [API health](https://smart-pg-manager-backend.onrender.com/api/health) · [Deployment instructions](#deployment-and-data)

## Features

- **Owner accounts:** registration, login, JWT sessions, protected pages, and owner-scoped API queries.
- **Dashboard:** occupancy, collections, outstanding balances, recent payments, and upcoming dues.
- **Rooms and residents:** capacity checks, room assignments, resident profiles, and preserved history when residents leave.
- **Attendance:** daily and bulk marking, notes, and monthly summaries.
- **Rent:** monthly generation, partial and full payments, atomic balance checks, and payment retry IDs.
- **Electricity:** meter readings, calculated room bills, installment payments, and payment history.
- **Receipts:** downloadable rent and electricity PDFs tied to saved payment IDs. Receipts identify payments as recorded; they do not verify bank settlement or serve as tax invoices.
- **Reminders:** editable WhatsApp drafts, click-to-chat links, duplicate warnings, and owner-reported activity. Sending remains manual.
- **Settings:** property details, future billing defaults, reminder preferences, and message templates.
- **Reports:** monthly financial summaries and PDFs, with billing-month collections separated from transaction-date receipts in Asia/Kolkata.
- **CSV exports:** rooms, residents, attendance, rent records, rent payments, electricity bills, electricity payments, and monthly summaries. Resident contact fields are excluded and formula-leading text is escaped.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS, React Router, Axios |
| Backend | Node.js 24, Express 4, Mongoose, JWT |
| Database | MongoDB Atlas |
| Charts and documents | Recharts, jsPDF |
| Hosting | Vercel frontend, Render API |

## Getting started

Use **Node.js 24** and npm. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Install the locked dependencies from the repository root:

```sh
npm ci --prefix server
npm ci --prefix frontend
```

If local environment files are missing, copy [server/.env.example](server/.env.example) to `server/.env` and [frontend/.env.example](frontend/.env.example) to `frontend/.env`. Preserve any existing configuration and fill in placeholders privately.

| Package | Local configuration |
| --- | --- |
| Backend | `NODE_ENV=development`, `PORT=5000`, a valid `MONGO_URI`, a unique `JWT_SECRET` of at least 32 characters, `JWT_EXPIRES_IN=7d`, `CLIENT_URL=http://localhost:5173` |
| Frontend | `VITE_API_BASE_URL=http://localhost:5000/api`; when unset in development, Vite proxies `/api` to port 5000 |

Run the API and frontend in separate terminals:

```sh
npm run dev --prefix server
```

```sh
npm run dev --prefix frontend
```

Open `http://localhost:5173`. Use an isolated development database for write testing. The optional `npm run seed --prefix server` command creates demo data and replaces the demo account's existing records; use it only with a disposable development database.

## Tests and production build

Run from the repository root:

```sh
npm test --prefix server
npm test --prefix frontend
npm run build --prefix frontend
npm run test:build --prefix frontend
npm audit --audit-level=moderate --prefix server
npm audit --audit-level=moderate --prefix frontend
node scripts/check-repository.mjs
```

The production output is `frontend/dist`. `npm run preview --prefix frontend` serves that build locally. To target a different backend, set `VITE_API_BASE_URL` to its public HTTPS URL ending in `/api` before building. Missing or loopback production values resolve to `https://smart-pg-manager-backend.onrender.com/api`; malformed URLs are rejected.

Tests cover API access control, configuration, CORS, sessions, model validation, payment updates, reporting, reminders, and exports using synthetic data and mocks. The production artifact check verifies compiled API URLs, receipt/report PDFs, all eight CSV formats, and reminder links. Hosted browser behavior and complete database workflows still need release acceptance testing.

Run these checks locally before releasing. Vercel and Render use the deployment settings below; deployment does not require a GitHub Actions workflow.

## Project structure

```text
frontend/
  scripts/              Production artifact verification
  src/
    api/                API configuration and HTTP client
    components/         Shared and feature-specific UI
    context/            Authentication state
    hooks/              Fetching and debounce helpers
    layouts/            Application and authentication layouts
    pages/              Application screens
    utils/              Formatting, dates, receipts, reports, and reminders
  vercel.json           Vercel build settings, headers, and SPA routing
server/
  scripts/              Read-only database connectivity check
  src/
    config/             Environment validation and database connection
    controllers/        Request handlers
    middleware/         Authentication, validation, and error handling
    models/             MongoDB schemas
    routes/             API endpoints
    seed/               Optional development demo data
    utils/              Shared billing, ownership, and date helpers
  test/                 Backend automated tests
scripts/                Repository hygiene checks
render.yaml             Render service blueprint
```

## Deployment and data

Use the existing [Vercel project](https://smart-pg-manager.vercel.app) and [Render API service](https://smart-pg-manager-backend.onrender.com/api/health) when updating production. Keep [frontend/vercel.json](frontend/vercel.json), including its SPA rewrite and security headers. Keep [render.yaml](render.yaml) until the existing service is confirmed to be manually configured and independent of a Render Blueprint. Importing the Blueprint as a new service would create another deployment.

Keep `.env` files, private keys, database backups, and resident data exports out of Git. **`server/.env` exists in earlier Git history.** Removing it from tracking does not remove that history; rotate the exposed database credentials and JWT secret before publishing or deploying. Coordinate rotation with the existing deployment because changing the JWT secret expires saved sessions.

Retain the existing Atlas project, cluster, database name, and records. Seed scripts, demo imports, resets, and production write tests are not part of deployment. Use an isolated database and synthetic owners for write and concurrency checks. Rewriting Git history is a separate maintenance operation.

### Render backend

| Setting | Value |
| --- | --- |
| Branch / runtime | `main` / Node |
| Root directory | `server` |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Node version | `24` via `NODE_VERSION`; package engines require `24.x` |
| Health check | `/api/ready` for this backend version |
| Auto deploy | Off during manual release verification |
| Persistent disk / pre-deploy command | None |
| Blueprint region / plan | Singapore / Free |

For an older running backend, keep its working health probe until deploying a version that supplies `/api/ready`. The server listens on `0.0.0.0`, uses Render's supplied `PORT`, and trusts one proxy hop. `GET /api/health` checks process liveness; `GET /api/ready` pings MongoDB and returns 503 when the connection is unavailable.

### Vercel frontend

| Setting | Value |
| --- | --- |
| Branch / framework | `main` / Vite |
| Root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `24.x` |
| Production variable | `VITE_API_BASE_URL=https://smart-pg-manager-backend.onrender.com/api` |

Vite embeds the API URL at build time, so changing it requires a new build and deployment. The URL must use HTTPS, end in exactly one `/api`, and contain no credentials, query string, or fragment. Missing or loopback production values fall back to the existing Render API.

Configure Preview separately if needed. Add each exact approved Preview origin to Render's `CLIENT_URL`; wildcard Vercel origins are rejected. Review Git-triggered deployment settings before publishing a release commit.

### Production environment variables

Backend secrets belong in Render and the ignored `server/.env`, never in Vercel or a `VITE_` variable. Vite variables are public bundle configuration.

| Host | Variable | Production setting |
| --- | --- | --- |
| Render | `NODE_ENV` | `production` |
| Render | `PORT` | Supplied by Render; local fallback is `5000` |
| Render | `MONGO_URI` | `mongodb+srv://<db-user>:<url-encoded-password>@<atlas-host>/<existing-database>?retryWrites=true&w=majority` |
| Render | `JWT_SECRET` | A unique random secret of at least 32 characters |
| Render | `JWT_EXPIRES_IN` | `7d` by default, or a positive duration such as `12h` |
| Render | `CLIENT_URL` | `https://smart-pg-manager.vercel.app`; comma-separated exact HTTPS origins if needed |
| Render | `NODE_VERSION` | `24` |
| Vercel | `VITE_API_BASE_URL` | `https://smart-pg-manager-backend.onrender.com/api` |

`MONGO_URI` and `JWT_SECRET` are required. Production also requires `CLIENT_URL`. The Blueprint generates a JWT secret for a new service; preserve the configured secret when updating an existing service. Reminders use manual WhatsApp links and need no messaging-provider credentials. Never overwrite an existing `.env` while copying an example.

### MongoDB Atlas access

Use an application database user scoped to the existing database. URL-encode special characters in the password and preserve the database name in the connection string.

Allow the Render service's outbound CIDR ranges in Atlas's IP access list. Obtain them from the service's **Connect > Outbound** settings; avoid opening access to `0.0.0.0/0`. A successful local ping does not prove that Render has network access. MongoDB stores application records; Render's local filesystem is not database storage, and exports are generated in the browser.

`npm run check:db --prefix server` performs a read-only ping using the native MongoDB driver without loading application models or creating indexes. Keep real database credentials out of public CI.

### Release procedure

1. Review changes and complete the credential rotation described above. Keep environment files, dependencies, builds, backups, and resident exports out of Git.
2. Run the [tests, audits, production build, artifact checks, and repository check](#tests-and-production-build). Tests use synthetic data and mocks.
3. Publish the release commit manually when ready, after reviewing provider auto-deploy settings.
4. If the backend changed, deploy it to the existing Render service. Confirm its database connection and both health endpoints. An unauthenticated request to `/api/rooms` should return 401.
5. Deploy the frontend in the existing Vercel project with the correct production API variable. Use a fresh build without the previous cache when troubleshooting an old API URL. If the frontend hostname changes, update Render's exact `CLIENT_URL` too.
6. Complete the hosted checks below. Use an isolated database for write or concurrency acceptance tests.

### Hosted acceptance checks

- Sign in with an existing account and visit dashboard, rooms, residents/profile, attendance, rent, electricity, payments, reminders, settings, and reports.
- Refresh `/rooms`, `/residents/<existing-id>`, `/payments`, `/reports`, and `/settings` directly. The SPA should load; signed-out users should reach login.
- Confirm requests use the Render HTTPS API with one `/api` prefix and attach `Authorization: Bearer ...`. No production request should target localhost.
- Download receipts for existing rent and electricity payments, a monthly PDF, and all eight CSV formats. Check saved payment IDs and Asia/Kolkata transaction-date totals.
- Preview reminder text and inspect the encoded `wa.me` link. Opening WhatsApp or marking activity updates application history; preview alone is enough for a production read-only check.
- Verify that session expiry clears authentication and transient network failures preserve the saved token. Allow a sleeping Render service to start; the client timeout is 90 seconds.
- Test owner isolation, mutations, payment retries, and concurrent payments with synthetic accounts in an isolated database. Automated mocks do not replace this acceptance coverage.

### Troubleshooting

| Symptom | Checks |
| --- | --- |
| Production requests target localhost or an old API | Check Vercel's Production `VITE_API_BASE_URL`, then rebuild and redeploy. A settings edit cannot change an existing bundle. |
| Refreshing a page returns a platform 404 | Confirm Vercel Root Directory is `frontend` and `vercel.json` is included in the deployment. |
| Browser reports CORS errors | Match the frontend origin exactly in Render's `CLIENT_URL`. Check that preflight allows `Authorization` and `Content-Type`. Local development uses `http://localhost:5173`. |
| API starts slowly after inactivity | Allow the service to resume. Network failures preserve the saved session token. |
| `/api/ready` returns 503 | Check Render's `MONGO_URI`, database credentials, Atlas access list, and connectivity. Preserve the existing database name. |
| `/api/ready` returns 404 on an older service | Deploy the backend version providing it before selecting it as the health probe. |
| Requests return 401 | Check token validity and recent JWT rotation. Cross-host authentication uses bearer tokens and does not require cross-site cookies. |
| Sign-in requests return 429 | Wait for the auth rate limit to reset and check forwarded client IP handling. |

The auth limiter stores state in memory for one API instance and resets when it restarts. Multiple instances require a shared limiter store.

Confirm account-specific hosting limits and plan eligibility before operating a commercial service. Provider references: [Render Free](https://render.com/docs/free), [Render Node versions](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks), [outbound IP ranges](https://render.com/docs/outbound-ip-addresses), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel plans](https://vercel.com/pricing), [Atlas cluster types](https://www.mongodb.com/docs/atlas/manage-clusters/), and [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## Author

Parkhi Kumari — B.Tech Computer Science and Engineering, AI & Data Science.
