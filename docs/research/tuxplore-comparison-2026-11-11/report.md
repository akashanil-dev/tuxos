# Tuxplore → TuxOS: design, usability and continuation report

Research date: 11 November 2026. Scope: local projects, source inspection and sampled browser interaction. No application code changed.

**Tuxplore’s strongest advantage is how readily it lets someone enjoy and understand the system. TuxOS already carries much of its visual design, but puts more conditions between the visitor and that experience.** The most credible explanation for the feedback is a combination of easier entry, continuous desktop exploration, playful content, helpful graphical tools and smaller interaction costs. A different color palette alone would do little to address these differences.

TuxOS is the stronger foundation for an expanded learning product. Its deeper curriculum and more capable simulation deserve to survive. To become a convincing continuation, it also needs to preserve the activities, freedom and accumulated progress that people associate with Tuxplore.

The implementation differences below are verified. Their contribution to people’s preference is an informed interpretation, not a result from interviews or a controlled user study. I did not establish that Tuxplore has a higher frame rate.

## 1. What was inspected

| Project | Inspected version |
| --- | --- |
| TuxOS | `/home/akash/Documents/tuxos`, commit `2562174`, “feat: add Tuxplore startup and KDE anniversary wallpaper”. Working tree was clean before this research. |
| Tuxplore | `/home/akash/Documents/tuxplore/tuxplore-clean`. This is a local snapshot without Git metadata, not a verified copy of the currently deployed site. |

I inspected startup, accounts, desktop shells, design tokens, window management, terminals, Files, learning interfaces, rewards, games, settings, companion behavior and save formats. I also built the TuxOS frontend into a temporary directory and measured script sizes.

Browser checks used local servers and disposable review data. In Tuxplore I entered as a guest, completed the first quest, inspected the command cheat sheet, solved the first Pipe Dream level, started and paused Know Your Distro, opened its family map and previewed a file. In TuxOS I signed into a disposable local account, completed the first two lessons, verified the clipboard restriction, installed the simulated KDE desktop, moved and maximized Files, and returned to learning from the taskbar.

The TuxOS API used a temporary database with AI disabled. No real account, production service or AI provider was used. One development-server interruption produced a save error and reload during the review; that was excluded from product-performance conclusions. Screenshots retain their captured viewport sizes, so they illustrate features rather than constitute a pixel-for-pixel layout comparison. Later desktop unlocks, mobile behavior, all lesson content, full game completion and live cloud migration were not exercised end to end.

## 2. Styling: much has already carried over

The two desktops share unusually close visual foundations. These are source values, not estimates from screenshots:

| Element | Tuxplore | TuxOS | Interpretation |
| --- | --- | --- | --- |
| KDE accent | `#3daee9` | `#3daee9` | Same identity |
| KDE window / titlebar | `#2a2e32` / `#31363b` | Same | Same main surfaces |
| KDE corner radius | 5px | 5px | Same window shape |
| GNOME accent / radius | `#3584e4` / 12px | Same | Same visual family |
| Hyprland accent / radius | `#cba6f7` / 10px | Same | Same Catppuccin direction |
| CDE | Gray surfaces, blue titlebar, square corners, bevels | Same approach | Distinct retro shell preserved |
| Base UI / terminal text | 14px; Inter and JetBrains Mono stacks | 14px; similar stacks | No broad typography downgrade established |
| Window entrance | 160ms, scale from 0.96, fade | 160ms, scale from 0.96, fade | Opening timing is already equivalent |
| Original wallpapers | Nine image wallpapers | All nine present, byte-identical | These assets are already migrated |

Sources: [Tuxplore tokens](/home/akash/Documents/tuxplore/tuxplore-clean/css/os.css:3), [TuxOS tokens](/home/akash/Documents/tuxos/apps/web/src/styles/base.css:6), [Tuxplore window transitions](/home/akash/Documents/tuxplore/tuxplore-clean/css/os.css:266), [TuxOS window animation](/home/akash/Documents/tuxos/apps/web/src/styles/window.css:1), [TuxOS wallpaper catalog](/home/akash/Documents/tuxos/packages/appearance/src/index.ts:62).

The visible differences with greater practical importance are:

- **The first usable screen.** Tuxplore presents a wallpaper, desktop, small quest window and Tux. TuxOS presents a full-screen console with progress, rewards and a locked desktop button. This is a substantial change in mood even though the eventual desktops share styling.
- **Consistency across learning and exploration.** Tuxplore’s Journal is part of its themed desktop. TuxOS has desktop styling, a green introductory console, and a separate blue learning/rewards interface with hard-coded colors. Switching between them can feel like moving between products.
- **File-manager composition.** Tuxplore uses a Places sidebar, breadcrumbs, large file icons and a preview pane. TuxOS uses a path field, action buttons and a table. The newer interface supports more editing operations, but supplies fewer visual explanations while browsing.
- **Desktop emphasis.** The sampled Tuxplore desktop had seven available icons. The newly unlocked TuxOS desktop displayed eleven, including Plugins prominently even though Plugins remains locked until lesson 26. This makes the extra functionality visible before it is useful.
- **Default wallpaper.** Tuxplore starts with the subdued “Free as in freedom” artwork. TuxOS currently resolves `default` to the KDE anniversary image. Its settings label says “System default · KDE Minimal”, while its reward map presents the anniversary wallpaper as a lesson-16 reward. These messages should agree before a successor release.

Sources: [TuxOS journey styles](/home/akash/Documents/tuxos/apps/web/src/journey/journey.css:1), [desktop app order](/home/akash/Documents/tuxos/apps/web/src/main.tsx:65), [wallpaper fallback](/home/akash/Documents/tuxos/packages/appearance/src/index.ts:88), [wallpaper settings](/home/akash/Documents/tuxos/modules/settings/src/view.tsx:69), [reward definitions](/home/akash/Documents/tuxos/packages/sdk/src/journey.ts:15).

**Design recommendation:** preserve the shared desktop design system. Concentrate visual work on the learning interface, file browsing, clear app availability, notification placement and consistent defaults. A wholesale desktop reskin is not supported by this comparison.

## 3. Why Tuxplore can feel smoother and more convenient

### A. It asks for less commitment before providing value

Tuxplore offers “Play without an account”, asks for a username and opens KDE with the Quest Journal. The initial screen does promote account creation, so it is not literally zero-friction, but a local guest route exists. KDE and wallpaper choice are available immediately.

TuxOS requires an account and a reachable account service. Its new-user path to KDE includes seven checked tasks across two lessons, reward acknowledgements, a lesson transition, `sudo apt update`, `sudo apt install kde-plasma-desktop`, and the package confirmation. Other desktops require later milestones and installation: GNOME at lesson 7, Hyprland at 21 and CDE at 31. Tuxplore unlocks those after quests 3, 10 and 6 respectively; those quests are not equivalent units to TuxOS lessons.

“Earn your desktop” can be motivating for someone choosing a course. It is a substantial obstacle for someone opening a link to explore Linux, demonstrate the app or play a game.

**Recommendation:** offer a clearly named Explore path alongside Guided Learning. Let a visitor experience the desktop and games before account creation, and offer an account when they want durable syncing. Keep the guided progression available as a chosen learning experience. This is a proposed product decision, not an implemented change.

Evidence: [Tuxplore guest flow](/home/akash/Documents/tuxplore/tuxplore-clean/js/boot.js:238), [Tuxplore defaults](/home/akash/Documents/tuxplore/tuxplore-clean/js/core.js:44), [TuxOS required account handling](/home/akash/Documents/tuxos/apps/web/src/app.tsx:78), [desktop installation UI](/home/akash/Documents/tuxos/apps/web/src/journey/JourneyScreen.tsx:180), [unlock rules](/home/akash/Documents/tuxos/packages/sdk/src/journey.ts:15).

### B. Learning stays inside the world being explored

Tuxplore’s quest window can remain beside a terminal. Its current quest shows the story, checklist, hint and an “Open…” action for the relevant app. Progress updates without taking away the terminal. Completing the first quest advanced the Journal and produced a toast while I remained in the same desktop session.

TuxOS’s ordinary desktop “Learn Linux” action switches to the full-screen journey. I verified this from the taskbar. Returning to Files or another desktop app requires “Explore desktop”. Reward milestones show modal dialogs. The learning terminal is keyed by lesson and is replaced when the lesson changes; completed lessons temporarily show a completion panel instead of the terminal.

TuxOS also contains a searchable curriculum interface, but the standard desktop action is intercepted to resume the journey. Existing capability is therefore less discoverable than its presence in the code suggests.

**Recommendation:** make the lesson panel usable beside desktop apps, with an optional focused full-screen view. Expose the curriculum and review mode through normal navigation. Preserve terminal context wherever the lesson permits it, and make ordinary progress feedback non-blocking. The current one-question layout remains useful for learners who prefer reduced distraction.

Evidence: [Journal implementation](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/journal.js:17), [desktop learning action](/home/akash/Documents/tuxos/apps/web/src/screens/Desktop.tsx:61), [journey modes and rewards](/home/akash/Documents/tuxos/apps/web/src/journey/JourneyScreen.tsx:31), [learning terminal lifecycle](/home/akash/Documents/tuxos/apps/web/src/journey/JourneyScreen.tsx:164), [curriculum search](/home/akash/Documents/tuxos/packages/course-view/src/index.tsx:266).

### C. Tuxplore has distinctive activities that TuxOS does not replace

Tuxplore gives someone several reasons to stay beyond completing lessons:

- **Pipe Dream:** eight puzzles built from command blocks, with intermediate pipeline output, target comparison and the equivalent terminal command. I verified the first puzzle’s immediate completion feedback. This teaches a concept through visible cause and effect.
- **Know Your Distro:** Rapid and Infinite modes, five family choices, a family map, scores, lives, pause, sound and keyboard/tap controls. The three-round Rapid format is especially relevant to event demonstrations.
- **The dungeon quest story:** letters, hidden maps, gates, goblins and a crown give commands a purpose within a connected story.
- **Personal cheat sheet:** successful commands accumulate into a reference with descriptions and examples, with a print action.
- **Try Linux:** a four-question distro selector, progress summary and guidance for moving beyond the simulation.
- **Thirty achievements:** many reward experimentation, using a pipe, opening a terminal from Files, desktop switching and discovering secrets. TuxOS’s ten journey rewards are tied to ordered lesson milestones.

chmod Arcade adds value in TuxOS, but covers a different topic and interaction. It does not replace either of the two Tuxplore games. TuxOS also retains some playful lesson scenarios, such as the garden; the loss is the larger connected adventure and variety of activities, not the total absence of playfulness.

**Recommendation:** port the games and cheat sheet as first-class TuxOS modules. Preserve a recognizable short Tuxplore adventure alongside the deeper curriculum. Treat the real-Linux guide as an editorial migration: verify its distro information and replace broad claims that everything in the simulation works identically on a real system.

Evidence: [Pipe Dream](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/pipedream.js:8), [Know Your Distro](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/runner.js:1), [quest chain](/home/akash/Documents/tuxplore/tuxplore-clean/js/quests.js:17), [cheat sheet](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/journal.js:75), [Try Linux](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/system.js:187), [achievements](/home/akash/Documents/tuxplore/tuxplore-clean/js/core.js:135).

### D. Tuxplore makes the connection between graphics and commands explicit

Its Files app displays breadcrumbs, common Places, file permissions, file contents and a matching `cat` command. “Open terminal here” carries the current directory into a terminal. Previewing `welcome.txt` completed its reading quest during this review. That is a tangible benefit of treating both interfaces as views of the same system.

TuxOS Files offers creation, deletion, an editable location field, a detailed table and a link to its filesystem course. Those are improvements. However, it has no equivalent preview pane, breadcrumb trail or “Open terminal here” control in the inspected implementation; opening a file launches the editor.

**Recommendation:** add these browsing and explanation features around the existing editor and file operations. Permit GUI activity to satisfy objectives when the objective is understanding a file or state; retain command-specific checks where executing the command is the skill being taught.

Evidence: [Tuxplore Files](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/files.js:26), [TuxOS Files](/home/akash/Documents/tuxos/modules/files/src/view.tsx:82).

### E. Some everyday interactions have become restrictive

Before KDE is ready, TuxOS intercepts copy, cut, paste, context menus, drag/drop and clipboard shortcuts in the learning terminal. Attempting to paste displayed:

> copy pasting makes you dumb, so we disabled it for now :)

This is verified browser behavior. It introduces a practical obstacle and a judgmental message exactly when a newcomer may need reassurance. Tuxplore uses ordinary text input and explicitly allows copying selected input.

**Recommendation:** allow normal clipboard use by default. If typing practice is an intentional teaching choice, make it an optional mode with neutral wording and a clear exit. Copying output for reference should remain possible. Keep the existing free hints and answers.

Evidence: [clipboard guard and message](/home/akash/Documents/tuxos/modules/terminal/src/clipboard.ts:1), [where the restriction applies](/home/akash/Documents/tuxos/apps/web/src/journey/JourneyScreen.tsx:176), [Tuxplore terminal input](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/terminal.js:84).

### F. Small presentation details affect the sense of completion

Several secondary differences are worth addressing:

| Detail | Finding | Suggested treatment |
| --- | --- | --- |
| Window closing | Tuxplore fades/scales out over 160ms. TuxOS immediately removes the window through session state. | Add a brief exit transition without delaying save or close guards. |
| Initial placement | Tuxplore centers/cascades windows within the work area and clamps initial dimensions. TuxOS starts at `48 + n×24`, `40 + n×24` with no viewport clamp in the session-open action. | Clamp and recenter restored/new windows for the current viewport. |
| Reopening apps | Tuxplore defaults to one instance per app, with Terminal explicitly allowing multiple. TuxOS direct `openApp` creates another session window. Taskbar activation has its own reuse behavior. | Define an app-instance policy so desktop icons, launchers and taskbars behave predictably. |
| Touch activation | Tuxplore desktop icons and folders explicitly support a single tap for coarse pointers. TuxOS desktop icons define double-click and Enter, without that coarse-pointer branch. | Validate touch behavior on tablets; restore the intentional tap path. This was source-reviewed, not device-tested. |
| Welcome notification | After moving Files into the top-right area, its titlebar controls were covered by TuxOS’s welcome panel. They worked after I dismissed the panel. | Keep onboarding available without covering working controls. |
| Companion | Tuxplore automatically supplies local event hints and desktop shortcut guides. TuxOS has an offline guide, but with AI off it deliberately suppresses the intro, strolls and nudges until clicked. | Keep useful local contextual guidance independent of AI setup. |

Evidence: [Tuxplore window lifecycle](/home/akash/Documents/tuxplore/tuxplore-clean/js/wm.js:200), [TuxOS initial geometry](/home/akash/Documents/tuxos/packages/kernel/src/actions/session.ts:97), [TuxOS opening API](/home/akash/Documents/tuxos/packages/system/src/index.ts:300), [desktop activation](/home/akash/Documents/tuxos/apps/web/src/screens/Desktop.tsx:166), [welcome overlay](/home/akash/Documents/tuxos/apps/web/src/screens/Desktop.tsx:242), [Tux event hints](/home/akash/Documents/tuxplore/tuxplore-clean/js/tux.js:37), [Vasu offline behavior](/home/akash/Documents/tuxos/apps/web/src/tutor/TutorPanel.tsx:32).

These are specific differences, not evidence that every Tuxplore interaction is superior. Both have keyboard shortcuts, desktop-specific shells, reduced-motion CSS and narrow-screen window rules.

## 4. Performance: measured weight, unmeasured frame rate

I built TuxOS with `npm run build --workspace @tuxos/web -- --outDir /tmp/tuxos-comparison-build-20261111`. The build succeeded. To compare compression consistently, I used Python gzip level 9 on each referenced file and summed the sizes. Decimal kB are used below.

| Local asset set | Raw | Gzipped |
| --- | ---: | ---: |
| Tuxplore startup JavaScript, all 20 scripts referenced by its HTML | 315.4 kB | 102.5 kB |
| TuxOS production entry JavaScript | 853.0 kB | 249.0 kB |
| Tuxplore startup CSS | 83.7 kB | 19.6 kB |
| TuxOS production entry CSS | 99.4 kB | 19.4 kB |
| TuxOS deferred Penguin3D chunk | 528.0 kB | 132.1 kB |

The TuxOS entry script alone is about **2.43 times** the compressed size of Tuxplore’s startup scripts. This excludes images, fonts, HTML, API traffic and other deferred chunks. It is a local artifact-size comparison, not a network trace or load-time ratio. Tuxplore also makes more separate script requests, so bytes alone cannot settle which loads faster in deployment. Exact values are saved in [bundle-sizes.json](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/bundle-sizes.json).

There are three credible profiling targets:

1. **Startup loading.** The build warns that Terminal’s view is both dynamically and statically imported. The guided journey’s static import brings that path into the entry bundle. Some other modules remain deferred, which is beneficial.
2. **Idle graphics.** On WebGL-capable browsers, Vasu uses a deferred Three.js renderer with a recurring animation frame. It skips drawing when the browser document is hidden. After the desktop has been visited, the journey hides the desktop through CSS while keeping it mounted; there is no corresponding learning-view visibility check in the renderer. This is a possible source of unnecessary work, not a measured slowdown.
3. **Window updates.** Tuxplore moves windows by directly updating styles. TuxOS updates local React preview state during dragging and dispatches the saved geometry on release. That already avoids a kernel save on every pointer move. Mutating kernel actions still clone system state, and saving serializes snapshots. Profile this with realistic saved systems before changing the architecture.

Sources: [static terminal import](/home/akash/Documents/tuxos/apps/web/src/journey/JourneyScreen.tsx:1), [window preview and commit](/home/akash/Documents/tuxos/apps/web/src/desktop/WindowFrame.tsx:68), [kernel copying](/home/akash/Documents/tuxos/packages/kernel/src/kernel.ts:176), [batched saving](/home/akash/Documents/tuxos/packages/system/src/index.ts:206), [deferred 3D loading](/home/akash/Documents/tuxos/apps/web/src/tutor/Penguin.tsx:5), [render loop](/home/akash/Documents/tuxos/apps/web/src/tutor/Penguin3D.tsx:272).

**Recommendation:** measure cold and warm startup, first app opening, command response and dragging on the same browser/device with production builds. Compare a fresh save and a populated save. Measure Vasu enabled, disabled and hidden. Do not attribute all perceived smoothness to React, Three.js or network saves without those measurements.

## 5. Migration inventory

“Missing” means no equivalent was found in the inspected TuxOS application sources and registered modules. It does not mean there is no related functionality at all.

| Tuxplore capability | TuxOS position | Migration treatment |
| --- | --- | --- |
| KDE, GNOME, CDE and Hyprland shells and greeters | Present, with later access gates | Preserve; revise access policy separately from visual design. |
| Original nine wallpapers and desktop icon-theme approach | Present | Preserve credits and existing assets; fix default/reward consistency. |
| Guest play and browser-local progress | Removed from the normal product entry | Restore an Explore option if low-friction continuation is the goal. |
| Optional account syncing | Accounts now required; versioned saves added | Preserve account reliability while restoring optional initial commitment. |
| Short ten-quest adventure and dungeon world | Replaced by a different, much larger curriculum | Migrate a recognizable introductory adventure; retain the advanced curriculum. |
| Quest Journal alongside terminal | Replaced by the main full-screen journey | Add an integrated journal/lesson panel and optional focus view. |
| Pipe Dream, eight levels and intermediate outputs | Missing | Port as a module using shared command behavior. |
| Know Your Distro, Rapid/Infinite, map, scores and controls | Missing | Port as a module, including event-friendly Rapid mode and score history. |
| Learned-command cheat sheet and print action | Missing | Build from successful learner commands; include descriptions and examples. |
| Thirty exploratory/secret achievements | Replaced by ten lesson milestones | Add exploration achievements alongside learning milestones. |
| Try Linux quiz and next-step guide | Missing as a comparable app | Restore after editorial and source verification. |
| File preview, Places, breadcrumbs and terminal-here | Partial: browsing exists; these affordances are missing | Add around the current table, editor and file operations. |
| Local companion reactions and desktop shortcut guide | Partial: offline Vasu guide exists; proactive behavior differs | Restore useful deterministic help without requiring an AI key. |
| Shell, history navigation, completion, pipes and redirection | Present with a different implementation | Keep TuxOS’s engine; explicitly compare command compatibility. |
| `man`/`whatis`, Windows-command suggestions, teaching `nano`/`vim` | No direct counterparts found; TuxOS has `help` and a GUI editor | Migrate the useful teaching behaviors, with clear simulation boundaries. |
| Basic `apt`, `dnf`, `pacman` exposure | More developed `apt`/dpkg and Software; no dnf/pacman counterparts found | Preserve apt depth; add distro-family learning without pretending the host is every distro at once. |
| Fun terminal programs and Easter eggs | Partial: cowsay, fortune, cmatrix, sl and others already exist | Inventory remaining discoveries and preserve their achievements where appropriate. |
| Fast boot preference | No equivalent persistent preference found | Offer a skip-boot preference for returning visitors. |
| Reset files without erasing quest progress | No direct whole-filesystem equivalent found | Add scoped practice recovery; TuxOS’s `lab reset` already covers a narrower admin-lab state. |
| Narrow-screen fallback and phone rescue screen | Present | Preserve, then test touch and keyboard access on actual target devices. |
| Linux Administrator / DevOps tracks | Tuxplore definitions are empty placeholders | Do not claim missing finished courses. TuxOS has real curriculum depth here. |
| Public stats / site metadata | Snapshot contains analytics/stats code and links, but lacks linked `stats.html` | Verify the original deployment before deciding what to retain; do not count the local link as a working feature. |

Useful source anchors: [registered Tuxplore app order](/home/akash/Documents/tuxplore/tuxplore-clean/js/wm.js:79), [TuxOS modules](/home/akash/Documents/tuxos/apps/web/src/main.tsx:65), [old shell teaching behavior](/home/akash/Documents/tuxplore/tuxplore-clean/js/shell.js:104), [old terminal editors](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/terminal.js:140), [old settings](/home/akash/Documents/tuxplore/tuxplore-clean/js/apps/system.js:162), [unfinished tracks](/home/akash/Documents/tuxplore/tuxplore-clean/js/tracks.js:16).

TuxOS-specific strengths should remain: **34 lessons and 150 checked tasks**, administration exercises, Docker, the filesystem guide, the editor, richer apt/Software behavior, sandboxed plugins, widgets, persistent window geometry, versioned account saves and optional AI assistance. These are valuable extensions of the product. This research did not perform a security audit or validate the instructional quality of every lesson.

## 6. A credible continuation plan

### First: agree on the experience being preserved

Use this product promise as a working direction:

> Open TuxOS, explore a Linux desktop, learn through play, and keep going into deeper Linux skills when you are ready.

Offer Explore and Guided Learning as understandable choices. Keep a guest’s local status clear. Make saving to an account an available benefit. Let learners enter focused lessons without making every visit begin in a lesson. Returning users should resume the context they chose.

For the default desktop, emphasize a small set of useful entry points: Terminal, Files, Learn/Journal and Play, with Settings and Software readily accessible through the launcher. Keep advanced or locked capabilities discoverable with clear explanations. Avoid presenting unavailable functionality as an ordinary ready-to-use desktop icon.

### Then: restore convenience before adding more breadth

Prioritize clipboard behavior and wording, learning/desktop continuity, file preview and terminal-here, boot preference, consistent defaults, app-instance behavior and unobstructed notifications. These address everyday costs users can feel immediately. Preserve the existing free hints, clear save failures and safeguards for unsaved editor content.

### Then: migrate the signature features as native modules

The natural source-to-target mapping is:

| Source | Proposed TuxOS destination | Integration requirement |
| --- | --- | --- |
| `js/apps/pipedream.js` | Pipe Dream module | Evaluate blocks with shared text-command behavior; store puzzle completion in the learner’s save. |
| `js/apps/runner.js` | Know Your Distro module | Preserve modes, controls, audio options, family map and best scores; review catalog facts and asset credits. |
| `js/quests.js` + Journal | Introductory adventure and journal UI | Adapt objective checks to kernel/module events; count only the appropriate learner actions. |
| Learned commands + achievements | Shared progress/reference service | Record successful learner commands and exploration separately from graded curriculum completion. |
| Try Linux section | Real Linux guide module | Maintain sourced advice and a clear distinction between a browser simulation and a real machine. |

Use TuxOS’s existing module host, kernel and save lifecycle. Copying the old global `OS` runtime into a parallel hidden application would leave two filesystems, two progress models and inconsistent behavior. Preserve the experience while integrating with the current system.

### Preserve users’ history before retiring the old entry point

There is **no Tuxplore-save importer in the inspected TuxOS paths**. Tuxplore uses `tuxos-save-v1` with quests, learned commands, achievements, game state and its own filesystem tree. TuxOS reads `tuxos.save` containing a kernel snapshot. Its existing “legacy local save” path is for that TuxOS format; it does not establish compatibility with Tuxplore saves.

Prepare an explicit versioned export/import flow and test it on saved examples before redirecting or removing the old site. Preserve:

- Quest completion and in-progress objectives.
- Learned commands and achievements, including discovery timestamps where available.
- Pipe Dream completion and Know Your Distro records.
- Desktop and wallpaper preferences, including desktop entitlements already earned.
- User-created files, with clear treatment of renamed homes and incompatible simulated system files.

Map `kde → plasma`, `retro → cde`, `tiling → hyprland`, and `gnome → gnome`. Separate retained exploration entitlements from the new course’s mastery record so experienced Tuxplore users do not lose earned choices or receive credit for administrator lessons they have never completed.

Different site origins will need an explicit transfer mechanism for browser-local data. Account linking should prove ownership of the relevant account; matching usernames alone is insufficient. Keep an original export and show a preview of imported items, conflicts and unsupported data. Do not overwrite either save silently. Do not import old authentication tokens as new credentials.

Evidence: [old state schema](/home/akash/Documents/tuxplore/tuxplore-clean/js/core.js:41), [old cloud sync](/home/akash/Documents/tuxplore/tuxplore-clean/js/cloud.js:1), [TuxOS legacy source key](/home/akash/Documents/tuxos/apps/web/src/main.tsx:45), [TuxOS saved snapshot reader](/home/akash/Documents/tuxos/packages/system/src/index.ts:434).

### Retire Tuxplore only after these checks pass

- A new visitor can reach meaningful exploration without completing an unrelated prerequisite sequence.
- Existing Tuxplore users can find the two games, adventure, cheat sheet, achievements and real-Linux guide in TuxOS.
- Imported sample saves retain files, progress and earned choices; unsupported items are explained and recoverable from the original export.
- A learner can read a lesson, use Files, run a command and return without losing their place.
- Basic pointer, keyboard, touch and reduced-motion paths are verified. Ordinary window actions and messages remain unobstructed.
- Production-build measurements show acceptable cold/warm startup and interaction behavior on a modest device, including with a populated save.
- People who currently prefer Tuxplore try the same short tasks in both products and can explain any remaining friction.

For that last check, alternate which product people try first. Ask them to enter the app, find their first activity, recover from a wrong command, inspect a file, solve a pipeline puzzle and resume later. Observe delays, wrong turns and requests for help, then ask why they preferred a version. This will test the causes identified here without reducing the discussion to “which one looks nicer”.

## 7. Selected browser evidence

These are captures from disposable local sessions, not the production sites.

**TuxOS’s introductory typing restriction:** the blocked-paste message appears while the desktop is still locked.

![TuxOS learning screen showing its clipboard restriction](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxos-typing-mode.jpg)

**Tuxplore’s visual pipeline puzzle:** the output after a command is visible beside the target, and the actual shell pipeline is shown.

![Tuxplore Pipe Dream after solving the first puzzle](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxplore-pipe-dream.jpg)

**Tuxplore’s file preview:** a file’s contents, permissions and equivalent terminal command appear together.

![Tuxplore Files with welcome.txt preview and the matching cat command](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxplore-files-preview.jpg)

**TuxOS after unlocking the desktop:** familiar shell styling, expanded app selection and the current anniversary wallpaper.

![TuxOS KDE desktop after completing the introductory tasks and installation](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxos-desktop.jpg)

Additional captures: [command cheat sheet](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxplore-command-cheatsheet.jpg), [distro map](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxplore-distro-map.jpg), [required desktop installation](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxos-desktop-installation.jpg), [TuxOS Files](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxos-files.jpg), [separate learning view after desktop access](/home/akash/Documents/tuxos/docs/research/tuxplore-comparison-2026-11-11/images/tuxos-learning-after-desktop.jpg).
