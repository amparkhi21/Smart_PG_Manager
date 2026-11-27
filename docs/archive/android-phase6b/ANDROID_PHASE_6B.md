# Android Phase 6B handoff

The changes are on `mobile-app`. The branch now includes the backend-only CORS hotfix `3657607` from `origin/main`; no mobile changes were merged or pushed to `main`. Existing mobile files were copied to the ignored `tmp/phase6b-original/` before editing. The original Capacitor package manifests were retained.

## App behavior

- Navy/teal building-and-check branding replaces the default launcher artwork. Square and round PNGs are generated at 48, 72, 96, 144 and 192 pixels. Adaptive icons use a vector foreground; Android 13+ also has a monochrome icon.
- One AndroidX system splash displays the mark on navy, with the app name as a branding image on Android 12+. It fades out when React mounts, without waiting for the API or a fixed loading delay.
- Shared layouts now account for Capacitor 8's safe-area variables, bottom navigation, landscape cutouts and keyboard resize. Dialogs render outside transformed page containers, scroll within the available height, trap focus and restore it when closed. Small-screen payment summaries use two columns; figures and labels can wrap.
- Hardware Back dismisses the top dialog or profile menu, navigates within the app, or minimizes it from Dashboard/Login. Returning from an external app revalidates an existing session with a read request.
- Android JWTs are encrypted with AES-256-GCM using a non-exportable Android Keystore key. An existing localStorage token is migrated only after a successful encrypted write. Logout clears the saved session. Failed migration never falls back to storing a new plaintext Android token. Browser storage behavior is preserved.
- A failed session restore shows a retry screen without deleting the token. Offline and slow-request notices explain connectivity and Render wake-up time. API failures have manual retry actions; financial writes have no automatic retries. Network failures during writes tell the owner to check saved records before submitting again.
- Android PDF receipts, report PDFs and CSV exports use a native share chooser and private cache-backed FileProvider URIs. The owner chooses an app to save/share the file. Exports are limited to 16 MiB, and old cache exports are removed on a later app start/export after 24 hours. Browser downloads retain their anchor-based handoff.
- WhatsApp click-to-chat links open outside the Android WebView; messages still require manually pressing Send. Copy uses the Android clipboard. External links are restricted to HTTPS, telephone and email URLs.

## Identity and security

`Smart PG Manager`, `com.smartpgmanager.app`, version name `1.0.0`, version code `1`.

The production API remains `https://smart-pg-manager-backend.onrender.com/api`. Capacitor keeps its existing `https://localhost` origin. Cleartext traffic and app backup are disabled; the FileProvider exposes only the export-cache directory. No storage, contacts or calling permissions were added. No database reset, seed, real financial write, credential change, production signing key, deployment, store publication or GitHub push was performed.

## Files

The detailed frontend change inventory is in [android-phase6b-files.json](android-phase6b-files.json). Principal changes:

| Area | Files |
| --- | --- |
| Native configuration | `frontend/capacitor.config.json`, `frontend/android/app/build.gradle`, `frontend/android/.gitignore`, `frontend/android/app/src/main/AndroidManifest.xml` |
| Android bridge/splash | `frontend/android/app/src/main/java/com/smartpgmanager/app/MainActivity.java`, `SmartPgNativePlugin.java` in the same directory |
| Android resources | `frontend/android/app/src/main/res/values/styles.xml`, `values-v27/styles.xml`, `values-v31/styles.xml`, `values/colors.xml`, `values/ic_launcher_background.xml`, vector drawables, adaptive icon XML, density PNGs, `xml/file_paths.xml`, `xml/data_extraction_rules.xml` |
| Branding source/tool | `frontend/public/brand/smart-pg-icon.svg`, `frontend/scripts/generate-android-branding.ps1`, `frontend/src/components/BrandMark.jsx`, `frontend/index.html` |
| Native browser adapters | `frontend/src/native/platform.js`, `sessionStorage.js`, `files.js`, `external.js`, `requestActivity.js`, `backNavigation.js` |
| Runtime/status | `frontend/src/components/NativeRuntime.jsx`, `ConnectionNotice.jsx`, `ProtectedRoute.jsx`, `frontend/src/main.jsx` |
| Sessions/API | `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`, `http.js`, `frontend/src/utils/format.js`, `frontend/src/hooks/useFetch.js` |
| Shared mobile UI | `frontend/src/index.css`, `layouts/AppLayout.jsx`, `layouts/AuthLayout.jsx`, `components/Header.jsx`, `BottomNav.jsx`, `components/ui/Modal.jsx`, `FormControls.jsx`, `IconButton.jsx`, `StatCard.jsx`, `components/attendance/DailyAttendance.jsx`, `pages/PaymentHistory.jsx` |
| Export/reminder integration | `frontend/src/utils/pdf.js`, `reports.js`, `frontend/src/pages/Reports.jsx`, `frontend/src/components/reminders/ReminderPreviewModal.jsx` |
| Checks | `frontend/src/native/mobile.test.js`, `frontend/scripts/verify-build.mjs`, corrected package assertion in the existing Android instrumented example test |

No new application dependencies were installed. The installed Capacitor 8 and AndroidX libraries supply the native APIs. Windows System.Drawing generates raster icon fallbacks from the geometric artwork. Temporary `playwright-core@1.65.1` tooling was installed under ignored `tmp/phase6b-browser/` for Chrome checks; it is not bundled with the app.

## Validation

| Check | Actual result |
| --- | --- |
| `npm.cmd test --prefix frontend` | 25 passed, including secure-session migration/logout, native export payloads, external links, Back handling and no financial-write retries |
| `npm.cmd test --prefix server` | 18 passed, including explicit Android-origin opt-in, website CORS, JWT authentication and unauthorized-origin rejection |
| `npm.cmd run build` in `frontend` | Passed |
| `npm.cmd run test:build` in `frontend` | Passed: production HTTPS API, receipt/report PDF generation, all eight CSV formats, browser download handoff and WhatsApp URL encoding |
| Chrome production-build checks | 39 route/viewport checks passed at widths 320, 390 and 1280, including resident profile, login and registration; no horizontal overflow or clipped tested controls; modal resize/Escape, More sheet, real PDF/CSV browser downloads, offline token retention, 503 retry and 401 logout passed. API responses were synthetic, with no writes. |
| `npx.cmd cap sync android` | Passed |
| Android debug compile, unit-test task and lint | Passed using project JBR 21; app lint has 0 errors and 12 nonfatal warnings |
| Final APK inspection | Valid v2 debug signature, expected app name/package/version, ten launcher/round PNG dimensions and HTTPS Capacitor configuration verified; final production stylesheet was checked inside the APK |

Browser screenshots, synthetic downloads and the full browser result JSON are in ignored `tmp/phase6b-artifacts/`. The browser harness is `tmp/phase6b-browser/check.mjs`. Android lint and unit reports are under `frontend/android/app/build/reports/`. The existing Android JVM unit test is the generated arithmetic example; it does not validate Keystore or native UI behavior.

## Build and install

Use the project's Android Studio JBR 21 at `C:\Users\pkpar\.jdks\jbr-21.0.11`. The machine's default Java 26 and Android Studio installation's JBR 25 differ from that project JDK.

From the project root in PowerShell:

```powershell
Set-Location frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:build
npx.cmd cap sync android
$env:JAVA_HOME = 'C:\Users\pkpar\.jdks\jbr-21.0.11'
Set-Location android
.\gradlew.bat assembleDebug testDebugUnitTest lintDebug
```

The debug APK is `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (4,580,798 bytes). SHA-256: `7672A1548AE969153700F7C3ACBA4C7051B0081445F9E3F6E55E0D147D967180`.

To update the installed debug application, connect the phone with USB debugging enabled and run from the project root:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r ".\frontend\android\app\build\outputs\apk\debug\app-debug.apk"
```

The `-r` replacement preserves app data when using the same signing certificate. You can instead copy this APK to the phone and open it to install the update. Do not uninstall or clear application storage to update it.

To regenerate PNG branding on this Windows machine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\frontend\scripts\generate-android-branding.ps1
```

## Remaining release acceptance

No Android device was connected in `adb devices -l`; no real-device tests or installation were performed during this phase. Verify the updated APK on the phone before producing a signed release: cold/warm launch and splash, gesture and three-button navigation, hardware Back, keyboard visibility in long/nested dialogs, rotation, saved-session migration and persistence across app restart, logout, native PDF/CSV save/share, clipboard, WhatsApp opening, offline/slow-network recovery and an existing account's read-only screens. Use synthetic accounts in an isolated database for any financial write acceptance test. Signing and store release remain manual future steps.

The 12 remaining nonfatal app lint warnings concern manifest ordering/older-platform attributes, SDK/dependency maintenance, unused resources, a missing density folder, and the API-26 adaptive-icon monochrome check. Android 13+ has explicit API-33 monochrome resources. Full warning IDs/counts are recorded in `android-phase6b-files.json`; Gradle also retains the generated Capacitor `flatDir` repository warning. No app lint errors were suppressed to pass the build.

Implementation references: [Android system splash migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate), [Capacitor 8 SystemBars](https://capacitorjs.com/docs/apis/system-bars), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [secure file sharing](https://developer.android.com/training/secure-file-sharing/share-file).
