# Performance evidence and comparison beta

11 November 2026. This is a local engineering result, not evidence that people now prefer TuxOS. The baseline build is commit `2562174`; legacy source is upstream `0da57ca0199aa9e21a6dee315894338c2e765430`. Current samples were taken during Phase 6 after `5466f66`. Asset hashes in the JSON artifacts identify the measured build. Later metadata edits can change hashes and a few bytes.

## Measurements

Machine: Intel Core i5-1240P, 16 logical CPUs, approximately 16 GB RAM; Linux, Chrome 155 in the in-app browser; 1280 × 720 viewport. Production files served on separate loopback origins with gzip level 9. Fonts may already be cached. No network/CPU throttling. Host load was not isolated.

| Measure | Archived TuxOS | Continuation | Tuxplore |
| --- | ---: | ---: | ---: |
| Startup JavaScript, gzip 9 | 249,804 B | 170,631 B | 103,312 B transferred as encoded JS in browser |
| First navigation FCP | 252 ms | 244 ms | 272 ms |
| Repeat navigation FCP, three samples | 192 / 208 / 236 ms | 200 / 176 / 172 ms | 304 / 340 / 176 ms |
| Click to first desktop DOM, API unavailable | Could not enter | 139.2 ms | 33.3 ms |
| First Terminal content DOM | Not reachable in this scenario | 317 ms | 13.2 ms |

The continuation startup is 31.7% smaller than the archived TuxOS build. It remains larger than Tuxplore. Terminal code is deferred; the first open pays for that chunk. The measured delay justified Terminal-only prefetch on pointer/focus intent in common launchers, respecting Save-Data and 2G. It does not preload all apps at idle. There is no measured post-prefetch latency claim yet.

Repeated navigation re-downloads/revalidates files (`no-cache`, no ETag), so these are **not warm HTTP-cache samples**. First navigation to separate origins is also not proof of an empty browser cache. The probe sees rendered desktop/app DOM, not input readiness or the end of an animation. Tuxplore’s desktop splash continues after its early desktop DOM; its journal appeared at 653.6 ms. LCP values include staged boot content and are not a fair renderer-speed comparison. The archived application requires its account API; the comparison server intentionally returns 404 for every API. This is a controlled failure scenario, not a claim about production availability.

Read the raw [browser samples](performance-browser-samples.json), [baseline graph](performance-baseline-bundles.json), [current graph](performance-current-bundles.json), and [save CPU samples](performance-save-costs.json). Initial graphs use the same compressor; the original Phase 0 Vite estimate used a different calculation. No frame-rate, battery, mobile-hardware, true warm-cache, or live-AI claim is made.

The final release candidate adds public/recovery UI and the Hyprland window-group fix. Its [release graph](performance-release-bundles.json) is **171,109 gzip bytes**, a **31.5%** reduction from the archived build, within the 180,000-byte budget. Earlier browser samples remain identified as their own builds.

## Save cost and changes

The synthetic 3,000-file save is 3,551,486 bytes. In 50 Node samples after 10 warmups, the old clone-then-serialize export had a 12.039 ms median / 18.769 ms p95. Direct synchronous serialization has a 7.052 ms median / 10.924 ms p95. It captures an immutable string before storage starts and avoids exposing mutable state. Snapshot cloning for callers and atomic action rollback remain intact; save ordering, conflict detection and storage-switch tests still pass. These timings exclude browser storage and network latency and vary with host load/JIT.

Other changes: 2D Vasu default and optional lazy 3D; inactive/hidden runner loops and audio stop; drag previews stay local until commit; Pipe Dream evaluation is memoized; Files ignores stale directory reads and restores folder/view; app loading has a named status and retry boundary. Recovery suspends the desktop. Near-limit saves still make every mutating action copy a large state; profile lower-end devices before claiming that limit is smooth.

## Reproduce and hold future budgets

```sh
npm ci
npm run build
node scripts/performance/bundles.mjs apps/web/dist --check
node scripts/performance/save-costs.mjs
node scripts/performance/serve.mjs apps/web/dist 5182 current
```

Open `http://127.0.0.1:5182/?measure`, expand Performance readings, use normal controls, then Capture measurements. The probe only observes DOM/Performance entries, never reads saves, clicks controls, or sends analytics. Save its visible JSON alongside device/browser/build information. Serve an archived build on another port. Do not publish the probe as the product.

Budgets frozen for the next beta on this named machine: initial JavaScript ≤180,000 gzip-9 bytes (automated check); median click-to-usable guest desktop ≤500 ms, first Terminal ≤500 ms and subsequent opens ≤100 ms; command feedback ≤100 ms; p95 portable-save CPU ≤25 ms for the 3.55 MB fixture; no persistent animation loop for a hidden game. Usable/input timings, command feedback, drag/resize frame traces, true cold/warm HTTP-cache runs and idle CPU must be recorded with browser tracing before marking those budgets passed. DOM timings alone do not satisfy them. Investigate a >20% median regression on the same device and five runs. These budgets were set after the preserved-build comparison, not retroactively claimed as Phase 0 measurements.

## Human comparison protocol (not yet conducted)

Recruit 5–8 volunteers, including people who preferred Tuxplore and first-time learners. Ask permission before retaining notes or a sanitized export. Alternate product order. Use the same machine/browser and a fresh fictional system unless the person explicitly offers a migration copy. Do not collect passwords or private file contents.

1. Enter, choose a desktop and find a useful first activity.
2. Find a file, explain its contents and open Terminal in its folder.
3. Recover from a mistyped command without the observer taking over.
4. Follow a lesson with Files and Terminal beside it; switch focus view and return.
5. Solve one Pipe Dream level; play a Rapid round and try Infinite.
6. Reload and resume. For volunteers, export/import, inspect files, quests and records, then restore the pre-import backup.

Record: participant alias, experience, product order, device/browser/input type, task completion/time, wrong turns, requests for help, lost context, errors and exact reasons for preference. Ask what felt smoother and what they missed. Never infer preference from build size. Repeated blockers get an implementation fix and a repeat observation. Zero lost work is required. Blank observation records below are a template, not results.

| Participant / order | Task | Completed unaided | Time | Wrong turns / help / lost context | Preference and reason | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| To be observed | | | | | | |

Beta/retirement stays gated on these observations, real target-device interaction tests and volunteer migrations.
