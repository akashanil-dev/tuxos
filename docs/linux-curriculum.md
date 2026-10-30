# Linux curriculum guide

Learn Linux opens a reviewed, offline-capable curriculum by default. The optional AI practice lab remains separate from its saved progress. Use **Full syllabus** to leave a lesson, then **Continue** to resume. **Redo** restarts a completed lesson. Select a stage, search a topic, or expand a lesson to see its objectives and companion VM exercise.

## Coverage

34 lessons, 150 checked browser tasks, seven stages. The suggested minutes describe guided study, not a promise of administrator proficiency. Companion VM work takes additional time.

| Stage | Lessons | Browser tasks |
| --- | ---: | ---: |
| 1 · Linux foundations | 7 | 27 |
| 2 · Shell fluency | 5 | 21 |
| 3 · Accounts and security | 4 | 18 |
| 4 · Services and operations | 5 | 23 |
| 5 · Networking and storage | 5 | 22 |
| 6 · Automation and recovery | 5 | 21 |
| 7 · Administrator assessments | 3 | 18 |

## Lab types and completion

- **Terminal:** acts on the same virtual filesystem as Files and Text Editor.
- **Sandbox:** practices administration against a separate, persistent training machine. Services, accounts, processes, routes, capacity, firewall rules and cron schedules are models. No host commands or network requests run. Training accounts cannot log in to the desktop or own its files. Capacity values are fixed fixtures; cron stores schedules without a clock executor. `lab reset` resets this machine without deleting lesson progress or practice files.
- **Workbook:** reviews configuration and recovery procedures in virtual files. Boot recovery, SSH authentication, partitioning, LVM/RAID, network mounts, complete Bash scripts and configuration management must be performed on a disposable VM to demonstrate execution skills.

The three capstones assess service recovery, account provisioning and data restoration in the simulator. Each also describes an independent VM assessment. Completing browser tasks does not mark VM work as done and does not award a professional certificate.

`tar` in the simulator snapshots virtual text files into a JSON teaching format. It supports `-cf`, `-tf` and `-xf ... -C`, not compression, metadata preservation or real tar interoperability. Use real tar in the VM for portable archives. Other administration commands expose their supported subset with `--help`; unsupported operations fail explicitly.

## Lesson inventory

| Lesson | Lab type | Tasks | Suggested minutes |
| --- | --- | ---: | ---: |
| First words with the shell | terminal | 3 | 20 |
| Moving around | terminal | 4 | 20 |
| Making, copying and removing | terminal | 5 | 20 |
| Reading and searching | terminal | 4 | 20 |
| Pipes: chaining commands | terminal | 3 | 20 |
| Permissions and sudo | terminal | 4 | 20 |
| Installing software with apt | terminal | 4 | 20 |
| Absolute paths and the Linux directory tree | terminal | 4 | 25 |
| Quoting, wildcards and safe filenames | terminal | 4 | 25 |
| Environment variables and exit status | terminal | 5 | 25 |
| Operational reports with text pipelines | terminal | 4 | 25 |
| Checkpoint: prepare an operations handover | terminal | 4 | 30 |
| Meet the administration sandbox | sandbox | 4 | 25 |
| Provision users and supplementary groups | sandbox | 5 | 25 |
| Directory permissions and least privilege | terminal | 4 | 25 |
| SSH configuration and layered hardening | workbook | 5 | 25 |
| Processes, signals and graceful shutdown | sandbox | 4 | 25 |
| Service lifecycle and boot enablement | sandbox | 5 | 30 |
| Journal investigation and incident evidence | sandbox | 5 | 25 |
| Package inventory and maintenance | terminal | 5 | 25 |
| Boot chain and recovery planning | workbook | 4 | 25 |
| Addresses, routes and DNS diagnosis | sandbox | 4 | 25 |
| Listening ports and firewall policy | sandbox | 6 | 25 |
| Capacity, inodes and memory pressure | sandbox | 4 | 25 |
| Filesystems, mounts, LVM and RAID | workbook | 4 | 40 |
| Shared storage and mount permissions | workbook | 4 | 25 |
| Create, inspect and restore a backup | sandbox | 5 | 35 |
| Schedule recurring work with cron | sandbox | 4 | 25 |
| Design reliable shell scripts | workbook | 4 | 40 |
| Configuration changes and rollback | terminal | 4 | 25 |
| Monitoring, alerts and incident reports | terminal | 4 | 25 |
| Capstone: bring a web service online | sandbox | 6 | 45 |
| Capstone: onboard an operations teammate | sandbox | 6 | 45 |
| Capstone: restore data and hand over a server | sandbox | 6 | 60 |

## Teaching and assessment

Each task has a pre-exercise explanation, an objective, hints, a verification condition and a replayable solution. Checks inspect successful command evidence, output, files or modes, as appropriate. Expected failures (permission denied, an inactive service) are explicitly checked as such. Only learner events count; tutor demonstrations do not complete tasks.

Existing seven-lesson progress is reconciled with current content by stable task IDs. New lessons do not erase completed work. Resuming keeps practice files; redoing a completed lesson resets its task progress. AI practice progress is stored separately. Administration scenarios deliberately begin with `lab reset` where clean state is required.

## Authoring and verification

Content is in `modules/learn-linux/src/course.json`. Preserve lesson and globally unique task IDs when changing content. Add stage, duration, labKind, outcomes, teach, setup, checks, solution and companion VM instructions. A solution has exactly one action for each task. Include the required modules in replay tests.

The administration subset is in `modules/learn-linux/src/admin.ts`; it must remain isolated from the host. Tests cover privilege checks, state transitions, persistence, invalid operations, archive traversal, saved-course migration, redo and every lesson solution. Run `npm run check` and `npm run build` after changes. Check the syllabus and a lesson in the browser as well: command registry conflicts can arise only when all desktop modules load together.

## Reference material

The in-app lessons link to primary documentation for further study:

- [Ubuntu Server documentation](https://documentation.ubuntu.com/server/)
- [Ubuntu user management](https://ubuntu.com/server/docs/security-users/)
- [GNU Bash manual](https://www.gnu.org/software/bash/manual/bash.html)
- [systemctl manual](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [crontab file format](https://man7.org/linux/man-pages/man5/crontab.5.html)
