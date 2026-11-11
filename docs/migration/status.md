# Tuxplore continuation implementation status

Started 11 November 2026 on `codex/tuxplore-continuation`, from TuxOS `2562174`.

The accepted [implementation plan](../research/tuxplore-comparison-2026-11-11/implementation-plan.md) defines the work. This file records demonstrated progress, remaining work, and release gates. It must not describe untested or externally dependent work as complete.

| Phase | State | Evidence or next work |
| --- | --- | --- |
| 0 Baseline | In progress | Existing typecheck passes; baseline 539/540 tests pass. One shell listing assertion hard-coded October against the real clock. Production build succeeds. Freeze source/feature inventory and save fixtures. |
| 1 Contracts and export | Implemented; integration verification | Version 2 snapshots read v1 and preserve appearance. Desktop/theme/plugin access is independent of mastery; anniversary entitlement is retained. Storage transitions drain original writes; API refuses schema downgrade. Original-origin export bridge is prepared, not deployed. |
| 2 Convenient entry | Pending | Guest/account entry, fast boot/resume, clipboard, appearance defaults, notifications. |
| 3 Continuous desktop learning | Pending | Windowed learning/focus, terminal continuity, Files, window policies, touch. |
| 4 Signature features | Pending | Adventure, both games, reference, achievements, guide, shell teaching, local help. |
| 5 Import | Pending | Validated preview, conflict handling, backup, atomic/idempotent transfer, recovery. |
| 6 Validation | Pending | Tests/build, browser verification, comparable measurements, formative user feedback. |
| 7 Release/retirement | Pending | Release documentation and tooling; real cutover depends on successful migration and user validation. |

## Baseline findings

- GitHub's Tuxplore repository metadata identifies `master` and `http://tuxplore.akashanil.dev/` as the homepage. The configured GitHub connector returned an unavailable-tool error; read-only GitHub CLI access was used instead.
- Direct HTTP inspection returned 403 for both production origins. The normal browser can load Tuxplore and shows an About link absent from the local snapshot. Deployment identity therefore needs comparison with current upstream; the local folder is not proof of production equivalence.
- Baseline production output is preserved at `/tmp/tuxos-migration-baseline-20261111` for the current session. The entry contains the terminal through static imports; optional 3D is deferred.
- Baseline test failure: `packages/shell/src/commands.test.ts` expected `Oct` while using the real clock in November. Fix by injecting a fixed clock, keeping the listing assertion meaningful.
- Browser performance traces and user preference results have not yet been collected. Bundle sizes alone do not establish smoothness.
- Upstream snapshot: `akashanil-dev/tuxplore@0da57ca0199aa9e21a6dee315894338c2e765430`, fetched read-only into `/tmp/tuxplore-upstream-20261111`. Quests keep their IDs/objectives; relevant differences include About links, analytics/privacy handling, account behavior, and fullscreen controls. The deployed browser confirms the About and public Stats pages exist. Preserve those pages/links during transition; the earlier local-snapshot limitation does not establish missing production functionality.
- `legacy-source-manifest.json` freezes local source/asset hashes and records upstream equivalence. `build-baseline.json` uses gzip level 9 consistently. The three synthetic legacy fixtures use the upstream default filesystem with fictional `explorer` data, covering new, partial, and completed history; they contain no real account data.
- The date-independent shell suite passes all 26 tests after the baseline repair. Full-suite verification will run again at the first integration milestone.

## Commit log

Record each meaningful implementation batch with its verification here as the work proceeds.

- `8d31deb`: baseline research, implementation plan, feature ledger, synthetic fixtures, source/build manifests, and a fixed-clock shell test (26 shell tests passed).
- Access/persistence batch: SDK exploration/preferences contracts, v1→v2 snapshot support, retained cosmetics, optional package practice, isolated storage transitions, API downgrade protection, and the legacy export page. First full check: 547/548 tests passed; the remaining assertion expected the old session shape and was updated to include the new preferences. All 43 targeted tests then passed, including the corrected test; typecheck and production build passed. Fixture puzzle IDs were corrected to the actual eight level IDs, and the upstream license notice is retained.

## External release gates

Keep Tuxplore accessible until compatible saves import successfully, original-origin export is deployed, and existing users have tested the continuation. Do not manufacture user feedback or equate a local passing build with a production deployment. No migration deadline has been announced.
