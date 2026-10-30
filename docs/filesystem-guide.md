# Learn Linux Filesystem

Open **Learn Linux Filesystem** on the desktop or from Software → Learn & explore. Files also has **Filesystem /**, **Home**, **Hidden files**, and a link to the guide.

The guide presents one folder at a time. Search a path or filename, read its purpose, inspect an actual virtual file, open a directory in Files, or run an `ls -la` inspection in Terminal. Each topic has one question, immediate feedback, and a Next button. Optional details stay collapsed.

The 27 stops cover the root, home and hidden preferences, `/etc` (including SSH, systemd and apt), `/usr`, traditional executable/library directories, `/opt`, logs and changing data, temporary/runtime directories, boot/device/kernel views, mounts, service content and administrator/recovery directories.

## Configuration practice

Six exercises teach hostname, hosts, KDE preferences, SSH policy, fstab fields and a systemd unit. The workflow is read → back up → edit → check. Each exercise has a goal, optional hint, editable text, validation feedback and a restore button. Unsaved edits prompt before leaving the exercise or closing the app window.

Only copies under `~/Documents/filesystem-lab/<exercise>/practice.conf` are changed. The original contents are kept in `practice.conf.bak`. Learners can inspect these files using Files or Terminal. Saves use the same filesystem and account persistence as other apps. Correct answers and completed labs are stored in `~/.local/state/tuxos/filesystem/progress.json`.

## Scope and compatibility

This is a representative teaching tree, not an entire Linux distribution. Files vary with the distribution and installed software. `/proc`, `/sys`, boot images, device entries and sample logs are static examples. Only `/dev/null` has device behavior. There are no native binaries, real mounts or symbolic links, and group permissions and sticky bits are not fully modeled. Real systems often merge traditional `/bin`, `/sbin` and `/lib` paths into `/usr`; this simulator uses directories.

Example configuration files do not control the host, networking, TuxOS appearance, or the separate administration sandbox. On real Linux, some configuration is generated and should be changed through its owning tool. The guide explains the distinction and recommends validation before applying real changes.

The versioned kernel upgrade adds missing sample files to older saved systems. It never replaces existing content, ownership or modes, and skips conflicting files. After upgrading once, files a learner deletes are not silently recreated on each boot. Package databases remain owned by the existing apt implementation.

References for further reading: [Debian beginner reference](https://www.debian.org/doc/manuals/debian-reference/ch01.en.html), [systemd filesystem hierarchy](https://www.freedesktop.org/software/systemd/man/latest/file-hierarchy.html), [Linux proc documentation](https://docs.kernel.org/filesystems/proc.html), and [Linux sysfs documentation](https://docs.kernel.org/filesystems/sysfs.html).
