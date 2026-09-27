# Living beside Resoph

How b-notes lives with ResophNotes while he still uses it: what Resoph does,
the approach, and the first cut of the design (Stage 0). Each part is marked
*decided*, *proposed* or *open*. The evidence is in `CORPUS-ANALYSIS.md`.
Decided parts move into `DESIGN.md` as they're built.

He will keep using Resoph until b-notes is clearly better, on three or four
machines — the Dell and the Asus first — each offline for long stretches. His
Resoph `.txt` folder syncs through Dropbox; each Resoph's database does not.
That is the condition, not a phase. The aim is to wean him off Resoph by
being better, never by taking it away.

## 1. What Resoph does

From his folder, the 0.7.0 test log, and Danilo trying it by hand:

- **Resoph keeps every note in a database of its own, one per machine**, at
  `%USERPROFILE%\.ResophNotes\`: two XML files, one for settings and one for
  the data. They live outside Dropbox, so each machine's Resoph has its own copy
  of everything. The content isn't encrypted but base64: each note's full text,
  plus created and modified times, a deleted flag, a Simplenote key, and tags —
  `pinned` among them.
- **A note is its title, a blank line, and the file's text.** Checked, not
  guessed: with his whole (redacted) corpus loaded into Resoph on the VM, every
  one of the 1,215 notes in Resoph's database is exactly that — an empty file
  included, which is the title and the blank line. `scripts/check-resoph-reading.mts`
  compares what b-notes reads from the folder with what Resoph holds, note by
  note, and prints counts only, so it can be run on his own machines too.
  (The one hand-made note sampled earlier, with a single line break, was typed
  that way in Resoph; no file-backed note looks like it.)
- **The database is live, not left over** from before `.txt` storage was
  switched on. In Danilo's sample, a note created 2026-09-19 carries a
  `<modify>` of 2026-09-26 23:18 and a `<filemodify>` of 23:57 the same night.
  Resoph is still writing it, and it records each file's modification time,
  which only makes sense for keeping the two in step. The notes coming back
  after their files were deleted are the same behaviour. To confirm on each of
  his machines: edit a note in Resoph and see whether the data file's
  modification time moves.
- **The `.txt` folder is a mirror of that database.** Each note is written as a
  file named after its title, holding the rest of its text. Resoph shows the
  filename as the note's first line. Editing that line renames the file.
- **It puts back whatever it remembers.** Delete or rename a note's file, even
  with Resoph closed, and on its next start Resoph writes it back — sometimes
  more than once. A rename becomes two notes: tried on the VM with his corpus
  loaded, Resoph wrote the file back under its old name *and* took the renamed
  file in as a new note. That is a duplicate from a single rename, on a single
  machine. While it runs it does the same within minutes: the test log
  shows eight files renamed by b-notes being rewritten twice.
- **This is almost certainly where his identical copies come from.** Retitle a
  note on one machine and that Resoph writes a new file. The other machines'
  Resophs still hold the old title: they write the old file back, and take the
  new file in as a new note. Both names then live on in every database.
- **It reads files changed on disk** — when it next saves. What happens when its
  own copy has also been edited isn't known, and may not arise in practice.
- **It saves as it goes**, not only on closing.
- **Its close button hides it in the tray**, probably behind the tray's arrow,
  where he'd never find it.
- **It lists `.txt` files in subfolders**, live, and makes an empty note in the
  main folder for each one, titled with that file's name. So nothing of b-notes'
  may sit inside his folder.
- **Simplenote** keeps one piece of text per note, so a Simplenote export
  carries the title inside every file. That's why his ~300 Simplenote-era files
  do — 294 in this corpus — and Resoph shows those with the title twice.
  b-notes shows it once, the one deliberate difference from Resoph.
- **Characters it can't put in a filename** become `%2A` (`*`), `%3F` (`?`),
  `%2F` (`/`), `%5C` (`\`), `%3A` (`:`), `%09` (tab). Leading and trailing spaces
  are kept.
- **The title-outside-the-file format is a setting**: `<fileincludetitle>false`
  in Resoph's config, `%USERPROFILE%\.ResophNotes\resophnotesconfig.xml`,
  beside `<filedatabase>true` (the `.txt` mirror) — as seen in Danilo's copy.
  The config is plain XML; strings in it are base64 like the database. It holds:
  - `<userdata9>` — the notes folder (`D:/B-notes-diagnostic/D-Respoph-tryout`
    in Danilo's), so b-notes can find his Resoph folder without asking;
  - `<systray>` — minimize to tray;
  - `<enablesync>` — Simplenote sync;
  - `<sorttype>` — how his list is sorted.

  Flipping `fileincludetitle` on his machines would make every Resoph rewrite
  every file at once, on every machine — never touch it.
- **Process name:** `ResophNotes.exe`.
- "Since 2023" in the analysis is only where the evidence stops. Resoph hasn't
  changed since 2018, so it has almost certainly always worked this way.

**What follows: b-notes can never safely rename, move or delete anything in his
Resoph folder.** Any Resoph on any machine that remembers a note will put it
back. *Decided.*

**What the database offers.** Read-only, it is the best record there is: his
real Resoph pins, when each note was created (lost from the files), notes that
exist in a database but not as files, and the notes each machine has that the
others don't. A census of each machine's database — counts, dates, pins,
deleted flags, never content — would show how far the machines have diverged.
It's also where the eventual switch (§6) should read from. *Proposed.*

## 2. The approach — *proposed*

**b-notes reads Resoph's folder and writes only its own.** Resoph's folder is a
read-only source that b-notes keeps looking at. Everything b-notes writes goes
into a folder of its own, which Resoph never sees.

**Why this, and not sharing one folder:**

- **The ongoing import is b-notes' strongest selling point.** Whatever he
  writes in Resoph turns up in b-notes, so b-notes is always the place that
  has everything he has ever written — the thing `TARGET-USER.md` says will
  impress him first. It also takes the pressure off the week: if he drifts
  back to Resoph for a day, nothing he writes there is lost to b-notes, and
  coming back costs him nothing.
- **b-notes can't harm a Resoph note**, because it never writes where Resoph
  looks. After the 0.7.0 test, that's the promise that rebuilds trust.
- **Resoph can't harm a b-notes text**, because it never sees them. Nothing it
  puts back, renames or rewrites reaches b-notes' folder.
- **b-notes gets to be itself** in its own folder: its own names, versions and
  deleting, with no need to play by Resoph's rules.
- **Running together stops being dangerous.** With nothing shared to fight over,
  Resoph open beside b-notes costs at most a text that moved on in both.
  Asking him to close Resoph at startup (§4.10) becomes about habit, not
  safety.

Sharing one folder was designed first (the history of this file has it) and
set aside: every rename, move or delete there is undone by some machine's
Resoph, and the only defence was stopping everything while Resoph ran.

**Nothing goes back to Resoph.** What he writes in b-notes isn't in Resoph,
which nudges him towards b-notes. Anything b-notes wrote into Resoph's folder
would live forever in every Resoph's database, warning copies included. The
one exception worth considering later is a single signpost note (§4.11).

## 3. The idea in one paragraph

His list in b-notes is every text in his Resoph folder, plus every text b-notes
holds itself. A Resoph text is shown straight from Resoph's file, read-only
underneath, and looks exactly like any other text. **The first time he changes
one, b-notes quietly copies it into its own folder and saves the change
there**, and from then on that copy is the text. The Resoph file is left
exactly as it was. Nothing is imported in bulk, so there are no 1,200
duplicates to keep in step. If Resoph later changes a text b-notes has copied,
b-notes brings the change in, and nothing is lost either way.

## 4. Stage 0

**Built** on branch `stage-0-resoph-source` (2026-09-27), as below, with these
differences from what follows:

- **Line endings (§5 Q5) were left as they were.** b-notes still writes `\n`,
  a deliberate earlier choice, until the Windows builds on his machines are
  known.
- **Knowing a Resoph file under a new name (§4.6) is not built.** A text he
  retitles in Resoph after b-notes has copied it shows as a second text — an
  untidy duplicate, never a hidden one.
- **A change Resoph makes to a text he has put away** is not brought in; only
  texts in his list are compared.
- **Search is not re-ranked**; that is its own item in `TODO.md`.
- **The copy's link** is written as §4.4 says, but hiding the Resoph original
  also works from the copy's name alone, so a link lost after its copy was
  written can never hide a text.
- **A new text is named from its first line as it stands at the first save**,
  about a second after he starts typing, rather than once the line is
  finished (§4.7). The name can hold half a title. Nothing reads it and it is
  never renamed, but someone looking in the folder may be misled.
- **Never writing blind** is built for b-notes' own folder: a file changed
  behind b-notes — another machine through Dropbox, Notepad — is kept as a
  version labelled `izmenjeno drugde` before his words are written over it.
  It is kept quietly; no mark says so yet.
- **b-notes' folder can never be Resoph's or inside it**: such a choice in the
  advanced panel is set aside for the default beside Resoph's, and logged.
- **Closing the other editors** asks each one first. Resoph, if that only hid
  it, is then ended once its files have stopped changing and been copied into
  `userData/resoph-copies` — copied after the polite close, because hiding is
  when Resoph saves its database. About ten seconds on the VM.
- **b-notes switches off Resoph's minimize-to-tray itself** — at every start
  when Resoph is not running, and right after ending it otherwise — by setting
  `<systray>` to `false` in Resoph's settings, with the file copied aside first
  and every other byte left alone. Tried on the VM: Resoph starts normally with
  the edited settings, and asked to close the way its X does, it now quits.
  So closing it needs force at most once per machine.
- **Once per machine**, recorded in `userData/resoph-tray.json`. If someone
  turns tray mode back on afterwards, b-notes leaves it: that was a choice.
- **The advanced panel says where it stands**: *Resoph tray: off (switched off
  by b-notes 2026-10-02)* in the panel's grey, or in red while it is on — with
  why, if it was turned back on. One glance on a visit or down the telephone.

### 4.1 Two folders — *decided*

- **His Resoph folder**, read and never written. Only its top level: Resoph
  itself lists subfolders, but nothing of b-notes' will be there. b-notes can
  find it in Resoph's config (§1) rather than asking.
- **b-notes' folder**, beside it in Dropbox — say `Dropbox/b-notes/`: his
  b-notes texts, their versions, deleted texts, `settings.json`, and what links
  a copied text to the Resoph file it came from. Plain text throughout, and it
  opens in Notepad.

The table *Where his things are kept* in `DESIGN.md` changes with this.

### 4.2 The list — *proposed*

- **Every Resoph text b-notes hasn't copied, plus every b-notes text.** A copied
  Resoph text shows once, as its b-notes copy.
- **His titles, in his order.** Titles sort the way Resoph sorts them, so
  leading spaces, `*`, `(UP)`, `AA` and `zz` keep doing what he put them there
  to do. *Nedavni* stays as it is. *Decided, for now* — the mess gets cleaned
  up later (§6).
- **Sorted as they are, not shown as they are** — *decided and built* (branch
  `list-title-marks`). A row starting with thirty spaces looks broken. The
  order already carries his rank, so the list shows a title without its
  leading spaces, runs of spaces inside it collapsed and Resoph's `%2A` shown
  as `*`. What he typed stays untouched in the text itself.
  - Leading spaces become a signal of three rising bars, one to three lit:
    1–15 spaces, 16–23, 24 and more. The same width at every rank.
    His widths bunch at 16 and 24.
  - The marks at the front that he spells consistently — `(UP)`, `*(UP)`, the
    kinds `A (E)`, `A(E)`, `AA(E)`, `yA (E)`, `ZA (E)`, `A(P)`, `AA(P)`, and
    `AA`…`AAAA`, `ZZ`…, `zz`…, `y` — are drawn small in the accent blue, still
    as his letters. 536 of 1,215 titles carry one.
  - A `*` in front of the name — after the leading spaces, a mark or a series
    number, or typed into `*(UP)` — is drawn as a small grey ★ in one place,
    just before the name. The `A` he floats it with (`A (E) A* Avdo`) only
    sorted, and isn't shown. Stars inside or after a name (`Sorabi**`) stay as
    he typed them.
  - Everything in front of the name is one space's width apart, on the name's
    baseline, and every row starts at the same place. No columns: his padding
    is for sorting. The marks are the one part in colour; the signal, series and
    star are grey.
  - The number after `(UP)`, with its series (`II`) if there is one, is drawn
    grey after the mark; 205 titles have one.
  - Anything else — half-typed marks, one-off spellings — is left as text.
  - The order is Resoph's, near enough: by character, ignoring case, so
    spaces, then `(`, `*`, `-`, digits, letters. Only where two titles part
    on a letter does the Serbian alphabet decide (`č` after `c`). Checked
    against screenshots of Resoph's list on his corpus (2026-09-27): the same
    order row for row, except that Resoph sorts `č ć š ž đ` after `z`. A text
    starting with one is the last row of his list, where he doesn't look —
    "ČAJ s ledom" looked lost until a search found it. b-notes keeps them in
    the alphabet on purpose.
- **Search covers titles and text**, with and without diacritics, as now. Not
  weighted by where a text comes from: on day one nearly all his writing is
  untouched Resoph texts, so pushing those down would bury it. Better ranking
  (title matches first, then recency) is its own item in `TODO.md`.
- **Every text knows where it comes from**: untouched in Resoph, copied from
  Resoph, or b-notes' own. It's in the log, and shown only to Danilo (a dev
  build, or a switch in the advanced panel). A badge he'd see raises "what is
  Resoph doing in here?", a question he can't answer. Whether he ever sees it
  is P2.
- **Refreshed whenever b-notes comes to the front**, and at start. A pass over
  1,200 files' names, sizes and times is cheap; only changed files are read.
- **Nothing is hidden.** Resoph's identical copies show as they do in Resoph.
  Collapsing them waits for later. A Dropbox conflicted copy shows as a text
  of its own.

### 4.3 What a title is — *decided*

**The title is the first line, as it is in Resoph.** A Resoph text is shown as
its title (its filename, read through Resoph's escapes), a line break, then the
file's text: exactly what he sees in Resoph. A b-notes text holds its title as
its first line.

This revisits "title outside the editor". That was right while b-notes lived
in Resoph's folder, where a title edit meant a rename nobody could make stick.
Here nothing is ever renamed: a b-notes file keeps the name it was given, and
its title is simply its first line. So **he can retitle freely**, leading
spaces and all, and his ranking-by-retitling keeps working. Resoph keeps the
old title, like everything else b-notes doesn't send back.

Titles are kept exactly, leading spaces included, for sorting. How they are
displayed is a separate question (§4.2).

**The title is the first line and nothing cleverer** — *proposed*. Today
`titleFrom` keeps reading past a first line of four characters or fewer, and
cuts at 50 characters. Both were built for his Simplenote export, where the
first line was often a fragment. Now the first line is his real title,
exactly as Resoph shows it, even when it's `i` or `Ana1`. So: the first
non-empty line, as it is. Length is cut only on screen, by the list itself.

### 4.4 Copy on first touch — *proposed*

- **The first edit to a Resoph text copies it** into b-notes' folder — the title
  line, then the text — and saves the edit into the copy. Nothing on screen
  changes; he just keeps typing.
- **A link records where it came from**: the Resoph filename, its text at the
  moment of copying, the file's modification time, and this machine's file ID.
  Written once and never changed, so two machines can't disagree about it.
- **The same goes for anything else that acts on a Resoph text.** Deleting
  one copies it into *Obrisano*, and a kept version needs a copy to belong to.
  Every action starts by making the text b-notes' own.

### 4.5 When Resoph changes a text b-notes has copied — *proposed*

b-notes compares the Resoph file with everything it already holds for that
text — the text itself and its versions. Anything it has already seen isn't
news. That quietly handles another machine's Resoph putting an old version
back.

A Resoph change that is new:

- **If b-notes hasn't changed the text since**, Resoph's version becomes the
  text, and b-notes' previous one becomes a version. He wrote in Resoph, and
  b-notes shows what he wrote.
- **If both changed**, the newer becomes the text and the other a version.
  Nothing is lost. *Open:* how he's told — the choices are in §5.

Versions that came from Resoph are named as such, so all of this can be
worked out from the files themselves, with no extra record to keep in step
across machines.

### 4.6 Knowing a Resoph file under a new name — *proposed*

When he retitles a text in Resoph that b-notes has copied, its link points at a
filename that has gone, and a new one has appeared.

**What a retitle in Resoph does to the file** — tried on the VM with his
corpus loaded, by adding a word to one note's title: Resoph wrote a *new* file
under the new name and deleted the old one. The new file had a new ID, new
modified and created times, and exactly the same bytes — the title lives in
the name, so the file's text did not change. Nothing else in the folder
changed, and no half-typed names were left behind.

So the signals, in the order they are trusted:

- **The file's text, unchanged under a new name.** In one refresh, the linked
  file left and one arrived whose file text is byte-for-byte the same. That is
  exactly what a retitle leaves; refreshing on every return to b-notes keeps
  the pairs small.
- **File IDs: useless.** Resoph writes a new file, so a retitle gets a new ID.
- **Modification times: useless for this.** The new file is dated the moment
  of the retitle. (His byte-identical copies sharing a time to the second must
  come from something else — another machine's Resoph writing its database
  out, or Dropbox — and are not evidence about retitles.)
- **Creation times** are local to one machine, and reset by any copy.

A retitle combined with an edit to the text in one sitting leaves nothing to
pair by, and shows as a second text — and an edit is a keystroke away.

**Resoph's own record of the note** survives both. Danilo saw the retitled
note's `<object>` keep its place in Resoph's database and its `<create>` time.
But — *not built; open*:

- `<create>` alone names only about half his notes. With his corpus loaded on
  the VM, 539 of 1,215 share a creation time with another, one group of 156:
  Resoph dates a note it takes in from a file by that file's time, and his
  2023 bulk imports dated hundreds to one second.
- Creation time and position together would tell them apart, if the position
  is stable when notes are added and deleted and when Resoph rewrites the
  file. Untested. Deleted notes appear to stay in the list with
  `<delete>true</delete>`, which would help.
- Resoph saves its database when its close button hides it, not as he moves
  between notes. b-notes closes Resoph before reading anything at startup, so
  the database should be current then; during a session it can lag.
- It knows only this machine's retitles. Another machine's arrive through
  Dropbox as a file gone and a file come.

Until then a text he retitles in Resoph after b-notes copied it shows as a
second text: untidy, never hidden.

When no signal is sure, the new Resoph file shows as a text of its own beside
the b-notes copy: a duplicate, which is untidy but can be fixed later. Linking
two different texts would file one out of sight as a version of the other. So
**link only when sure**.

### 4.7 New texts, and what b-notes names its files — *proposed*

- New texts are written into b-notes' folder only.
- **Named once, when the first line is finished** — he presses Enter or leaves
  it — and never renamed. Before that the draft is kept under a temporary name
  in b-notes' folder, so nothing he types is ever only in memory.

**What a filename has to do.** He never sees it; to b-notes it *is* the text.
So one name must mean one text, on every machine, forever:

1. **Same text, same name, everywhere.** If the Dell and the Asus both copy the
   same Resoph text while offline, they must pick the same name. Dropbox then
   sees one file changed in two places, which is exactly true, and §4.5
   handles it.
2. **Different texts, different names, everywhere.** If two different texts
   ever get the same name on two machines, Dropbox sees one file changed in
   two places, which is false. §4.5 would then file one text out of sight as
   a version of the other.
3. **Decided without looking at the folder.** Each offline machine sees a
   different folder, so "take the next free number" gives different answers
   on different machines and breaks both rules above.

**Where the danger is, concretely:**

- *His spacing variants.* Resoph has `Pismo`, `   Pismo` and `         Pismo`
  as three separate texts. Cleaned for a safe filename, all three become
  `Pismo`. If he edits two of them, their copies must still be two files
  (rule 2).
- *Common first lines.* Two new texts that both begin `Pismo` — or `1`, which
  34 of his texts begin with — started on two machines while offline. Each
  machine sees no `Pismo` yet and picks `Pismo`. Rule 2 again.
- *Numbering doesn't save either case*, because each machine numbers against
  its own folder (rule 3).

**The rule: a readable part, and a tag that makes it unique.**

- **Readable part**: the title, cleaned — diacritics folded to plain letters
  (the fold search already uses), anything but letters, digits, spaces and
  plain punctuation replaced, spaces collapsed, edges trimmed, cut near 50
  characters, Windows' reserved names avoided, *Bez naslova* if nothing is
  left. Only there so a person looking in the folder can tell what's what.
- **Tag for a copy of a Resoph text**: six characters computed from its exact
  Resoph filename, spaces and all — a checksum. The same Resoph file gives the
  same six characters on every machine (rule 1). `   Pismo` and `         Pismo`
  give different ones (rule 2).
  `Pismo ~k3f9a2.txt`, `Pismo ~p81xq0.txt`.
- **Tag for a new text**: when and where it was started, e.g.
  `Pismo ~2026-09-27 14-32-10 Dell.txt`. No two machines can produce the same
  one (rule 2), and nothing else could have made that name, so there's never a
  first copy to collide with.
- **Always tagged.** An earlier draft of this left the tag off when cleaning
  changed nothing. That's prettier, but it's one more rule to get right, for
  names nobody reads.
- **Never ` (n)`**, and nothing is ever renumbered.

**Why in the filename, and not in a record beside it.** Dropbox reconciles by
path and nothing else. If two machines write the same path, Dropbox merges
them into one file plus a conflicted copy before b-notes sees anything, and no
record anywhere can undo that. So whatever decides *which text this is* has to
be in the path:

- A **record in Dropbox** mapping Resoph files to b-notes files would be written
  by two offline machines, each choosing differently, and would itself become
  a conflicted copy to reconcile.
- A **record per machine** (`userData`) never reaches the other machines. The
  Asus wouldn't know the Dell had already copied a text, and would copy it
  again under a name of its own: a duplicate.
- A name **computed from the text's origin** needs no record, and nothing about
  it can fall out of step.

Records still have their place, for what doesn't decide identity:

- **The link** (§4.4) — which Resoph file a copy came from. The checksum can't
  be run backwards, so this is written down, in b-notes' folder, under the
  copy's own name. It's written once, and any machine that writes it writes
  the same thing, so Dropbox has nothing to argue about.
- **Per-machine hints** — file IDs and the modification times last seen, for
  spotting renames (§4.6). These go in `userData`. They mean nothing on another
  machine, and losing them costs a missed rename, never a text.

The readable part is fixed when the file is made. If he retitles the text
later, the name keeps the old title. That's harmless — nothing reads it — but
someone looking in the folder should know.

What goes from today's code: numbering on collision, which renamed *other*
texts to make room; stripping his own ` (1)`; and Serbian letters in names,
which Windows' own zip mangles.

### 4.8 Versions and deleting — *proposed*

- **Versions** as today, in b-notes' folder.
- **Deleting** works as designed, inside b-notes' folder. A Resoph text is
  first copied there (§4.4), and the list stops showing the Resoph original.
- **Restoring** brings the b-notes copy back. The Resoph file never moved, so
  there's nothing to undo there.
- **Emptying the text** keeps a version first, as now.

### 4.9 Several machines — *proposed*

Every machine's b-notes reads the same Resoph folder and writes the same b-notes
folder, both through Dropbox, often after long offline stretches.

- **Untouched Resoph texts need nothing**: every machine reads the same file.
- **Two machines copying the same Resoph text offline** write the same
  filename (§4.7). If neither edited it further, the files are identical and
  Dropbox has nothing to argue about. If both did, Dropbox makes a conflicted
  copy.
- **A Dropbox conflicted copy in b-notes' folder is a text that moved on in
  two places**, the same situation as §4.5, and it's handled the same way:
  newer is the text, the other a version. Never hidden, never silently dropped.
- **Links are written once and never changed**, and everything else is worked
  out from the files, so there's no shared record to fall out of step.

### 4.10 Resoph and Notepad while b-notes runs — *proposed*

- **At startup, b-notes asks him to close them.** One big, plain, modal message:
  close Resoph and Notepad (and Obsidian, if it's running), then carry on. A
  button does it for him, because Resoph hides in the tray. b-notes reads his
  folders only once they're gone, so it starts from whatever they last wrote.
  Here it isn't needed for safety. It breaks the habit of having all three
  open, and it cuts down on texts moving on in two places at once. *Decided
  in outline.*
- **And whenever he comes back to b-notes** — *decided and built*. Not during
  a session, which would stop him mid-sentence, but at the one moment a
  message costs him nothing: the window regaining focus, which fires only when
  the whole window comes back from somewhere else. What he typed is saved
  first; then the same message if Resoph, Notepad (any Notepad) or Obsidian
  was opened meanwhile; then both folders are read again, so what they wrote
  on the way out is what he sees. Never two of these at once, and none while
  the message is up — closing the programs bounces focus between windows.
- **How the button closes them** — *open*, to be tried on a real machine:
  - **Resoph can't be asked while `<systray>` is on**, since its close button
    only hides it. *Decided and built:* b-notes switches the setting off
    itself, only while Resoph is closed (a running Resoph writes its settings
    back when it quits) — at every start when Resoph is not running, and just
    after ending it otherwise. Then a polite close quits it, and he can't lose
    its window to the tray either. Until then, the fallback is ending it by
    force, which risks the database if it's mid-write — possibly how he lost
    everything before. So: ask first (hiding saves its database), wait until
    its files stop changing, copy them into `userData`, end it, and check
    afterwards that they still read as whole XML, putting the copy back if
    not.
  - **Notepad is asked**, never forced. Classic Notepad (Windows 10, as on the
    VM) asks about unsaved changes in its own window, and b-notes waits.
    Windows 11 Notepad keeps the unsaved changes of every open tab, new files
    and edited ones, and brings them back next time without asking — so
    nothing is lost by closing it, but the file does not have those edits, and
    saving that tab later writes over whatever the file holds by then.
  - **Obsidian is asked.** It saves as it goes.
  - Seeing them: Windows' own `tasklist`, no new dependency. Processes:
    `ResophNotes.exe`, `Notepad.exe`, `Obsidian.exe`.
- **Notepad** opens files in his Resoph folder, which b-notes only reads. For
  b-notes' own files, b-notes checks each file is still what it last read before
  writing it.
- **Log** every copy, adopted Resoph change, fork and linked rename.

### 4.11 Nudging, not uninstalling — *proposed*

- **Take Resoph off startup, the taskbar and the desktop, and put b-notes where
  it was.** Resoph stays installed if he asks for it, and going back costs him
  nothing.
- **A signpost in Resoph**, later if at all: one note, written once, never
  renamed or deleted, titled with his own leading-spaces trick so it sits at the
  top of his Resoph list, saying plainly that his newest writing is in b-notes.
  It is the only file b-notes would ever put in Resoph's folder.

### 4.12 What Stage 0 leaves out

- All renaming, and the code for it: rename on first-line change, numbering
  same-named texts, converting `.md`.
- The in-folder *Obrisano*, *Verzije* and `settings.json`: they move to b-notes'
  folder.
- The archive strip and its four `.md` folders.
- Reading Resoph's database.
- Collapsing identical copies, and reading status words (*konacna*, *radi*) out of his titles.
- Anything written to Resoph's folder.
- Stopping him mid-session when Resoph or Notepad opens, other than when he
  comes back to the window.

## 5. Open questions

1. **A text that moved on in two places** (§4.5). Newer is the text, the other
   a version, nothing lost — that part is settled. What he's shown:
   - **a. Nothing.** The other version waits in the versions dialog. Simplest,
     but he may never know his other edit exists, which is hiding it.
   - **b. A quiet mark on the text**, in the list and above the editor, with
     one line saying the text was also changed elsewhere and the other version
     is kept, and a button that opens the versions dialog on it. The mark goes
     once he has looked. *Leaning this way.*
   - **c. Both, side by side, as two texts.** Rules itself out: two
     near-identical things and a choice he can't make is exactly what
     `TARGET-USER.md` forbids.
   - **d. Merge them** when the edits touch different paragraphs, keeping both
     originals as versions. `paragraph-diff.ts` could do most of it. Clever,
     so later if ever — a wrong merge is a new text nobody wrote.

   Rare on one machine once Resoph is closed at startup. More likely across
   machines after long offline stretches.
2. **Leading spaces in the list** (§4.2):
   - **a. Trimmed.** The order still shows his rank. *Leaning this way for
     Stage 0.*
   - **b. Trimmed, with a small mark for rank** — a dot or a bar, heavier for
     more spaces.
   - **c. Kept, collapsed** to one fixed indent.
3. **Filenames** (§4.7): plain ASCII agreed? Tags as proposed, or another shape?
4. **Where b-notes' folder lives** — `Dropbox/b-notes/`? — and what happens to
   0.7.0's leftovers (see *Cleanup*).
5. **Which Windows builds**, for Notepad and line endings. b-notes' files could
   be written with CRLF throughout.

Experiments on Resoph (Danilo can run them), still useful:

- ~~Rename detection~~ — done: a retitle writes a new file (new ID, new times,
  same bytes) and deletes the old one. See §4.6.
- ~~Resurrection~~ — done: a file renamed behind Resoph's back comes back under
  its old name, and the renamed one is taken in too — two notes. See §1.
- **His machines' Resoph configs**: `<enablesync>`, `<sorttype>`, `<systray>`, and the folder in `<userdata9>` — one copy of `resophnotesconfig.xml` from each is enough.
- **Census of each machine's database** — counts, dates, pins, deleted flags,
  never content. A small script run on his machine could produce it.

## 6. Later

- **Collapse identical copies**, and turn his marks into rank, collections and
  status, alongside ways to set them that aren't retitling.
- **Read Resoph's database**, for his real pins, creation dates, and notes whose
  files are missing.
- **The switch**, once he has stopped using Resoph: copy what's left in Resoph's
  folder into b-notes' folder, and stop reading it. A setting, not a migration.
  Filenames get cleaned on the way in. Resoph comes off every machine at
  the same time, or his writing there would look lost.

## 7. Cleanup on his machines — *reminder for deployment*

To do by hand, before or while the next build goes in:

- **Do it on the Dell before it next goes online, with Resoph closed.** The test
  ran offline, so nothing has reached Dropbox yet. But Resoph's database on the
  Dell already holds the debris, and removing files won't remove it from there
  (§1). Remove the files and they come back. The debris has to go through
  Resoph itself, on the Dell: deleted as notes, in Resoph.
- **Move b-notes' things out of his Resoph folder**: `settings.json`,
  `Verzije/`, `Obrisano/`, `Arhiva/`. Resoph has probably already taken copies of
  the `.txt` files in `Verzije/` and `Obrisano/` in as notes of its own (§1), so
  check its list for those too.
- **Remove what the test added to his list**, identified by the log and by date
  (2026-09-26), never by looking: the numbered copies in eight groups, the
  version-named text `2026-09-26 18-23-43`, and the empty notes Resoph made from
  b-notes' subfolders.
- **Don't clean up empty files as such.** In Resoph's format an empty file is a
  note with a title and nothing under it — mostly ideas he jotted as a title and
  never wrote up. Of the seven empty files in his live folder, five date from
  2023 and one from August 2026, and those are his. One appeared during the
  test; check it against the log before removing it.
- **The three texts whose b-notes edits never saved** are the ones named in the
  log's *Could not save* lines. If he mentions writing something that isn't
  there, it's probably one of those.

A script could list exactly what's in each group, from the log and the folder,
for a person to look over before anything is removed. It must never delete.
