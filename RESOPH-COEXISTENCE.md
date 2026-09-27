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
  title as the first line and a single newline after it, plus created and
  modified times, a deleted flag, a Simplenote key, and tags — `pinned` among
  them.
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
  more than once. While it runs it does the same within minutes: the test log
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
- **Toward Simplenote** it joins title and body with a blank line between.
  Simplenote keeps one piece of text per note, so a Simplenote export carries
  the title inside every file. That's why his ~300 Simplenote-era files do.
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
  to do. *Nedavni* stays as it is.
- **Search covers titles and text**, with and without diacritics, as now.
- **Refreshed whenever b-notes comes to the front**, and at start. A pass over
  1,200 files' names, sizes and times is cheap; only changed files are read.
- **Nothing is hidden.** Resoph's identical copies show as they do in Resoph.
  Collapsing them waits for later. A Dropbox conflicted copy shows as a text
  of its own.

### 4.3 What a title is — *proposed*

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
displayed is a separate question.

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
  Nothing is lost. *Open:* how he's told a text has two versions that each
  moved on. A quiet mark on the text, leading to the versions dialog, is the
  obvious shape. The wording and the look are still to be proposed.

Versions that came from Resoph are named as such, so all of this can be
worked out from the files themselves, with no extra record to keep in step
across machines.

### 4.6 Knowing a Resoph file under a new name — *proposed*

When he retitles a text in Resoph that b-notes has copied, its link points at a
filename that has gone, and a new one has appeared. The signals, in the order
they are trusted:

- **The same text under a new name.** Exact match only.
- **A rename seen as a pair**: in one refresh, the linked file left and one
  arrived with the same modification time and mostly the same text.
  Refreshing on every return to b-notes keeps the pairs small.
- **This machine's file ID**, if experiment 7 shows Resoph renames rather than
  rewrites.

On timestamps:

- **Modification times** survive renames, and the evidence says they also
  survive Resoph and Dropbox: his byte-identical copies share their
  modification time to the second. That makes them a good *pairing* signal,
  but not an identity — every edit changes them, and identical copies share
  them.
- **Creation times** are local to one machine. Dropbox creates the file afresh
  on every other machine, and copying resets them, as it did for this corpus.
- **File IDs** survive a real rename on one machine and nothing more. Another
  machine has its own. Whether Dropbox keeps a machine's ID when it carries a
  rename across is untested.

When no signal is sure, the new Resoph file shows as a text of its own beside
the b-notes copy: a duplicate, which is untidy but can be fixed later. Linking
two different texts would file one out of sight as a version of the other. So
**link only when sure**.

### 4.7 New texts — *proposed*

- Written into b-notes' folder only.
- **Named once, when the first line is finished** — he presses Enter or leaves
  it — and never renamed. Before that the draft is kept under a temporary name
  in b-notes' folder, so nothing he types is ever only in memory.
- **The name is safe everywhere**: no edge spaces, no characters Notepad, zip or
  Explorer choke on. It's made from the title and made unique, and he never sees
  it. *Open:* the exact rule — plain ASCII, how uniqueness is made. It must be
  the same on every machine for a copied Resoph text, so two machines copying
  the same file offline write the same file rather than two.

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
- **Not during a session.** Nothing b-notes writes is anywhere Resoph looks, so
  if he opens Resoph again while b-notes runs, the worst it causes is a text
  that moved on in both, which §4.5 handles without loss. Interrupting him
  mid-sentence would cost more than it saves. Revisit if forks turn out to be
  common.
- **How the button closes them** — *open*, to be tried on a real machine:
  - **Resoph can't be asked while `<systray>` is on**, since its close button
    only hides it. The simplest fix is to turn *minimize to tray* off in
    Resoph's options on each of his machines, by hand, at install. Then a
    polite close quits it, and he can't lose its window to the tray either.
    b-notes could flip the setting itself, but only while Resoph is closed —
    Resoph probably writes its config back on exit — and a by-hand change is
    easier to undo. If that isn't enough, the fallback is ending it by force,
    which risks the database if it's mid-write — possibly how he lost
    everything before. So: first copy both files into b-notes' folder, wait
    until the data file stops changing, end it, and check afterwards that the
    database still reads as XML.
  - **Notepad is asked**, never forced. Classic Notepad asks about unsaved changes
    in its own window, and b-notes waits. Windows 11 Notepad may close without
    asking and restore its tabs next time.
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
- Collapsing identical copies, and turning his marks into rank or status.
- Anything written to Resoph's folder.
- Stopping him mid-session when Resoph or Notepad opens.

## 5. Open questions

1. **Titles as the first line in the editor** (§4.3) rather than above it. It's
   what he sees in Resoph, and it lets him retitle. Agreed?
2. **The fork mark** (§4.5): what a text that moved on in two places looks like,
   and what it says.
3. **b-notes' filenames** (§4.7): the rule, and whether any trace of his title
   should be readable in them.
4. **Where b-notes' folder lives**, and what happens to 0.7.0's leftovers
   (see *Cleanup*).
5. **Which Windows builds**, for Notepad and line endings. b-notes' files could
   be written with CRLF throughout.

Experiments on Resoph (Danilo can run them), still useful:

- **Rename detection:** retitle a note in Resoph, then compare the file's ID
  (`fsutil file queryfileid "<file>"`), modification time and creation time
  before and after. Same ID: Resoph renames. New ID: it writes a new file.
- **Resurrection:** with Resoph closed, rename a file. Which names come back,
  and how many times? (Deleting is already known to come back.)
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
