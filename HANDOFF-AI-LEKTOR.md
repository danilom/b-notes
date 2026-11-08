# Handoff: AI Lektor and the review redesign

Written 2026-11-08, for whoever picks this up after Danilo and Claude. It says
where the work stands and what was decided but not yet built. The why behind
most of it is in `DESIGN.md`; this file is the bridge to it, and can be deleted
once the work below is merged.

## Read first

- `CLAUDE.md`: how code is written here, and the git rules.
- `TARGET-USER.md`: who the app is for. Every decision answers to him: an
  elderly man writing essays in Serbian, unsteady hand, washed-out laptop
  screen, acts boldly on wrong ideas of what software does.
- `DESIGN.md`, sections **AI Lektor**, **Testing** and **Shipping a new version**.

## Rules that are easy to break

- **He has v1 (0.8.4) and it works. Nothing may disturb it.** Publish only with
  `npm run release`, which makes a pre-release. Never make a release live:
  `npm run release -- --live` is Danilo's alone, and a live release installs on
  his machines by itself and cannot be taken back.
- **His real texts are private.** They live only in the gitignored `testdata/`
  folder, never in code, tests or commits. The repository is public.
- **API keys** (`testdata/gemini-key.txt`, `testdata/claude-key.txt`, and
  `lektor.json` in the app's data folder) are never printed, logged or committed.
- **No test may spend AI credits.** Screens are tested with the test Lektor
  (below), the flow with `test-gui/lektor.spec.ts`, which fails any test that
  calls a real service.
- **The browser suite takes 4 to 6 minutes; ask Danilo before running it.**
  `npm test` (10 s) is free to run. `npx playwright test <spec>` does *not*
  rebuild, so run `node scripts/build.mjs && npx playwright test lektor`, or you
  test stale code. Unit tests run during a browser run can fail on timing.
- **Ask before inventing anything he sees** that could take more than one
  shape (wording, a control, a range). UI text is Serbian, ekavian, "ti".
- Commit each finished change on its own, subject = one plain sentence about
  what changes for him. Keep files' LF line endings. No push unless asked.

## Where the code is

All three are on GitHub (pushed 2026-11-08).

| Branch | What it is | State |
|---|---|---|
| `main` | v1, and the release safeguards since | what to start other work from |
| `ai-lektor` | the AI Lektor, built on `main` | ~225 commits, not merged |
| `rewrite-review` | the review redesign, on `ai-lektor` | first round of the redesign |
| `change-choices` | the review's choices, its look, and Ranije verzije, on `rewrite-review` | continue on this one; not pushed |

Merge order when ready: `change-choices` into `rewrite-review`, that into
`ai-lektor`, then `ai-lektor` into `main`, when Danilo says so. The Lektor shows a button in the status strip,
so merging it into `main` makes `main` no longer releasable as v1 + fixes.
Hotfixes for v1 can branch from the `v0.8.4` tag.

## Files that are not in git

Real texts and model replies are gitignored, because they are the client's
private essays and the repository is public. Danilo sends whatever is needed
separately and privately. Keep them in `testdata/`, never commit them, and send
them to no AI service without asking Danilo first.

| What | Where | What it is for |
|---|---|---|
| Sample texts and saved Opus replies | `testdata/diff-samples/` | Real essays paired with proposals (`.current.txt`, `.proposed.txt`), and Opus's corrections of two of them (`.lektor-<kind>.txt`). The prototype's real samples, and the test Lektor's saved replies in the browser build. |
| The same replies, for the app | `%APPDATA%\b-notes\lektor-test-replies\` | Recreate it by copying an essay's `.current.txt` and `.lektor-*.txt` files there from `diff-samples/`. |
| Model comparison runs | `testdata/lektor-comparison/` | The replies behind "Which models, and why" in `DESIGN.md`. `models-1` to `models-5` are the latest (Opus medium/low, Sonnet, Gemini, per essay and kind); `claude-*/task-*.txt` hold the prompts of that time. Only needed to re-check models or prompts. The scripts that ran them were not kept. |
| His texts as the browser build's list | `testdata/corpus.json` | What `npm run ui` lists. Without it the build starts on its invented sample texts, which is enough for most work. |

Not needed for the Lektor: `real-redacted/`, `corpus/`, `corpus-analysis/`,
`metadata/`, `resoph-corpus.json` and the logs, all from the corpus and Resoph work.

**Never sent: `testdata/gemini-key.txt` and `testdata/claude-key.txt`.** Get a
Gemini key of your own from Google AI Studio. Its free tier allows 20 requests a
day per project, so your own project won't use up Danilo's. A Claude key for paid
tests comes from Danilo, if at all.

## The AI Lektor (`ai-lektor`)

Working, in the app and the browser build:

- **A side panel**, opened by "Lektor" in the strip. Step 1 picks the service:
  "Google: besplatan, ok, brz" (`gemini-3.6-flash`), "Anthropic: plaćen,
  temeljan, spor" (Claude Opus 5.5 at medium effort), or "Probni: bez AI".
  Then an **AI utisak** (a short comment, shown word by word), then **AI
  ispravke** in four kinds: Slova i zarezi, Pravopis i gramatika, Stilska
  dorada, Dubinska prerada. The prompts are in English and shown as sent.
- **The corrections window** (`src/ui/lektor/lektor-dialog.ts`): a word-level
  diff he goes through, applied with "Unesi sve izmene u tekst", keeping the
  old text as a version first.
- **Results are kept** per text, kind and service. Opening the Lektor shows the
  existing utisak. A stale-comment rule decides between a note and starting over.
- **Keys:** one is enough; a service without a key is greyed out.
- **Why these models:** `DESIGN.md`, "Which models, and why". Gemini's free cap
  is 20 requests a day per Google project, and refused attempts seem to count.

**The test Lektor** ("Probni") needs no network. It is switched on from
Advanced settings, stored in `lektor-test.json` in the app's data folder, and
can act out every failure. Its made-up corrections change about as much as
Opus does, though not in the same pattern. To try the review on what Opus
actually sends, it hands back a **saved real reply** for a text whose title
matches:

- In the app: `<app data>/lektor-test-replies/<name>.current.txt` (the text)
  beside `<name>.lektor-<letters|grammar|wording|rewrite>.txt` (the reply).
  On Windows the app data folder is `%APPDATA%\b-notes`.
- In the browser build: the same files in `testdata/diff-samples/`, read by the
  dev server.
- A saved reply is marked `[SAVED OPUS CORRECTIONS]` under the title.
- Danilo has two of his essays set up this way. They are his and private:
  they don't come with the repository.

Still open on `ai-lektor`, not started:
- While a long utisak scrolls, should the buttons under it stay visible? Asked, never answered.
- Not yet tried on his machines at all.

## The review redesign (`rewrite-review`)

A Dubinska prerada changes about 40% of a text, and the red-and-green view
became unreadable. Done and committed (the checkbox, the bar and the line were
reworked again on `change-choices`, below):

- **"Prikaži samo novi tekst"**: a checkbox in the corrections window, on for
  Dubinska and off for the other kinds, every time. Ticked, undecided changes
  are drawn as their new text alone (bold green). It is a view, not a decision:
  what goes in, the "Pregledano" count and his own decisions are untouched.
- **The kind of correction** ("Dubinska prerada · AI Lektor: …") above the text.
- **The change bar opens on a click, never on hover.** X or a click on empty
  space puts it away, and it stays away while stepping with Prethodna/Sledeća
  until he clicks a change. Deciding a change quiets the bar until he moves on.
  The text has room above its first line, so a bar over the title doesn't
  cover the stepper.
- **An empty side is marked ∅:** "Vrati staro (∅)" on an addition, "Prihvati
  (∅)" on a deletion, and a drawn green ∅ where a change was resolved to nothing.
- **A comma or space at the very edge of a change is folded into it,** so one
  edit is one change (`withEdgesFolded` in `src/notes/text-diff.ts`).
- The current change's dashed line is 3px (was 4px); accepted green is bold.

**The prototype** (`design/diff-prototype.html`, served at
`localhost:5173/diff-prototype` by `npm run ui`) runs the real review on
samples. It opens on **"Svi slučajevi"**, an invented text with every kind of
change once, ending with "ščepao"/"šišao" (letters close together) and one long
rewritten paragraph. The looks tried there and chosen are the app's own now;
the ones not chosen are in git history.

## The review's choices and look (`change-choices`)

Decided with Danilo on 2026-11-08 in the prototype, then moved into the app.

**What a change is now.** Every change always has a wording in effect: the AI's,
unless he picks another. Nothing is "undecided". A change is either *open*,
showing its wordings side by side (red old text, green AI predlog, blue his own
wording if he typed one), all but the one in effect struck out, or *collapsed*
to the one in effect, in bold green ("biće uneto").

- **The bar** over an open change: **Vrati staro · Prihvati · Izmeni ✎ · ×**,
  radio-like: a square sign at each button's left edge, filled in the one in
  effect, the words centred in the rest. Picking one collapses the change.
  "(∅)" on a side that is nothing. Buttons share a minimum width; × is small
  and square. The bar over a corrected letter has × too.
- **His own wording is never cleared** by picking another; it stays, struck
  out, one click away. Izmeni (or clicking his blue words while the bar is up)
  edits it, starting from his wording if he has one, else from what is in
  effect. Typing out exactly the old text or the proposal picks that one.
- **Clicking a collapsed change opens it.** The bar shows only over an open
  change, never over a collapsed one stepped to.
- **"Prikaži tekst kakav će biti"** (was "Prikaži samo novi tekst") sets how
  the changes he has *not* touched are shown: ticked collapsed, unticked open.
  A change he opened or collapsed himself keeps what he last did.
- **Choosing is animated**: the others fade, then a copy of the chosen box
  glides to where its words land and cross-fades into the green word. Words on
  several lines, and his own typing, just fade in. None of it under "reduce
  motion". A step with Sledeća during the fade is not undone.
- **Look:** green for collapsed (accepted is a fair thing to imply; red stays
  the teacher's pen for letters). His own wording is a fixed blue box, not the
  accent. The current change has a black dotted line (square dots) under it and
  a **black arrow in the margin** beside its first line; the paragraph bar and
  frame are gone. Under the pointer, a dotted line in the colour of what it is
  under, no darkening; collapsed changes and single letters have wider targets
  (a letter keeps to itself towards another corrected letter within one
  character). The stepper lost its icon.
- **Legend** above the text, in the small interface type, upright, each mark
  drawn on the sample word "reč": *tvoj stari tekst · AI predlog · tvoja
  izmena · biće uneto · sitne popravke*, with the counts on the line under it.
  `src/ui/diff-legend.ts`.
- **Ranije verzije** now uses the same view, read-only (no bar): red struck is
  what the copy had that his text has lost, green what his text has now, with
  its own legend (*bilo u ovoj verziji · sada u tekstu · sitne razlike*). The
  stepper there still shows only over a copy too long to see whole. The old
  paragraph-by-paragraph view (labelled blocks, shortened paragraphs) is gone.

Decided against: splitting long changes; making the letter bar heavier; any
change to line thickness (fine as is).

Small things known:
- The prototype counts small fixes before merging, as the app does now.
- On a narrow window the first bar can sit under the title line, when it doesn't fit beside the stepper.
- Not yet looked at on his screen sizes (`/his-screens`) or at the warmest Night Light.

## Where things live

| What | Where |
|---|---|
| Lektor panel, steps, saved results | `src/ui/lektor/lektor-sidebar.ts`, `lektor-kept-results.ts` |
| Corrections window | `src/ui/lektor/lektor-dialog.ts` |
| Services | `lektor-gemini-ai.ts`, `lektor-claude-ai.ts`, `lektor-fake-ai.ts`, `lektor-test-replies.ts` |
| Calls out of the app | `src/platform/lektor-remote.ts` (main process), `scripts/serve.mjs` (browser build) |
| Wording | `src/language/lektor-wording.ts` |
| The diff | `src/notes/text-diff.ts`, `text-review.ts` |
| The review view, its state, the bar | `src/ui/diff-view.ts`, `diff-review.ts`, `diff-change-bar.ts` |
| The legend above a comparison | `src/ui/diff-legend.ts` |
| Ranije verzije | `src/ui/versions/versions-dialog.ts` |
| Styles | `src/ui/interface.css` (review), `src/ui/lektor/lektor.css` (panel) |
| Tests | `test/` (unit), `test-gui/lektor.spec.ts` and `versions.spec.ts` (browser) |
| His screens, scaled | `localhost:5173/his-screens#asus` |
