# Smart PG Manager

A responsive application for paying guest (PG) property owners to manage rooms, residents, attendance, rent, electricity bills, payments, and reports.

[Frontend](https://smart-pg-manager.vercel.app) · [API health](https://smart-pg-manager-backend.onrender.com/api/health) · [Deployment guide](DEPLOYMENT.md) · [GitHub Actions](https://github.com/amparkhi21/Smart_PG_Manager/actions/workflows/verify.yml)

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

[GitHub Actions](.github/workflows/verify.yml) runs the automated tests, dependency audits, production build, artifact checks, and Git hygiene checks on Node.js 24. It does not deploy or use database credentials.

## Project structure

```text
.github/workflows/       Automated verification
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

See [DEPLOYMENT.md](DEPLOYMENT.md) for Render and Vercel settings, environment variables, Atlas access, release checks, and troubleshooting. `GET /api/health` checks API liveness; `GET /api/ready` checks database readiness. `npm run check:db --prefix server` performs a read-only MongoDB ping.

Keep `.env` files, private keys, database backups, and resident data exports out of Git. **`server/.env` exists in earlier Git history.** Removing it from tracking does not remove that history; rotate the exposed database credentials and JWT secret before publishing or deploying. Coordinate rotation with the existing deployment because changing the JWT secret expires saved sessions.

Deployment must retain the existing Atlas database and records. Seed scripts, resets, and production write tests are not part of deployment.

## Author

Parkhi Kumari — B.Tech Computer Science and Engineering, AI & Data Science.
