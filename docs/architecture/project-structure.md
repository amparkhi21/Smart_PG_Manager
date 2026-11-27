# Project structure

The application keeps two independent package roots: `frontend/` and `server/`.
Keep their names stable because hosting configuration, scripts and integration tests use them.

- `frontend/src/App.jsx`: owner/resident routes and compatibility redirects.
- `frontend/src/pages/`: active route screens.
- `frontend/src/components/`: shared UI and feature-specific components.
- `frontend/src/context/`, `hooks/`, `api/`, `utils/`: state, data access and reusable helpers.
- `frontend/src/native/`: Android/browser adapters; `frontend/android/`: native application.
- `frontend/e2e/`: browser regression specifications; unit tests are colocated in `src/`.
- `server/src/app.js`: Express composition; `server/src/index.js`: startup and shutdown.
- `server/src/controllers/`: HTTP input mapping, status codes, response envelopes and streaming.
- `server/src/services/`: business operations, Gemini integration and notification delivery; `services/workers/` owns push-worker lifecycle.
- `server/src/middlewares/`: authentication, authorization, request validation and error handling.
- `server/src/config/`, `models/`, `routes/`, `utils/`: configuration, persistence, endpoint wiring and reusable helpers.
- `server/src/constants.js`: the existing shared enums, limits and planner defaults.
- `server/scripts/`: repository, database and startup diagnostics.
- `server/test/`: isolated backend regressions.
- `docs/android/`, `docs/operations/`, `docs/archive/`: current runbooks and historical records.
- `tmp/`: absent after cleanup; test runs may recreate this ignored directory. Test binaries, local tooling, screenshots, diagnostics and cleanup manifests are preserved in the [external archive](../archive/README.md).

The unified Requests screen handles the current request workflows. Old complaint,
leave, payment-request and room-change URLs retain their redirects. Removing the
inactive screen implementations does not remove their backend APIs or models.
Complaint/contact helper modules and their unit tests remain to preserve existing
validation, search and pagination coverage.

See [backend layers and relocation mapping](backend-layers.md) for service boundaries
and startup compatibility. Frontend feature-folder restructuring remains deferred.
Environment files, Firebase configuration, signing material and native resources
remain in their existing locations. No unused `server/src/docs/` or `uploads/`
directory is created: documentation stays under root `docs/`, and community images
continue to use authenticated MongoDB GridFS storage.
