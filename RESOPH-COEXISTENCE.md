# Living beside Resoph

How b-notes shares his texts with ResophNotes: what Resoph does, where b-notes
keeps its own things, how the two take turns, what a title is, and what the
next build does. Each part is marked *decided*, *proposed* or *open*. The
evidence is in `CORPUS-ANALYSIS.md`. Decided parts move into `DESIGN.md` as
they're built.

He will keep using Resoph until b-notes is clearly better, on three or four
machines, each offline for long stretches, all syncing one Dropbox folder. That
is the condition, not a phase. Some day, once he's comfortable, a switch in
b-notes moves his texts into b-notes' own folder (§6). Until then, b-notes is a
guest in Resoph's folder.

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

## 2. Two folders — *decided*

- **His texts folder** is his Resoph folder, shared with Resoph. It holds his
  texts and nothing else of b-notes'.
- **b-notes' own folder** sits beside it in Dropbox — say `Dropbox/b-notes/` —
  and holds `settings.json`, `Verzije/` and whatever else b-notes keeps. Still
  synced and backed up, still plain text that opens in Notepad, and out of
  Resoph's sight.

The table *Where his things are kept* in `DESIGN.md` changes with this.

## 3. Taking turns — *decided in outline*

No modes. b-notes doesn't work alongside the other editors; it stops until
they're gone:

- **While Resoph, Notepad or Obsidian is running, b-notes shows one big, plain,
  modal message**, over the whole window: close them, then carry on. There's
  no reduced mode that half-works. (Obsidian is on the list because he was
  once moved to it, not because he's known to use it.)
- **A button closes them for him.** Resoph hides in the tray, so telling him to
  close it would send him hunting for something he can't find.
- **Only when they're gone does b-notes read his folder**, fresh, so anything
  they wrote on the way out is what he sees.
- **If one starts while he's writing**, b-notes writes what he has at once, then
  shows the same message.
- **b-notes can see them.** Electron has no API for it, but Windows' own
  `tasklist` names every running program, with no new dependency. It costs a
  fraction of a second, so checking every few seconds is affordable — measure
  on his slowest laptop. Programs: `ResophNotes.exe`, `Notepad.exe` (the
  Windows 11 Notepad too — confirm), `Obsidian.exe` (several processes).
- **Log every detection, closing and wait.**

How the button closes each one — *open*, each needs trying on a real machine:

- **Resoph can't be asked**: its close button only hides it. Ending it by
  force is the only way, and forcing it out while it writes its database could
  damage that database — which may be how he "lost everything" before. So:
  copy both database files into b-notes' folder first, wait until the data file
  has stopped changing for a few seconds, then end it. Afterwards check the
  database still reads as XML, and put the copy back if not. Worth checking
  first whether Windows' shutdown message (the one it sends when logging off)
  makes Resoph save and quit on its own.
- **Notepad is asked to close**, never forced. Classic Notepad then asks him
  about unsaved changes, in its own window, and b-notes waits. Windows 11
  Notepad may close without asking and restore those tabs next time it opens.
- **Obsidian is asked to close.** It saves continuously.

What turns can't cover:

- **Other machines.** Their Resophs act through Dropbox whenever they sync, and
  nothing here sees them. The no-rename rule is what protects against that.
- **Notepad's memory.** Windows 11 Notepad brings back unsaved tabs, and a stale
  one saved days later overwrites newer writing while b-notes is closed. So
  b-notes keeps, in its own folder, the last text it wrote of every text it
  touched. On its next start it can tell a file changed behind its back, and
  what was there is still recoverable.
- **Writing blind.** Even with turns, check before every write that the file is
  still what b-notes last read. If it isn't, keep both.

## 4. Titles — *decided for the next build*

- **The title is the filename**, read through Resoph's escapes, and it's shown
  **outside the editor**, above the text. The editor holds the file, exactly as
  it is on disk.
- **No title can be edited in b-notes yet.**
- **Nothing in his folder is ever renamed, and the renaming code comes out of
  b-notes entirely** — rename on first-line change, the numbering of same-named
  texts, conversion of `.md`, all of it — until there's a design that's safe
  against §1.
- **Search covers titles as well as text.**

*Open, and needed for the next build:* **naming a new text.** It takes its name
once, and never again. The questions:

- **When.** Not on the first keystroke — 0.7.0 created `n` and renamed it on
  every keystroke to `Naslov teksta`. Once he finishes the first line (presses
  Enter or leaves it) seems right. Until then the draft waits in b-notes' own
  folder, where Resoph can't see it.
- **Where the title lives.** Danilo's instinct is to keep it inside the file as
  well. Then Resoph shows it twice, as it does for his Simplenote-era texts.
  And b-notes shows it twice too — heading and first line — unless the heading
  is left out whenever it matches the first line.
- **What happens when he later changes that first line.** The name stays, so
  heading and first line part ways. Harmless, but visible.

*Open, for later:* whether titles ever become editable. Either the Resoph way
(renaming, which §1 says can't be made safe) or with b-notes keeping titles
itself (then Resoph shows the old ones). Probably decided at the switch, when
Resoph stops mattering. Meanwhile he ranks by retitling, so b-notes needs a
rank of its own before he'll stop.

## 5. b-notes' own features until the switch — *proposed*

Every feature of b-notes' that touches his folder is another way to break the
trust that keeps him out of Resoph. So until the switch:

**b-notes only reads files, writes their contents, and creates new ones.
Nothing in his folder is moved, renamed or deleted.** Everything else of
b-notes' lives in its own folder and only ever adds. The worst any of it can do
is fail, never harm a text.

- **Versions** keep working, unchanged in spirit: copies in b-notes' own folder,
  taken before a big loss. Pure addition, invisible to Resoph.
- **Deleting** can't work while any Resoph remembers the note: the file comes
  back. For the next build, leave it out. He deletes by emptying the text
  anyway, and that still works, with a version kept first. Later, perhaps
  "hide from my list" — a note in b-notes' own folder, touching nothing of his.
- **Obrisano** goes, with deleting.
- **Arhiva** can wait. It's a view into b-notes' own folder, and bringing a
  text back would be *creating* a file in his, which is allowed, but none of
  it is needed to do no harm.
- **Duplicate numbering** goes, with the renaming code.

Less to build and less to go wrong. What he loses from 0.7.0 is deleting, and
he may never have used b-notes' delete.

## 6. The switch — *later*

Once he's comfortable, a switch in b-notes moves his texts into b-notes' own
folder. It will have to:

- **Read every machine's Resoph database**, not only the folder. That's where the
  pins, the creation dates, and the notes whose files are missing are.
- **Take the other machines into account.** Their databases hold what this one
  doesn't. Either the switch happens on each machine, or their databases are
  read into it.
- **Leave Resoph with nothing to fight over.** After the switch b-notes never
  reads the old folder again, so a Resoph that keeps writing there can't hurt
  b-notes. But anything he writes in that Resoph won't appear in b-notes, and
  that looks like loss. Resoph has to be uninstalled everywhere at the same time.
- **Clean up the names on the way**, which is when filenames become safe for
  Notepad, zip and Explorer.

## 7. Alternative: b-notes' own folder, fed from Resoph — *under discussion*

Danilo's idea, and possibly a replacement for §2–§5. Don't coexist in one
folder. b-notes keeps his texts in its own folder, as its own, and keeps
bringing in whatever Resoph has, until one day there's nothing new to bring.

- **b-notes' folder is the master.** Clean names, the title inside the text,
  versions and deleting as `DESIGN.md` has them. Nothing Resoph does can undo
  anything there, because Resoph never sees it.
- **Resoph → b-notes is frictionless.** On start, and whenever b-notes comes to
  the front, it reads his Resoph folder and brings in what's new or changed.
- **b-notes → Resoph, at first, is nothing at all.** b-notes never writes to
  Resoph's folder, so it can't harm a Resoph note, and it never has to close
  Resoph. The price: what he writes in b-notes isn't in Resoph. That nudges him
  toward b-notes, but could also read as loss, and Danilo has to explain it in
  person. Content-only write-back — never names, never deletes — can be added
  later if he gets stuck between the two.
- **This is where b-notes gets to limit the mess.** The rules for bringing a
  Resoph file in:
  - Identical text under another name (a retitle, or Resoph bringing an old
    name back) is the same text, not a new one.
  - Text b-notes has already seen for that file, at any point, is not news.
    That's what stops another machine's Resoph from rolling a text back.
  - Changed in both since the last import: nothing is lost. One stays the text,
    the other is kept as a version of it. Which one, and what he's told, is
    *open*.
  - Nothing is ever deleted because it disappeared from Resoph's folder.
- **The switch becomes a setting**, not a migration: stop reading Resoph's
  folder.
- **The hard part is the import**, which now becomes a small sync engine. It
  has to give the same result on three or four machines importing the same
  change offline, so no two of them create the same text twice. It lives
  entirely inside b-notes, though, where it can be tested hard, unlike Resoph's
  behaviour.
- **The turns of §3 stop being needed for safety**, so Resoph is never forced
  out.

Experiments on Resoph that decide details (Danilo can run them):

1. With Resoph closed, change a file's text in Notepad, then start Resoph. Does
   it show the new text, or put its own back over it? This decides whether
   write-back could ever work.
2. With Resoph closed, add a new `.txt` to its folder. Does it take it in?
3. With Resoph closed, rename a file. Which names come back, and how many
   times?
4. With Resoph open and the note not being edited, change its file. Picked up?
   And the same with the note mid-edit in Resoph.
5. Is Simplenote sync on, on his machines? Which way does it win?
6. A census of each machine's database — counts, dates, pins, deleted flags,
   never content. A small script run on his machine could produce it.

## 8. Cleanup on his machines — *reminder for deployment*

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
