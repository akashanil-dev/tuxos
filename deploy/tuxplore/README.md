# Legacy origin export bridge

Copy `export.html` and `export.mjs` to the existing Tuxplore site's root and link to `export.html` from its welcome screen and Settings. Keep the existing application, account API, About and Stats pages available during migration. These files add export without loading a second Tuxplore runtime or changing an existing save.

The export page must remain on the exact origin used for browser-local saves. Serve it directly after retirement; an unconditional domain redirect would prevent it reading those saves. Do not deploy this page on TuxOS and claim that it can find data from Tuxplore.

The portable envelope is `format: tuxplore-export`, `version: 1`, with `exportedAt`, `sourceOrigin`, `preferences.anonymousUsage`, and a `save` containing supported legacy fields. Authentication state is excluded. The optional original backup reads only `tuxos-save-v1`, never the separate cloud token. Both downloads remain local to the user.

Account users must be able to sign in to the legacy service to retrieve their latest save until a separately validated account export path replaces it. No accounts are linked by matching usernames.

This directory is deployment-ready source, not evidence that the bridge has been published. Record the actual deployment and original-origin browser check in `docs/migration/status.md`.

## Prepare the candidate without editing the legacy checkout

```sh
node deploy/tuxplore/prepare.mjs /path/to/verified/tuxplore /path/to/new/candidate
```

The preparation adds a greeter link across all four styles, a Settings link, and an About notice. It preserves
play, public pages and assets, excludes the backend/secrets, and records source hashes. Inspect the candidate
against the actual deployed source. Its `archive.html` is additive and its `play.html` retains legacy account
access; replacing the original root is separately gated. See `docs/migration/release-runbook.md`.

Local candidate verification on 11 November 2026: missing-save feedback, greeter notice, fictional guest entry,
then export-prepared confirmation for `bridgeguest`. Export unit tests confirm the supported envelope and no
credential reads. This is not original-origin production or authenticated legacy-cloud export verification.
