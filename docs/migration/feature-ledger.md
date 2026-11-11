# Tuxplore feature migration ledger

All rows begin pending. Update evidence as behavior is implemented and verified. Sources refer to the inspected Tuxplore snapshot; verify upstream differences before freezing payload mappings.

| Capability | Legacy source | Target | Verification | State |
| --- | --- | --- | --- | --- |
| Guest entry, local saves, optional accounts | boot.js, cloud.js | App/accounts/system | API unavailable, reload, safe guest/account conversion | Pending |
| Four desktops and greeters | de.js, greeters.js, css | Existing shells and access policy | Switch all four without awarding lessons; imported choices survive | Pending |
| Wallpapers, icons, preferences, fast boot | core.js, apps/system.js | appearance/settings/session | Correct defaults and credits; explicit choices/resume persist | Pending |
| Desktop/lesson continuity | apps/journal.js | course-view/JourneyScreen | Use Files and Terminal beside instruction; retain work | Pending |
| Ten quests and dungeon story | quests.js, fs.js | learn-adventure | Every objective, hints, partial resume, scoped reset | Pending |
| Pipe Dream, eight levels | apps/pipedream.js, coreutils.js | pipe-dream | Block stages, previews, terminal parity, saved completion | Pending |
| Know Your Distro | apps/runner.js | know-your-distro | Rapid/Infinite, families/map, scores/combos, controls, sound, weather, showcase | Pending |
| Learned commands/print | apps/journal.js, shell.js | journal/reference | Successful learner commands, examples, readable print, import | Pending |
| Thirty achievements | core.js and triggers | shared exploration progress | Stable IDs/timestamps, exact-once triggers, import, no tutor farming | Pending |
| Try Linux | apps/system.js | try-linux | Four-question selector/six distros, sourced guide, next steps | Pending |
| File navigation and preview | apps/files.js | files | Places/breadcrumbs, permissions, equivalent CLI, terminal-here | Pending |
| Clipboard and teaching tone | terminal.js | terminal/JourneyScreen | Copy/paste/context menu, Ctrl+C, neutral optional practice | Pending |
| Help and Windows/typo suggestions | shell.js | shell | man/whatis, harmless suggestions, existing help/completion | Pending |
| Teaching editors | apps/terminal.js | terminal/shell | nano/vim open/edit/save/exit, permission/cancel behavior | Pending |
| Package families | shell.js | apt/family practice | apt depth retained; explicit dnf/pacman exercises | Pending |
| Fun commands and secrets | shell.js, boot.js | shell/adventure/desktop | Inventory each trigger, avoid duplicate implementations | Pending |
| File reset without lost progress | apps/system.js | scoped practice recovery | Personal files/courses/scores preserved, backup restore | Pending |
| Companion reactions/shortcuts | tux.js | offline Vasu | Useful without AI/API, cooldown/dismiss/hide, focus intact | Pending |
| Window instances/geometry | wm.js | SDK/system/WindowFrame | Singleton races, multi-terminal, unsaved editor, viewport clamp | Pending |
| Touch/reduced motion/notifications | wm.js, de.js, css | shared desktop | All shells, keyboard/touch, unobstructed controls, phone rescue | Pending |
| Save conversion | core.js, fs.js, cloud.js | migration/export/import | Every payload field mapped/reported, conflicts/idempotence/failure recovery | Pending |
| Performance | startup scripts and loops | production web build | Same-device cold/warm, populated saves, hidden/visible games/Vasu | Pending |
| Metadata, credits, old links | index.html, assets, deployment | web/deploy/docs | Continuation identity, original-origin export and meaningful old links | Pending |
| Stats and unfinished career tracks | analytics.js, tracks.js | verify deployed scope | Do not invent parity for absent local stats or empty tracks | Investigation |
| TuxOS additions | current modules | preserve | Linux 34 lessons/150 tasks, Docker, filesystem, editor/apt, plugins/widgets, account versioning, AI | Regression coverage pending |
