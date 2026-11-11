# Save import and recovery

The top save bar opens **Import & backups**. It accepts a Tuxplore JSON export, the original `tuxos-save-v1` JSON, or a TuxOS backup. File selection and pasted JSON share the same converter. Source files remain unchanged.

## Tuxplore rules

- Preview the destination username, resulting progress, compatible package installations and every conflicting file/folder. Keep current files, use imported files, or retain both with a deterministic renamed copy. Individual choices override the default. Directory merges preserve extra destination files.
- Only the source learner’s home is merged. Current system identity, root files and configuration remain the destination’s. Missing adventure assets are supplied by Adventure’s existing preparation/recovery controls. Edited scripts remain text; serialized `run` metadata is never evaluated.
- Map `kde/gnome/retro/tiling` to `plasma/gnome/cde/hyprland`; preserve supported wallpaper, fast boot, game mode and sound when selected. Retain historical desktop availability in the import report.
- Keep earliest timestamps for completed quests/discoveries/commands and maximum game records. Choose partial adventure objectives explicitly, alongside the appropriate practice-file conflicts. Partial objectives are not unioned into invented completions. TuxOS Linux/Docker/filesystem course records remain untouched.
- Keep the original undifferentiated runner `best` as a labelled historical best. `rapidBest` and `infiniteHigh` retain their separate meanings. All eight puzzle IDs and ten quest IDs are mapped.
- Install supported package equivalents through the same dependency resolver, package files and dpkg database as apt. `fortune` maps to `fortune-mod`. Unsupported packages and track/field records are listed in the historical report; the unchanged source remains their recovery route.
- Full command history becomes a personal text file. New general terminals receive the last 100 commands, each bounded to 4096 characters; this does not truncate the retained history file.
- Home paths and ownership map deliberately when usernames differ. Personal text and command history are never globally replaced. Authentication fields and source analytics preferences are not adopted as consent or credentials.

The SHA-256 import identity is based on canonical portable save contents, excluding the export envelope’s timestamp and authentication fields. Repeating the same import is a no-op, even if JSON key order or the envelope date changed. Reports and provenance stay in the destination history. Unknown discovery IDs remain visible as historical records.

## TuxOS backups and account transfer

A TuxOS backup restores a whole system rather than merging independently saved course/lab states. The preview explains the replacement; a destination backup is mandatory. External backup plugins retain their files but start disabled, requiring explicit permission review to enable them. A locally authenticated guest-to-account transfer preserves the current system and its existing plugin consent; no legacy credential is used for authentication.

Differently named account transfer maps the primary user, home folder, ownership, structured terminal/window paths and defined fields in passwd/shadow/group/gshadow. Personal file contents, custom environment values and shell history stay unchanged. A destination name already belonging to another simulated user is refused. The browser source remains unchanged. Replacing an existing account keeps a browser recovery copy first; the account service’s revision check prevents overwriting a competing save.

The backup manager lists, downloads, previews/restores and explicitly deletes browser copies for the current learner. Earlier named account-transfer backup keys are also discovered. **Reset whole system** replaces all personal files, courses, scores, software and configuration; it requires a backup first. Adventure/package repair remains a separate, scoped operation.

## Transaction and input boundaries

- Parse at most 4 MiB, 100,000 JSON values and 80 nesting levels; reject reserved prototype keys. Filesystems allow at most 20,000 nodes and 32 folder levels. Validate filenames, node types, modes, modification times, identity, session and exploration structures before creating the destination kernel.
- Read snapshot versions 1 and 2; write version 2. Refuse unsupported versions and incompatible quest/draft structures. Validate both the 4 MiB save and the API’s 8 MiB encoded request limits. Oversized input/output is refused with an actionable explanation, without truncating source data.
- Check that the running destination still equals the preview, honour unsaved-editor leave guards, stop older writes, suspend mutations on the old kernel, write the backup and its index, then replace the target once. Overlapping transfers are refused. Failed backup/storage writes leave current work intact; startup failure attempts restoration. If both startup and restoration fail, retain the backup and pause writes.
- Browser backups use separate local storage even for account sessions. Quota failure stops replacement. They are not a server-side backup and clearing site data removes them; important copies can be downloaded.
- Opening the modal suspends the desktop, its shortcuts, Vasu and active games; background gameplay cannot continually invalidate its preview.

## Evidence

The integration milestone passes 617 tests in 73 files and a production build. Follow-up focused checks cover renamed authenticated transfer, the sign-in discovery race, disabled imported-plugin permission review, backup storage/index failure, stale preview, overlapping replacement, late shell writes, full reset and recovery. Converter fixtures cover fresh/partial/complete, all four desktops, old/new runner records, file conflicts, edited/missing files, unknown fields, malformed/reserved/traversal/deep/oversized input and repeat imports.

Browser verification imported the fictional partial fixture, retained both welcome-file versions, opened `Documents/personal.txt` with its original contents and mode 640, and showed Rapid 230 / Infinite 1400 / historical 120. Restoring the pre-import backup returned CDE, the original editor notes and Infinite 200; the imported-only personal file was absent, as expected. Both recovery copies remained available. See [import success](screenshots/import-success.jpg) and [restore drill](screenshots/restore-drill.jpg).

The original-origin export bridge is prepared under `deploy/tuxplore/` but has not been deployed. Browser-local export and authenticated legacy cloud export must remain accessible at the original origin before production retirement. No production data has been changed.
