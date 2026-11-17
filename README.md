# Smart PG Manager

A React and Express application for PG owners to manage occupancy, residents, attendance, rent, electricity, and recorded payments.

The application modules are implemented. The frontend is hosted at https://smart-pg-manager.vercel.app and the API at https://smart-pg-manager-backend.onrender.com. The local production-connectivity fix requires a new Vercel deployment. See [deployment instructions](DEPLOYMENT.md) for configuration and [the Phase 5A readiness report](PHASE5A_READINESS.md) for the earlier preparation evidence and current follow-up.

## Implemented functionality

- Owner registration/login, HS256 JWT sessions, protected routes, and owner-scoped backend queries.
- Dashboard occupancy and financial summaries.
- Rooms with capacity, rent, occupancy, duplicate-number checks, and deletion restrictions for historical records.
- Residents with room assignment, profile/history views, leave handling, and capacity checks.
- Daily/bulk attendance and monthly attendance summaries.
- Monthly rent generation, partial/full payments, conditional atomic balance checks, and payment retry IDs.
- Room electricity readings, calculated bills, installment payments, and payment history.
- Individual rent/electricity PDF receipts based on persisted payment IDs. Receipts say Payment Recorded; they are not bank verification or tax invoices.
- WhatsApp reminder drafts, editable previews, click-to-chat links, duplicate warnings, and owner-reported activity. The app does not automatically send messages or claim delivery/read status.
- Property settings, future billing defaults, reminder preferences, and message templates.
- Read-only monthly reports and PDF exports, separating billing-month collections from transaction-date receipts in Asia/Kolkata.
- Eight CSV exports: rooms, residents, attendance, rent records, rent payments, electricity bills, electricity payments, and monthly summary. Resident contact fields are omitted, and formula-leading strings are escaped.

The source and selected automated behaviors have been verified. These statements do not imply full browser or live-database acceptance coverage for every module; the readiness report describes the limits.

## Stack and structure

| Component | Technology / intended host |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS, Axios, React Router / Vercel |
| Backend | Node 24, Express 4, Mongoose, JWT / Render |
| Database | Existing MongoDB Atlas database |
| Receipts/charts | jsPDF / Recharts |
| Version control | Git / GitHub |

- `frontend/src/`: pages, reusable components, authentication context, API client, and export utilities.
- `server/src/`: routes, controllers, models, validation, authentication, and startup configuration.
- `server/test/`: synthetic model/controller and HTTP security tests; no live-database writes.
- `frontend/scripts/verify-build.mjs`: production export/link artifact checks using synthetic data.
- `.github/workflows/verify.yml`: Node 24 tests, audits, build, and Git hygiene checks; no deployment or secrets.
- `render.yaml` and `frontend/vercel.json`: optional backend blueprint and frontend SPA routing/build configuration.

## Local setup (Windows PowerShell)

Use Node 24 and `npm.cmd`. From the project root, install dependencies with `npm.cmd ci --prefix server` and `npm.cmd ci --prefix frontend`.

If `.env` files do not already exist, copy `server/.env.example` to `server/.env` and `frontend/.env.example` to `frontend/.env`. Do not overwrite existing configuration. Replace placeholders privately. The backend reads `NODE_ENV`, `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `CLIENT_URL`. The frontend reads `VITE_API_BASE_URL`.

For local development, use `NODE_ENV=development`, `CLIENT_URL=http://localhost:5173`, and `VITE_API_BASE_URL=http://localhost:5000/api`. The frontend also supports an unset API URL during development through Vite's `/api` proxy to port 5000. Set a valid MongoDB connection and a unique JWT secret of at least 32 characters. Never run seed scripts against existing data.

Run these in separate terminals:

```powershell
npm.cmd run dev --prefix server
```

```powershell
npm.cmd run dev --prefix frontend
```

Open `http://localhost:5173`. Backend liveness is `GET /api/health`; database readiness is `GET /api/ready`. A read-only connectivity check is available through `npm.cmd run check:db --prefix server`.

## Tests and production build

```powershell
npm.cmd test --prefix server
npm.cmd test --prefix frontend
npm.cmd audit --prefix server
npm.cmd audit --prefix frontend
Push-Location frontend
$env:VITE_API_BASE_URL = 'https://smart-pg-manager-backend.onrender.com/api'
npm.cmd run build
npm.cmd run test:build
Remove-Item Env:VITE_API_BASE_URL
Pop-Location
node scripts/check-repository.mjs
```

`VITE_API_BASE_URL` is the primary public API configuration. Production uses `https://smart-pg-manager-backend.onrender.com/api` if the variable is missing or points to localhost/loopback, including when a local development `.env` is present. A valid configured HTTPS backend overrides the fallback. Invalid paths, duplicated `/api`, embedded credentials, and non-HTTPS public API URLs are rejected. Vite embeds the resolved URL at build time, so changing Vercel configuration requires a new deployment. The frontend output is `frontend/dist`.

## Deployment and data protection

Follow [DEPLOYMENT.md](DEPLOYMENT.md) manually. The backend uses environment-based CORS, one trusted Render proxy hop, auth rate limiting, Helmet, safe production errors, a database readiness check, and graceful shutdown. Authentication uses bearer tokens rather than cross-site cookies. Temporary network failures preserve the saved token; confirmed protected-API 401 responses clear it.

`server/.env` existed in earlier Git history. Rotate the database credentials and JWT secret before pushing or deploying. The file and dependencies have been removed from current Git tracking, while local copies are retained. History has not been rewritten. Never commit credentials, resident data exports, backups, or private keys.

Render Free sleeps when idle. Vercel Hobby is limited to personal/non-commercial use; confirm eligibility for the intended use before deploying a commercial PG operation. No paid services, automatic messages, seed runs, Git pushes, cloud deployments, or mobile development are part of this preparation.

## Author

Parkhi Kumari - B.Tech Computer Science and Engineering, AI & Data Science.
