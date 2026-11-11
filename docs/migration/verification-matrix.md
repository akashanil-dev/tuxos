# Verification matrix

11 November 2026. Fictional local systems only. Automated checks prove contracts; browser observations prove
only the specific flows below. Real-user preference and physical input-device results are still unobserved.

| Combination / behavior | Evidence | Result / limits |
| --- | --- | --- |
| Fresh guest, unavailable/hung account API | Account/flow tests; production build at local API-404 origin | Enters without registration; observed desktop DOM after 139.2 ms, not a full input-readiness trace |
| Guest reload and view continuity | Browser guest/import/restore sessions | Files/notes, current quest, scores/sound, terminal context, focus/window learning and fast boot retained |
| Files folder/list-icons/hidden preferences | Browser `/tmp` + icon view + hidden files + reload; async directory regression | Retained, without displaying an older request’s folder contents |
| Imported guest, conflicts and recovery | Partial legacy fixture in browser; converter suite | Personal mode/content, both welcome-file versions, quest and game records checked; pre-import restore returned original notes/score; both backups retained |
| Real disposable API account, renamed transfer | Local `explorer` → `continuationqa` through login/preview | New home and whoami verified, personal text unchanged; account reload/unlock resumed; source guest retained by transaction contract |
| API stops during account use | Local process stopped, browser save warning and Retry saving after restart | Visible failure, retained running work, retry cleared warning; no silent guest fallback |
| Account conflicts, delayed writes, sign-out, quota/index failure | API/account/system/backup tests | No cross-identity late writes, schema downgrade, stale-preview overwrite or replacement without recovery copy |
| KDE Plasma and GNOME | Earlier guest and final account browser switching, lessons, Files and games; shell tests | Readable desktop controls and unchanged learning state; final retained-app check also passes |
| CDE | Browser teaching editor, package practice, import/restore, reference and account transfer | Native light controls and migrated panels readable; controls and source data retained |
| Hyprland, many restored windows | Final browser check exposed thin stacks; fixed and rechecked | Bounded groups and Windows switcher keep the selected terminal readable; work survives group changes |
| Narrow window geometry | Earlier narrow browser checks; clamping/drag cancellation tests | Controls remain within the available area; physical touch remains open |
| Phone rescue and Boot anyway | Component/mobile-startup tests | Copy/share fallback, truthful simulation copy, continuation path; actual phone not tested |
| Touch / pointer cancel | Hook and app control tests; visible runner tap buttons | Physical touch, mobile keyboard and orientation changes not tested |
| Reduced motion / hidden games and Vasu | Source/component/game loop checks | Hidden/desktop-inactive runner pauses and stops its animation/audio; no physical-device motion/idle CPU trace |
| Adventure and games | Full ten-quest replay, eight puzzle solutions/shell parity, Rapid completion and Infinite/replay rules; browser play/reload | Local flows pass; complete human gameplay/device acceptance remains a beta task |
| Teaching editors and package families | Browser nano save/discard and Vim insert/:wq/reload; Fedora exercise; both-family behavioral tests | Shared filesystem, permissions, stale writes, cancellation, apt isolation and scoped restore covered |
| Command reference print | Browser Print action invoked; 100-row print DOM tests | Native print preview unavailable to browser tool; check PDF pagination, clipping and light/dark output manually |
| Plugins/widgets/AI consent | Existing regression suites plus catalog/permission-review browser checks | Permissions, isolated storage, imported-disabled plugins, AI-off/Stop/Esc/sudo paths retained; no live provider key used |
| Original-origin exporter | Prepared legacy candidate, guest `bridgeguest`, missing-save and export-prepared browser checks | Local candidate only; real legacy account retrieval and exact-origin deployment still unverified |
| Release failure / rollback | Six disposable filesystem/HTTP/restart drill scenarios | Safe activation and compatible fallback; no production-host/database recovery claimed |

## Required device and user checks before retirement

Use the task script in `performance-and-beta.md`. Run a laptop with mouse/keyboard, a lower-end laptop, a
physical tablet with touch and a phone with its virtual keyboard. For each, record browser/version, viewport,
normal/reduced motion, fresh and populated systems, desktop style and account mode. Include dragging/resizing,
closing an unsaved editor, keyboard launch/focus, game pause/touch/audio, import conflicts, save failures, reload
and account sign-out. Print a long learned-command table to PDF and inspect every page.

Run actual browser traces for cold/warm starts, command feedback, first/subsequent Terminal and Files, drag/resize,
visible/hidden Vasu and runner, and near-limit saves. Keep the budgets fixed and record any exception with its
cause. Do not turn a unit-test pass into a claim about frame rate or a person’s preference.

Final retained-app browser pass: Docker’s built-in course opens, `docker --version` completes its first checked
task, and the filesystem guide and Software catalog render. Plugins opens its catalog and Quick Notes’ explicit
private-storage permission review; the review was cancelled. AI stays off and no provider key was submitted.
The final integration has 626 passing tests in 75 files, typecheck/build pass, and six release-drill scenarios pass.
