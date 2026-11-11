# TuxOS

TuxOS continues Tuxplore: a simulated Linux computer for exploring desktops, learning through adventures,
and keeping your progress. Start as a guest, then use an optional account when you want to save across devices.
Vasu offers local guidance; AI assistance is optional.

**Project site:** [tuxos.akashanil.dev](https://tuxos.akashanil.dev) · **Team:** Akash A · Edson Edwin Ninan

This branch contains the continuation release candidate. Local validation is recorded in
[the implementation status](docs/migration/status.md); production rollout and retirement have separate gates.

## Features

- **Explore immediately.** KDE Plasma, GNOME, Hyprland and CDE are available without lessons, installation or
  registration. Fast boot, chosen context, open windows and bounded terminal history resume. Desktop styles,
  wallpapers, icons and palettes retain their character.
- **Learn alongside your tools.** One Learn Linux window can sit beside Files and Terminal or use a focus view.
  Keep the reviewed **34 lessons / 150 tasks**, five built-in Docker lessons, filesystem guide, administration
  practice, optional AI labs and chmod Arcade. Free hints and answers remain available; using them has no penalty.
  Badges and course mastery are separate from interface access. The anniversary wallpaper remains an earned
  or retained cosmetic. Desktop package installation is optional practice. See [the learning guide](docs/learning-journey.md).
- **Tuxplore activities.** Ten-quest Tux’s Adventure, eight Pipe Dream puzzles, Know Your Distro’s Rapid and
  Infinite modes, family map, thirty discoveries, a searchable/printable learned-command reference, and the
  four-question Try Linux guide. Games preserve separate records and pause when inactive.
- **A shared shell and filesystem.** Bash-like pipes, redirection, variables, globs, conditionals, completion and
  history; Files Places, breadcrumbs, previews, list/icons, permissions and Open terminal here. Text Editor and
  the teaching nano/Vim interfaces preserve unsaved-work guards. Normal clipboard behavior is available.
- **Software practice.** apt/dpkg and Software share dependency resolution, prompts, package locks and installed
  programs. Separate Fedora/dnf and Arch/pacman exercises teach family differences without mixing package state.
  All packages and commands are bounded simulations, not real downloads or host programs.
- **Plugins and widgets.** Review permissions, install/update/disable/export packages, and use the bundled apps,
  widgets and Theme Studio. Plugins retain restricted iframes and approved private storage. Imported native
  backups leave plugins disabled until their permissions are reviewed again. See [the plugin manual](docs/plugins.md).
- **Progress you can recover.** Guest saves remain in this browser; account saves retain version-conflict protection.
  Import & backups previews Tuxplore conversion or a native restore, offers file conflict choices, records
  compatibility notes and requires a recovery copy before replacement. Different account names are supported
  after authentication; account and browser systems are never silently merged. See [the migration guide](apps/web/public/migrate.html)
  and [conversion contracts](docs/migration/import-and-recovery.md).
- **Vasu with or without AI.** Local quest hints, command suggestions and app shortcuts work without the API.
  The lightweight 2D penguin is the default; optional 3D loads only when requested. AI is off by default, uses
  the learner’s provider/key, shows its actions, requires sudo consent and stops with Stop or Esc. Course checks
  distinguish learner work from tutor actions.

Guest operation does not imply a fully offline/PWA site. Browser-local saves and recovery copies disappear when
site data is cleared; download important backups. Tuxplore’s exact original origin must continue serving its
export page, and old account access must remain available until its export replacement is verified.

## Architecture

TuxOS is a TypeScript monorepo (npm workspaces). The "Linux" is a simulation written for teaching, not a real
Linux kernel. It models the parts a learner touches: users, file ownership, permission bits, root and sudo.

```
apps/web      React desktop (Vite, xterm.js)
apps/api      Node API: AI tutor and trainers, accounts, saves
packages/     kernel, sdk, shell, lessons, module-host, system, tutor, course-view, appearance
modules/      terminal, files, editors, courses, adventure, puzzles, runner, exploration, guide, apt, settings
```

- **Kernel** (`packages/kernel`): holds the system state. The only way to change it is
  `kernel.dispatch(action)`, which checks the caller's capabilities, runs the action as a Linux user so file
  permissions apply, and records the result in an event log. The learner, the shell, every module and the AI
  tutor all go through it, and a failed action leaves the state unchanged. Acting as another user (sudo) needs
  the `user:switch` capability.
- **Virtual filesystem**: files and directories with owners and Unix permission bits, a root-only
  `/etc/shadow`, `/dev/null` and errno-style errors (`ENOENT`, `EACCES`, `EPERM`).
- **Shell** (`packages/shell`): parses commands and implements its built-ins through `dispatch`. Every command
  line is logged as a `shell.ran` event, which lessons check.
- **SDK and module host** (`packages/sdk`, `packages/module-host`): a module declares its apps, commands and
  capabilities in a manifest, and its code loads only when first used. Every module action also becomes a tool
  for Vasu, so new modules extend the tutor without tutor changes.
- **Package manager** (`modules/apt`): a catalogue of packages (`catalog.ts`) with real versions, sizes and
  dependencies; dpkg's database lives in the simulated filesystem (`dpkg.ts`), so installs are saved with the
  learner's system; each package's program is written in TypeScript (`programs.ts`), since there are no real
  binaries. Package commands are registered from the start but say "not found" until installed, and a command's
  optional `available()` keeps them out of `help` and Tab completion.
- **Lessons** (`packages/lessons`): fixed courses are JSON, with each step checked by a small condition over
  what happened and the system state. AI courses run a survey, ask the API for a syllabus and send each command
  to it for assessment. Progress is saved in the learner's home folder (`~/.local/share/tuxos/`).
- **System client** (`packages/system`): the one API the UI uses for boot, saving, sessions, terminals and
  modules.
- **Plugin manager** (`packages/system/src/plugins.ts`, `apps/web/src/plugins`): one lifecycle for GUI and CLI
  operations, strict package validation, reviewed permissions, private storage quotas, versioned updates and
  immediate app-list updates. The bundled catalog works offline; custom packages are imported locally.
  `PluginWindowFrame` and `PluginRPCGateway` provide the restricted iframe and permission-checked bridge.
- **AI tutor** (`packages/tutor`, `apps/web/src/tutor`, `apps/api`): the browser keeps the conversation and
  runs the agent's tools (look at the screen, click, type, files, windows, module actions). The API adds Vasu's
  instructions and makes one model call per request with the learner's key, so it is stateless. Everything
  Vasu does is recorded as the `tutor` actor, so lessons count only the learner's own work.
- **API** (`apps/api`): a dependency-free Node server. `/api/tutor` serves the tutor, `/api/learning/*`
  (`plan`, `evaluate`, `hint`, `answer`) the trainers, and `/api/auth/*` and `/api/save` accounts. Model
  responses are validated before use. Passwords are stored as salted scrypt hashes and session tokens are
  hashed, both in SQLite (`node:sqlite`). Saves are versioned so an older tab can't overwrite newer progress,
  and requests are rate limited.
- **AI providers** (`apps/api/src/providers.ts`): every provider speaks OpenAI's chat-completions format at its
  own address. Keys are checked without spending anything where possible (listing models; OpenRouter's key
  endpoint; for NVIDIA, whose model list is public, a one-token request). Weaker models are handled: a model
  without tool calling still chats (Vasu can't operate the computer), the trainers retry without JSON mode and
  read the JSON out of the reply, and a too-large conversation is retried with its recent part. OpenAI-only
  options (such as `reasoning_effort`) go only to OpenAI.
- **Network safety** (`apps/api/src/net-guard.ts`, `deploy/tuxos-api.service`): every request to a provider is
  checked when it connects, against the addresses the name really resolves to: loopback, private, link-local
  (cloud metadata), CGNAT and other reserved ranges are refused, redirects are never followed and responses are
  size-capped. systemd's `IPAddressDeny` enforces the same in the kernel. A learner's own address (any
  OpenAI-compatible server) is off unless `ALLOW_CUSTOM_AI_URL=1`, and then public https on port 443 only;
  `ALLOW_PRIVATE_AI_URL=1` is for local development (e.g. Ollama). A custom server's error text is never shown.
- **API keys** (`apps/api/src/ai-keys.ts`, `apps/web/src/ai-key.ts`): the server has no key of its own; every
  AI call uses the learner's. `/api/ai/key` checks the provider, model and key, then saves them sealed with
  AES-256-GCM under the account's vault key. The database holds the vault key only
  wrapped with a key derived from the learner's password (scrypt) and, per session, with a key derived from
  the session cookie's token, which the server never stores. So the database, the server's files and its
  configuration can't decrypt a saved key without the learner's password or a live session: the operators can't
  read it. A key is decrypted in memory only for that learner's own requests, never logged (key-like text is
  redacted from errors) and never sent back. A guest's key stays in their browser and goes with each AI request
  in `x-ai-*` headers; it is never stored on the server.
- **AI switch** (Settings → AI): off until the learner turns it on, and greyed out while the server has
  `AI_FEATURES` off. For an account the server keeps the setting and refuses to use the key; for a guest the
  browser stops sending it. With AI off, or without a key,
  no AI request leaves the browser, and every module uses its own offline behaviour: Learn Linux, Learn Docker
  and the chmod trainer teach their built-in lessons with rule-based checks (an AI lab in progress is kept and
  resumes when AI is back on), `/hint` and `/answer` use each task's own hints, and Vasu answers from an offline
  guide built from the shell's help and the learner's last error. Plugins never have AI or network access.

## Run locally

Requires Node.js 22.18 or newer. CI and production use Node 24.

```sh
npm install
cp .env.example .env    # optional settings
npm run dev             # API on :8787, desktop at http://localhost:5173
```

To try the AI features, set `AI_FEATURES=1` in `.env`, then in **Settings → AI** inside TuxOS turn AI on, choose a
provider, paste your key and load its models. Everything else works without it. If the trainer doesn't load,
check `http://localhost:8787/api/health`.

| Variable | Purpose |
| --- | --- |
| `AI_FEATURES` | `1` offers AI features. Off by default: no AI request is made and the switch is greyed out. |
| `ALLOW_CUSTOM_AI_URL` | `1` lets learners enter their own OpenAI-compatible address (public https only). Off in production. |
| `ALLOW_PRIVATE_AI_URL` | `1` also allows http and private addresses, for a local server such as Ollama. Development only. |

Never commit an API key. If one is exposed, revoke it and create a new one.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API and the desktop dev server |
| `npm run check` | Type check, then run the Vitest suite |
| `npm test` | Run the tests only |
| `npm run build` | Type check and build the desktop |
| `npm run api` | Start the API server only |

## Deployment

Production runs on an Ubuntu 24.04 server behind Cloudflare and Caddy. The files are in [`deploy/`](deploy) and
[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

- **CI:** every push and pull request runs `npm ci`, the type check, the tests and the web build.
- **CD:** a passing push to `main` uploads the release over SSH. `deploy/deploy.sh` installs it in
  `/opt/tuxos/releases/<commit>`, switches the `/opt/tuxos/current` symlink, restarts the `tuxos-api` systemd
  service and checks `/api/health`. If the check fails, it switches back to the previous release. During migration, releases are retained. Rollback requires a schema-2-compatible reader and API; see [the rollout runbook](docs/migration/release-runbook.md).
- **Server:** Caddy serves `/opt/tuxos/current/web` and forwards `/api/*` to the API's Unix socket
  `/run/tuxos/api.sock` ([`deploy/Caddyfile`](deploy/Caddyfile)). The API runs as the unprivileged `tuxos` user
  ([`deploy/tuxos-api.service`](deploy/tuxos-api.service)), with settings in `/etc/tuxos/tuxos.env` and the
  database at `/var/lib/tuxos/tuxos.db`. `TRUST_PROXY=1` makes rate limits use the visitor's IP.
- **One-time setup:** copy `deploy/` to the server and run `sudo bash deploy/setup-server.sh`. Add the Caddy
  site block and mounts, then add the GitHub secrets
  `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` to a `production` environment.
- **Backup:** `sudo sqlite3 /var/lib/tuxos/tuxos.db ".backup /root/tuxos-backup.db"`. Saved API keys in a backup
  stay encrypted with each learner's password, so a backup can't reveal them either.
- **Manual rollback:** `bash deploy/rollback.sh <compatible-release-name>` verifies the reader and API before switching. Never restore the old database over new learner progress. Logs: `journalctl -u tuxos-api`.

## Known limitations

- It is a simulation: there are no real OS processes or background jobs. The shell implements a teaching
  subset of bash, with interactive package confirmations and a cancellable browser-rendered `cmatrix`.
- Group permissions are not modelled, and `ls -l` shows times in UTC.
- apt only knows the packages in its catalogue, each written for TuxOS; there are no real `.deb` packages or
  downloads. `apt update` loads this catalog; unsupported packages are identified with a hint to run `apt list`.
  `docker.io` and the base system are listed as installed but can't be removed. Upgrade currently reports
  no available upgrades; it does not fetch newer package versions from the internet.
- The Docker simulation covers the commands and images listed above. Interactive container shells
  (`-it ... sh`) are not available.
- Vasu's agent flow was tested with a scripted model and in a real browser. The quality of his answers against
  the real model has not been reviewed systematically, and he has no memory between conversations.
- Accounts have no password reset.
- The provider flow was tested against stand-ins and each provider's real endpoints (without a valid key), not
  end to end with real keys. Small free models vary a lot in tool calling and JSON output; the fallbacks keep
  things working, but answer quality depends on the model chosen.
- Each state-changing action copies the whole state, so near-limit saves still require target-device profiling; portable saving avoids an extra full-state copy.

## Credits

Built with [TypeScript](https://www.typescriptlang.org/), [React](https://react.dev/), [Vite](https://vite.dev/),
[xterm.js](https://xtermjs.org/) and [Vitest](https://vitest.dev/). Tests use Testing Library and jsdom. Fonts:
[Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL Open Font
License). Icon themes: GNOME (CC-BY-SA / GPL-3.0), Breeze (LGPL-3.0) and Papirus (GPL-3.0), used unmodified;
see [`apps/web/public/icons/CREDITS.md`](apps/web/public/icons/CREDITS.md). The AI features use the
[OpenAI chat-completions format](https://platform.openai.com/docs/api-reference/chat), which every supported
provider accepts.

Tuxplore’s license is retained in [the migration credits](docs/migration/licenses/Tuxplore-LICENSE.txt); distribution artwork credits are in [the public asset inventory](apps/web/public/distros/CREDITS.md).

The development history is in [CHANGELOG.md](CHANGELOG.md).
