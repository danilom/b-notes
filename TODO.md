# Human edited todo

[ ] P3/rare Updates: maybe some UI is ok, so he doesn't mess with it while install is in progress

## UI
[ ] "Novi tekst" button not in the right place
[ ] Increase size of everything by 15%. The user is elderly. 

# TODO

## Idea — snapshot on risk, not on a timer

Autosaving is only dangerous when text goes away. If the new content contains
the old content, the edit is pure insertion and nothing can be lost, so it can be
written freely. If it doesn't, something vanished: a few characters is ordinary
editing, but a large removal — above all one replacing most of the text — is the
suspected select-all-then-type failure, and deserves a snapshot taken *before*
the write lands.

It must never block the edit. He genuinely does cut for brevity; the point is
only to make that recoverable.

Two things fall out of it. Snapshots become rare and meaningful instead of
hundreds of near-identical copies of an essay he's fiddling with, which bounds
version storage. And it gives an undo that survives closing the app, which
ordinary undo doesn't.

Threshold still to decide, and worth testing against real editing.

It also gives us something to *show* him. Because we know what vanished at the
moment it vanished, a restored version can be described in his own words —
"removed 63 characters: *ne volim januar… polako odlaze*" — rather than making
him diff two texts in his head. Recognising the missing sentence is a far easier
task than comparing two near-identical drafts.

## P1 — Come back exactly as he left it

Reopen the text he was last editing, scrolled and with the cursor where it was.
Continuity across restarts is worth more against "it disappeared" than any list
design.

Be selective about what else is restored, though. **Reopening the app is his way
out of any mess he thinks he's in**, so restoring too much would take away that
escape. Restore the open text; don't reopen a version panel; and clear any search
— a filtered list on startup looks exactly like texts having gone missing.

## P3 — Relative times go stale where they sit

`describeWhen` builds its string once, at render. Nothing re-runs it, so a row
reading "pre 5 minuta" still reads that an hour later, and the status bar sits on
"Sačuvano pre 2 minuta" for as long as he reads without typing. It is a small
lie, told in the one place whose whole job is to reassure him that his work is
safe.

Measured rather than assumed: a full list repaint is ~9ms for 586 rows, so cost
is not the objection. Two things are:

- `renderList` starts with `replaceChildren()`, and emptying a scroll container
  clamps `scrollTop` to 0. A blind repaint on a timer would yank him to the top
  of the list every tick. Confirmed by measurement, not inference.
- Almost nothing ever needs repainting. A row only changes when it crosses a
  rung, and everything below `juče` is stable for months — in his own corpus,
  which stops in 2021, *no* row will ever change.

So the shape is a ~30s tick that rewrites the `.note-when` text node on the rows
that are actually younger than an hour, plus the status line: one or two text
nodes touched, scroll untouched, nothing rebuilt.

## P3 — "Sačuvano 2019" reads oddly

`describeWhen` is shared between the list column and the status bar, which want
different things. In the column "2019" is exactly right; in a sentence it comes
out as *Sačuvano 2019*, which is terse to the point of sounding wrong. The status
bar has room for a fuller phrasing and should probably have its own.

## P2/P3 — Suggest similar texts

When a text has likely siblings, offer a quiet "Slični tekstovi (3)" on that
text, using fuzzy matching. It meets the three-to-five-variants problem at the
only moment it matters — when he's looking at one of them — and stays silent when
the match is uncertain. Needs developing.

## P3 — Diacritic-insensitive search

He writes Serbian in Latin script and often drops the diacritics, inconsistently:
`šećer` might appear as `secer`, `šecer` or `sećer` across his own texts, and he
may type any of those into the search box. Folding them so that any spelling
finds any other is mechanically trivial — expand each of `šđžčć` to its bare
counterpart on both the query and the indexed text.

Worth measuring before building: we have a sample of his ~600 texts, so we can
count how many searches would actually miss without this. It may turn out to
matter far more, or far less, than it appears.

## Getting logs off his machine

The app writes a log file (see `src/main/log.ts`), but reading it currently
means someone sitting at the machine. He can't be asked to find a file, zip it,
or attach it to anything, so when he reports a problem by phone the evidence is
effectively out of reach.

Needs deciding:

- Whether logs are uploaded automatically or only on request. Automatic upload
  means the app talks to the network, which it otherwise never does — that's a
  real change to its security posture, and the reason Electron can currently be
  pinned and left alone.
- Where they'd go, and who pays for it.
- What counts as consent here, given he can't meaningfully evaluate a prompt
  about it.
- A fallback that needs nothing from him: writing a copy into the Dropbox folder
  would sync it without a single interaction, at the cost of putting logs
  somewhere he might see them.

Until this is settled, debugging a problem on his machine means remote access.
