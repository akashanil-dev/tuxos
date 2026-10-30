# Account-first learning journey

New learners create an account or sign in before starting. The web app uses the existing API account service and database for saves, with no anonymous/local-only fallback. `npm run dev` runs that API locally; public accounts across devices require deploying the API with persistent storage alongside the web app. A database outage shows a retry action rather than silently switching to browser storage.

After sign-in, Learn Linux opens with one question above the terminal. Hint, Show answer and Explain this offer optional help. Commands are checked by the existing reviewed curriculum; displaying an answer never completes a question. The same 34 lessons and 150 checked tasks remain available, with future lessons unlocking in order.

| Completed lessons | Reward |
| --- | --- |
| 1 | Terminal Explorer badge |
| 2 | Permission to install KDE Plasma, then use Files, Software and learning apps |
| 3 | Wallpaper customisation |
| 7 | GNOME desktop |
| 12 | Breeze Blue, Forest and Twilight colour palettes |
| 16 | KDE 30th Anniversary wallpaper |
| 21 | Hyprland desktop |
| 26 | Plugins, widgets and community themes |
| 31 | CDE desktop |
| 34 | Completion badge and all features available |

The default wallpaper is KDE Minimal. Anniversary artwork is selectable only after its reward, regardless of calendar date. Rewards enable a choice; they do not automatically change the learner's desktop or wallpaper.

Each newly checked task gives 10 XP. Hints, answers, errors and breaks have no penalty. Replaying a completed task does not award duplicate XP or remove earned rewards. The reward map explains the next milestone. Learn Linux in the desktop, launcher or taskbar resumes the same learning journey without closing other windows. The trophy reward map also offers Continue learning; no floating navigation buttons cover the desktop.

Completed lessons, checked task IDs, acknowledged rewards and the guided terminal's folder/environment are saved with the account. Earlier reviewed-course progress is imported on boot. A legacy browser save can migrate into a newly created account with the same username; user files are preserved. Appearance choices that have not yet been earned revert to the starting appearance. Save failures remain visible with Retry saving.

Milestones live in `packages/sdk/src/journey.ts`. The kernel enforces appearance and app gates, and the plugin manager checks installation/launch eligibility. Only the built-in Learn Linux module can submit progress through `journey.record`; optional AI practice never awards journey progress. These are teaching rules in a client-side simulation, not a server-validated credential or anti-cheating system.

Tests cover all 34 lessons, each reward boundary, direct-action restrictions, free hints/answers, replay, migration, terminal resume, persistence and the learning-to-desktop interface.

## Install an earned desktop

Rewards unlock installation, rather than preinstalling a desktop. At lesson 2, the learning screen becomes a guided KDE installation terminal:

```sh
sudo apt update
sudo apt install kde-plasma-desktop
```

Answer Y (or press Enter) at the confirmation prompt. Simulated download, unpack and configuration phases show progress. Only a successful finish registers the desktop. Ctrl+C cancels staged work without marking packages installed; rerun to retry. After installation, KDE Plasma opens automatically without a launch button. Returning to learning does not trigger another automatic switch. Completed lesson progress is preserved.

Later, Settings offers Install for earned environments: `gnome-core`, `hyprland`, and `tuxos-cde`. It opens a terminal with the commands to type; once installed, the card changes to Switch to. These use the same dpkg database as apt and persist with the account. The active desktop cannot be removed until another installed desktop is selected. Pre-existing accounts keep their lessons and files, but must install any earned desktop not yet in the package database.

Package names for [KDE Plasma](https://packages.ubuntu.com/noble/kde-plasma-desktop) and [GNOME](https://packages.ubuntu.com/noble/gnome-core) follow Ubuntu. All desktop packages here are abbreviated TuxOS teaching packages, with simulated sizes and versions, shown as `tuxos://practice-repository`. In particular, the Hyprland and CDE examples are not instructions for an Ubuntu 24.04 machine; [native Hyprland installation varies by distribution](https://wiki.hypr.land/getting-started/installation/).

The pre-desktop screen omits its tagline and redundant terminal labels. Questions have a highlighted background and strong border. Guided terminal output is cyan, errors are red, and commands and prompts retain their normal colour. Existing ANSI program output is preserved. Clipboard restrictions remain until KDE is installed.


Settings → Learning history → Clear history asks for confirmation, then replaces the account’s saved TuxOS simulation with a fresh one and opens lesson 1. It clears lessons, XP, rewards, software, plugins and practice files, while keeping the account signed in. Older pending saves finish before replacement, and a failed reset save leaves the running session available for retry.


The desktop Terminal is independent of lesson assessment: it opens at a plain shell prompt, never advances lessons or awards XP, and omits course-only hint/answer/task/next commands from help and completion. Learn Linux and Learn Docker explicitly attach their embedded terminals to their own courses. Files and installed software are shared, while each shell keeps its own working directory and command history.
