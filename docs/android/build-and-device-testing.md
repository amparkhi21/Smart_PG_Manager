# Android build and device testing

Current identity: **Smart PG Manager**, package **`com.smartpgmanager.app`**,
version **`2.1.0`**, version code **`4`**. Minimum SDK is 24; compile and target SDK
are 36. Keep these values unchanged during cleanup.

## Build a debug APK

Use Node.js 24, JDK 21 and the installed Android SDK. `JAVA_HOME` must point to a
JDK 21 installation; `frontend/android/local.properties` supplies the local SDK
path. Machine-specific paths and signing files remain local.

From the repository root in PowerShell:

```powershell
Push-Location frontend
npm.cmd run build
npx.cmd --no-install cap sync android
Push-Location android
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.gradle'
.\gradlew.bat :app:assembleDebug --console=plain
Pop-Location
Pop-Location
```

Check each command succeeds before continuing. If tooling cannot read its normal
configuration inside a restricted execution environment, use approved build access
without modifying application configuration to work around that restriction.

Output relative to the repository:

`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

Inspect the APK with the installed SDK's `aapt dump badging` and
`apksigner verify --verbose --print-certs`. Verify the package, version name/code,
debuggable flag and Android Debug certificate. An up-to-date Gradle result is
acceptable when the APK's packaged web assets match the latest frontend output.
This procedure does not produce or authorize a signed release APK.

## Backend and Firebase

The production API is `https://smart-pg-manager-backend.onrender.com/api`.
Capacitor bundles `dist` and uses the WebView origin `https://localhost`; the
backend must explicitly allow that origin and authorization/content-type headers.
Cleartext traffic remains disabled. A successful unauthenticated health request
does not establish authenticated device behavior.

Keep `frontend/android/app/google-services.json` in its expected local location.
Keep server Firebase Admin configuration and all signing/encryption keys unchanged.
See [Firebase push configuration](firebase-push.md). Client configuration alone
does not prove that server delivery is enabled or working.

## Physical-device acceptance checklist

Physical-device checks are **pending unless separately recorded with evidence**.
Build success and simulated browser/native-bridge tests do not establish a device
pass. Record device model, Android/WebView versions, APK hash, date and outcomes.

- Install and update using a compatible signing certificate; launch and splash.
- Owner/resident login, secure session restore, logout and account switching.
- Resident management, unified Requests and legacy-route navigation.
- Attendance, notification lists, rent/electricity billing and AI menu display.
- Back navigation, keyboard resize, cutouts, rotation and narrow-screen controls.
- Notification opt-in/denial, token registration, foreground/background delivery
  and notification-tap routing using an authorized test account.
- Dialer, clipboard, external/UPI links and PDF/CSV share chooser.
- Offline recovery, slow backend wake-up and Wi-Fi/mobile-data transitions.

Use isolated test accounts/data for write scenarios. Never repeat financial writes
against production merely to validate the Android shell.

Historical implementation evidence is under
[`docs/archive/android-phase6b/`](../archive/android-phase6b/ANDROID_PHASE_6B.md).
Its older version and machine-specific JDK instructions are historical.
