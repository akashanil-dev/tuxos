# Exploration command and secret inventory

Tuxplore source: frozen upstream `0da57ca0199aa9e21a6dee315894338c2e765430`, `js/shell.js`, `js/apps/terminal.js`, `js/wm.js`, `js/boot.js`. All commands operate in the browser simulation.

| Legacy capability | Continuation behavior |
| --- | --- |
| help, man, whatis | Current registry descriptions, supported usage, examples and explicit teaching scope. `help COMMAND` opens its teaching manual. Windows and spelling suggestions never execute a replacement. |
| history, clear, exit/logout | Per-terminal bounded history, screen clearing, exit/logout closes that terminal. Other sessions keep running. |
| pwd, ls, cd, cat, mkdir, touch, rm, rmdir, cp, mv, chmod, find | Shared permission-aware filesystem. `cat -n` numbers lines; `find` supports a starting path, quoted `-name` glob and `-type`. `rmdir` atomically removes only empty directories. Root-recursive rm refuses visibly; `-f` suppresses missing-file errors, not permission errors. |
| less/more | Legacy teaching behavior retained: read into terminal scrollback. Not a real interactive pager. |
| grep, head, tail, wc, sort, uniq, tr, cut, rev, echo, pipes/redirection | Existing shared shell filters, also used by Pipe Dream; output remains copyable. |
| nano, vim, vi, nvim | Supported teaching editor interactions on the shared filesystem, with permissions, conflict detection and unsaved-work guards. Full Vim/nano plugin/command sets are outside the simulated subset. |
| apt/apt-get/dpkg, which | Existing deeper apt repository, dependencies, prompts, package files and Software app retained. Optional examples still require their package installation. |
| dnf, pacman | Explicit Fedora/Arch exercises; separate saved package records and scoped reset/restore. Runnable examples use `pkg-lab run`. Main desktop apt is unchanged. |
| ps/top/htop, kill/killall | Existing administration machine; top/htop show a process snapshot. PID 666 is a separate fictional discovery, not a replacement for course processes. User privilege is checked; PID 1 remains protected. |
| uname, hostname, date, uptime, df, free, env/printenv | Existing system/admin commands retained, missing date/uptime/printenv added. Uptime describes the browser practice session. No claim of real hardware diagnostics. |
| ping | Existing training network retained. Arbitrary real Internet traffic and invented successful pings are not performed. |
| xdg-open/open | Opens supported virtual apps and paths through the system app launcher; a text file opens in Editor, directories in Files. Legacy journal/runner/pipedream/installer/cheatsheet names map to native successors. No embedded old runtime. |
| reboot/shutdown/poweroff | Request simulated power actions through the desktop’s existing save and unsaved-work checks. Tutor actors cannot request power changes. |
| quest/hint | Native adventure status and hints; course `/hint` still targets its own active course. |
| fortune, cowsay, sl, neofetch, cmatrix | Existing package implementations retained. Added cowsay’s Tux figure. Matrix exit through Ctrl+C can earn its discovery without falsely recording a successful command. |
| lolcat | Missing program restored as an apt package. ANSI colour is only for terminal output; pipes and redirected files remain plain text. |
| make, tux | Sandwich joke with sudo and a friendly terminal message. No Makefile or host execution. |
| bash and executable adventure scripts | Only exact vetted gate/stairs assets have supported actions. `bash` reads those assets without requiring execute permission; ordinary execution still checks it. Imported serialized JavaScript is never evaluated. Unknown scripts produce an explicit limitation message. |

All 30 discovery IDs are retained. Trigger owners: exploration observer (boot/commands/pipes/theme/Files/Windows habits), adventure (half/all), Pipe Dream (all), runner (play/500/combo/map/Rapid/showcase), Try Linux, terminal editors, protected rm refusal, package Matrix, sandwich, fictional daemon, boot menu (memtest/recovery) and desktop (Konami). Boot discoveries are assigned only after a learner enters a session. Timestamps use first-award semantics; tutor activity does not earn them. Konami’s brief roll is skipped for reduced motion and never watches text entry. Memory-test and recovery screens explicitly describe simulations.

Verification status and actual test/browser results are recorded in [status.md](status.md). These documented replacements and simulation boundaries still need the approved formative user comparison before retirement.
