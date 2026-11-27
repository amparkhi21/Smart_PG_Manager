# Historical records

[Android Phase 6B handoff](android-phase6b/ANDROID_PHASE_6B.md) and its
[file inventory](android-phase6b/android-phase6b-files.json) preserve the original
implementation record. Version numbers, machine paths, validation counts and
`tmp/` references describe that historical session, not the current release.

Use the [current Android runbook](../android/build-and-device-testing.md) for
version 2.1.0, version code 4. Historical patch scaffolding and older APKs are
archived outside the repository at
`C:/Users/pkpar/OneDrive/Desktop/smart-pg-manager-archive/cleanup-2026-11-27/`.
Its original cleanup evidence, temporary test results, logs and backups are now
preserved in `tmp-evidence.zip` under the sibling archive directory
`root-cleanup-2026-11-27-verified/`. Historical `tmp/phase6b-original/` and
`tmp/phase6b-artifacts/` references resolve to entries in that ZIP. Each archived
file was verified against its SHA-256 hash before its temporary copy was removed.
The archive has a `manifest.json`. The remaining `tmp/` contents, including
`root-cleanup/results.json`, preservation hashes, screenshots, diagnostics,
temporary tooling and MongoDB test binaries, were subsequently copied and
SHA-256 verified under `root-cleanup-2026-11-27-verified/remaining-tmp/tmp/`.
That archive's `manifest.json` and `completion.json` record the final removal of
the root `tmp/` directory. `junctions.json` records the former link to the
application's `server/node_modules`; the target dependencies remain in place.
