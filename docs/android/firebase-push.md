# Android push backend and client (Phases 8C1 and 8C2)

Push is optional. In-app notifications and all existing business APIs work without Firebase. The Android client registers only after an authenticated user enables push and grants notification permission.

## Android Firebase app setup (Phase 8C2)

1. In the Firebase project used by the server, register an Android app with the exact package name `com.smartpgmanager.app`.
2. Download that app's `google-services.json` and place it at `frontend/android/app/google-services.json`.
3. Build or sync the Android project. The build detects a missing file and keeps push unavailable while leaving the app and in-app notifications usable; do not add a placeholder or invent Firebase values.
4. Keep the server Firebase Admin configuration below in server environment secrets. The Android client file is not a service-account credential and cannot replace the server credentials.

### Review the Firebase client API key before release

`google-services.json` contains a Firebase client API key. Firebase documents these keys as public project/app identifiers, not authorization secrets. Their restrictions are configured in Google Cloud Console under **APIs & Services > Credentials**; the JSON file does not prove which restrictions are active. Before including a client config in a release, verify the key belongs to the expected project and has appropriate API restrictions and quotas. Firebase-provisioned keys should be limited to Firebase-related APIs. If you add an Android application restriction, use package `com.smartpgmanager.app` and the release signing certificate's SHA-1 fingerprint; also apply API restrictions and monitor usage. See [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys) and [Google Cloud API key restrictions](https://cloud.google.com/docs/authentication/api-keys).

Android 13 and later require the runtime notification permission. The app asks only when an Owner or Resident enables push in settings. Tokens are sent only through the authenticated device API below, after permission is granted. Background notification display depends on both the Android app configuration and server FCM setup; foreground pushes refresh the existing unread count without adding a second notification.

Without a matching reviewed client config at `frontend/android/app/google-services.json`, Android push registration is unavailable; in-app notifications remain usable. Never include Firebase Admin service-account JSON, private keys or the token encryption key in client source.

Configure server environment secrets only:

| Variable | Value |
| --- | --- |
| `FCM_ENABLED` | `true` to enable delivery; default is disabled |
| `FIREBASE_PROJECT_ID` | Your existing Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service-account email |
| `FIREBASE_PRIVATE_KEY` | Service-account PEM private key; real newlines or escaped `\n` |
| `FCM_TOKEN_ENCRYPTION_KEY` | Independent random 32-byte key encoded as 64 hex characters |

Generate the encryption key using a cryptographically secure secret generator. Keep it stable: changing or losing it requires devices to register again. Do not use `JWT_SECRET` as the encryption key. Do not place these variables in Vite, Android resources, source files or committed service-account JSON. No application-default credential or local credential-file fallback is enabled.

Use an existing service account with the permission to send FCM messages in the intended project. See [Firebase Admin setup](https://firebase.google.com/docs/admin/setup), [sending messages](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk) and [FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes).

## Authenticated APIs

Both owner and active resident JWTs use the same routes. PG, account and role come from authentication; request-supplied identity fields are ignored.

- `POST /api/notifications/devices`: JSON `{ "deviceId": "<stable-installation-identifier>", "token": "<FCM-registration-token>", "platform": "android" }`. Returns `{ success, message, data: { id, deviceId, platform } }`. Installation IDs contain 16–128 letters, digits, `_` or `-`; a generated UUID is suitable. Tokens are opaque strings of 20–4096 accepted FCM characters. Re-registering the same installation updates its token and resident session version; multiple installations per account are supported. Tokens are AES-256-GCM encrypted with account/PG/installation associated data and indexed by SHA-256, never returned or logged. Encryption configuration is required even if delivery is disabled.
- `DELETE /api/notifications/devices/:id`: unregister the returned registration ID, scoped to the authenticated account and PG. It requires no Firebase configuration. Foreign registrations return 404. There is no public token-list endpoint.

A token or installation cannot be bound to multiple accounts. A collision returns 409 without disclosing the existing owner. The Android client unregisters before logout/account switching, then registers under the new authenticated account. It registers again after password/session changes and token refreshes.

## Delivery and reliability

Only newly persisted Phase 8A notification events opt into push. No historical production notifications are backfilled. Existing complaint, payment, room, leave and notice event handlers remain the source of truth. Dispatch starts after the database notification is committed, outside API responses and business transactions. A local background drain checks pending rows every 30 seconds and on notification activity; no external scheduler is required.

Delivery rechecks the exact PG, recipient role/account, resident active status and resident session version. Only devices registered before the notification was created receive it. Read notifications and updates older than 24 hours are skipped. Push payloads carry stable notification/entity IDs, an approved application path and recipient/PG metadata; the lock-screen text is generic and contains no complaint details, financial amounts or UTRs. Future clients must validate the recipient before opening the authenticated in-app record.

A unique database record claims each notification/device pair **before** the SDK send call. Concurrent drains, repeated events and token refreshes cannot repeat that application send attempt. There is no automatic replay after an ambiguous failure, timeout or process crash following the claim: FCM has no application exactly-once acknowledgment, so replay could duplicate delivery. Pending work that has not been claimed can retry after restart; in-app notifications remain the durable source if a push is missed. Firebase SDK transport retries, if any, are separate from this application claim. The Android notification tag and data include a stable notification ID.

Invalid/not-registered FCM tokens are removed only if their registration revision is still current, protecting refreshed tokens from old failures. Other failures retain the device and store a sanitized error code only. No SDK error messages, tokens or credential values are logged. Push exceptions and timeouts cannot fail notification reads, payments, complaints or approvals.

Missing/disabled/invalid Firebase configuration leaves push pending and in-app notifications available. Startup logs configuration variable names only. Changing configuration requires a server restart. No actual Firebase connection or real push is required to run the mocked disposable-MongoDB tests.
