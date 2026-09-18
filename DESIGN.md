# brano-notes

Everything specific to this app: who it's for, what it's built from, how it
ships, and what it records. General coding rules live in `CLAUDE.md`.

## Who this is for

brano-notes is a Windows desktop app for editing long-form essays. It has exactly one user: an elderly relative who has used computers for 20+ years but has no firm grasp of opening and saving files, and is shaky on copy/paste.

These constraints are the specification. Without them there'd be no reason to build this instead of using one of the many existing editors, so state them plainly and specifically — a vague constraint can't be designed against. Expect this list to grow.

Every design decision follows from this:

- He should never see a file dialog, a filesystem path, or the word "save".
- His work must never be lost. Autosave is the only save.
- No jargon in UI text. No modal that can be dismissed into a wrong state.
- Errors are our problem, not his — recover silently where possible; never surface a stack trace, error code, or a question he can't answer.
- Files live in a Dropbox folder so they're backed up and synced. He must never need to know that.
- He uses several machines, including old ones, and tends to reach for the slowest. Assume a 4GB spinning-disk laptop: keep the renderer lean and don't pull in heavy UI or editor libraries.
- Because several machines sync the same folder, Dropbox *will* eventually produce conflicted copies (`essay (Brano's conflicted copy 2026-09-18).md`). Detect them, never show him that filename, and resolve them without asking him to choose between two files he can't tell apart. This is the most likely way he loses work.
- A laptop left off for months comes back running an old build. An older version must never corrupt a file written by a newer one, so keep the on-disk format boring and forward-compatible.
- Only ever one instance. When nothing appears to happen he will click the icon again, and two copies autosaving into the same folder race each other.

When the tradeoff is between "powerful" and "impossible to get wrong", choose impossible to get wrong.

## Stack

- Electron + TypeScript. The Electron version is pinned deliberately: the app is local-files-only with no network and no untrusted content, so there is no pressure to chase Chromium updates. Don't upgrade it without a concrete reason.
- Storage sits behind one small async interface with two implementations: a mock backed by `localStorage`, for developing the UI in a plain browser, and the real one over IPC to the main process. The interface is async in both, so call sites never change when they're swapped.
- Keep Electron APIs (`app.getPath`, `dialog`, …) at the edges. Core logic takes paths as parameters so it runs — and can be tested — under plain Node.
- Target Windows 10 and later, so there's no Electron version ceiling. (Electron 23+ dropped Windows 7/8; not a constraint for us.)
- Consider `app.disableHardwareAcceleration()` — on old Intel GPUs it tends to fix rendering glitches as well as reduce load.
- Never use top-level `await` in the main process entry. It's an ES module, and Electron waits for that module to finish evaluating before emitting `ready`, so `await app.whenReady()` at the top level deadlocks: the app starts, opens no window, and prints nothing. Electron's stdout isn't attached to the terminal on Windows, so this failure is completely silent — trace to a file when debugging startup.
- Failing to write a file is the one error that must never be silent internally, even though the user never sees it. Log it and retry.

## Distribution

- Public GitHub repo (`danilom/b-notes`), single `main` branch. No secrets in it, and nothing identifying: the Dropbox folder location comes from config or first-run detection, never a hardcoded path.
- Packaged with `electron-builder` (NSIS); updates via `electron-updater` pointed at GitHub Releases. No tokens, no signing certificate.
- Unsigned is deliberate. The initial install is done in person, so the one-time SmartScreen prompt is absorbed then; later updates are fetched by the app itself and carry no Mark-of-the-Web, so they apply silently. The tradeoff is that `verifySignature` is skipped and integrity rests on HTTPS.
- Updates must be invisible: `autoDownload: true`, `autoInstallOnAppQuit: true`. Never prompt him to install, and never call `quitAndInstall()` while he's editing. `autoRunAppAfterInstall` is off — he closed the app because he was finished, and a window reappearing on its own looks like the computer acting unprompted.
- The update host must support `Accept-Ranges`, or electron-updater can't do a differential download and falls back to fetching the whole installer — 106MB instead of roughly 1MB for a small fix. GitHub Releases supports it; check before moving to any other host.
- Updates are silent, so a broken updater is silent too. Everything electron-updater reports is routed into the log file; that's the only place it will ever surface.

### Shipping a new version

1. Bump `version` in `package.json` and commit. electron-updater compares versions, so an unbumped build is invisible to it.
2. `npm run dist` builds the installer locally into `release/` without publishing. Test it.
3. **Tag that commit and push the tag** (`git tag -a v0.1.3 -m "Version 0.1.3" && git push origin v0.1.3`). GitHub refuses to create a non-draft release without an existing tag, and `releaseType: release` means ours are never drafts. Skip this and electron-builder tags the *default branch* instead, producing a release that points at code you didn't build.
4. `npm run release` builds and uploads. Needs `GH_TOKEN` in the environment, a token with `public_repo` scope. That token is only for uploading — the app reads public releases anonymously and none is ever bundled into it.
5. **Check the release actually has all three assets**: the installer, its `.blockmap`, and `latest.yml`. electron-builder runs two publishers in parallel and they interfere; it has twice uploaded an incomplete set while reporting success, dropping a different file each time. A missing `latest.yml` means no client can update at all; a missing `.blockmap` silently costs a full 106MB download instead of a differential one. If anything is absent, upload from `release/` by hand — those files are internally consistent, so don't rebuild, because a rebuild changes the installer's hash and desyncs it from what's already uploaded:

   `gh release upload v0.1.3 release/*.exe release/latest.yml release/*.blockmap --clobber`

6. Expect up to a minute of 404s on the asset URLs afterwards; that's CDN propagation, not a failed upload.

## Logging

Everything goes to a log file (`src/main/log.ts`, written under `userData/logs`,
pruned at 30 days or 10MB — whichever comes first, both configurable). Electron
detaches stdout on Windows, so anything not written to that file is invisible,
including during startup. Assume the log is the only account of what happened:
he reports problems by phone, vaguely, days later.

Log:

- Every significant operation — a note opened, saved, created, renamed; a
  conflicted copy detected or resolved; the notes folder being located.
- Every UI interaction except typing — buttons, selections, navigation.
- Every error, including ones recovered from silently. *Especially* those: an
  error he never saw is one he can't tell us about.

Don't log:

- Note contents, or fragments of them. His essays are private, the files get
  large, and the logs may eventually leave the machine (see `TODO.md`).
- Anything per-keystroke. Writes are synchronous so entries survive a crash,
  which makes them too expensive to do on a spinning disk at typing speed.

One file per run, named for its start time, pid and kind of run
(`brano-notes-2026-09-18-162537-31240-installed.log`), so a dev build and the
installed one can run together without interleaving, and each run reads as its
own story. The first line of every file repeats whether the run was `installed`
or `dev`.

Renderer code logs through the `window.log` bridge, which reaches the same file;
in a plain browser tab it falls back to the console. `logs.cmd` in the repo root
opens the folder in VS Code, since the path is otherwise awkward to reach.

A warning for anyone reading these logs through a tool that runs inside a
Windows Store/MSIX-packaged app: `%APPDATA%` is redirected copy-on-write into
that package's `LocalCache\Roaming`. Reads can return a stale snapshot while the
real file keeps growing underneath, which looks exactly like an app that has
stopped logging. Read the log from an ordinary Explorer window or shell when
what you're seeing doesn't match what the app should be doing.

## Testing

- Logic tests: `npm test` runs `node --test` directly against the TypeScript sources — Node strips the types itself, so there's no build step and no test framework. This is why `erasableSyntaxOnly` is on in `tsconfig.json`: enums and parameter properties would break it. Covers the storage layer and pure logic; keep these runnable without Electron.
- End-to-end: Playwright's Electron support (`_electron.launch()`) drives the real app window and can screenshot it. Keep this suite small — the critical path is "type → it persists → reopen → the text is still there". Spectron is archived; don't use it.
- Day-to-day UI iteration happens in a browser against the mock storage backend (`npm run ui`), not in a test suite.
