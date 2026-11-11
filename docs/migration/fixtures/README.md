# Synthetic migration fixtures

Generated from the default state and filesystem of Tuxplore upstream commit `0da57ca0199aa9e21a6dee315894338c2e765430` on 11 November 2026. The fictional user is `explorer`. No real account, credentials, or personal data are included.

- `tuxplore-fresh.json`: default state and complete legacy filesystem.
- `tuxplore-partial.json`: first quest complete, next quest partial, learned commands, discoveries, game records and a user-created file.
- `tuxplore-complete.json`: completed adventure and puzzle history, all desktop entitlements, explicit wallpaper and fast boot.

These are conversion fixtures, not evidence that the gameplay was completed. Extend them with focused corrupt/conflict cases in tests. Preserve unsupported source data for recovery instead of silently dropping it. Quest progress uses positional boolean arrays; completion uses timestamps.
