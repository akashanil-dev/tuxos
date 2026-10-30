# TuxOS

A pretend Linux computer that runs in the browser and teaches newcomers Linux and its ecosystem. An AI tutor,
Vasu the penguin, guides each learner and can operate the system himself. Every activity (Learn Linux, Learn
Docker, games) is a module that shows up as a desktop icon.

**Live:** https://tuxos.akashanil.dev

**Team:** Akash A · Edson Edwin Ninan

## Features

- **Earn your desktop.** Create an account and start with a single Linux question above a terminal. Free hints
  and answers support each step; checked lessons earn XP and unlock KDE Plasma, GNOME, Hyprland, CDE,
  wallpaper changes, themes and plugins. The existing 34-lesson syllabus is unchanged. See the [reward map](docs/learning-journey.md).
- **A desktop in the browser.** Each earned environment has its own panels, window decorations and icon theme.
  Open windows are saved, so your desktop comes back as you left it. Restart still plays GRUB and the boot log.
- **Terminal.** A bash-like shell in each window, with pipes, redirection, variables, globs, `&&`/`||`, Tab
  completion, history and line editing. Ctrl+Alt+T opens one from anywhere.
- **Installing software with apt.** `apt`, `apt-get` and `dpkg` behave like Ubuntu's: changing packages needs
  `sudo`, `apt update` fetches the package lists first, dependencies come along (and `apt autoremove` cleans
  them up), and installed programs land in `/usr/bin` with dpkg's database in `/var/lib/dpkg`. Packages to try:
  `cmatrix`, `tree`, `hello`, `cowsay`, `sl`, `neofetch`, `fortune-mod` and `jq`. A missing program says how to get it
  (`sudo apt install tree`), as on Ubuntu. Answer Y/n prompts in the terminal, preview installs/removals with
  `-s`, and stop the Matrix animation with Ctrl+C. Headless calls can pass `-y` or a piped answer.
- **Files and Text Editor.** A point-and-click file manager and an editor over the same filesystem. Both show
  real permission errors.
- **Plugins.** Discover and install Quick Notes, Focus Timer and Permission Explorer, or import your own
  self-contained plugin package through a graphical manager. Review permissions before installation, enable
  or disable plugins, export packages and remove them. Apps appear immediately in the desktop and launcher.
  Each plugin runs in a restricted iframe with access only to its approved private storage.
  See the [Plugin User Manual](docs/plugins.md) for step-by-step creation and installation, updates,
  permissions, troubleshooting and the package/SDK reference.
- **Learn Linux Filesystem.** A separate beginner guide with 27 short folder topics, file previews, quick checks and six configuration exercises. Open it from the desktop, Software or Files. The expanded virtual root tree includes system configuration, personal folders, logs and clearly labelled hardware/boot examples. Practice copies and backups live in `~/Documents/filesystem-lab`; progress is saved with the learner’s system. Existing saved files are preserved during the one-time layout upgrade. See [the filesystem guide](docs/filesystem-guide.md).
- **Learn Linux.** A complete, reviewed path with **34 lessons and 150 checked tasks in seven stages**:
  foundations, shell fluency, accounts and security, services, networking and storage, automation and recovery,
  and administrator assessments. Search or filter the syllabus, read explanations before exercises, pause and
  resume, and redo completed lessons. The curriculum works without AI and remains the default when AI is on.
  An optional personalized AI practice lab is available separately. Administration commands operate on a
  bounded training machine; workbooks for SSH, LVM, boot recovery and Bash scripting include companion VM
  exercises. Browser completion is not a professional certification. See [the curriculum guide](docs/linux-curriculum.md).
- **Learn Docker.** A simulated `docker` CLI (`run`, `ps`, `images`, `logs`, `exec`, published ports with
  `curl`...) with an AI-designed lab, or five built-in lessons when no AI is available.
- **chmod Arcade.** A 60-second game for reading and writing file permissions.
- **Vasu, the AI tutor.** A penguin who walks along the bottom of the screen and answers questions. He can see
  the screen and your recent commands. He can also use the computer: he moves his own pointer, clicks, types
  into his own terminal and opens apps. He runs as a normal user and has to ask for sudo, with your password,
  before he can act as root. Every action shows in the chat, and **Stop** (or Esc) takes control back.
- **Accounts required.** Sign up or sign in to save your system and learning progress to the API's database.
  There is no anonymous browser-only session. Existing local saves can migrate when creating an account with the same username.
- **Any AI provider, your own key, with an off switch.** Vasu and the AI trainers use a provider the learner
  chooses in **Settings → AI** (Groq, NVIDIA, OpenRouter, Google Gemini, Cerebras, Mistral, OpenAI, DeepSeek or
  Together; several have free plans), with the learner's own key and a model picked from the provider's list.
  The server has no key. A signed-in learner's settings are encrypted with a key only their password unlocks, so
  the API stores encrypted settings. The **AI features** switch is
  off until the learner turns it on. With AI off, nothing is sent to an AI: the courses teach their built-in
  lessons and Vasu answers from his offline guide. *AI is currently switched off on the live site while it is
  rebuilt (`AI_FEATURES`).*

### Software shop and desktop extensions

After earning the KDE desktop, open **Software** for a Discover-inspired collection of eight terminal programs, with previews, categories, search, install/remove controls, package details and optional command explanations. **Try it** opens a terminal and runs the example once. The shop calls the same simulated `apt` commands as the terminal, including dependency resolution and package locks, and reads the same dpkg database. Changes from either interface update the shop live and use the normal TuxOS save.

After lesson 26, **Plugins** includes visual previews, release notes, catalog updates, four pinnable widgets and Theme Studio’s three desktop palettes. Widget position and size persist, and widgets keep the existing sandbox and private-storage model. Themes can be reset in Settings. See the [plugin manual](docs/plugins.md#desktop-widgets-and-appearance-presets) for usage and the optional authoring fields. This is a browser-based practice repository, not access to the full Ubuntu or native Omarchy catalogs.

## Architecture

TuxOS is a TypeScript monorepo (npm workspaces). The "Linux" is a simulation written for teaching, not a real
Linux kernel. It models the parts a learner touches: users, file ownership, permission bits, root and sudo.

```
apps/web      React desktop (Vite, xterm.js)
apps/api      Node API: AI tutor and trainers, accounts, saves
packages/     kernel, sdk, shell, lessons, module-host, system, tutor, course-view, appearance
modules/      terminal, files, editor, settings, apt, learn-linux, learn-docker, chmod-arcade, about
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
  service and checks `/api/health`. If the check fails, it switches back to the previous release. The last five
  releases are kept.
- **Server:** Caddy serves `/opt/tuxos/current/web` and forwards `/api/*` to the API's Unix socket
  `/run/tuxos/api.sock` ([`deploy/Caddyfile`](deploy/Caddyfile)). The API runs as the unprivileged `tuxos` user
  ([`deploy/tuxos-api.service`](deploy/tuxos-api.service)), with settings in `/etc/tuxos/tuxos.env` and the
  database at `/var/lib/tuxos/tuxos.db`. `TRUST_PROXY=1` makes rate limits use the visitor's IP.
- **One-time setup:** copy `deploy/` to the server and run `sudo bash deploy/setup-server.sh`. Add the Caddy
  site block and mounts, then add the GitHub secrets
  `DEPLOY_HOST`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` to a `production` environment.
- **Backup:** `sudo sqlite3 /var/lib/tuxos/tuxos.db ".backup /root/tuxos-backup.db"`. Saved API keys in a backup
  stay encrypted with each learner's password, so a backup can't reveal them either.
- **Manual rollback:** `ln -sfn /opt/tuxos/releases/<commit> /opt/tuxos/current`, then
  `sudo systemctl restart tuxos-api`. Logs: `journalctl -u tuxos-api`.

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
- Each state-changing action copies the whole state, which is fine at learner-sized filesystems.

## Credits

Built with [TypeScript](https://www.typescriptlang.org/), [React](https://react.dev/), [Vite](https://vite.dev/),
[xterm.js](https://xtermjs.org/) and [Vitest](https://vitest.dev/). Tests use Testing Library and jsdom. Fonts:
[Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL Open Font
License). Icon themes: GNOME (CC-BY-SA / GPL-3.0), Breeze (LGPL-3.0) and Papirus (GPL-3.0), used unmodified;
see [`apps/web/public/icons/CREDITS.md`](apps/web/public/icons/CREDITS.md). The AI features use the
[OpenAI chat-completions format](https://platform.openai.com/docs/api-reference/chat), which every supported
provider accepts.

The development history is in [CHANGELOG.md](CHANGELOG.md).
