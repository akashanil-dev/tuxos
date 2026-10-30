# TuxOS Plugin User Manual

Create, install, update and manage applications on the TuxOS desktop.

| Document information | Value |
| --- | --- |
| Audience | TuxOS users, plugin authors and project maintainers |
| Package format | `tuxos-plugin`, format version `1` |
| Last updated | 13 October 2026 |
| Ready-to-import example | [Hello Desktop](examples/hello-desktop.tuxos-plugin.json) |

## Contents

1. [Getting started](#1-getting-started)
2. [Install an available plugin](#2-install-an-available-plugin)
3. [Create your first plugin](#3-create-your-first-plugin)
4. [Build from source files](#4-build-from-source-files)
5. [Add your package to TuxOS](#5-add-your-package-to-tuxos)
6. [Permissions and private storage](#6-permissions-and-private-storage)
7. [Manage, update and share plugins](#7-manage-update-and-share-plugins)
8. [Package reference](#8-package-reference)
9. [Browser SDK reference](#9-browser-sdk-reference)
10. [Terminal command reference](#10-terminal-command-reference)
11. [Troubleshooting](#11-troubleshooting)
12. [Release checklist](#12-release-checklist)
13. [Runtime limits and security](#13-runtime-limits-and-security)
14. [Maintainer reference](#14-maintainer-reference)

## 1. Getting started

A **plugin** is a portable JSON package containing its identity, contributed apps, requested permissions and a self-contained HTML interface. It can add one to four apps to the desktop launcher. Interfaces can use inline HTML, CSS and JavaScript.

Open **Plugins** from the desktop or app launcher, or select **Settings → Open Plugins**.

| Area | Purpose |
| --- | --- |
| **Discover** | Browse available bundled plugins, search and filter by category. |
| **Installed** | Open, pin widgets, apply themes, enable, disable, export or remove plugins. |
| **Updates** | Review newer versions from the bundled catalog, with private data preserved. |
| **Add your own** | Import a package, paste JSON or start from a template. |

No programming tools are required to install plugins. Template editing requires basic HTML and JSON knowledge. The source-file workflow in section 4 additionally requires Node.js on your computer; this project supports **Node.js 22.18 or later**.

Plugins work for guests and signed-in users. Packages and private data use the normal TuxOS save. Guest saves stay in the current browser; account saves use the existing account synchronization system. Wait for a successful save before leaving.

> **Two filesystems:** **Choose package** selects a file on your real computer. TuxOS terminal paths and plugin storage belong to the simulated TuxOS filesystem. Selecting a computer file does not create it in the TuxOS home directory.

## 2. Install an available plugin

1. Open **Plugins → Discover**.
2. Find a plugin using **Search plugins** or the category filters, including **Widgets** and **Appearance**.
3. Select **Install plugin**.
4. Review its name, version, author, apps and requested permissions.
5. Select **I trust this plugin and approve these permissions.**
6. Select **Install plugin** in the dialog and wait for confirmation.
7. Launch its app from the desktop, or select **Installed → Open**.

Apps appear immediately; no restart is needed. Approval is required even when there are no storage permissions.

| Available plugin | Purpose | Storage permissions |
| --- | --- | --- |
| **Quick Notes** | Write and save a personal note. | `fs:read`, `fs:write` |
| **Focus Timer** | Start, pause and reset a 25-minute timer. | None |
| **Permission Explorer** | Explore Unix permission bits and octal values. | None |

**Discover** is an offline catalog shipped with TuxOS. Importing your own package adds it to your **Installed** list; it does not publish it to other users.

## 3. Create your first plugin

### Option A: Edit the built-in template

1. Open **Plugins → Add your own**.
2. Select **Use template** to populate **Package JSON**.
3. Change these fields:

   | Field | Example | Purpose |
   | --- | --- | --- |
   | `manifest.id` | `study-helper` | Stable package and private-data identity. |
   | `manifest.name` | `Study Helper` | Name in the plugin manager. |
   | `manifest.author` | `Your name` | Author attribution. |
   | `manifest.contributes.apps[0].id` | `study-helper-app` | Unique launcher app identity. |
   | `manifest.contributes.apps[0].title` | `Study Helper` | Launcher and window title. |
   | `html` | `<h1>My study helper</h1>` | Complete interface. |

4. Keep `version` at `1.0.0` and `capabilities` at `[]` for a first plugin without storage.
5. Select **Review package →**, approve the review and select **Install plugin**.
6. Open the app. Your heading should appear.
7. Use **Installed → Export package** to download the finished package.

IDs must start with a lowercase letter, contain only lowercase letters, digits and hyphens, and be at most 48 characters. Avoid built-in and already-installed identities. Keep your identities unchanged for future updates.

> **JSON editing:** Quotes, backslashes and newlines inside the `html` string must be escaped. JSON does not allow comments or trailing commas. For larger interfaces, use the source-file workflow so `JSON.stringify()` handles escaping.

### Option B: Import the working example

Save [Hello Desktop](examples/hello-desktop.tuxos-plugin.json) to your computer and follow section 5. Open the app and select **Say hello**. It should show the current TuxOS username through the browser SDK.

The example uses different package and app IDs and a custom `hello.html` entry. An app ID does not need to equal its package ID.

## 4. Build from source files

Use your **computer's terminal**, outside the simulated TuxOS terminal. This example requires Node.js and no npm packages.

### Step 1: Create a folder

```sh
mkdir hello-desktop
cd hello-desktop
```

Create three files:

```text
hello-desktop/
├── manifest.json
├── index.html
└── package.mjs
```

### Step 2: Create manifest.json

```json
{
  "id": "hello-desktop",
  "name": "Hello Desktop",
  "version": "1.0.0",
  "description": "My first TuxOS desktop application.",
  "author": "Your name",
  "entry": "index.html",
  "capabilities": [],
  "contributes": {
    "apps": [
      {
        "id": "hello-desktop-app",
        "title": "Hello Desktop",
        "icon": "🧩",
        "category": "Utilities",
        "defaultGeometry": { "width": 480, "height": 360 }
      }
    ]
  }
}
```

### Step 3: Create index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Desktop</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font: 16px/1.6 system-ui;
      background: #152034; color: #edf2f7; overflow-wrap: anywhere; }
    button { padding: 10px 16px; border: 0; border-radius: 8px;
      background: #8ed8bc; color: #10251f; font: inherit; cursor: pointer; }
    button:focus-visible { outline: 3px solid white; outline-offset: 3px; }
    button:disabled { opacity: 0.6; cursor: wait; }
  </style>
</head>
<body>
  <h1>Hello, TuxOS!</h1>
  <p id="message" role="status">Your plugin is ready.</p>
  <button id="hello" type="button">Say hello</button>
  <script>
    const button = document.getElementById('hello');
    const message = document.getElementById('message');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await tuxos.ready;
        message.textContent = 'Hello, ' + await tuxos.user() + '!';
      } catch (error) {
        message.textContent = 'Could not connect: ' + error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
```

Keep CSS and JavaScript inline. External scripts, stylesheets, fonts, fetch/XHR, nested frames and workers are blocked. Small images may use `data:` URLs. Build tools are optional, but their output must be a single self-contained HTML string.

Opening `index.html` directly in a browser previews layout only. The `tuxos` API is injected when running inside TuxOS.

### Step 4: Create package.mjs

```js
import { readFile, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const html = await readFile(manifest.entry ?? 'index.html', 'utf8');
const pkg = { format: 'tuxos-plugin', formatVersion: 1, manifest, html };
const output = JSON.stringify(pkg, null, 2) + '\n';
const bytes = Buffer.byteLength(output, 'utf8');

if (bytes > 256 * 1024) {
  throw new Error('Package exceeds the 256 KiB import limit.');
}

const filename = `${manifest.id}-${manifest.version}.tuxos-plugin.json`;
await writeFile(filename, output, 'utf8');
console.log(`Created ${filename} (${bytes} bytes)`);
```

Run:

```sh
node package.mjs
```

**Expected result:** `hello-desktop-1.0.0.tuxos-plugin.json` appears in the folder. This script assembles JSON and checks its file size. TuxOS performs full manifest and permission validation during import.

Distribute the generated JSON file. A ZIP archive, source folder, npm package, HTML file alone or manifest alone cannot be installed.

## 5. Add your package to TuxOS

### Import a file

1. Open **Plugins → Add your own → Choose package**.
2. Select your generated `.tuxos-plugin.json` file.
3. Review the details and requested permissions.
4. Select **I trust this plugin and approve these permissions.**
5. Select **Install plugin** and wait for confirmation.
6. Select **Installed → Open**, or launch the app from the desktop.

### Paste JSON

Copy the entire generated JSON document, including `format`, `formatVersion`, `manifest` and `html`. Paste it into **Add your own → Package JSON**, select **Review package →** and complete the approval dialog.

Validation and review do not execute the imported code. If its package ID is already installed, the dialog becomes an **update** review. Check the identity before approving a replacement.

**Success check:** The package is **Enabled** in **Installed**, its apps appear in the launcher and its interface opens.

## 6. Permissions and private storage

Storage access is disabled by default. Request only what your feature needs:

| Capability | Allows |
| --- | --- |
| `fs:read` | Read, list and inspect this plugin's private files. |
| `fs:write` | Create, overwrite and delete this plugin's private files. |

Neither capability permits access to other plugins, the user's general filesystem, account credentials or API keys.

For a note-taking plugin, replace the manifest's capabilities field with:

```json
"capabilities": ["fs:read", "fs:write"]
```

This is a field inside `manifest.json`, not a complete JSON document. Rebuild and review the update before using the new permissions.

Use relative paths such as `note.txt` or `drafts/first.txt`. Create parent directories before writing. Parent traversal and access outside the plugin's storage are rejected.

```js
async function loadNote() {
  try {
    return await tuxos.storage.read('note.txt');
  } catch (error) {
    if (error.code === 'ENOENT') return ''; // No saved note yet.
    throw error; // Report other failures in the interface.
  }
}

async function saveNote(text) {
  await tuxos.storage.write('note.txt', text);
  // Show "Saved" only after this promise resolves.
}

async function createDraft(text) {
  await tuxos.storage.mkdir('drafts');
  await tuxos.storage.write('drafts/first.txt', text);
}
```

Connect these functions to your interface and show rejected promises as visible errors. Debounce autosave and display saving/saved/error states. Do not depend on a final asynchronous write during window close.

Private data follows the **package ID**. Updates, disabling and ordinary removal preserve it. Reinstalling the same ID reconnects the data; a new ID creates a separate storage area. Package export does **not** export private data.

## 7. Manage, update and share plugins

### Enable or disable

Select **Installed → Disable** to close the plugin's windows, remove its apps and commands from use, and revoke active bridge access. The package and data remain saved.

Select **Review & enable** to approve permissions again and restore its apps.

### Install an update

1. Keep the same package ID and existing app IDs.
2. Increase `version`, for example `1.0.0` → `1.0.1`.
3. Rebuild and test against existing saved data.
4. Import through **Add your own**.
5. Review changes, approve and select **Update plugin**.
6. Reopen the app; existing windows close during replacement.

Data is retained. Downgrades are rejected. Same-version replacement is supported for local development; published releases should use a new version. Updates are not automatic. A newer bundled version offers **Review update** in **Discover**.

### Export and share

Select **Installed → Export package**. Share the downloaded JSON file; recipients import it through **Add your own**. Exports contain the manifest and HTML, with no private data or approval record.

The author field is self-reported. There is no signature verification or public upload service. Making a package available in **Discover** for everyone requires a maintainer to update the bundled catalog and release TuxOS.

### Remove

Select **Installed → Remove**. Leave **Also delete this plugin's saved data** unchecked to retain data for reinstall. Select it only to permanently delete private data, then select **Remove plugin**.

Windows close and apps/commands disappear immediately. The removal must save successfully to persist across sessions.

## 8. Package reference

### Outer document

| Field | Required value |
| --- | --- |
| `format` | Exactly `"tuxos-plugin"`. |
| `formatVersion` | Number `1`, not string `"1"`. |
| `manifest` | Manifest object described below. |
| `html` | Non-empty HTML string without NUL characters. |

### Manifest

| Field | Required | Rules |
| --- | --- | --- |
| `id` | Yes | Unique package ID; lowercase letter first, then lowercase letters, digits or hyphens; maximum 48 characters. |
| `name` | Yes | Display name, 1–80 characters. |
| `version` | Yes | Numeric `major.minor.patch`, without leading zeroes or prerelease suffixes; each component at most eight digits. |
| `description` | No | Up to 500 characters. |
| `author` | No | Up to 100 characters. |
| `icon` | No | Package icon, up to 32 characters. Apps still require their own icons. |
| `entry` | No | Simple `.html` filename; defaults to `index.html`. Stem starts with a letter/digit, then letters, digits, underscores or hyphens; maximum 48 characters. No paths or URLs. |
| `capabilities` | Yes | Array containing only `fs:read` and/or `fs:write`, without duplicates; `[]` is allowed. |
| `contributes.apps` | Yes | One to four app definitions. |
| `contributes.commands` | No | Up to four launcher command definitions. |

Names and descriptions cannot contain control characters. `constructor` and `prototype` are invalid IDs. Built-in identities and existing app/command registrations are reserved. Collision checks run before an installed package is replaced.

### Apps

| Field | Required | Rules |
| --- | --- | --- |
| `id` | Yes | Unique app ID using package ID syntax. |
| `title` | Yes | Display title, 1–80 characters. |
| `icon` | Yes | Icon name or text/emoji, 1–32 characters. |
| `category` | No | Up to 40 characters; defaults to `Utilities`. |
| `description` | No | Up to 500 characters. |
| `defaultGeometry` | No | Integer `width` 240–1600 and `height` 160–1200 pixels. |

All apps in a package use the same HTML entry. There is no per-app entry or browser SDK method to identify which contributed app opened the document.

### Optional commands

Add this field inside `contributes`, alongside `apps`:

```json
"commands": [
  { "name": "hello-desktop", "summary": "Open Hello Desktop", "usage": "hello-desktop" }
]
```

`name` uses ID syntax. `summary` is required and limited to 160 characters; `usage` is optional and limited to 160 characters. Commands launch the package's **first app**. They do not execute author-supplied shell or host code.

## 9. Browser SDK reference

TuxOS injects read-only `window.tuxos` before your scripts. Methods return promises unless stated otherwise. Calls wait for the bridge automatically; `await tuxos.ready` is useful during initialization.

| API | Purpose | Permission |
| --- | --- | --- |
| `await tuxos.ready` | Wait for the host connection. | None |
| `await tuxos.user()` | Return the current TuxOS username. | None |
| `await tuxos.hostname()` | Return the simulated hostname. | None |
| `await tuxos.storage.read(path)` | Return a file's text. | `fs:read` |
| `await tuxos.storage.list(path)` | List a private directory; defaults to `'.'`. | `fs:read` |
| `await tuxos.storage.write(path, content)` | Create/overwrite a text file and save it. | `fs:write` |
| `await tuxos.storage.mkdir(path)` | Create a directory, including missing parents. | `fs:write` |
| `await tuxos.storage.remove(path)` | Recursively delete a file or directory; cannot remove the storage root. | `fs:write` |
| `await tuxos.subscribe(listener)` | Subscribe to own event summaries; returns an unsubscribe function. | None |
| `await tuxos.dispatch(type, payload)` | Invoke a permitted lower-level filesystem action. | Depends on action |

```js
const unsubscribe = await tuxos.subscribe(({ seq, type, ok }) => {
  console.log('Plugin event:', seq, type, ok);
});

// Call when events are no longer needed.
unsubscribe();
```

Events summarize this plugin's own actions with sequence, type and success status. They do not stream file contents or action payloads.

Lower-level actions are restricted to `fs.read`, `fs.stat`, `fs.list`, `fs.write`, `fs.mkdir` and `fs.remove`. For example, `await tuxos.dispatch('fs.stat', { path: 'note.txt' })` inspects a private file. The same permission and path checks apply.

Use `try/catch`. Host errors carry `error.code` where available, such as `ENOENT`, `EACCES`, `ENOSPC`, `EBUSY` or `EIO`. Timeouts may have only a message. The handshake times out after eight seconds; requests time out after ten seconds. Reopen the app after a lost or revoked connection.

## 10. Terminal command reference

Run these in the **TuxOS learner's system terminal**. Plugin management is unavailable in the tutor terminal. File paths refer to the simulated filesystem.

| Command | Action |
| --- | --- |
| `plugin list` | List installed IDs, versions and statuses. |
| `plugin info hello-desktop` | Show details and requested permissions. |
| `plugin install ./hello-desktop.tuxos-plugin.json` | Install a package that requests no storage permissions. |
| `plugin install ./hello-desktop.tuxos-plugin.json --allow` | Approve requested storage permissions and install. |
| `plugin install ./hello-desktop.tuxos-plugin.json --allow --replace` | Replace an existing package after reviewing its contents. |
| `plugin disable hello-desktop` | Disable and close windows. |
| `plugin enable hello-desktop --allow` | Approve re-enabling. |
| `plugin remove hello-desktop` | Remove while retaining private data. |
| `plugin remove hello-desktop --delete-data` | Remove and permanently delete private data. |

First save the complete package JSON into a virtual file using the TuxOS text editor to use a package path. For computer files, use **Choose package** instead. HTTP URLs are unsupported. `--allow` approves all requested permissions, so inspect the package first. Enabling always requires `--allow`, even with no storage permissions.

## 11. Troubleshooting

| Symptom | Cause and resolution |
| --- | --- |
| Invalid JSON | Remove comments/trailing commas, escape HTML correctly or rebuild using `JSON.stringify()`. Copy the entire generated file. |
| Expected package with formatVersion 1 | Import the outer package, not just a manifest. Use `"tuxos-plugin"` and numeric `1`. |
| Package exceeds 256 KB | Reduce embedded assets and unused code. Size is measured in bytes, not characters. |
| Invalid ID or registration collision | Follow section 8 and choose unique identities. Preserve your existing IDs for updates. |
| Version rejected | Use numeric `major.minor.patch` and avoid downgrades. |
| Approval button disabled | Review the package and select the trust checkbox if you approve. |
| App absent from launcher | Check **Installed** for disabled/invalid state or an incomplete installation. |
| `tuxos is not defined` outside TuxOS | Import the package to test SDK features; a standalone browser does not inject the SDK. |
| Missing external styles/scripts/images | Inline CSS/JavaScript and use small `data:` images. External loading is blocked. |
| `EACCES` or access denied | Check capabilities, approval and enabled state. Use private paths and permitted actions. |
| `ENOENT` | File or parent directory does not exist. Treat an initial missing save as empty; create parent directories before writing. |
| `ENOSPC` or quota error | Reduce package/data size or remove unused content. Both plugin quotas and account save limits apply. |
| `EBUSY` or too many requests | Debounce inputs, serialize writes and avoid tight polling loops. |
| “saving failed” or `EIO` | Keep the session open, address the reported save failure and select **Retry saving** when offered. Retry failed plugin writes before reporting success. |
| Account save conflict | Use the account conflict recovery flow. Preserve current work before loading another saved state. |
| Connection timeout after update/disable | The old bridge is revoked. Close/reopen the app and review enablement if needed. |
| **Needs attention** | Read the displayed error. Remove the invalid package while retaining data, then import a known-good package. |
| Legacy package disabled | Use **Review & enable** if valid, or import a current complete package. |

A failed save may leave a change present only for the current session. Do not assume installation, removal or a private write survives reload until saving succeeds.

## 12. Release checklist

Before distributing a package:

- [ ] Choose stable, unique package, app and command IDs.
- [ ] Set a new numeric version and accurate author, name and description.
- [ ] Request only necessary permissions and explain their purpose.
- [ ] Embed UI assets; remove secrets, API keys and debug data.
- [ ] Check keyboard access, visible focus, contrast and narrow-window layout.
- [ ] Display loading, empty, saving and error states; handle rejected SDK calls.
- [ ] Test fresh installation, each app and any launcher command.
- [ ] Verify saved data after reopening and after reloading TuxOS following a successful save.
- [ ] Test disable/enable, update, removal with retained data and reinstall.
- [ ] Test permanent deletion using disposable data only.
- [ ] Export/import the final package and confirm it contains no private data.
- [ ] Share release notes and any saved-data migration requirements.

Updating a package does not automatically migrate its private files. Handle format changes deliberately and preserve recoverable data.

## 13. Runtime limits and security

### Limits

| Resource | Limit |
| --- | --- |
| Package file / validated JSON | 256 KiB; non-ASCII text may use multiple UTF-8 bytes per character. |
| Installed packages | 24, totaling 1 MiB of package storage. |
| Apps / launcher commands per package | Four each. |
| Private data per package | 128 KiB, 128 entries, eight directory levels. |
| Private data across packages | 1 MiB, 2,048 entries, including data retained after removal. |
| Private path / component length | 2,048 / 255 characters. |
| RPC request / response | 64 KiB / 256 KiB. |
| Requests per frame | 60 per second; four concurrently. |
| Pending SDK calls / event listeners | 32 each. |

Package and private-data quotas are separate. The **Plugin packages** meter shows code/package storage, not saved notes. The account's overall saved-system limit also applies.

### Trust model

Install packages from authors you trust. An author name is an attribution claim, not a verified identity. This runtime supports user-reviewed, trusted-author packages.

Plugins run in `sandbox="allow-scripts"` iframes without `allow-same-origin`. Content policy restricts external resources/connections, forms, nested frames, workers and base URL overrides. Camera, microphone, geolocation, payment, clipboard and fullscreen are disabled. Bridge requests are bound to the frame and document channel. Disable, removal and update revoke previous bridge authority.

The SDK cannot execute shell commands, grant root, change file permissions, install other plugins, manage windows or read account credentials/API keys. Approved filesystem operations stay inside the package's private storage.

An iframe is not an operating-system process isolation boundary. Arbitrary JavaScript can consume CPU/memory. Browser CSP does not universally prevent a frame from navigating itself to an external URL before the host observes its next load and revokes the bridge. This runtime does not provide complete network or denial-of-service isolation.

A public untrusted marketplace would need separate-origin hosting, signing/provenance, publication review/moderation, resource isolation and security testing. The current feature provides a bundled catalog and local imports, without public publication, signature verification or automatic updates.

Browser references: [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) and [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

## 14. Maintainer reference

### Saved-system layout

These are **virtual TuxOS filesystem** paths:

```text
~/.local/share/tuxos/
├── plugins/<package-id>/
│   ├── manifest.json
│   ├── <entry filename>
│   └── install.json
└── plugin-data/<package-id>/
    └── <private files>
```

The entry filename is the manifest's actual value, such as `index.html` or `hello.html`. `install.json` records enablement and approved permissions. Use the manager; manually copying a manifest does not replace package import and approval.

Lifecycle operations are serialized per session. Collision checks precede replacement, and installation/private-storage mutations use kernel transactions. Save failures remain visible. Reload reconciles unchanged packages without duplicate registration or window closure.

### Implementation map

| Source | Responsibility |
| --- | --- |
| [SDK package definitions](../packages/sdk/src/plugins.ts) | Schema, validation, capabilities and manager types. |
| [Plugin service](../packages/system/src/plugins.ts) | Installation, approvals, quotas, storage and lifecycle. |
| [RPC gateway](../packages/system/src/plugin-rpc.ts) | Frame-bound requests and event delivery. |
| [Document and browser SDK](../apps/web/src/desktop/plugin-document.ts) | Injected API and content policy. |
| [Plugin window](../apps/web/src/desktop/PluginWindowFrame.tsx) | Sandboxed frame and bridge lifecycle. |
| [Graphical manager](../apps/web/src/plugins/PluginManager.tsx) | Discovery, review and management. |
| [Bundled catalog](../apps/web/src/plugins/catalog.ts) | Available packages and starter template. |
| [Terminal command](../packages/shell/src/commands/plugin.ts) | Learner terminal management. |

To add an entry to **Discover**, a maintainer defines a valid self-contained package in `catalog.ts`, adds it to `PLUGIN_CATALOG` with presentation metadata, tests it and releases the application. Follow the existing entries. Local imports do not modify the bundled catalog.

### Project verification

Run on your computer from the repository root:

```sh
npm run check
npm run build
```

Coverage includes validation, approval, installation/update, conflicts, disable/enable, removal/reinstall, restoration, corrupted/legacy saves, session revocation, storage escapes/quotas, RPC binding/cleanup and graphical import/catalog workflows. Browser verification should also check actual iframe execution, handshake, persistence, immediate launcher changes and narrow-window layout.


## Desktop widgets and appearance presets

Four bundled apps can also live directly on the desktop: **Quick Notes**, **Focus Timer**, **World Clock** and **Konqi’s Linux Tips**. Install one, then choose **Pin to desktop** from its card or the Installed page. Drag its header to move it, or focus the move handle and press arrow keys. The **⤢** button switches between compact and large sizes; **×** unpins it. Up to eight widgets can be pinned. Placement and size are saved with the TuxOS session. Timers restart and clock timezone selections reset when their view reloads; saved notes stay in private plugin storage.

Disabling a plugin hides its widgets, with placement retained for re-enabling. Updates reload widgets. Removing a plugin unpins them. Windows and pinned widgets keep the same iframe restrictions and private-storage permissions.

**Theme Studio** includes Breeze Night, Violet Dusk and Northern Lights. Its gallery card shows static previews. After installation, choose a palette on the card or Installed page. Desktop window, menu and accent colours change; the wallpaper does not. Reset using **Reset desktop colours** in Plugins or Settings. Apps with their own fixed palettes, such as the terminal, retain those palettes.

The Updates page compares installed versions with the bundled catalog. Custom updates use the existing JSON import flow; TuxOS does not fetch updates from arbitrary URLs. These are TuxOS plugins, inspired by customizable Linux desktop workflows. Native Omarchy plugins, shell scripts and themes are not directly compatible.

Authors can opt an app into widgets using `"widget": true` inside its app contribution. Keep the layout responsive down to 240 pixels wide. A package can declare up to eight themes in `manifest.contributes.themes`, each with this shape:

```json
{
  "id": "my-night",
  "name": "My Night",
  "accent": "#88c0d0",
  "background": "#202630",
  "surface": "#303640",
  "foreground": "#eeeeee"
}
```

All four colours must be six-digit hexadecimal values. The host validates and renders these values. Themes are applied only by an explicit user action in Plugins; plugin JavaScript gains no desktop-control permission. Gallery previews never execute imported HTML. The existing format version remains 1; both contributions are optional.
