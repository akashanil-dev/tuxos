# Tuxplore feature migration ledger

Status distinguishes implemented behavior from full release verification. Sources refer to the inspected Tuxplore snapshot; verify upstream differences before freezing payload mappings.

| Capability | Legacy source | Target | Verification | State |
| --- | --- | --- | --- | --- |
| Guest entry, local saves, optional accounts | boot.js, cloud.js | App/accounts/system | API unavailable, reload, safe guest/account conversion | Implemented; account rename pending Phase 5 |
| Four desktops and greeters | de.js, greeters.js, css | Existing shells and access policy | Switch all four without awarding lessons; imported choices survive | Implemented; all-shell regression tests pass |
| Wallpapers, icons, preferences, fast boot | core.js, apps/system.js | appearance/settings/session | Correct defaults and credits; explicit choices/resume persist | Implemented; import mapping pending |
| Desktop/lesson continuity | apps/journal.js | course-view/JourneyScreen | Use Files and Terminal beside instruction; retain work | Implemented; browser focus/window continuity verified |
| Ten quests and dungeon story | quests.js, fs.js | learn-adventure | Every objective, hints, partial resume, scoped reset | Implemented; ten-quest replay and browser first quest pass; real guide integrated |
| Pipe Dream, eight levels | apps/pipedream.js, coreutils.js | pipe-dream | Block stages, previews, terminal parity, saved completion | Implemented; eight-solution parity tests and browser solve pass |
| Know Your Distro | apps/runner.js | know-your-distro | Rapid/Infinite, families/map, scores/combos, controls, sound, weather, showcase | Implemented; full model/replay tests and browser gameplay pass |
| Learned commands/print | apps/journal.js, shell.js | exploration/reference | Successful learner commands, examples, readable print, import | Implemented; print and import verification pending |
| Thirty achievements | core.js and triggers | shared exploration progress | Stable IDs/timestamps, exact-once triggers, import, no tutor farming | All thirty trigger paths implemented; model/observer tests and browser secrets verified, imports follow |
| Try Linux | apps/system.js | try-linux | Four-question selector/six distros, sourced guide, next steps | Implemented; quiz/reload tests and browser complete flow pass |
| File navigation and preview | apps/files.js | files | Places/breadcrumbs, permissions, equivalent CLI, terminal-here | Implemented; browser preview and terminal-here verified |
| Clipboard and teaching tone | terminal.js | terminal/JourneyScreen | Copy/paste/context menu, Ctrl+C, neutral optional practice | Implemented; browser paste and lesson completion verified |
| Help and Windows/typo suggestions | shell.js | shell | man/whatis, harmless suggestions, existing help/completion | Implemented; command and routing checks pass |
| Teaching editors | apps/terminal.js | terminal/shell | nano/vim open/edit/save/exit, permission/cancel behavior | Implemented; unit and browser save/reload verified |
| Package families | shell.js | apt/family practice | apt depth retained; explicit dnf/pacman exercises | Implemented; both workflows, isolation, resume and scoped recovery tests pass; Fedora browser flow verified |
| Fun commands and secrets | shell.js, boot.js | shell/adventure/desktop | Inventory each trigger, avoid duplicate implementations | Implemented; see shell-parity.md for supported subsets and explicit replacements |
| File reset without lost progress | apps/system.js | scoped practice recovery | Personal files/courses/scores preserved, backup restore | Adventure recovery implemented and tested; general backup manager follows |
| Companion reactions/shortcuts | tux.js | offline Vasu | Useful without AI/API, cooldown/dismiss/hide, focus intact | Implemented; local quest hint and shortcuts browser-verified, cooldown/tutor-isolation tests pass |
| Window instances/geometry | wm.js | SDK/system/WindowFrame | Singleton races, multi-terminal, unsaved editor, viewport clamp | Implemented; concurrency, document identity and geometry tests pass |
| Touch/reduced motion/notifications | wm.js, de.js, css | shared desktop | All shells, keyboard/touch, unobstructed controls, phone rescue | Implemented; physical touch verification pending |
| Save conversion | core.js, fs.js, cloud.js | migration/export/import | Every payload field mapped/reported, conflicts/idempotence/failure recovery | Pending |
| Performance | startup scripts and loops | production web build | Same-device cold/warm, populated saves, hidden/visible games/Vasu | Pending |
| Metadata, credits, old links | index.html, assets, deployment | web/deploy/docs | Continuation identity, original-origin export and meaningful old links | Pending |
| Stats and unfinished career tracks | analytics.js, tracks.js | verify deployed scope | Do not invent parity for absent local stats or empty tracks | Investigation |
| TuxOS additions | current modules | preserve | Linux 34 lessons/150 tasks, Docker, filesystem, editor/apt, plugins/widgets, account versioning, AI | 594 integration tests pass; full visual matrix pending |

| Save migration and recovery | Native validated import/backup manager | Previewed home-file conflict choices, history/quest/score conversion, compatible apt installs, unchanged source download, idempotent provenance, renamed authenticated transfer and mandatory local recovery copies. 617-test integration plus focused account/plugin/recovery checks; browser import/read/score verification and restore drill. Original-origin export deployment and volunteer migrations remain release gates. |
