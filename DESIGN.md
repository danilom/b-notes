# b-notes

Everything specific to this app: who it's for, what it's built from, how it
ships, and what it records. General coding rules live in `CLAUDE.md`.

## Who this is for

b-notes is a Windows desktop app for editing long-form essays, built for one
specific person. **`TARGET-USER.md` describes him, how he works, what has gone
wrong before, and what the app therefore has to be.** Read it first — it is the
specification, and this file only covers what follows from it technically.
Unresolved questions about him are in `B-QUESTIONS.md`.

The consequences that shape the code:

- He should never see a file dialog or a filesystem path. The word "save" is fine in a sentence like "saved 2 minutes ago"; what's forbidden is requiring him to save.
- His work must never be lost. Autosave is the only save.
- No jargon in UI text. No modal that can be dismissed into a wrong state.
- Errors are our problem, not his — recover silently where possible; never surface a stack trace, error code, or a question he can't answer.
- Files live in a Dropbox folder so they're backed up and synced. He must never need to know that.
- He uses several machines, including old ones, and tends to reach for the slowest. Assume a 4GB spinning-disk laptop: keep the renderer lean and don't pull in heavy UI or editor libraries.
- Because several machines sync the same folder, Dropbox *will* eventually produce conflicted copies (`essay (Brano's conflicted copy 2026-09-18).md`). Detect them, never show him that filename, and resolve them without asking him to choose between two files he can't tell apart. Never hide one: until it is resolved, it is his writing. In practice an old name brought back by another machine's Resoph is far more common than a conflicted copy — see *His files are Resoph's* below.
- A laptop left off for months comes back running an old build. An older version must never corrupt a file written by a newer one, so keep the on-disk format boring and forward-compatible.
- Only ever one instance. When nothing appears to happen he will click the icon again, and two copies autosaving into the same folder race each other.
- A window he cannot see is, to him, work that is gone. Window behaviour is a data-safety concern here, not polish.
- About 1,200 texts in his live folder, 11 MB, the largest near 300 KB — twice what the first design assumed. Search is the primary way he finds anything, not scrolling.
- Assume his screen is warm. Windows Night Light (and any f.lux-alike) pulls blue down hard, so a palette that leans on faint tints falls apart on it — a two-point green tint arrives at the eye as amber. The chrome is therefore neutral and the colour is spent on the accent, and contrast is checked at 2400K as well as at 6500K. Never judge colour on a screen with it switched on without saying so.
- He writes Serbian in Latin script and frequently drops the diacritics (`sdzcc` for `šđžčć`). Search must match with or without them, in both directions, or he won't find his own writing.
- UI text is Serbian (Latin) and English, Serbian first. Keep every string in one place from the start — retrofitting that later is the expensive version.
- The app addresses him as *ti*, never *vi* — direct singular imperative, `Obriši` not `Obrišite`. It speaks ekavian (`pre`, not `prije`) even though he writes ijekavian: both read as ordinary Serbian to him, and ekavian is shorter, which matters in the narrow column beside his titles. Sample prose in the test corpus stays ijekavian — that stands in for his writing, not for the app's voice.
- He arrives with his whole corpus in ResophNotes' folder and format (below), already containing near-duplicate drafts of the same essay and many byte-identical copies. Migration is part of the versioning design, not a separate import chore.

When the tradeoff is between "powerful" and "impossible to get wrong", choose impossible to get wrong.

### His files are Resoph's

He writes in ResophNotes and will keep doing so until b-notes is clearly
better. Years of moving him to Simplenote, Notepad, GMail drafts and Obsidian
didn't stick. So b-notes lives beside Resoph — reading its folder, keeping its
own texts in a folder next to it — on three or four machines that sync through
Dropbox after long offline stretches. **Resoph goes on writing his texts, and
will for the foreseeable future.** The evidence behind everything in this
section is in `CORPUS-ANALYSIS.md`; the design is in `RESOPH-COEXISTENCE.md`.

**Resoph keeps a note's title in the filename and writes only the rest into the
file.** In Resoph the title shows as the first line of the note, and editing
that line renames the file. Opened directly, the file has no title: its first
line is his opening sentence, a section number or a note to himself. Of the
~890 files in his folder that Resoph last wrote, 25 have their title inside
them. The exceptions are texts from a 2023 Simplenote export that Resoph hasn't
rewritten since; those also carry the title as their first line. Confirmed by
hand in Resoph, on one file so far.

What follows:

- **b-notes reads his Resoph folder and writes only its own.** Every text in
  Resoph's folder is in his b-notes list, shown straight from Resoph's file.
  The first time anything changes one — an edit, a kept copy, deleting it —
  b-notes copies it into its own folder and works on the copy from then on;
  the Resoph file is left exactly as it was. Whatever he writes in Resoph turns
  up in b-notes, so b-notes is always the place that has everything, which is
  the reason to use it. Nothing goes back to Resoph. The design, and why not
  one shared folder, is in `RESOPH-COEXISTENCE.md`.
- **A Resoph note is its filename plus its file.** The title is the filename
  read through Resoph's escapes: `%2A` is `*`, `%3F` `?`, `%2F` `/`, `%5C` `\`,
  `%3A` `:`, `%09` a tab — shown as the first line, the way Resoph shows it,
  with the file's text under it. Taking the title from the file's first line
  shows him 1,200 opening sentences and a list he doesn't recognise, which is
  what 0.7.0 did.
- **In b-notes' own folder the title is simply the first line**, and a file
  keeps the name it was made with. So he can retitle freely — leading spaces
  and all — and nothing is ever renamed.
- **Every name on disk is valid.** More than a quarter of his names begin or end
  with spaces, and many carry escapes and marks. Explorer can't make these
  names, Windows 11 Notepad shows them as blank tabs, and Windows' own zip
  refuses them — but they are his titles, and none may be refused. 0.7.0
  refused them, and his edits to three texts never reached the disk.
- **His filing lives in his titles.** Leading spaces rank a text (more spaces
  sort higher), and so do `*` and `AA`; `(UP)` with a number orders a
  collection; `(E)` and `(P)` mark kinds; `zz` sinks; words in brackets give a
  status. It only works in title order. He does organise, constantly, but in
  his own way and never through a feature built for it.
- **The folder is a mirror of Resoph's own database, and Resoph puts back
  whatever it remembers.** Each machine's Resoph keeps every note in a database
  outside Dropbox (`%USERPROFILE%\.ResophNotes\`), and writes back any note whose
  file has gone — within minutes while it runs, and on its next start
  otherwise. A rename or delete made anywhere can be undone by any machine's
  Resoph. In the 0.7.0 test b-notes renumbered eight names at each start,
  Resoph wrote them back each time, and his list grew by nineteen texts in two
  hours. So **b-notes never renames, moves or deletes anything in his Resoph
  folder**, and renames nothing anywhere. What it does write there, it writes
  in place, which Resoph reads as it is: a stub over a text it takes over, and
  a text he moves back. **The stub is an on-disk format that lasts for good**:
  Resoph puts it back if it goes, and an old b-notes must know a new one. It
  is known by a frozen rule that never looks at its wording — every line
  starts with `[b-notes]` — set out in `resoph-stub.ts` and
  `RESOPH-COEXISTENCE.md` §4.5. Change the wording freely; never the rule. His own title edits in Resoph, undone by another machine's
  Resoph, are where most of his identical copies come from.
- **A name is made once, and made to mean one text on every machine.** Several
  machines work offline and Dropbox matches files by path alone. So a copy of
  a Resoph text is named from the Resoph file's exact name (the same on every
  machine), and a new text from the moment and machine it was started on
  (different on every machine) — `Pismo ~K3F9A2`, `Pismo ~2026-09-27 14-32-10
  Dell`. Never ` (n)`, and never decided by looking at what is in the folder.
- **What Resoph changes is brought in.** A Resoph text b-notes has copied is
  compared with its Resoph file whenever b-notes comes back to the front.
  Anything b-notes has already seen for that text is not news — which stops
  another machine's Resoph rolling it back. If only Resoph changed it,
  Resoph's becomes the text; if both did, the newer does, the other is kept
  as a version, and a line over the text says so until he has looked.
- **b-notes starts only once the other editors are closed.** While Resoph,
  Notepad or Obsidian is running, it waits behind one plain modal message and
  a button that closes them for him. Resoph's close button only hides it in
  the tray while its *minimize to tray* is on, so b-notes switches that off in
  Resoph's settings whenever Resoph is closed; until it has, Resoph is ended,
  once its files have been copied into `userData`. And again whenever he comes
  back to the window — having saved what he typed first — since opening one of
  them from Explorer and coming back is his ordinary habit. Never while he is
  writing: that would stop him mid-sentence.
- **His filenames will have to be cleaned up eventually**, and not by renaming
  in place, for the reason above. The shape recorded in `CORPUS-ANALYSIS.md`
  §9 is copying out into a folder of b-notes' own, once Resoph no longer
  writes the old one anywhere.

Where the app's own words go, on any screen that shows him something and asks
him to decide:

- **The line under the title says what to do here.** *Izaberi verziju da vidiš
  po čemu se razlikuje, pa je vrati ako želiš.* It is an instruction, so it is
  set at the same size as the note beside the button, not as fine print.
- **A line above a box says what that box is.** When it was saved, what is
  missing from it. These belong against the thing they describe — under the
  title they name something six inches away. Say only what the surface cannot:
  that a box will not take his typing is already carried by its tint, its
  border, the smaller type, the absent caret and the arrow over it instead of
  an I-beam, and a sentence saying so again is a line he reads every visit for
  something he learns once.
- **A line beside a button says what pressing it will do.** *Ova verzija
  postaje aktivni tekst.* Directly above it instead where he must not skim
  past it — a line to the side of a button reads as a footnote. The message
  b-notes holds him at while Resoph is open does this: *Klikni dugme ispod:
  b-notes će ih zatvoriti umesto tebe…*

Each of the three had drifted into the wrong slot at least once. The test is
whether the sentence is about the screen, about a thing on it, or about an act
— and then putting it where that thing is.

## Stack

- Electron + TypeScript. The Electron version is pinned deliberately: the app is local-files-only with no network and no untrusted content, so there is no pressure to chase Chromium updates. Don't upgrade it without a concrete reason.
- Storage sits behind one small async interface with two implementations: a mock backed by `localStorage`, for developing the UI in a plain browser, and the real one over IPC to the Electron process. The interface is async in both, so call sites never change when they're swapped.
- Keep Electron APIs (`app.getPath`, `dialog`, …) at the edges. Core logic takes paths as parameters so it runs — and can be tested — under plain Node.
- Target Windows 10 and later, so there's no Electron version ceiling. (Electron 23+ dropped Windows 7/8; not a constraint for us.)
- Consider `app.disableHardwareAcceleration()` — on old Intel GPUs it tends to fix rendering glitches as well as reduce load.
- Never use top-level `await` in the main process entry. It's an ES module, and Electron waits for that module to finish evaluating before emitting `ready`, so `await app.whenReady()` at the top level deadlocks: the app starts, opens no window, and prints nothing. Electron's stdout isn't attached to the terminal on Windows, so this failure is completely silent — trace to a file when debugging startup.
- Failing to write a file is the one error that must never be silent internally, even though the user never sees it. Log it and retry.

### Where code lives

| folder | runs where | holds |
| --- | --- | --- |
| `src/notes/` | everywhere | what a note is: the store, titles, naming, save decisions |
| `src/platform/` | everywhere | what a platform must provide: the filesystem contract, the log bridge, build identity |
| `src/language/` | everywhere | every word he reads, in both languages |
| `src/ui/` | everywhere | the screen he writes on: the list, the editor's search, the strip along the bottom |
| `src/ui/deleted-and-archived/` | everywhere | Obrisano and Arhiva: the strips under his list, the dialogs behind them, the way a text comes back |
| `src/ui/versions/` | everywhere | the copies kept of a text, and stepping through what changed |
| `src/ui/settings/` | everywhere | how the app looks and where it reads from, and what remembers both |
| `src/ui/dialogs/` | everywhere | the modal wrapper, the heading every dialog uses, and the general confirm |
| `src/hosts/electron/` | only the packaged app | lifecycle, the preload bridge, updates, the log file, the real filesystem |
| `src/hosts/mockup/` | only the browser | a pretend filesystem, and the test corpus it's filled with |

### Where his things are kept

| file | folder | why there |
| --- | --- | --- |
| his texts, as Resoph keeps them | his Resoph folder (Dropbox) | read and never written: Resoph puts back anything changed there |
| his texts b-notes has written | b-notes' folder, beside Resoph's (Dropbox) | backed up and synced; he never sees the path |
| `settings.json` | b-notes' folder | which letters and which colour are taste, and travel with him |
| `Obrisano/` | b-notes' folder | texts he has deleted, with what he wrote in them |
| `Verzije/` | b-notes' folder | what a text said before he emptied it or Resoph changed it; `Obrisano/Verzije/` once the text itself is put away |
| `screen.json` | `userData` | how big the letters are is the screen in front of him, not taste — syncing it would have one machine keep undoing the other |
| `session.json` | `userData` | which text he had open, on this machine |
| `folders.json` | `userData` | where his Resoph folder and b-notes' are, if someone chose; otherwise Resoph's own settings say, and b-notes' goes beside it |
| `resoph-copies/` | `userData` | Resoph's database, copied before b-notes ends Resoph; the ten newest |
| `logs/` | `userData` | ours, per machine, safe to delete |

Emptying the text is how he deletes — he never found Resoph's delete command —
and until now it was the one edit in the app that truly lost writing: the file
was overwritten with nothing and only the name survived. A version is kept
before an emptying lands, and if it cannot be kept the emptying does not happen.
Versions are plain `.txt`, readable in Notepad without this app, and nothing
ever writes to one after it is made.

Everything in `userData` is safe to delete: it costs him a window position and a
colour, never a word. Both settings files are written by laying the keys we know
over whatever is already in the file, so an old build coming back after months
cannot strip a setting a newer one wrote.

Everything above `hosts/` runs in both; `hosts/` is where that stops. The two
inside it are alternatives to one another — each wires the same pieces together
against a different environment, which is why they reach into `notes/` and `ui/`
rather than only into `platform/`. Wiring is what a host is for.

```
platform ← notes ← ui → language
        ↖      ↖      ↖
         hosts/electron, hosts/mockup
```

`notes/` depends on the filesystem *contract* and never on an implementation.

The seam is **a filesystem, not a note store**. A host provides somewhere to keep
text files — list, read, write, rename — and starts the interface. Nothing else.
The note store is built on top of that by the app itself, so there is one
implementation of what a note is rather than one per host.

That extends to the Electron bridge, which speaks `files:read` and `files:write`
rather than `notes:save`. A bridge that spoke notes would force the Electron main
process to know how a note is named and when a save may rename one — rules that
would then exist in a place the browser build can't reach.

That distinction matters more than it looks. `moveToDeleted` was briefly a
platform method, which put *where deleted things go and what they're called* —
policy — into code the browser couldn't exercise. As a filesystem operation it's
a rename, and the policy lives in shared with everything else.

It also means anything else we need to read off his machine goes through the same
interface rather than growing a second way to touch the disk.

There are two entry points and two builds, so the mock cannot reach what he
installs:

- `src/renderer/entry.ts` → `dist/` — the installed app. Knows only the real store.
- `src/mockup/entry.ts` → `dist-browser/` — served by `npm run ui`. Adds the mock.

`src/renderer/app.ts` is handed a store rather than choosing one, so nothing in
the interface knows the mock exists. `test/boundaries.test.ts` holds the whole
arrangement in place by reading the imports: nothing outside `src/mockup/` may
reach into it, and neither the interface nor shared code may import Electron or
`node:` modules. Those would all fail silently — a mock shipped to him, or a rule
living on only one side of the seam.

This is not tidiness. The UI is developed and judged in a browser against the
mock store, so **anything implemented only in `src/electron/` does not exist
there** — and a mock that behaves differently from the real thing quietly
invalidates every judgement made against it. That has already happened twice:
emptied notes were swept only by the real store, and the mock carried its own
copy of the filename collision rule.

The split to aim for: *deleting a file* belongs in `src/electron/`, while *what
counts as deleted, what it gets renamed to, and where it goes* do not. Rules live
in `src/shared/` where both sides use the same one; only the system call stays
behind. **If a rule has to be written twice, it is in the wrong place.**

One deliberate exception: `log.ts` stays whole in `src/electron/`, pure retention
logic and all. The mock has no log file and wants none — nothing in the browser
needs to agree with it, so there's no divergence to prevent.

## Distribution

- Public GitHub repo (`danilom/b-notes`), single `main` branch. No secrets in it, and nothing identifying: the Dropbox folder location comes from config or first-run detection, never a hardcoded path.
- Packaged with `electron-builder` (NSIS); updates via `electron-updater` pointed at GitHub Releases. No tokens, no signing certificate.
- Unsigned is deliberate. The initial install is done in person, so the one-time SmartScreen prompt is absorbed then; later updates are fetched by the app itself and carry no Mark-of-the-Web, so they apply silently. The tradeoff is that `verifySignature` is skipped and integrity rests on HTTPS.
- Updates must be invisible: `autoDownload: true`, `autoInstallOnAppQuit: true`. Never prompt him to install, and never call `quitAndInstall()` while he's editing. `autoRunAppAfterInstall` is off — he closed the app because he was finished, and a window reappearing on its own looks like the computer acting unprompted.
- The update host must support `Accept-Ranges`, or electron-updater can't do a differential download and falls back to fetching the whole installer — 98MB instead of roughly 1MB for a small fix. GitHub Releases supports it; check before moving to any other host.
- Updates are silent, so a broken updater is silent too. Everything electron-updater reports is routed into the log file; that's the only place it will ever surface.

### Shipping a new version

1. Bump `version` in `package.json` and commit. electron-updater compares versions, so an unbumped build is invisible to it.
2. `npm run dist` builds the installer locally into `release/` without publishing. Test it.
3. **Tag that commit and push the tag** (`git tag -a v0.1.3 -m "Version 0.1.3" && git push origin v0.1.3`). GitHub refuses to create a non-draft release without an existing tag, and `releaseType: release` means ours are never drafts. Skip this and electron-builder tags the *default branch* instead, producing a release that points at code you didn't build.
4. Publish with `gh`, not electron-builder:

   `gh release create v0.1.5 --title v0.1.5 --notes "" release/b-notes-setup-*.exe release/latest.yml release/*.blockmap`

   Add `--clobber` via `gh release upload` instead if the release already exists.

5. **Check the release has all three assets** — the installer, its `.blockmap`, and `latest.yml` — and that `latest.yml`'s `sha512` matches the local one. A missing `latest.yml` means no client can update at all; a missing `.blockmap` silently costs a full 98MB download instead of a differential one.
6. Expect up to a minute of 404s on the asset URLs afterwards; that's CDN propagation, not a failed upload.

**Don't use electron-builder's `--publish`.** It runs two publishers in parallel that race to create the release: one wins, the other dies with a 422, and the run aborts before generating `latest.yml` — leaving a release no client can update from. It failed this way on all four attempts, each time dropping a different file while reporting some success. `npm run dist` produces a complete, internally consistent set every time; uploading it with `gh` is the reliable path.

## Logging

Everything goes to a log file (`src/main/log.ts`, written under `userData/logs`,
pruned at 30 days or 10MB — whichever comes first, both configurable). Electron
detaches stdout on Windows, so anything not written to that file is invisible,
including during startup. Assume the log is the only account of what happened:
he reports problems by phone, vaguely, days later.

Log:

- Every significant operation — a note opened, created or renamed; a copy kept
  before a risky save; a conflicted copy detected or resolved; the notes folder
  being located. And how many texts are in the list whenever that changes: a
  count is what tells a folder that emptied itself from a man who deleted one
  text, days later, over the telephone.
- Every UI interaction except typing — buttons, selections, navigation.
- Every error, including ones recovered from silently. *Especially* those: an
  error he never saw is one he can't tell us about.

Don't log:

- Note contents. His essays are private and the files get large.
- **Saves.** Autosave lands within a second of him stopping, so a session would
  be a thousand identical lines and the one that mattered would be unfindable.
  What gets logged instead is the part of a save that moves a file: a rename
  when his first line changed, and a copy kept before a risky write.
- **What he searched for.** A query is a word out of his writing, or one he is
  hunting in it, so logging queries gives away what his essays are about
  without ever quoting one.
- Anything per-keystroke. Writes are synchronous so entries survive a crash,
  which makes them too expensive to do on a spinning disk at typing speed.

**The log carries his titles, and that is deliberate.** A note's id is its
filename, which is built from his first line — so every line naming a text names
a fragment of his writing. The alternative is a hash, and a hash is useless the
moment he telephones to say the one about Tivat has gone wrong. The diagnosis is
worth more than the redaction *while the log stays on his machine*, which makes
this a condition rather than a decision: **the telemetry idea in `TODO.md` —
putting logs in a shared Dropbox folder — cannot proceed until they are redacted
first.** Treat a log file as being as private as the writing itself.

One file per run, named for its start time, pid and kind of run
(`b-notes-2026-09-18-162537-31240-installed.log`), so a dev build and the
installed one can run together without interleaving, and each run reads as its
own story. The first line of every file repeats whether the run was `installed`
or `dev`.

Renderer code logs through the `window.log` bridge, which reaches the same file;
in a plain browser tab it falls back to the console. `logs.cmd` in the repo root
opens the folder in VS Code, since the path is otherwise awkward to reach —
wherever the logs have been pointed: it runs `scripts/open-logs.mts`, which
finds the folder with the app's own rule (`logsFolderFor`).

A warning for anyone reading these logs through a tool that runs inside a
Windows Store/MSIX-packaged app: `%APPDATA%` is redirected copy-on-write into
that package's `LocalCache\Roaming`. Reads can return a stale snapshot while the
real file keeps growing underneath, which looks exactly like an app that has
stopped logging. Read the log from an ordinary Explorer window or shell when
what you're seeing doesn't match what the app should be doing.

## Testing

- Logic tests: `npm test` runs `node --test` directly against the TypeScript sources — Node strips the types itself, so there's no build step and no test framework. This is why `erasableSyntaxOnly` is on in `tsconfig.json`: enums and parameter properties would break it. Covers the storage layer and pure logic; keep these runnable without Electron.
- GUI tests: `npm run test:gui` builds, then runs Playwright over the browser build in `test-gui/`. It drives the real interface against the mock filesystem, so it is the only layer that catches a stylesheet that never loaded, a dialog that never opened, or a button that does nothing. Keep the suite small — the critical path is "type → it persists → reopen → the text is still there".
- **It costs three to five minutes. Ask before running it.** `npm test` is ten seconds and needs no permission; this does not. Say what it would catch and wait to be told yes. When one area changed, offer the targeted form, which is about thirty seconds:

  ```
  node scripts/build.mjs && npx playwright test status-bar
  ```

  The build is not optional there. `npx playwright test` on its own skips it and tests whatever was last built, which has already produced two false greens — a suite passing against code that had been deliberately broken.
- What it does not cover: the Electron main process. Nothing in `src/hosts/electron/` outside the preload is exercised by any suite, so a change to `electron-main.ts` gains nothing from running either one, and has to be checked by hand in a dev run.
- `page.clock.install()` does **not** stop time. It must be followed by `pauseAt`, or every test that depends on a save still being pending is racing a real 800ms timer.
- Playwright's Electron support (`_electron.launch()`) could drive the packaged window instead, and would close the gap above. Spectron is archived; don't use it.
- Day-to-day UI iteration happens in a browser against the mock storage backend (`npm run ui`), not in a test suite.
- His screens are smaller than the dev machine's once Windows has scaled them (1280 × 800 and 1280 × 720 CSS pixels, both at 150 %), so less fits. `/his-screens` on either server (`tools/his-screens.html`) frames the app at the size of his b-notes window on each laptop, switchable; on `npm run ui:his-corpus` it shows his texts. The Dell's are measured from his log ("Window open" and "Ready" lines); the Asus is taken to match until its log is read.
