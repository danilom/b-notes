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
| `rewrite-review` | the review redesign, on `ai-lektor` | this file is here; continue on it |

Merge order when ready: `rewrite-review` into `ai-lektor`, then `ai-lektor`
into `main`, when Danilo says so. The Lektor shows a button in the status strip,
so merging it into `main` makes `main` no longer releasable as v1 + fixes.
Hotfixes for v1 can branch from the `v0.8.4` tag.

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
became unreadable. Done and committed:

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
change once. It has "Samo novi tekst", "Samo za čitanje" (the diff without the
bar, as Ranije verzije could use it), and six hover styles.

## Decided, not built

In this order:

1. **The bar redesign.** Agreed 2026-11-08, try it in the prototype first:
   - Clicking any change opens it. "Vidi predlog" and "Vrati predlog" go:
     the first is now just the click, the second looked like it but was destructive.
   - An undecided change opens as old text (red, struck out) and the AI's text
     (green), with **Vrati staro · Prihvati · Izmeni · ×**. Undecided means the
     AI's suggestion, which is what goes in if he does nothing.
   - "Izmeni" starts from the AI's text, as today. Any of the three makes it decided, shown in green.
   - A decided change, clicked, shows every candidate side by side: old, AI's,
     and his own wording if he wrote some, with each one not in effect struck
     out. Same three buttons.
   - From there, "Vrati staro" or "Prihvati" switch to that one and **clear his
     own wording**; "Izmeni" edits his wording again, then it is green.
   - In "Samo novi tekst", an undecided change clicked opens as an undecided one.
2. **Hover option 6 into the app** (chosen): the buttons' darkening wash over
   red and green boxes, a darker background and a bigger target for text
   without a box, and the current change's dashed line under the change pointed
   at, in its own colours (red under red, green under green). Not under single
   coloured letters, which have their own underline. The CSS is in the
   prototype; the app still shows a plain outline. In the app, the line should
   also cover a change's pieces in other paragraphs, as the current change's does.
3. **Line thickness,** an open question: 3px renders unevenly at Windows scaling
   (5.25 real pixels at 175%, 4.5 at his 150%). 2px for both lines would be
   exact on his screen.
4. **Run the whole browser suite again** after the bar redesign, before merging.
   As this note was written, `rewrite-review` passed all of it (83 tests, 5.7 min)
   and the unit suite (1154).

Small things known:
- The prototype's own "Sitne popravke: N" line counts before merging; the app counts after.
- On a narrow window the first bar can sit under the title line, when it doesn't fit beside the stepper.

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
| Styles | `src/ui/interface.css` (review), `src/ui/lektor/lektor.css` (panel) |
| Tests | `test/` (unit), `test-gui/lektor.spec.ts` (browser) |
| His screens, scaled | `localhost:5173/his-screens#asus` |
