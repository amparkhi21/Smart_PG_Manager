# Deployment guide

Operational instructions for the existing Vercel frontend, Render API, and MongoDB Atlas database. For local setup and automated verification, see [README.md](README.md).

| Service | Address |
| --- | --- |
| Frontend | `https://smart-pg-manager.vercel.app` |
| API | `https://smart-pg-manager-backend.onrender.com/api` |
| Repository | `https://github.com/amparkhi21/Smart_PG_Manager.git` |

## Protect the existing data and configuration

`server/.env` was committed in earlier Git history. Its ignored local copy and the existing deployment settings must remain private. Rotate the exposed MongoDB database-user password and JWT secret before publishing or deploying, coordinating the changes with Render and local configuration. JWT rotation requires owners to log in again. Rewriting Git history is a separate maintenance operation.

Retain the existing Atlas project, cluster, database name, and records. Do not run the seed command, import demo data, reset collections, or test write flows against production. Use an isolated database and synthetic owners for create/update/payment and concurrency checks.

## Render API

Use the existing service when updating production. [render.yaml](render.yaml) provides an optional Blueprint for a new service; importing it alongside an existing service would create another deployment.

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Runtime | Node |
| Root directory | `server` |
| Region / plan in the blueprint | Singapore / Free |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Node version | `24` via `NODE_VERSION`; package engines require `24.x` |
| Health check | `/api/ready` for the backend version in this repository |
| Auto deploy | Off during manual release verification |
| Persistent disk / pre-deploy command | None |

For an older running backend, confirm that `/api/ready` exists before changing its health check. Keep its working probe until deploying the backend version that supplies readiness.

The server listens on `0.0.0.0`, uses Render's supplied `PORT`, and trusts one proxy hop. `/api/health` checks process liveness; `/api/ready` pings MongoDB and returns 503 if the connection is unavailable.

## Vercel frontend

Use the existing Vercel project when updating production. Keep [frontend/vercel.json](frontend/vercel.json), including its SPA rewrite and security headers.

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Framework | Vite |
| Root directory | `frontend` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `24.x` |
| Production variable | `VITE_API_BASE_URL=https://smart-pg-manager-backend.onrender.com/api` |

Vite embeds the API URL at build time. Changing an environment variable requires a new frontend build and deployment. The application prefers an explicit HTTPS API URL; missing or loopback production values fall back to the existing Render API. URLs must end in exactly one `/api` and contain no credentials, query string, or fragment.

Configure Preview separately if needed. Add each exact approved Preview origin to Render's `CLIENT_URL`; wildcard Vercel origins are rejected. Review Git-triggered deployment settings before pushing a release commit.

## Environment variables

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

`MONGO_URI` and `JWT_SECRET` are required. Production also requires `CLIENT_URL`. The Blueprint generates a JWT secret for a new service; preserve and manage the configured secret when updating an existing service. Reminders use manual WhatsApp links and need no messaging-provider credentials.

For local examples, see [server/.env.example](server/.env.example) and [frontend/.env.example](frontend/.env.example). Never overwrite an existing `.env` while copying an example.

## MongoDB Atlas access

Use an application database user scoped to the existing database, rather than an Atlas administrator. URL-encode special characters in the password and preserve the database name in the connection string.

Allow the Render service's outbound CIDR ranges in the Atlas IP access list. Obtain them from the service's **Connect > Outbound** settings; avoid opening access to `0.0.0.0/0`. A successful local ping does not prove that Render has network access.

The application stores records in MongoDB and generates exports in the browser. Render's local filesystem is not database storage.

## Release procedure

1. Review the changes and complete the credential rotation described above. Keep environment files, dependencies, builds, backups, and resident exports out of Git.
2. Run the tests, audits, production build, artifact checks, and repository check in [README.md](README.md#tests-and-production-build). Tests use synthetic data and mocks; the GitHub workflow has no deployment credentials.
3. Review and publish the release commit manually when ready. Check provider auto-deploy settings first so publishing does not start an unintended release.
4. If the backend changed, deploy it to the existing Render service using the settings above. Confirm its database connection and both health endpoints. An unauthenticated request to `/api/rooms` should return 401.
5. Deploy the frontend in the existing Vercel project with the correct production API variable. If troubleshooting an old API URL, use a fresh build without the previous build cache. If the frontend hostname changes, update Render's exact `CLIENT_URL` as well.
6. Run the hosted checks below before considering the release verified. Use an isolated database for any write or concurrency acceptance tests.

## Hosted acceptance checks

- Sign in with an existing account and visit dashboard, rooms, residents/profile, attendance, rent, electricity, payments, reminders, settings, and reports.
- Refresh `/rooms`, `/residents/<existing-id>`, `/payments`, `/reports`, and `/settings` directly. The SPA should load, and signed-out users should reach login.
- Confirm requests target the Render HTTPS API with a single `/api` prefix and attach `Authorization: Bearer ...`. No production request should target localhost.
- Download receipts for existing rent and electricity payments, a monthly PDF, and all eight CSV formats. Check persisted payment IDs and Asia/Kolkata transaction-date totals.
- Preview reminder text and inspect the encoded `wa.me` link. Opening WhatsApp or marking activity updates application history; preview alone is enough for a production read-only check.
- Verify session expiry clears authentication and a transient network failure preserves the saved token. Allow for a sleeping Render service to start; the client timeout is 90 seconds.
- Test owner isolation, mutations, payment retries, and concurrent payments using synthetic accounts and an isolated database. Automated mocks do not replace this acceptance coverage.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Production requests target localhost or an old API | Check Vercel's Production `VITE_API_BASE_URL`, then rebuild and redeploy. A settings edit cannot change an existing bundle. |
| Refreshing a page returns a platform 404 | Confirm Vercel Root Directory is `frontend` and `vercel.json` is included in the deployment. |
| Browser reports CORS errors | Match the frontend origin exactly in Render's `CLIENT_URL`. Check the preflight response allows `Authorization` and `Content-Type`. Local development uses `http://localhost:5173`. |
| API starts slowly after inactivity | Allow the service to resume. Network failures preserve the saved session token. |
| `/api/ready` returns 503 | Check Render's `MONGO_URI`, database credentials, Atlas access list, and connectivity. Preserve the existing database name. |
| `/api/ready` returns 404 on an older service | Deploy the backend code that provides it before selecting it as the health probe. |
| Requests return 401 | Check token validity and recent JWT rotation. Cross-host authentication uses bearer tokens and does not require cross-site cookies. |
| Sign-in requests return 429 | Wait for the auth rate limit to reset and check forwarded client IP handling. |

The auth limiter stores state in memory for a single API instance and resets when it restarts. Scaling to multiple instances requires a shared limiter store.

For a local read-only database check, run `npm run check:db --prefix server`. It uses the native MongoDB driver to ping without loading application models or creating indexes. Keep real database credentials out of public CI.

Confirm account-specific hosting limits and plan eligibility before operating a commercial service. Provider references: [Render Free](https://render.com/docs/free), [Render Node versions](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks), [outbound IP ranges](https://render.com/docs/outbound-ip-addresses), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel plans](https://vercel.com/pricing), [Atlas cluster types](https://www.mongodb.com/docs/atlas/manage-clusters/), and [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
