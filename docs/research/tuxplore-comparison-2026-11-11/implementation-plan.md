# Tuxplore to TuxOS implementation plan

11 November 2026 · Proposed implementation · No application changes made

Make TuxOS the continuation people can recognize: immediate desktop exploration, playful Linux learning, familiar activities, and their existing history, followed by TuxOS’s deeper curriculum when they want it. Restore convenience first, integrate the missing features into the existing system, and retire Tuxplore only after migration and user testing pass.

This plan follows the [comparison report](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/report.md). It targets the inspected TuxOS checkout at `2562174` and the local Tuxplore snapshot at `/home/akash/Documents/tuxplore/tuxplore-clean`. Confirm the deployed Tuxplore version before finalizing compatibility. The reported preference for Tuxplore is credible feedback; the proposed causes still need testing with those users.

## 1. Recommended product decisions

| Area | Recommended behavior |
| --- | --- |
| First visit | A primary **Explore TuxOS** action opens a usable KDE desktop as a guest. **Start guided learning** opens the introductory learning experience. Neither requires registration. |
| Returning visit | Resume the chosen desktop or learning context, including the active activity. Offer a persistent fast boot preference. Keep the boot sequence available for people who enjoy it. |
| Accounts | Offer **Save to an account** when useful. Explain that guest progress belongs to this browser and provide an export. Existing account users retain their saved systems and versioned saves. |
| Learning versus access | Make desktop access, the four desktop styles, and ordinary apps available independently of course completion. Keep earned badges, adventure progress, and course mastery separate. Mode switching never awards completion. |
| Installation challenge | Preserve “build your desktop” as an optional, explicitly entered practice lab. Its package state belongs to that exercise; the everyday desktop remains accessible. Explain the boundary between interface style and simulated installed packages. |
| Rewards | Use badges, discoveries, optional cosmetics, and suggested next activities. Preserve existing earned rewards and imported appearance choices. Existing cosmetics that remain earned must have accurate labels and eligibility rules. |
| Learning interface | Use one journal/learning surface with an optional focus view. Learners can keep instructions beside Terminal and Files and browse or review the curriculum. |
| Desktop layout | Start with Terminal, Files, Learn/Journal, and Play. Put Settings, Software, and advanced tools in the launcher with useful descriptions. Show availability honestly. |
| Visual identity | Preserve KDE, GNOME, Hyprland, CDE, icon families, and original wallpaper assets. Extend their tokens into learning, help, rewards, and new games. |
| Help | Keep free hints and answers, normal clipboard behavior, and useful local Vasu guidance. AI remains an explicit optional enhancement. |

These are proposed defaults for the migration. In particular, removing course-based desktop access gates is a product change that makes exploration a first-class experience. Preserve a veteran’s achievement history even when a previously earned interface choice becomes generally available.

Keep TuxOS’s 34 lessons and 150 checked tasks, administration exercises, Docker learning, filesystem guide, editor, richer apt/Software behavior, persistent windows, sandboxed plugins/widgets, account saves, and optional AI assistance. The short adventure becomes an additional entry into this material.

## 2. Delivery sequence

| Phase | Deliverable | Depends on | Exit condition |
| --- | --- | --- | --- |
| 0 | Frozen feature inventory and baseline | Current research | Every legacy feature has a disposition and a verification method. |
| 1 | Access/progress contracts, compatible saves, early legacy export | Phase 0 | Existing saves survive upgrades; access changes cannot erase earned choices. |
| 2 | Guest entry and immediate convenience improvements | Phase 1 | A visitor can explore, save locally, return, and safely move to an account. |
| 3 | Continuous learning and desktop interactions | Phases 1–2 | Lessons, terminal work, and file browsing remain usable together. |
| 4 | Adventure, games, reference tools, and local guidance | Phase 1; integrate with Phase 3 | Complete legacy feature parity is demonstrated against the inventory. |
| 5 | Tested Tuxplore import and account transition | Phase 1; feature schemas from Phase 4 | Representative saves import without silent loss or overwrite. |
| 6 | Performance work and comparison beta | Phases 2–5 | Technical checks and observed user tasks pass on target devices. |
| 7 | Continuation release and staged retirement | Phase 6 | Migration remains available and rollback is rehearsed. |

Start save-format design and the old-site exporter early. Complete the importer after the destination features have stable schemas. Phase numbers describe delivery dependencies, not fixed calendar estimates; game parity and deployed account compatibility need an initial implementation pass before dates are credible.

## 3. Phase 0: establish the baseline

Create a feature ledger containing source behavior, target location, persistence fields, acceptance scenario, and status. Use the report’s migration inventory as its starting point. Include details inside each game and command, rather than counting an app as migrated when its window opens.

Preserve a source snapshot and credits/license inventory. Check which deployed Tuxplore build, domain, and account backend users actually use. Its local folder has no Git history, so file timestamps alone cannot establish deployment equivalence. Check public stats and metadata separately: the inspected folder has a missing linked stats page, and its career-track definitions are empty placeholders. Do not treat those as finished features that TuxOS lacks.

Record a reproducible baseline using production builds, the same browser, viewport, machine, and network settings. Include fresh and populated saves; cold and warm starts; AI off/on; and Vasu visible/hidden. Capture time to usable desktop, first terminal/file window, command feedback, drag/resize responsiveness, and idle activity. Save the commands, build revision, device information, and traces with the measurements.

**Exit:** the ledger covers every row of the report, representative save fixtures exist, and performance comparisons can be repeated. User-provided saves used as fixtures should be sanitized and never committed with credentials or private file content.

## 4. Phase 1: separate access, achievement, and storage

### Access and progress

Extend the existing SDK/kernel contracts with distinct records for interface preferences/access, course mastery, adventure progress, discoveries, learned commands, and game records. Preserve stable identifiers and completion timestamps when available. Use versioned additions and upgrade functions; keep current course and step IDs unchanged.

Route appearance and app availability through one policy used by Settings, the launcher, Desktop, and kernel actions. Update reward copy and the optional installation exercise together. Do not implement Explore by fabricating completed lessons or by merely hiding the existing gates in the UI.

The current [journey reconciliation](/home/akash/Documents/tuxos/packages/kernel/src/actions/journey.ts) can reset wallpaper/theme choices and widgets based on course progress. Change that behavior before imported preferences enter the system. Review `demandReward`, `demandDesktop`, `desktopReady`, and all callers as one change. Account for existing installed-desktop records without claiming that switching a visual shell installed packages in an exercise.

Add the minimum shared progress actions needed by the new modules. Only trusted, successful learner activity should award command learning or mastery. Keep AI/tutor actions, lesson setup, imports, and restoration from accidentally earning new badges. Historical imported achievements retain an import source; they do not replay completion notifications on every boot.

### Save lifecycle

Use the existing kernel, module host, and `KeyValueStorage` lifecycle. Define a versioned migration envelope and destination schema before feature implementation. Keep upgraded saves readable by supported releases, or explicitly prevent an incompatible older release from rewriting them. A UI feature flag must not delete data when disabled.

Treat storage changes as a transaction: finish or safely retain pending writes, capture the current system, select the intended identity, resolve conflicts, then boot against the selected storage. Never redirect a pending guest write into an account or an account write into a different account. Keep guest and account data distinct on shared devices. Preserve clear save-error feedback and the API’s version-conflict protection.

Add a downloadable export to the deployed legacy origin early, after confirming its actual schema. Export portable state without authentication tokens. Keep the old application functional during this stage.

**Primary files:** [SDK journey contracts](/home/akash/Documents/tuxos/packages/sdk/src/journey.ts), [kernel state](/home/akash/Documents/tuxos/packages/kernel/src/state.ts), [system lifecycle](/home/akash/Documents/tuxos/packages/system/src/index.ts), [browser accounts](/home/akash/Documents/tuxos/apps/web/src/accounts.ts), [account API](/home/akash/Documents/tuxos/apps/api/src/accounts.ts).

**Exit:** old TuxOS saves load, preferences survive reconciliation, mode changes preserve mastery, and storage-switch tests cover delayed writes, failed saves, expired sessions, conflicting versions, and sign-out. A legacy guest can download a usable export from the original site.

## 5. Phase 2: restore easy entry and everyday convenience

Implement the Explore and Guided entry choices in [main](/home/akash/Documents/tuxos/apps/web/src/main.tsx) and [App](/home/akash/Documents/tuxos/apps/web/src/app.tsx). Reuse local storage support, but change the current account-first wiring deliberately. Guest exploration must work when the account API is unavailable. Keep initial account discovery from blocking guest entry indefinitely.

Make **Save to an account** support both a new account and an existing account with its own progress. Show the choice and preview before merging or replacing anything. Retain a local backup until the destination write succeeds. Explain local storage failure or quota exhaustion and allow export; do not display “saved” when persistence failed. Update account-required error messages to fit the optional-account experience.

Ship these small improvements in the same early release:

- Remove the clipboard prohibition and judgmental wording in [clipboard handling](/home/akash/Documents/tuxos/modules/terminal/src/clipboard.ts). Preserve normal selection, copying output, paste, and Ctrl+C interruption semantics. An optional typing exercise can explain its limited restriction and offer an exit.
- Persist the last chosen context and fast boot setting. Re-entering TuxOS should not always restart the full-screen journey.
- Establish one canonical wallpaper default with matching Settings labels. Preserve explicit saved choices and separate the anniversary reward from an accidentally selected fallback.
- Replace ordinary blocking reward acknowledgements with accessible notifications and a persistent rewards gallery. Important save failures and destructive confirmations still need clear attention.
- Curate desktop shortcuts and give advanced apps accurate descriptions and availability. Keep existing custom arrangements where possible.

**Exit:** a fresh visitor reaches a usable desktop without completing lessons, installing a desktop, or registering; refresh retains guest progress; sign-in does not silently replace either save; and an existing account resumes correctly.

## 6. Phase 3: make learning and the desktop continuous

### One learning surface

Extend the existing [course view](/home/akash/Documents/tuxos/packages/course-view/src/index.tsx) and [Learn Linux module](/home/akash/Documents/tuxos/modules/learn-linux/src/index.ts). Remove the Desktop interception that always turns Learn Linux into a separate full-screen journey. Let the same activity appear in a normal window or focus view, with a clear return action, curriculum search, review, next-step guidance, and free hints/answers.

Preserve terminal working directory, relevant environment, input/history, and ongoing work across view changes. Avoid remounting the terminal solely because presentation mode or lesson selection changed. Store bounded resumable context; do not promise restoration of a running process after a browser reload. When another lab requires incompatible setup, explain the transition and use a scoped workspace or explicit reset rather than overwriting personal work.

Keep each course’s progress independent. Present the short adventure, Linux course, Docker, and filesystem guide through one recognizable learning entry. Static learning and exploration remain usable without AI; AI-specific course generation can retain its own requirement.

### Files and window behavior

Extend [Files](/home/akash/Documents/tuxos/modules/files/src/view.tsx) with breadcrumbs, useful Places, preview, permissions, and **Open terminal here**. Show the equivalent `cd`/`cat` command where it teaches the action. Keep path entry, hidden files, creation/deletion, the editor, permission checks, and unsaved-content protection. Support the familiar icon presentation as an option if the source parity review confirms it matters alongside the current table.

Add explicit app-instance policies to the [SDK](/home/akash/Documents/tuxos/packages/sdk/src/index.ts) and [system open path](/home/akash/Documents/tuxos/packages/system/src/index.ts): singleton apps focus their window, Terminal allows multiple sessions, and Editor handles document identity without discarding unsaved edits. Apply the same behavior to launcher, desktop, taskbar, lesson, and tutor requests. Prevent duplicate singleton windows from simultaneous launches.

Clamp initial and restored windows to the available desktop area, including shell panels. Re-clamp after viewport or desktop changes. Cover pointer cancellation and touch in [drag handling](/home/akash/Documents/tuxos/apps/web/src/hooks/usePointerDrag.ts), preserve keyboard access, and add short closing transitions consistent with opening behavior and reduced-motion preferences. Keep close guards and persistence independent of animation completion.

Move/dismiss welcome notices and toasts so they do not obstruct window controls. Preserve focus and readable status announcements. Provide touch-appropriate launch behavior instead of requiring desktop double-click everywhere. Verify all four shells, narrow layouts, and the existing phone rescue screen.

Use desktop tokens for learning panels, help, rewards, and games. Preserve each desktop’s typography, spacing, colors, and characteristic geometry rather than imposing one style on all four.

**Exit:** a learner can read instructions, inspect a file, open a terminal in that folder, complete a step, change view, and return without losing place or work. Window controls remain reachable with mouse, keyboard, and touch.

## 7. Phase 4: migrate the recognizable Tuxplore experience

Implement native TuxOS modules and use the existing filesystem, shell, events, and persistence. Register manifests in [main](/home/akash/Documents/tuxos/apps/web/src/main.tsx), lazy views in [views](/home/akash/Documents/tuxos/apps/web/src/views.ts), and icons for all desktop themes. New paths below are proposed. Do not embed the old global `OS` application as a second runtime.

| Work package | Scope and implementation | Acceptance |
| --- | --- | --- |
| Introductory adventure | Proposed `modules/learn-adventure`: adapt all ten quests, story, dungeon assets, journal checklist, hints, and app links. Use the existing lesson engine with narrowly defined event conditions where needed. | Complete the original story from start to graduation. Resume an in-progress quest. File-understanding objectives can accept GUI reading; command-specific objectives still require the learner’s command. Other courses and personal files survive setup/reset. |
| Pipe Dream | Proposed `modules/pipe-dream`: preserve all eight levels, block controls, stage limits, target/current/intermediate outputs, generated shell line, and completion. Reuse shared text-command behavior and isolated puzzle inputs. | Every supplied solution and representative wrong pipeline produces the expected stage outputs. Equivalent terminal commands agree. Puzzle completion survives reload and import. |
| Know Your Distro | Proposed `modules/know-your-distro`: preserve Rapid’s three rounds and ten lives, Infinite, team selection, five families, family map, combos, increasing speed, weather, pause/reset, audio preferences, keyboard/tap controls, best scores, and showcase behavior. | Full runs of both modes work; scores resume correctly; pause, hidden-window, resize, touch, audio-off, and reduced-motion paths are usable. Distro family data and credits are reviewed. |
| Learned-command reference | Add a journal/reference view backed by shared progress: command descriptions, examples, search, and print. Track successful learner commands, not just course completion. | A newly used supported command appears with a useful example; failed commands and AI activity do not falsely award it; imported learned commands remain visible; print is readable. |
| Exploration achievements | Restore the thirty legacy discovery/secret achievements with stable IDs and available timestamps, alongside current learning milestones. Map changed triggers explicitly. | Imported achievements remain; each supported new trigger awards once; resets and mode changes do not remove earned history; notifications remain non-blocking. |
| Real Linux guide | Proposed `modules/try-linux`: restore the four-question selector, six-distro scope, graduation summary, and USB/VM/next-step guidance. Verify current recommendations and official links when writing the content. | Quiz results and direct browsing both work. Guidance explains which actions are simulated and what differs on a real machine. Keyboard and narrow-screen use work. |
| Teaching shell features | Add `man`/`whatis`, contextual typo and Windows-command suggestions, and the teaching `nano`/`vim` interactions. Keep current help, completion, history, pipes, redirection, and editor. | Suggestions explain rather than unexpectedly execute a substituted command. Editors support the documented open/edit/save/exit flow with permissions and cancellation. Clearly label supported simulation scope. |
| Package-family exposure | Retain current apt/dpkg and Software depth. Add bounded `dnf`/`pacman` learning within explicitly selected family exercises, sharing package concepts where useful. | Learners can practice the legacy package tasks without implying that one active system uses all package managers interchangeably. Current apt dependency and prompt behavior still passes. |
| Discoveries and recovery | Inventory remaining fun commands/Easter eggs; add only missing behavior. Provide scoped restore/reset for adventure and practice files, with preview and recoverable backup. | Recover a damaged exercise while keeping personal files, earned progress, scores, and other courses. A full restart remains a separately named destructive operation. |
| Local Vasu guidance | Extend the existing offline guide with deterministic responses to common errors, progress hints, and desktop shortcuts. Use cooldowns, dismissal, and a hide preference. | Useful assistance works with AI off and with no account/API. It does not steal focus or repeat excessively. AI opt-in, Stop/Esc, and privileged-action consent remain intact. |

Keep game simulation independent of frame rate, bound persisted history, and clean up timers/listeners/audio when windows close. Adapt motion-heavy experiences for reduced motion and provide readable instructions and status outside the canvas. Rebuild adventure executable behavior through supported shell/module actions; never evaluate serialized legacy JavaScript.

**Exit:** each work package has a demonstrated scenario in the feature ledger. A partial runner, a renamed chmod game, or a larger curriculum does not count as parity with the missing activity.

## 8. Phase 5: preserve existing users and their history

Build a dedicated, tested conversion layer, for example a proposed `packages/migration`, shared by import preview and application. Keep conversion deterministic and separate from UI. The existing TuxOS legacy-save reader handles `tuxos.save`; Tuxplore uses a different key and schema, `tuxos-save-v1`.

| Legacy data | Destination rule |
| --- | --- |
| Username and home | Validate the destination identity, map the home path and ownership deliberately, and handle incompatible/colliding names in preview. Never rewrite arbitrary file contents with global string replacement. |
| Desktop | Map `kde → plasma`, `retro → cde`, `tiling → hyprland`, `gnome → gnome`. Preserve earned choices and record their history. |
| Wallpaper/settings | Preserve supported explicit choices, fast boot, game sound/mode preferences, and other inventoried settings. Explain missing assets/options. |
| Quests/tracks | Map completed and partial adventure objectives by stable IDs. Preserve unknown historical records as recoverable legacy data. Do not grant advanced TuxOS mastery from old quests or empty track placeholders. |
| Learned commands/achievements | Preserve known IDs and timestamps; maintain a visible historical record for unsupported discoveries. |
| Pipe Dream | Preserve per-level completion and any verified compatible progress fields. |
| Runner | Inspect all saved versions. Preserve `best`, `family`, `mode`, `rapidBest`, `infiniteHigh`, sound, and other actual fields with explicit semantics; do not assume an old undifferentiated score belongs to a new mode. |
| Files | Convert supported content, paths, ownership, permissions, and available timestamps. Start from the current system baseline; merge user files and vetted adventure assets. Do not overwrite current system identity/configuration blindly. |
| Installed software/history | Map supported package equivalents and bounded command history where meaningful. Keep incompatible legacy package state in the import report; do not fake a successful installation. |

The user flow is **export → select file → validate → preview → resolve conflicts → back up destination → import → verify → show summary**. Keep the source export unchanged. Provide a downloadable record of unsupported items and a way to recover original contents.

Validate versions, byte limits, depth, node count, path traversal, reserved keys, types, and filenames before constructing kernel state. Render imported text as text. Never execute embedded code, import credentials, or silently truncate data. Check the converted save against browser storage and the current API’s 4 MiB save limit; oversized imports need an actionable explanation and retained export.

Use explicit conflict decisions for files and existing progress. Merge compatible monotonic achievements by stable ID; do not union incompatible in-progress lab states. Preview any replacement, retain a target backup, commit once, and record an import identifier to make retries idempotent. Interrupted or failed imports leave the original target available. Re-importing must neither duplicate records nor downgrade progress.

Make file transfer the dependable cross-origin route. If automatic cloud transfer is later offered, first inspect the deployed backend and require proof of ownership of both accounts. Matching usernames is insufficient. Legacy passwords/tokens are never treated as TuxOS credentials. Account linking can follow file import without blocking users who only have local saves.

**Exit:** fixtures cover new/partial/completed saves, each desktop, game variants, edited/missing files, unknown fields, invalid input, renamed users, existing-target conflicts, repeat imports, write failure, and oversized data. Verify results by opening the destination apps and files, not only by comparing JSON. Rehearse recovery from the pre-import backup.

## 9. Phase 6: measure smoothness and validate the continuation

### Performance work

The report measured approximately 102 KB gzip of legacy startup JavaScript against 249 KB for the TuxOS entry bundle, with a further deferred 132 KB 3D component. Those are build-weight observations, not frame-rate or user-latency measurements.

Profile before changing architecture. Resolve the static/dynamic TerminalSurface import overlap where it materially improves startup. Keep games and optional 3D assets out of the critical entry path. Lazy loading should expose useful progress and errors, not an unexplained blank window. Preload likely apps only when measurements justify the cost.

Recommend a lightweight Vasu presentation by default, with richer 3D optional. Stop rendering when its surface is hidden, including a desktop hidden behind focus mode, and account for idle/reduced-motion conditions. Pause hidden games. Do not rely only on `document.hidden` for a mounted but invisible desktop.

Measure snapshot cloning/serialization and save activity with populated saves. Optimize excessive work if traces identify it; preserve save ordering, permissions, and durability. Keep drag feedback local and avoid adding network writes per pointer movement. Recompute puzzle results when inputs change rather than on every animation frame.

Set numeric startup and interaction budgets from Phase 0 on named target hardware before the beta, then hold them fixed for comparison. Require no unexplained regression from the baseline and compare Tuxplore directly for shared tasks. Record both cold and warm results and any remaining tradeoff. Browser-local guest operation does not imply the entire site is installable or reloadable offline; a full offline/PWA feature is separate scope.

### Verification

Run focused behavioral tests for each substantive change, followed by `npm run check` and `npm run build` at integration milestones. Prioritize tests for persistence, migration, access policy, event attribution, command parity, objective conditions, game rules, and unsaved work. Use browser scenarios for visual layout, focus, animation, pointer/touch behavior, and printing; source tests alone cannot establish those qualities.

Use a compact coverage matrix across all four desktops, guest and account saves, fresh and imported users, mouse/keyboard/touch, reduced motion, normal/narrow/phone layouts, and API failure. Exercise high-risk combinations directly rather than relying on screenshots alone. Also smoke-test the retained Linux/Docker/filesystem courses, apt/Software, editor, plugins/widgets, and optional AI controls.

Recruit a small formative group including people who currently prefer Tuxplore and new learners; five to eight participants is a practical starting point, not statistical proof. Alternate product order. Observe these same tasks in both products:

1. Enter and choose a first useful activity.
2. Find a file, understand it, and open a terminal in its folder.
3. Recover from a wrong command without outside assistance.
4. Follow a lesson while using desktop tools.
5. Solve a Pipe Dream level and play a runner round.
6. Leave, return, and resume; import an existing save where applicable.

Record completion, wrong turns, help requests, lost context, and reasons for preference. Fix repeated barriers and retest. The beta passes when core tasks work without lost work, repeated usability blockers are resolved, and remaining preferences can be explained concretely.

## 10. Phase 7: release and retire in stages

Release the convenience improvements first while Tuxplore remains available. Follow with the complete feature set and importer in an opt-in beta. Use feature flags only where they make rollback practical; avoid two competing filesystems or progress implementations. During testing, verify that a disabled feature preserves its saved records.

Publish the continuation release with a recognizable “TuxOS continues Tuxplore” explanation, familiar activity names, migration instructions, credits, and updated site title/description, social metadata, icons, and manifest. Verify old public links and any stats functionality on the real deployment before deciding their disposition.

Begin a migration period with a clear notice on Tuxplore and an easy export action. Choose and communicate the retirement date after beta results and migration feedback, rather than treating it as a deadline that overrides failures. Check inbound/deep links and provide meaningful destinations in TuxOS.

Retain an export-capable landing/archive page at the original origin after retirement. Browser-local data remains scoped to that origin: an unconditional redirect can make it inaccessible. Freeze new feature development, then retire interactive play only after the following checks pass. Handle old account export access separately from browser-local export access.

- All verified legacy capabilities are implemented or have an explicit, explained replacement accepted during testing. Unsupported historical data remains recoverable.
- Existing TuxOS users retain their files, courses, configuration, and working account saves.
- Tuxplore fixtures and volunteer migrations preserve compatible history; conflicts and failures never silently replace either source.
- The desktop, learning, file, game, and resume scenarios pass on target devices, with acceptable recorded performance.
- Original-site export, links, credits, and migration support are available.
- A restore drill proves recovery of the old deployment and pre-import saves. Any older application used for rollback understands the stored schema or is prevented from rewriting it.

Stop the rollout on lost data, broken account isolation, inaccessible export, repeatable task blockers, or substantial unexplained performance regression. Keep the previous release/deployment recoverable. Restoring an older application must not discard progress created after the migration; preserve new saves and handle them with a compatible recovery path.

## 11. First implementation batches

Start with these reviewable batches, each with its own behavior checks:

1. **Access and persistence contract:** separate access from mastery; add schema upgrades and import provenance; update reconciliation; define export format and source fixtures.
2. **Guest entry and safe account transition:** wire local storage, resume context, fast boot, export, account conflict handling, and clear save failures. Add the legacy-origin exporter alongside this work.
3. **Immediate UX fixes:** clipboard behavior/copy, consistent wallpaper defaults, curated shortcuts, and unobstructed non-blocking feedback.
4. **Continuous learning:** windowed journal, optional focus view, curriculum/review access, and preserved terminal context.

Then deliver Files/window improvements, adventure/reference/achievements, each game as a separate module, remaining shell/guide/companion work, and the completed importer. Finish with measured performance improvements, comparison beta, and staged retirement. This order delivers visible improvements early while protecting the data and compatibility work needed for a credible continuation.
