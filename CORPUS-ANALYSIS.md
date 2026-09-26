# His corpus, read from first principles

What his real folder shows about how he writes, names and files his texts, what
that does to the assumptions b-notes was built on, and what the app has to
survive as a result. Written 2026-09-27, after 0.7.0 met his real machine.

**No code follows from this yet.** Directions only — see the end.

Sources:

- `testdata/real-redacted/` — his Resoph folder on **one** of his two machines,
  copied with names, folder structure, sizes, encodings and line endings exact
  and all text past the first thirty words blanked (`scripts/anonymize-corpus.mjs`).
- `testdata/real-redacted-report.json` — the anonymizer's census.
- Danilo's observations of him using 0.7.0 for about an hour on 2026-09-26.
- The b-notes source at `e766b3b`, for what the app currently does.

His titles are his writing, so none is quoted here and this file can be
committed. Every finding below has real examples in
`testdata/corpus-analysis/EXAMPLES.md` (gitignored), next to the throwaway
scripts that produced the numbers.

Where a finding is a hypothesis rather than a count, it says so.

---

## 1. The corpus in numbers

| | files | size | notes |
| --- | --- | --- | --- |
| live folder (root) | 1,215 `.txt` + b-notes' `settings.json` | 11.3 MB | this is his list |
| `Arhiva/resoph_2024-11` | 1,096 `.md` | | a Resoph snapshot |
| `Arhiva/simplenote_2024-11` | 667 `.md` | | oldest text 2013 |
| `Arhiva/stare_2023-09_DellLaptop` | 646 `.md` | | near-identical to the Simplenote set |
| `Arhiva/stare_2023-09_HpLaptop` | 595 `.md` | | named in his Resoph style |
| `Obrisano/`, `Verzije/` | 3 | | b-notes' own, from the one hour |
| **total** | **4,223** | **33 MB** | 9 folders |

- **Twice what we designed for.** `DESIGN.md` and `TARGET-USER.md` assume ~600
  texts, 3.3 MB, largest 145 KB. The live folder alone is 1,215 texts and
  11.3 MB, and the largest is **296 KB** — five are over 200 KB and sixteen over
  100 KB. Those biggest ones are also the ones he has marked as most important
  (see §2).
- **Sizes.** Median 2.7 KB; 10% under 217 bytes; 10% over 20 KB. 93 are under
  100 bytes, 47 have no line break at all, 7 are zero bytes.
- **Extensions.** Live: all `.txt`. Archives: all `.md`. Nothing else, and
  nothing that isn't text — no images, no Office files, no shortcuts.
- **Encodings.** Every file is UTF-8 without a BOM, or pure ASCII. No UTF-16, no
  Windows-1250, no NUL bytes. Serbian letters appear in 67 live names and are
  correctly encoded everywhere.
- **Line endings.** Live: 1,160 CRLF, 54 with no line break, and exactly 2 LF —
  both written by b-notes in that hour (`settings.json` and one new text).
  Archives: 2,736 CRLF, 28 LF, 4 mixing CRLF and LF, 1 with a lone CR. Ten live
  texts contain tabs.
- **Age (by modification time).** Live: 481 last changed in 2023, 372 in 2024,
  222 in 2025, 140 in 2026. He works in bursts: Feb–Apr 2025 (174 files),
  May 2026 (68), Sep 2026 (49).
- **Modification times are not all his.** The live folder's oldest time is
  2023-09-16. About 300 files share a handful of seconds at 23:11–23:12 that
  night and another 156 share one second at 22:55:40 — a bulk import. For 481
  texts, "last changed" means "the day the folder was set up".
- **Creation times did not survive.** Every file in `testdata/` was created
  2026-09-26 21:52 — the copy, not his writing. (Question 9.)

## 2. How he names, titles, structures and files

### 2.1 The filename is his title. The first line is not.

Comparing each live filename with the first line of its text:

| relation | live | Simplenote / Dell archives | HP 2023 archive |
| --- | ---: | ---: | ---: |
| name is the first line (exactly, or up to spacing) | 292 (24%) | ~85% | 0% |
| name is his marks + the first line, or a truncation of it | 197 (16%) | ~7% | 2% |
| loosely related | 33 | 3% | 2% |
| **no relation at all** | **682 (56%)** | **1 file** | **91%** |
| empty file | 7 | | |

Simplenote named files after the first line and nothing else. In Resoph, from at
least September 2023 on, **he names the file and the first line goes its own
way.** Resoph set the name from the first line when a note was created; he then
changed the name.

What his first lines hold instead is telling. Of 1,208 non-empty live texts:

- 100 first lines are four characters or fewer — often a bare section number
  (34 are only digits), a single letter, or `x`.
- 150 are ALL CAPS, and many of those are **notes to himself**: *this has no
  point*, *the last part is missing, it was deleted*, *there are several parts
  here, the first is the tidied version of the one after*, *don't know if this
  goes in the story or the songs — decide*.
- 122 are over 80 characters: the first paragraph, with no title at all.

So the first line is where his text starts, or where he talks to himself about
it. **The name is where he says what it is.**

### 2.2 His marks

Three quarters of the live names carry at least one deliberate mark. Counts are
over the 1,215 live names; the same name often carries several.

| mark | files | what it seems to do |
| --- | ---: | --- |
| leading spaces (3–30 of them) | 241 | rank to the top — see 2.3 |
| `*` (Resoph wrote it as `%2A`) | 258 | star; `**` (68) a stronger star; 140 put it first |
| `(UP)` | 383 | unknown — the biggest single category; see below |
| `(UP) n` | 87 | numbered, 75 distinct numbers from 1 to 127 |
| `(UP) II n` | 118 | a second numbered series, 109 numbers from 0 to 130 |
| `A (E)`, `A(E)`, `AA(E)`, `yA (E)`, `ZA (E)` | ~80 | a kind — perhaps *esej* |
| `A(P)`, `AA(P)` | ~24 | a kind — perhaps *priča* |
| `AA`, `AAA`, `AAAA` at the front | 38 | float up (the old habit; 16 in 2021) |
| `zz`, `y` at the front | 25 | sink to the bottom |
| series code after `*`, some numbered | ~60 | ~10 subject codes, spelled inconsistently |
| status in brackets | ~150 | *this one* (35), *work on it* (32), *sketch* (18), *final* (19), *spare copy* (14), *pointless* (8), *compare I and II* (7), *sent*, *shortened* … |
| roman numerals | 219 | part or draft number |
| ` (n)` at the end | 31 | Simplenote's duplicates, and b-notes' (§6) |
| trailing space before `.txt` | 139 | mostly left over from editing marks |
| unbalanced brackets | 24 | a mark half-typed |

**What `(UP)` is not.** Danilo checked that it isn't Resoph's pin, and it is
odd for him to type anything this consistently. The data:

- It never appears in any Simplenote data — the 2021 backup, the 2024 export,
  the Dell set — nor in the first line of any text anywhere. It exists only in
  Resoph-era **filenames**: 239 on the 2023 HP laptop, 410 in the 2024 Resoph
  snapshot, 387 live.
- It doesn't follow Simplenote's pin: of the live `(UP)` texts that can be
  matched to the 2021 backup, 69 were pinned and 128 not, about the same ratio
  as texts without it.
- Every complete one is spelled exactly `(UP)` — no `(up)`, no `(Up)`. The only
  deviations (`(UP`, `( UP)`, a bare `(`) are in the identical-copy debris of
  §3, and look like the states a name passes through while someone edits it
  one character at a time.
- The gap after it is one of a few fixed widths: 2 spaces (119), 8 (135),
  10 (64), 7 (30), almost never anything else.

Uniform spelling and fixed-width gaps fit a prefix that is **copied from an
existing name and pasted**, or one applied by some tool, better than one typed
fresh each time. The debris shows it being edited by hand in the name at least
sometimes. What it means is still open (Question 2).

He is not using one scheme. He is using at least five — rank, star, collection
with position, kind, and status — and he mixes them within one name. Spelling
of the same code drifts from file to file.

### 2.3 It is all sort-order engineering

Every one of those front marks makes sense in exactly one view: **the list
sorted alphabetically by name**. In character order a space comes before `%`
(his `*`), which comes before `(`, which comes before digits, then `A`, and `z`
and `y` come last. So:

- more leading spaces sort higher — 30 spaces beats 16. The widths bunch at 16
  (63 files) and 24 (33), which looks like "one tab-width more than the last".
  **It is an arms race with himself for the top of the list.**
- `*` after the spaces ranks within the top group; a digit after `*` orders
  the items inside a series.
- `(UP)` gathers the collection in one block, numbered in reading order.
- `AA…` is the older, weaker version of the same move; `zz`/`y` is the reverse.

The leading spaces are new: 2 before 2025, then 26, 35 and 48 in February,
March and April 2025 and 67 in May 2026. The November 2024 Resoph snapshot has
8; the 2023 one none. Space-edged names now hold **6.4 MB — 56% of all his
writing by size**, 111 of them changed in 2026, and 11 of the 30 texts he
touched most recently.

This matches Danilo's read: he organises a lot, just not in an organised way.
The earlier conclusion in `TARGET-USER.md` — that he "will not name, file, tag
or organise anything" — was drawn from a Simplenote backup, where the name
could only be the first line. Given a name field he could edit, he organised
constantly.

### 2.4 Structure and folders

- **No folders of his own.** Everything he writes lives flat in one folder.
  His "folders" are the prefixes above.
- **At least one book-shaped structure**: two numbered sequences under `(UP)`,
  about 185 distinct positions between them, with a few numbers used twice.
  Whatever `(UP)` is, it is the largest thing he is building.
- **The four `Arhiva/` folders** follow b-notes' own naming convention, so
  presumably someone set them up rather than him (Question 4). Six archive
  files were modified after their snapshot date (Nov 2024 and Mar 2025), so
  something has been editing inside them.

## 3. What Resoph and the machines did to his names

- **Escapes.** Resoph can't write `* ? / \ : <tab>` in a filename, so it writes
  `%2A` (341 times), `%3F` (25), `%2F` (15), `%5C` (6), `%3A` (2) and `%09` (1).
  46 first lines contain a `*` and 33 a `?`, so the marks were at least
  sometimes typed in the title and carried into the name.
- **Leading and trailing spaces.** Resoph keeps them, Explorer won't let anyone
  type them, and some editors refuse to open such files. 327 live names begin or
  end with a space.
- **Renames leave the old file behind.** This is the single biggest source of
  his duplicates. 47 groups of live texts are **byte-for-byte identical** — 166
  files, 119 of them surplus, up to 9 copies of one text. Within a group the
  names differ only by how many leading spaces there are, whether `(UP)` or `*`
  is in front, or by a half-typed prefix (`(UP`, `( UP)`, `(      `, a stray
  letter). In one group the name is captured at five lengths, as if at five
  moments while it was being typed. Copies in a group usually share their
  modification time to the second, which a copy-then-fail-to-delete keeps and a
  rewrite would not.

  *Hypothesis:* each time he edits a name in Resoph, the file is saved under the
  new name and the old one is not removed — either because Resoph's delete fails
  (Dropbox or Notepad holding the file), or because the other machine, or
  Resoph's Simplenote sync, puts the old name back. Either way, **every rename
  he makes is a potential duplicate**, and he makes a lot of them. (Question 3.)
- **One Dropbox conflicted copy** in the live folder, 102 KB, one of his
  space-ranked texts. The design has treated conflicted copies as the likeliest
  way he loses work. On this machine the resurrected old name is far more
  common; the conflicted copy is still there, and b-notes hides it (§6).
- **Bulk imports rewrite history.** See the times in §1.

## 4. Near-duplicates: mechanical and deliberate

Grouping live names once his marks and brackets are stripped gives 177 groups
covering 458 texts — 38% of the list. They fall into two different kinds:

1. **Mechanical copies**: identical bytes under slightly different names, as
   in §3. They're debris from how the tools behave, and nothing about them is
   a decision of his.
2. **Deliberate drafts**: one essay in eight versions of 9–29 KB, each name
   carrying a different status (*sent*, *shortened*, *compare*, `!!!`); another
   in six versions all marked `yA (E)` with different notes in brackets. These
   are his versioning, done in the only field he has.

The rules in `TARGET-USER.md` about grouping conservatively were written with
the second kind in mind, and are right for it. The first kind is different:
because the bytes are identical, collapsing a group loses no text at all.

**Archives against the live folder**, by exact text:

| archive | identical text is live | same name live, text differs | neither name nor text live (non-empty) |
| --- | ---: | ---: | ---: |
| resoph_2024-11 | 874 of 1,096 | 55 | 162 |
| simplenote_2024-11 | 458 of 667 | 18 | 171 |
| DellLaptop 2023 | 459 of 646 | 17 | 170 |
| HpLaptop 2023 | 240 of 595 | 130 | 213 |

That last column is writing that exists somewhere but not in his list — or
exists there under a name and in a form nothing simple can match. It could be
something he deleted on purpose, an earlier state of something he renamed, or
something he lost.

## 5. Things he could open that aren't his writing

Very few: two Simplenote welcome notes, two setup to-do lists. Also 7 zero-byte
files whose **name is the whole note** — an idea written only as a filename —
and one file in the live folder named like a b-notes version (§6).

## 6. What b-notes already did in his folder

About an hour of use on 2026-09-26 left:

- `settings.json`, one new text, a `Verzije/` folder with two copies of it, and
  an `Obrisano/` folder holding one 1-byte file.
- **A file in his list named like a version timestamp**, with a version's text
  but CRLF endings — which b-notes never writes. Something other than b-notes
  copied a version into his list. The file in `Obrisano/` carries another
  version's name, so a version-named text was in his list and then deleted.
- **Two batches of numbered copies**: at 18:15:05 and at 19:54:45, six groups
  that already had `(1)` and `(2)` each gained a `(3)` and then a `(4)` (one
  gained `(4)` and `(5)`), each a byte copy of the highest-numbered one. The
  timestamp-named file appeared one second after the second batch.

  *Hypothesis:* on each b-notes start, `settleNames` renamed a bare `X` to
  `X (n)` to keep a group numbered, and Resoph (or the other machine) then
  wrote the bare `X` back. Each round would add one duplicate. Fifteen files is
  not much, but the loop would run on every start. (Question 5.)

## 7. The assumptions, against the evidence

| # | b-notes assumes | verdict | why |
| --- | --- | --- | --- |
| 1 | **Title = first line** (`titleFrom`) | **breaks** | 56% of names have nothing to do with the first line; 100 first lines are ≤4 characters and many are notes to himself. His list would read as a list he doesn't recognise. |
| 2 | **Filename derives from the title and follows it** (rename on save when the first line changes) | **breaks** | The first save of a text he named would replace the name he chose, marks and all, with its first line — and the old name would then likely come back from the other machine or from Resoph as a duplicate. |
| 3 | **A note id is a trimmed name** (`isNoteId`, `requireNoteId`) | **breaks, worst of all** | 327 texts — 56% of his writing, his highest-ranked and most recent — have names with spaces at the edges. By the code, `save`, `read` and `moveToDeleted` throw for all of them, and the autosave retries forever. (From reading the code, not reproduced.) |
| 4 | **One flat folder** | holds for him; bends for archives | He keeps no folders. But archive folders are listed through `isNoteFile`, which only takes `.txt`, and all 3,004 archive files are `.md` — so every archive reads as empty and the strip never appears. |
| 5 | **What counts as a text**: `.txt` in the root; `.md` converted on sight; conflicted copies set aside | bends | Right about extensions. Wrong to hide the conflicted copy (102 KB of a ranked text, silently gone). A zero-byte file can be a whole note. |
| 6 | **Duplicates are named ` (n)`, and a group is all-numbered or bare** (`claimName`, `settleGroup`) | **breaks** | His duplicates are mostly spacing and prefix variants, not ` (n)`. 31 names already end in ` (n)` (the old claim was none of 592). Renaming to keep the rule on a folder another writer shares is a duplicate factory (§6). |
| 7 | **Migration is triggered, never ambient** (`TARGET-USER.md`) | **breaks in the code** | `convertToPlainText` and `settleNames` rename files on his live Dropbox folder at every start. |
| 8 | **b-notes is the only writer** (single instance, autosave, "save" never his job) | **breaks** | Resoph and Notepad have the same files open at the same time, and a second machine writes to the same folder through Dropbox. Nothing checks whether a file changed on disk between b-notes reading it and writing it; the copy-before-a-big-loss rule catches only large shrinkages. |
| 9 | **"Safe" = no b-notes action loses text** | bends | True inside the app. The losses that matter here come from other writers, renames, and names b-notes can't handle. Safe has to mean safe while sharing the folder. |
| 10 | **Emptying is deleting / empty files are debris** | bends | Seven zero-byte files hold their whole content in the name. Deleting one in b-notes removes the file outright (`removeEmptyFile`) — and the idea with it. |
| 11 | **He doesn't organise; pinning / `AA` is his one habit** | **breaks** | Three quarters of names carry marks; five schemes; a numbered book structure. |
| 12 | **Alphabetical order is his filing** (memory) and **the list is newest-first plus "all" by title** | **breaks** | "All" sorts by first line, so none of his marks count. His order only exists sorted by his names. |
| 13 | **Search is over the text** | bends | His title words are often only in the name, which search never sees. |
| 14 | **Modification time = when he last worked on it** | bends | Bulk imports and rename copies stamp hundreds of files with times that aren't his. |
| 15 | **Variants are deliberate copies months apart** | bends | True of his drafts; the larger group by count is identical copies made by renames. |
| 16 | **Dropbox conflicted copies are the likeliest loss** | bends | One exists. Resurrected names are the common multi-machine artefact. |
| 17 | **~600 texts, 3.3 MB, largest 145 KB** | bends | 1,215 / 11.3 MB / 296 KB live, 33 MB with archives. Memory is fine; editor speed on 300 KB on his slowest laptop is untested. |
| 18 | **Files are UTF-8** | holds | All of them, on this machine. |
| 19 | **Line endings don't matter; writing LF is fine** | bends | His files are CRLF. b-notes writes LF, and Notepad before Windows 10 1809 shows an LF file as one line (Question 8). It also breaks our own rule of preserving a file's endings. |
| 20 | **Versions stay in `Verzije/`** | bends | A version got into his list (§6). Whatever carried it there, the design assumed nothing else looks in that folder. |

## 8. What b-notes has to survive, worst first

Ranked by what it costs him. Losing or hiding his writing comes first, then
losing his organising, then clutter and wear.

1. **Texts it can't save.** Every edit to 327 of his texts — the ones he ranks
   highest and touches most — fails and retries in memory. If the window closes
   first, the edit is gone. *Loses writing.*
2. **Another program writing the same file.** Resoph, Notepad and the second
   machine all write files b-notes has open. Whoever writes last wins, with no
   copy kept unless a lot of text vanished. *Loses writing, silently.*
3. **Renaming his texts.** A save that replaces his name with the first line
   destroys the name, which is part of his work and can only be recovered from
   Dropbox history, and invites the old name back as a duplicate. *Loses his
   organising and multiplies texts.*
4. **Hiding a text.** Conflicted copies are filtered out; archives read as
   empty; a zero-byte note shows as *Bez naslova*. *Hides writing.*
5. **An unrecognisable list.** Titles from first lines, in an order that isn't
   his, means most of his list looks like strangers or looks gone. Given how
   he reacts to a window he can't see, he'll read this as loss and go back to
   Resoph — which is how items 2 and 3 get worse. *Hides writing, as far as he
   can tell.*
6. **Ambient renames at startup** on a folder shared with Resoph and another
   machine: one new duplicate per round, and possibly the loop behind §6.
   *Multiplies texts.*
7. **Deleting an idea that lives in a name.** Seven today. *Loses writing, small.*
8. **Duplicate clutter.** 119 surplus identical copies in the list. He can't
   tell which one to edit, edits land in different copies, and identical texts
   start to diverge. *Splits work.*
9. **Writing that exists only in archives** — 160–210 texts per archive — not
   findable from where he looks. *Hides writing, possibly on purpose.*
10. **300 KB texts on a slow laptop.** His most important texts are the largest.
    *Wears him out.*
11. **LF line endings in files he may also open in an old Notepad.**
    *Readability outside the app.*

## 9. Directions

Not code, and not decided — things to talk about. The first four stop the
harm; the rest are the "keep his organising in spirit, give him better ways"
part.

- **His names on disk are his, and fixed.** b-notes never renames a file it
  didn't create: no rename when the first line changes, no settling of ` (n)`
  groups on his texts, no conversion on sight. A tidy name becomes a matter of
  what b-notes *shows*, not what's on disk. That removes the two-machine rename
  problem (§10) outright instead of managing it.
- **Accept every name that's on disk.** The id checks exist to keep b-notes'
  own names sane. They must not refuse his — spaces at either end, `%2A`,
  trailing spaces, whatever Resoph wrote.
- **Never write blind.** Before each write, check the file is still what
  b-notes last read (size, time or hash). If something else changed it, keep
  both versions rather than choose. Reload a text whose file changed when
  nothing unsaved is pending in b-notes.
- **Nothing hidden.** A conflicted copy shows next to the text it came from.
  Archives read `.md`. A zero-byte file's name is its text, and it is never
  removed without a copy.
- **His name is his title.** Show the name, read through Resoph's escapes
  (`%2A` → `*`), with the marks lifted out of it. Use the first line only for
  texts b-notes creates, or where the name is empty.
- **Read his marks, don't make him follow ours.** Turn what he already types
  into things the app shows: rank (spaces, `*`, `AA`), sinking (`zz`, `y`),
  collection and position (`(UP) n`, `(UP) II n`, series codes), kind (`(E)`,
  `(P)`), status (*this one*, *final*, *work on it*, *spare*, *pointless*).
  He'll keep typing marks into names in new ways, so the parser follows his
  habits and doesn't enforce a grammar. The raw name stays one click away.
- **Give him his order back.** A list in his name order, with the arms race
  collapsed into rank, as the complete list. Newest-first stays as *recent*.
  Search covers names as well as text.
- **Better ways, alongside the old.** A real *this is the current one*, a real
  pin, a real collection with order — each set with one click, and each stored
  outside the filename so setting it never renames anything. His own marks
  keep working, and the two agree.
- **Metadata that survives two offline machines.** Not one shared JSON file,
  which Dropbox will split into conflicted copies. Something mergeable: one
  small file per machine, or per text, combined on read, last change wins per
  field.
- **Collapse identical copies in the view, never on disk.** One row, "also kept
  under 6 other names". It's safe because the bytes are identical, and the
  choice of which name to show is a rule we can change later. Deliberate drafts
  keep the conservative grouping rules in `TARGET-USER.md`.
- **Keep line endings as found.** Write CRLF to a CRLF file.
- **Measure the 300 KB case** on the slowest laptop before designing around it.
- **Resoph and Notepad.** Three programs editing the same notes will fail
  whatever we build, and more work in b-notes won't stop it. The people around
  him have to settle that in person: retire Resoph on both machines once b-notes
  is trusted. Notepad can't be removed, so b-notes has to live with it (never
  writing blind covers most of it).

## 10. The second machine

The corpus is one machine's view. The other has been offline for long periods,
overlaps heavily and has diverged in places.

- **Any rename on one machine can undo itself.** Dropbox carries a rename across
  as a delete plus a create. If the other machine edited the old file while
  offline — or Resoph there rewrites it — the old name comes back beside the new
  one. That is the most likely source of the copies in §3, and it's why a
  one-shot cleanup of his names can't work: it would be applied to one machine's
  view and then contradicted by the other's.
- **So there is no cleanup of names on disk**, which is the first direction in
  §9. If renaming is ever wanted, it becomes a deliberate, one-off step, run
  only after both machines have synced fully and Resoph is gone from both, and
  recorded so the other machine's b-notes recognises the new names instead of
  reviving the old ones.
- **Identity can't rest on the filename alone.** A text that arrives under a
  revived old name is the same text. Identical bytes settle that for the
  mechanical copies; for texts that diverged, both must stay and both must
  show.
- **We need the other machine's folder** — at least its names, sizes and times
  — before deciding anything about merging.

## 11. Questions for Danilo

1. The "What I saw him do" list in the brief came through as two empty
   placeholders. What did you see him do?
2. What do `(UP)`, `(E)` and `(P)` stand for? It isn't Resoph's pin (§2.2).
   Could you ask him what it means, and watch how he adds one — does he copy
   it from another name? Are `(UP) n` and `(UP) II n` two volumes of one book?
3. How does he rename a text — in Resoph's title field, or in Explorer? Have you
   seen a rename leave the old file behind?
4. Did you build the four `Arhiva/` folders? Which machines and dates do they
   come from, and is either laptop the second machine?
5. What happened at 18:15 and 19:54 on 2026-09-26 — b-notes starting, Resoph
   opening, the other machine coming online?
6. Did he type the text whose first line is *Naslov teksta*, or did you? And do
   you know how a version-named file got into his list?
7. Does he know that more leading spaces sort higher, or does he just add
   "some more"? Does he sort Resoph by name?
8. Which Windows 10 builds are on the two machines? (Notepad and LF endings.)
9. Do the original files still have their creation times? That would show when
   each text began, not only when it was last touched.
10. Does Resoph on either machine still sync with Simplenote?
11. When he saves in Notepad, does he answer the "save changes?" prompt, and
    which way?
12. For a set of identical copies that differ only by spacing, which name is
    "his" — the most spaces, the most recent edit, something else?

## 12. Parked

Two loose ends from the previous session, not addressed here: about six texts
vanishing from the dev mock corpus under scripted typing, and the deleted strip
once saying 1 while its dialog listed 2. §6 is relevant to both — a version file
reached his real list, and a version-named text reached `Obrisano/`.
