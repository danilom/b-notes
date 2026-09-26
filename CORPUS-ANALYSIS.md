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
- Danilo's observations of him using 0.7.0 for about an hour on 2026-09-26, and
  his notes from it in `TODO.md` (*Brano user test 2026-09-26*), and the
  b-notes logs from that test on one machine.
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
- **Creation times are lost.** Every file was created 2026-09-26 21:52 — when
  his corpus was copied off his machine. The originals' creation times went
  with that copy, so nothing here can say when a text was begun.

## 2. How he names, titles, structures and files

### 2.1 Resoph keeps the title in the filename, not in the file

**This is the most important finding here, and it isn't something he did.**
Resoph appears to store a note as two parts: the title becomes the filename,
and only the rest is written into the file. In Resoph the title shows as the
first line of the note, and editing that line renames the file — which is why
Resoph "renames by the first line" and why there is no title field to find.
Anything opening the file directly — Notepad, b-notes — sees the text *without
its title*.

The evidence, from three angles:

- **By where a file last came from.** Files dropped into the folder from a
  Simplenote export in September 2023 and not written by Resoph since: name
  equals first line in 284 of 320. Every file Resoph has written, from the HP
  laptop import in 2023 through to 2026: name equals first line in **25 of
  888**.

  | last written by | name = first line | related | unrelated |
  | --- | ---: | ---: | ---: |
  | Simplenote export, 2023-09-16, untouched since | 284 | 31 | 5 |
  | Resoph (HP import 2023, and everything 2024–2026) | 25 | 167 | 696 |

- **Against Simplenote.** Simplenote keeps a note as one piece of text, title
  first. For texts whose Resoph name looks unrelated to the file's first line
  and which also exist in the Simplenote export, the Simplenote copy starts
  with a line matching the Resoph filename in 121 cases, and the Resoph file
  simply lacks that line. That's the title, moved out of the text and into the
  name.
- **Against the November 2024 snapshot.** Since then 155 texts changed name
  while the file's content, first line included, stayed byte-for-byte the same,
  and in 14 of 14 texts whose file first line changed, the name didn't follow.
  Both are what editing the title line in Resoph looks like on disk. So is the
  identical-copy debris in §3: names captured at each stage of typing, over
  file contents that never change.

The ~24% where name and first line do agree are mostly Simplenote-era files
that carry their title inside the text as well. In Resoph those presumably show
the title twice.

Danilo has confirmed this by hand on one file. Still worth pinning down in
Resoph (Question 1): what exactly sits between the title and the body (a blank
line, or nothing), what happens to characters Resoph can't put in a filename,
and how it names two notes with the same title.

**What this means for b-notes.** His first lines are not broken, and he didn't
decouple anything: to him the first line *is* the title, exactly as Resoph
shows it. b-notes showed the file without its title, so it showed him a list of
opening sentences, section numbers and notes to himself. Of 1,208 non-empty
live files:

- 100 start with four characters or fewer — often a bare section number
  (34 are only digits), a single letter, or `x`.
- 150 start in ALL CAPS, and many of those are **notes to himself** under the
  title: *this has no point*, *the last part is missing, it was deleted*,
  *don't know if this goes in the story or the songs — decide*.
- 122 start with a line over 80 characters: straight into the first paragraph.

To be a better Resoph, b-notes has to read a Resoph note the way Resoph does:
**the filename (read through Resoph's escapes) is the first line, and the file
is everything after it.**

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
sometimes. What it means is still open (Question 3).

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
or organise anything" — was drawn from a Simplenote backup. What he actually
does is organise *in his titles*, which in Resoph are the first line he sees
and the filename on disk.

### 2.4 Structure and folders

- **No folders of his own.** Everything he writes lives flat in one folder.
  His "folders" are the prefixes above.
- **At least one book-shaped structure**: two numbered sequences under `(UP)`,
  about 185 distinct positions between them, with a few numbers used twice.
  Whatever `(UP)` is, it is the largest thing he is building.
- **The four `Arhiva/` folders** are Danilo's: writing of his that lived
  outside his Resoph folder, moved in so the archive would work out of the box.
  All of it is `.md` because it comes from an attempt to move him to Obsidian;
  he kept going back to Resoph. So the target is, in effect, **a better
  Resoph**. Six archive files were modified after their snapshot date (Nov
  2024 and Mar 2025), so the Obsidian copies were edited at least a little.
  b-notes showed no archive strip, and §7 row 4 is why.

## 3. What Resoph and the machines did to his names

- **Escapes.** Resoph can't write `* ? / \ : <tab>` in a filename, so it writes
  `%2A` (341 times), `%3F` (25), `%2F` (15), `%5C` (6), `%3A` (2) and `%09` (1).
  46 first lines contain a `*` and 33 a `?`, so the marks were at least
  sometimes typed in the title and carried into the name.
- **Leading and trailing spaces.** Resoph keeps them, Explorer won't let anyone
  type them, and some editors refuse to open such files. 327 live names (326 once the conflicted copy b-notes hides is left out) begin or
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

  Each of these is him editing a title line in Resoph (§2.1): every edit to
  the title is a rename on disk, and sometimes the old file survives the
  rename. *Hypothesis for why:* Resoph keeps notes in memory and writes back
  any whose file has gone. The test log shows it doing exactly that to files
  b-notes renamed (§6). A second Resoph — the same machine's Notepad-and-Resoph
  pile-up, or another machine through Dropbox — would bring old names back the
  same way. Either way, **every title edit he makes is a potential duplicate**,
  and he makes a lot of them.
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

About an hour of use on 2026-09-26 — the test sessions, which account for the
times below — left:

- `settings.json`, one new text, a `Verzije/` folder with two copies of it, and
  an `Obrisano/` folder holding one 1-byte file.
- **A file in his list named like a version timestamp**, with a version's text
  but CRLF endings — which b-notes never writes. Something other than b-notes
  copied a version into his list. The file in `Obrisano/` carries another
  version's name, so a version-named text was in his list and then deleted.
- **Batches of numbered copies**, eight groups at a time.

**What the log shows** (`testdata/2026-09-26-B-notes-logs-dell`, six runs,
18:14–20:25; the machine was offline, so no Dropbox; Resoph and Notepad were
open the whole time):

- **b-notes and Resoph fed each other.** At three of the starts (18:14, 18:16,
  20:25) `settleNames` renamed the same eight bare names — `X` beside `X (1)` —
  to the next number. Between starts, Resoph wrote all eight bare names back:
  at 18:15:05, with b-notes still open, and at 19:54:45, seven seconds after
  b-notes closed. Each round added eight files, and the list grew from 1,196
  texts to 1,215 in two hours. Resoph evidently rewrites, from memory, any note
  whose file has disappeared. The version-named file in his list was written
  one second into the second Resoph batch, with Resoph's CRLF endings — so
  Resoph apparently also picked up a file from b-notes' `Verzije/` subfolder
  and wrote it into his list as a note. That one is a hypothesis.
- **His edits to three texts never reached the disk.** All three had
  space-edged names. One was edited for about 30 minutes across two runs, with
  78 failed saves (up to 47 in a row); another failed 26 times in 8 minutes.
  At each close the window "finished saving" in under 80 ms, with the saves
  still failing. **What he typed into those texts in b-notes is gone**, unless
  he typed it again in Resoph.
- **The copy button never worked** in the installed build: eight tries, each
  `Cannot read properties of undefined (reading 'writeText')` — the
  *Tekst nije kopiran* in `TODO.md`.
- One `.md` in his folder was converted to `.txt` at the first start.

### Would b-notes make it worse if pointed at his folder again?

Yes. The numbering rule is the smaller part of it. Running b-notes' own naming
functions (`note-naming.ts`, `note-title.ts`) against the folder as it is now,
planning only and renaming nothing:

- **Next start: no renames.** `settleNames` finds nothing to settle in the
  folder as it stands. The numbering rule causes harm only in combination:
  each time Resoph writes a bare name back beside numbered siblings, the next
  start moves it to a new number, as above. With Resoph running on the same
  folder, that's one more file per affected group per round.
- **First save of each text he edits** — the real damage:
  - **326 texts can't save at all.** Their names fail the id check, and the
    autosave retries in memory. That is the *Izmjene nisu sačuvane* he kept
    seeing in the test.
  - **576 texts would be renamed after the first line of the file** — 47% of
    his list. That line is his opening sentence, a section number or a note to
    himself, and it would replace his title. 66 of those would clash with each other
    (up to five texts wanting the same first line) and be numbered, and 3
    would push an untouched text of his aside to a number.
  - 312 keep their name.
- Every one of those renames is then a candidate to come back as a duplicate,
  from Resoph or from the other machine (§10).

Until the next build in §9 is in, b-notes should only be run
against a copy of his folder.

## 7. The assumptions, against the evidence

| # | b-notes assumes | verdict | why |
| --- | --- | --- | --- |
| 1 | **Title = first line** (`titleFrom`) | **holds for him, breaks on disk** | To him the first line is the title, as in Resoph. But Resoph keeps that line in the filename and out of the file (§2.1), so b-notes, reading the file, never sees his title: it showed opening sentences, section numbers and notes to himself. |
| 2 | **Filename derives from the title and follows it** (rename on save when the first line changes) | **holds as Resoph's rule; breaks as implemented** | Resoph does rename on a title edit. b-notes takes the title from the *file's* first line, so its first save of a Resoph note would replace his title with his opening sentence — and Resoph, still holding the old name, writes it back (§6). |
| 3 | **A note id is a trimmed name** (`isNoteId`, `requireNoteId`) | **breaks, worst of all** | 326 texts — 56% of his writing, his highest-ranked and most recent — have names with spaces at the edges. `save`, `read` and `moveToDeleted` throw for all of them, and the autosave retries forever. Matches the frequent *Izmjene nisu sačuvane* in the test. |
| 4 | **One flat folder** | holds for him; bends for archives | He keeps no folders. But archive folders are listed through `isNoteFile`, which only takes `.txt`, and all 3,004 archive files are `.md` — so every archive reads as empty, which is why the strip never appeared in the test. |
| 5 | **What counts as a text**: `.txt` in the root; `.md` converted on sight; conflicted copies set aside | bends | Right about extensions. Wrong to hide the conflicted copy (102 KB of a ranked text, silently gone). A zero-byte file can be a whole note. |
| 6 | **Duplicates are named ` (n)`, and a group is all-numbered or bare** (`claimName`, `settleGroup`) | **breaks** | His duplicates are mostly spacing and prefix variants, not ` (n)`. 31 names already end in ` (n)` (the old claim was none of 592). Renaming to keep the rule on a folder another writer shares is a duplicate factory (§6). |
| 7 | **Migration is triggered, never ambient** (`TARGET-USER.md`) | **breaks in the code** | `convertToPlainText` and `settleNames` rename files on his live Dropbox folder at every start. |
| 8 | **b-notes is the only writer** (single instance, autosave, "save" never his job) | **breaks** | Resoph and Notepad have the same files open at the same time — through the whole test, and Resoph rewrote files under b-notes (§6) — and other machines write to the same folder through Dropbox. Nothing checks whether a file changed on disk between b-notes reading it and writing it; the copy-before-a-big-loss rule catches only large shrinkages. |
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
| 19 | **Line endings don't matter; writing LF is fine** | bends | His files are CRLF. b-notes writes LF, and Notepad before Windows 10 1809 shows an LF file as one line (Question 5). It also breaks our own rule of preserving a file's endings. |
| 20 | **Versions stay in `Verzije/`** | bends | A version got into his list (§6). Whatever carried it there, the design assumed nothing else looks in that folder. |

## 8. What b-notes has to survive, worst first

Ranked by what it costs him. Losing or hiding his writing comes first, then
losing his organising, then clutter and wear.

1. **Texts it can't save.** Every edit to 326 of his texts — the ones he ranks
   highest and touches most — fails and retries in memory. If the window closes
   first, the edit is gone. This happened in the test, to three texts (§6).
   *Loses writing.*
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

Not code, and not decided. The design continues in `RESOPH-COEXISTENCE.md`. Three facts shape all of it:

- **Resoph stays.** Years of trying other tools haven't moved him off it, and
  nothing will until something is clearly better. So b-notes lives beside
  Resoph in the same folder, often with Resoph open at the same moment, on
  three or four machines. That isn't a transition to get through. It's the
  condition to design for.
- **Resoph's format is known** (§2.1): the title is the filename, and the text
  is the file. Living beside Resoph means speaking that format.
- **Cleaning up filenames is not on the table yet.** His names break Notepad,
  zip and Explorer, and they will have to be dealt with. But any rename in a
  folder that several Resophs remember gets undone (§6, §10), so it waits.

### The next build: first, do no harm

For a build in his hands within days. Ordered by the harm each item prevents;
each removes a failure seen in the log or predicted by the simulation in §6.

1. **Accept every name on disk.** Ends the lost edits and *Izmjene nisu
   sačuvane* for 326 texts.
2. **Rename nothing.** No settling of ` (n)` groups at startup, no conversion
   on sight, no rename when a first line changes. This ends the loop with
   Resoph and the 576 predicted renames. It also means no editing of titles in
   this build, which is fine: he can't edit them in b-notes today either.
3. **Show his title.** In the list, and above the text, show the filename read
   through Resoph's escapes (`%2A` → `*`), since that is his title. Search it
   along with the text. Without this his list is 1,200 opening sentences.
4. **Never write blind.** Before each write, check the file is still what
   b-notes last read. If Resoph, Notepad or Dropbox changed it, keep both —
   the other version as a copy of the text — rather than overwrite. When nothing
   is waiting to be saved, reload a text whose file changed on disk.
5. **Mind Resoph while b-notes is open.** Resoph rewrites notes it remembers,
   so with Resoph open, any rename or move b-notes makes is undone. That
   includes *deleting* a text, which moves it into `Obrisano/`. What b-notes can
   do:
   - Notice Resoph running (its process) and log it, always.
   - While it runs, hold off anything that moves a file (deleting, restoring,
     bringing back from the archive), and say so plainly where the button is.
   - Possibly offer to close Resoph for him — asking it to close the way a
     click on its close button would, never killing it. Whether Resoph saves
     on that, and what its tray icon does, needs trying first (Question 2).
     It must never be a question he can't answer.
6. **Hide nothing.** Show the conflicted copy next to the text it came from.
   Never remove a zero-byte file, because its name is the note.
7. **Keep line endings as found.** Write CRLF to a CRLF file.
8. **Fix the copy button** (the log's `writeText` failure).

New texts in this build: the simplest safe choice is the current one — named
from the first line when created, with the whole text, title line included,
written into the file. Resoph will show such a title twice, as it already does
for his ~300 Simplenote-era texts. (Question 9.)

### After that: a better Resoph

- **Read and write the full Resoph format.** The title shows as the first line
  of the text, as it does in Resoph; b-notes splits it into filename and file
  when it saves. Editing a title becomes a rename, and a rename is only safe
  when no Resoph is running on this machine — and never safe against another
  machine's Resoph (§10). That's why it comes after the first build.
- **Read his marks, don't make him follow ours.** Turn what he already types
  into things the app shows: rank (spaces, `*`, `AA`), sinking (`zz`, `y`),
  collection and position (`(UP) n`, `(UP) II n`, series codes), kind (`(E)`,
  `(P)`), status (*this one*, *final*, *work on it*, *spare*, *pointless*).
  He'll keep typing marks in new ways, so the parser follows his habits and
  doesn't enforce a grammar. The raw title stays one click away.
- **Give him his order back.** A list in his title order, with the arms race
  collapsed into rank. Newest-first stays as *recent*.
- **Better ways, alongside the old.** A real *this is the current one*, a real
  pin, a real collection with order, each kept outside the filename so setting
  it never renames anything. Stored so that several offline machines can
  merge it: one small file per machine, combined on read, not one shared file
  that Dropbox splits into conflicted copies.
- **Collapse byte-identical copies in the view.** One row, "also kept under 6
  other names". Safe because the bytes are identical. Deliberate drafts keep
  the conservative grouping rules in `TARGET-USER.md`.
- **Archives read `.md`**, so the archive strip appears at all.
- **Measure the 300 KB case** on the slowest laptop.

### Later, not on the table: cleaning up filenames

The copy-out idea stays the best shape found so far: a folder of b-notes' own
with clean, safe names (plain ASCII is the safe end), copied from the Resoph
folder, which is never written again. A re-runnable import brings in whatever
lands in the old folder later, from any machine. The blocker is the same as
before, stated more strongly: it only works once Resoph is no longer writing
the old folder anywhere. Until then his Resoph edits land where b-notes no
longer looks, and b-notes' edits never reach Resoph.

## 10. The other machines

There are three or four, not two, each with its own Resoph, each offline for
long stretches, all syncing one Dropbox folder. This corpus is one machine's
view.

- **A rename can be undone by any Resoph that remembers the old name.** The log
  shows Resoph rewriting notes whose files vanished within minutes. A Resoph on
  another machine does the same when it next saves, and Dropbox then carries
  the old name back to everyone. That is almost certainly where most of his
  identical copies come from — his own title edits in Resoph, undone somewhere
  else — and why no cleanup by renaming can work.
- **b-notes can't stop Resoph's duplicates, but it mustn't add to them.** It
  renames nothing, and it recognises identical copies for what they are.
- **Identity can't rest on the filename alone.** A text that comes back under
  an old name is the same text. Identical bytes settle that for the mechanical
  copies; texts that diverged must stay apart, and both must show.
- **The other machines' folders** (names, sizes and times are enough) would
  show how far they've diverged. Useful soon, but the next build doesn't wait
  on them: everything in it is about not making things worse, whatever state
  the folder arrives in.

## 11. Questions for Danilo

Answered so far: the test times (the b-notes sessions), the archives (yours,
from the Obsidian attempt), creation times (lost in the copy), the title/first
line split (Resoph's format, confirmed on one file), whether Resoph can leave
(no), and filename cleanup (later).

1. **Resoph's format, precisely.** What separates title and body in the file —
   nothing, or a blank line? Which characters become `%XX`? How does it name a
   second note with the same title? And does it pick up `.txt` files in
   subfolders? Put one in a subfolder and see if it appears in the list.
   b-notes' `Verzije/` and `Obrisano/` sit inside his folder, and the version
   file that turned up in his list suggests Resoph may be reading them.
2. **Closing Resoph.** What is its process called? With "minimize to system
   tray" on, does its close button quit or hide? Does it save everything when
   asked to close? And would you want b-notes to offer to close it?
3. What do `(UP)`, `(E)` and `(P)` stand for? It isn't Resoph's pin (§2.2).
   Worth asking him, and watching how he adds one.
4. Does he know that more leading spaces sort higher, or does he just add
   "some more"? Does he sort Resoph by title?
5. Which Windows versions are on the machines? At least one has Windows 11's
   Notepad, with tabs that come back.
6. Does Resoph on any machine still sync with Simplenote?
7. When Notepad asks whether to save changes, what does he answer?
8. For identical copies that differ only in spacing, which title is "his" —
   the most spaces, the last edited, something else?
9. New texts in the next build: keep the title line in the file (Resoph shows
   it twice), or write the Resoph way from the start?

## 12. Parked

Two loose ends from the previous session, not addressed here: about six texts
vanishing from the dev mock corpus under scripted typing, and the deleted strip
once saying 1 while its dialog listed 2. §6 is relevant to both — a version file
reached his real list, and a version-named text reached `Obrisano/`.
