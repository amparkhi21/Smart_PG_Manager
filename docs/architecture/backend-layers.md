# Backend layers and relocation mapping

The backend keeps the `server/` package root, API paths and response contracts.
This is an internal organization change, with no database migration or new UI.

## Responsibilities

| Location | Responsibility |
| --- | --- |
| `src/index.js` | Environment-first startup, database connection, worker startup, HTTP listening and graceful shutdown. |
| `src/app.js` | Express composition, security/CORS, health/readiness and route mounting. |
| `src/controllers/` | Map validated HTTP inputs to service arguments; choose HTTP status/envelope, handle cancellation and stream authorized images. |
| `src/services/` | Business operations, database orchestration, tenant filters, transactions, public data projections and provider delivery. |
| `src/services/workers/` | Start/stop the existing push drain and await in-flight deliveries. |
| `src/middlewares/` | Session authentication, role/tenant authorization, validation and error handling. |
| `src/models/` | Existing schema fields, hooks, indexes and embedded outbox behavior. |
| `src/constants.js` | Shared enums, validation limits, notification targets, payment warning and Gemini defaults. |
| `src/utils/` | Pure formatting/validation, token cryptography, ownership lookup and reusable transaction/bed helpers. |

Services receive explicit application context: checked owner/resident/member identities,
`input`, `filters` and `identifiers`. They do not receive Express request/response
objects. Identity remains supplied by authentication middleware, not client body
fields. Controllers add the existing `success` envelope and status code to the
service outcome. Idempotent payment/reminder operations preserve the distinction
between a newly created result (`201`) and an existing one (`200`).

Gemini request cancellation remains in the controller; generation locks, bounded
history and provider orchestration are services. No menu is published by generation.
Image authorization/storage stays in its service; headers and response streaming
stay in the controller. Files continue to use GridFS; no local upload directory or
new public file-serving route is introduced.

## Relocations

| Previous implementation | Current location |
| --- | --- |
| `src/server.js` | `src/index.js` |
| `src/middleware/*` | `src/middlewares/*` |
| Business logic in each `src/controllers/<feature>Controller.js` | Matching `src/services/<feature>Service.js`; controllers retain HTTP adapters. |
| Request validation factories in `requestsController.js` | `src/middlewares/requestValidators.js` |
| `src/utils/aiMessPlanner.js` provider/client orchestration | `src/services/geminiMenuService.js` |
| AI input/schema/output validation and date offset | `src/utils/aiMenuValidation.js` |
| AI history and per-owner generation lock | `src/services/aiMessMenuService.js` |
| `src/utils/notifications.js` | `src/services/notificationDeliveryService.js` |
| `src/utils/pushNotifications.js` dispatch and in-flight tracking | `src/services/pushNotificationService.js` |
| Push interval/start/stop lifecycle | `src/services/workers/pushNotificationWorker.js` |
| Database updates in `src/utils/billing.js` | `src/services/billingService.js`; numeric/status helpers remain in `utils/billing.js`. |
| Login-access mutation in `src/utils/residentAuth.js` | `src/services/residentAccountService.js`; phone/password/public-view helpers remain in `utils/residentAuth.js`. |
| Shared exported model/controller/utility constants | `src/constants.js`; imports point directly to the shared definitions. |

No compatibility copies of retired implementation files are retained. Internal
test imports and browser integration imports follow the new locations. Existing
tests continue to exercise the HTTP contracts and isolated database workflows.

## Startup, diagnostics and hosting

`package.json` uses `main: src/index.js`, `node src/index.js` for `npm start`, and
`nodemon src/index.js` for development. Render keeps root `server`, build command
`npm ci --omit=dev`, start command `npm start` and readiness path `/api/ready`.
The existing `render.yaml` does not need new commands or a new service.

`src/index.js` imports `config/loadEnv.js` before validating or starting the app.
The local loader preserves inherited environment configuration, and startup
errors remain sanitized. The database ping script remains available. SIGTERM/SIGINT
close the HTTP server, await push work and disconnect MongoDB. On Windows, isolated
verification dispatches the registered signal handlers through a test-only IPC
preload; it does not claim to test Unix signal forwarding by a hosting platform.

The organized root documentation and seven README screenshots remain in place.
Only architecture paths in the README are updated. `src/docs/` is unnecessary
because maintained documentation is already under the root `docs/` directory.
