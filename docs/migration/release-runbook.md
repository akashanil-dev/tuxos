# Continuation rollout and retirement runbook

11 November 2026. **Local release candidate; not deployed. No retirement date.** The source, recovery UI,
legacy exporter, metadata and deployment safeguards are implemented. Human beta and original-origin checks
must pass before retiring Tuxplore. The accepted plan explicitly makes them exit conditions.

## Prepared artifacts

- Main application: `npm ci && npm run check && npm run build && npm run check:bundle && npm run test:release`.
- CI produces a release archive with `web/`, `api/`, `release.json` and guarded deployment/rollback scripts.
  Pushing/merging `main` invokes the existing production deployment workflow; this implementation was not pushed.
- `deploy/release.json` declares snapshot 2, reader compatibility and API downgrade protection. These are
  contracts backed by the kernel/API tests, not a permission to label an incompatible build as safe.
- Original-origin bridge: `node deploy/tuxplore/prepare.mjs <verified-legacy-source> <new-output-directory>`.
  This copies only public assets, adds a greeter/Settings/About continuation link and includes `export.html`,
  `export.mjs`, a separate archive candidate and preserved `play.html`. It refuses unexpected source structure
  or an existing output directory. The input checkout and account backend are untouched.
- User-facing migration instructions: `/migrate.html`; continuation/credits: `/about.html`; history disposition:
  `/stats.html`; existing penguin icons and new browser-display manifest. No service worker or offline claim.

## Staged release

1. **Publish additive export first, on every exact original origin that stored saves.** Match the deployed
   legacy revision/backend before uploading the candidate. Preserve the current app, account routes, About,
   Stats and assets. Test a disposable guest’s local save, authenticated account retrieval, both export buttons,
   invalid/missing saves and opt-out behavior. HTTP, HTTPS, hostname and browser profiles are separate origins.
   Never add an unconditional redirect. Keep source backups privately; exports can contain personal notes.
2. **Opt-in continuation beta.** Back up the production SQLite database using its online backup facility and
   record the running release. Rehearse against a disposable copy, not the live database. Confirm schema-2
   compatible recovery, API save conflicts, guest/account isolation, export/import and restored files. Make the
   full candidate available opt-in while the old site stays usable. Do not use a flag that deletes feature data.
3. **Observe the comparison tasks.** Use `performance-and-beta.md` with 5–8 volunteers, including Tuxplore
   supporters. Test their sanitized migration copies with consent. Complete the physical phone/tablet, touch,
   reduced-motion, print and lower-end-device checks in `verification-matrix.md`. Fix repeated barriers, rerun
   affected tasks and record their reasons for preference. No observations have been invented for this report.
4. **Continuation release.** Publish the tested build, migration guide, original license/credits and support
   instructions. Keep Tuxplore play/account export available throughout the migration period. Verify page titles,
   social cards, manifest/icons and public links over the actual production CDN. Choose a retirement date only
   after feedback and migration evidence, then communicate it through the site. No messages were sent by this work.
5. **Archive and retire only after the checklist below is signed off.** `deploy/tuxplore/archive.html` is an
   export-capable candidate for the original root. It expects `play.html` for legacy account retrieval. Its presence
   does **not** prove that authenticated cloud export is ready to survive removing play: retain play/backend until
   a separate owned-account export flow is verified. Keep `export.html`, `export.mjs`, About, historical Stats and
   their required assets available. Serve the landing page directly on the original origin; do not redirect it.

## First schema-2 rollout and rollback

Old releases such as `2562174` cannot be the recovery reader for schema-2 saves. An old API could also remove
schema-downgrade protection. The deploy script now refuses that rollback configuration before switching.
Prepare a separately tested compatible recovery release first. Commit `e80d3a1` is a locally tested continuation
checkpoint; its production files were preserved during this task under
`/tmp/tuxos-recovery-e80d3a1-20261111` with metadata, before later release UI changes. Temporary paths are session
artifacts, not durable backups. Archive and verify the exact files/hashes before relying on them on a server.

On the deployment host, install the verified recovery bundle under `/opt/tuxos/releases/<recovery-id>` without
activating it. For the first rollout only, pass `TUXOS_ROLLBACK_RELEASE=<recovery-id>` to `deploy/deploy.sh`.
The CI deploy workflow does not automatically invent this identifier; arrange the compatibility release before
merging into production. Later releases can use the previous compatible release automatically. Release names
are validated and immutable, and no release is automatically pruned during migration.

```sh
# Run from the unpacked, verified candidate on the deployment host.
TUXOS_ROLLBACK_RELEASE=<verified-recovery-id> bash deploy/deploy.sh <new-immutable-release-id>
# Manual rollback, using the current guarded tooling:
bash deploy/rollback.sh <verified-compatible-release-id>
```

Do not downgrade `release.json` or bypass the guard. Rollback switches application files and restarts the API;
it does not restore an older database over new progress. Preserve the current database and browser exports.
If database recovery is unavoidable, keep both database versions and reconcile new saves explicitly with their
owners. If the compatible recovery release also fails health, stop and inspect the API service; the scripts
retain releases and data. The previous pre-continuation deployment can be restored only with a separately
verified compatibility layer and write protection, not by a blind symlink change.

The automated local drill uses disposable directories, fake HTTP health and a fake restart command. It verifies
successful activation, immutable release refusal, failed-health rollback, failed-restart rollback, rejection of
old readers, explicit compatible recovery, manual rollback and path validation. Six scenarios pass. It never
contacts production. Browser import/restore and real disposable-account transfer are additional evidence,
not a production disaster-recovery drill.

## Links and historical features

| Original public location | Disposition |
| --- | --- |
| `/` | Keep play during migration; later serve export-capable archive on the same origin |
| `/export.html` | Add now; retain indefinitely through the agreed support window |
| `/about.html` | Keep original credits/story with additive continuation link; TuxOS has its own About page |
| `/stats.html` | Deployed page exists. Preserve page/backend or a verified, dated archive; do not merge or invent counts |
| Old assets and account API | Retain while legacy play/export needs them; determine usage before removal |
| In-app activities | TuxOS launcher/Play/Learn entry retains recognizable names; no public activity URL router was found in inspected legacy startup |
| Empty career tracks | Unsupported historical records remain in source/report; no fabricated completed courses |

## Retirement gate record

| Gate | Current state |
| --- | --- |
| Inventoried capabilities implemented or explicit replacements documented | Local implementation complete; replacements still need user acceptance |
| Existing TuxOS progress, courses, apps and account conflict protection preserved | Automated integration plus local browser checks pass |
| Synthetic imports, repeat imports, conflicts, failure recovery | Passed; original source retained |
| Real volunteer migrations and preference comparison | Not conducted |
| Target-device touch/reduced-motion/print/performance checks | Partial; see verification matrix |
| Export bridge deployed and verified at exact original origins, including account retrieval | Prepared and locally checked, not deployed |
| Public Stats totals/backend and old inbound links verified | Page existence checked; counts/backend/inbound traffic not yet verified |
| Compatible local rollback and pre-import restore | Passed locally; production host rehearsal outstanding |
| Retirement notice/date and support window | Not announced; depends on gates above |

Stop rollout for lost data, account isolation failures, inaccessible exports, repeated task blockers, or substantial
unexplained performance regression. Keep Tuxplore available while resolving them.
