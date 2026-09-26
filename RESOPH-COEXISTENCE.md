# Living beside Resoph

How b-notes shares his texts with ResophNotes: what Resoph does, where b-notes
keeps its own things, how the two take turns, and what a title is. **Design in
progress** — each part is marked *decided*, *proposed* or *open*. The evidence
is in `CORPUS-ANALYSIS.md`; the settled parts move into `DESIGN.md` once
decided.

He will keep using Resoph until b-notes is clearly better, on three or four
machines, each offline for long stretches, all syncing one Dropbox folder. That
is the condition, not a phase.

## 1. What Resoph does

Known, from his folder, the 0.7.0 test log, and Danilo trying it by hand:

- **Title in the filename, body in the file.** Resoph shows the filename as the
  note's first line and writes only what's under it into the file. Editing that
  first line renames the file. Toward Simplenote it joins them as title, blank
  line, body (14 of 15 matched notes). Simplenote stores one piece of text, so
  a Simplenote export has the title inside every file. That's why his ~300
  Simplenote-era files carry it, and Resoph presumably shows it twice for them.
- **Always, as far as can be seen.** "Since 2023" in the analysis is only the
  limit of the evidence: the September 2023 import reset every older file's
  time. Resoph hasn't changed since 2018, so it has almost certainly always
  stored notes this way.
- **Characters it can't put in a filename** become `%2A` (`*`), `%3F` (`?`),
  `%2F` (`/`), `%5C` (`\`), `%3A` (`:`), `%09` (tab). Leading and trailing spaces
  are kept.
- **It lists `.txt` files in subfolders**, live, while running. For each one it
  makes an empty file in the main folder: a note whose title is that file's
  name. So nothing of b-notes' may sit inside his folder.
- **It rewrites from memory any note whose file has gone.** b-notes renamed
  eight files at each start of the test; Resoph wrote all eight back within
  minutes, twice.
- **It minimizes to the system tray**, where he can't find it.

Not known yet — each changes a decision below:

1. **Does it resurrect after a restart?** Close Resoph, rename or delete a note's
   file in Explorer, start Resoph. If the old one comes back, Resoph keeps an
   index of its own, and taking turns (§3) won't make renames or deletes safe.
2. **Where does it keep its own state** — pins, tags, Simplenote keys, window?
   Probably under `%APPDATA%`. That's the index question from the other side.
3. **Does it reload a file changed on disk while it runs**, or keep its own
   copy and later write that back over the change?
4. **Its close button, with "minimize to tray" on**: quit or hide? And does it
   save everything when asked to close?
5. **Its process name**, for §3.

## 2. Two folders — *proposed*

Danilo's suggestion, and the only arrangement Resoph's subfolder habit allows:

- **His texts folder** is his Resoph folder, shared with Resoph. It holds his
  texts and nothing else of b-notes'.
- **b-notes' own folder** sits beside it in Dropbox — say `Dropbox/b-notes/` —
  holding `settings.json`, `Verzije/`, `Obrisano/`, `Arhiva/`. Still synced and
  backed up, still plain text that opens in Notepad, and invisible to Resoph.

Deleting in b-notes then means moving a file out of Resoph's reach. That only
sticks if Resoph doesn't resurrect after a restart (unknown 1).

The table *Where his things are kept* in `DESIGN.md` changes with this.

## 3. Taking turns with Resoph and Notepad — *proposed*

Danilo's position: having three editors open on the same notes is a habit no
cleverness can make safe, so b-notes should enforce turns rather than try to
survive them.

**It can be done.** Electron has no process API, but Node can run Windows' own
`tasklist` and read which programs are running, with no new dependency. One
call costs a fraction of a second, even on his slowest laptop. Checking every
few seconds is affordable; measure it there.

What b-notes would do:

- **While Resoph or Notepad is running, he can read, search and copy, but not
  write.** The text stays on screen. In place of the caret, one plain sentence
  says what to do, next to a button that does it — e.g. *Zatvori ResophNotes i
  Notepad da bi pisao ovde* and *[Zatvori ih]*. The button matters because
  Resoph hides in the tray, where he'd never find it to close. The lock can't
  be dismissed; there is no wrong state to dismiss it into. (Wording to be
  proposed, not invented.)
- **If one of them starts while he's writing**, b-notes saves what he has
  typed at once (nothing else has touched it yet), then locks.
- **Closing them for him** means asking them to close, the way their own
  close buttons do, and never killing either. Notepad may be holding unsaved
  writing of his, and killing Resoph could lose whatever it hasn't saved. If
  asking isn't enough — Resoph hiding in the tray instead of quitting
  (unknown 4) — this needs rethinking, not force.
- **Any Notepad counts.** Nothing can tell which file a Notepad window holds.
  A false alarm — Notepad open on a shopping list — costs him one click on the
  button.
- **Log every detection, lock and closing.** The next phone call will be about
  this.

What turns can't cover, and what still has to hold:

- **Other machines.** Their Resophs write through Dropbox whenever they come
  online, and nothing here can see them. So b-notes still renames nothing
  (§4), and never writes a file without checking it's what it last read.
- **Notepad's memory.** Windows 11 Notepad keeps unsaved tabs across restarts,
  and he leaves tabs he can't see. A stale tab saved days later overwrites
  newer writing while b-notes is closed. So b-notes should keep the last text
  it wrote of every text it touched. Then anything written over it afterwards
  is still recoverable, and b-notes can notice, on its next start, that a file
  changed behind its back.
- **Other editors.** Is Notepad the only one he opens texts in? WordPad,
  Notepad++, Word? The list of programs to watch is his, not a guess.

## 4. What a title is — *open*

The central question left. What has to hold:

- **His existing titles are shown.** They're his filenames, and they carry all
  his filing.
- **b-notes and Resoph agree**, as far as possible. He goes back and forth, and
  two apps showing two titles for one text is a new way to be lost.
- **Renames are dangerous.** Any Resoph that remembers the old name can bring it
  back — on this machine while it runs, and on the others whenever they sync.
  His own title edits in Resoph are already the biggest source of his
  duplicates.
- **He retitles constantly.** 155 renames in 22 months, and ranking by leading
  spaces *is* retitling. If b-notes can't retitle, it needs a rank of its own
  from the start, or he'll go back to Resoph to do it.

### How b-notes reads any file — *proposed*, whichever option below

The title is the filename, read through Resoph's escapes. If the file's first
line is already that title, the title is inside the file (Simplenote-era
files, and any b-notes makes that way), so show the file as it is. Otherwise
show the title as a line above the text, the way Resoph does. That gives him
Resoph's view of every text, without Resoph's doubled title.

### How b-notes writes

**A. Resoph's way, fully.** The title is the first line on screen and the
filename on disk; the file holds the rest. Editing the title renames the file.

- \+ Resoph and b-notes agree, both ways, always.
- \+ Renames carry no more risk than what Resoph already does.
- − Every title edit is a rename. With turns in place (§3) this machine is
  safe; other machines' Resophs, and unknown 1, are not.
- − The rename has to happen once he's done — when he leaves the title line —
  never per keystroke. Per-keystroke renaming is how Resoph left the half-typed
  titles in his folder, and how 0.7.0 went `n` → `nA` → `Nas` → … → `Naslov
  teksta` in the test.
- − b-notes must make exactly the names Resoph makes, leading spaces and
  escapes included, so the ugly names keep being made.

**B. The title is fixed when a text is created, and never renamed.** New texts
take their name from the first line and keep the whole text, title included,
in the file (Danilo's instinct). Existing titles show as a heading and can't
be edited in b-notes.

- \+ No renames, ever.
- \+ Notepad shows the title for every text b-notes creates.
- − He can't retitle in b-notes, and he will try.
- − For a text b-notes created, changing its first line changes the file but
  not the name. Resoph then shows the old title above the new first line, and
  the two apps disagree.

**C. b-notes keeps titles itself.** b-notes records each text's title, and
rank and status beside it, in its own folder, merged across machines.
Filenames never change after creation.

- \+ He retitles freely in b-notes, and nothing is ever renamed.
- − Anything retitled in b-notes keeps its old title in Resoph forever.
- − A new store to keep consistent across three or four offline machines.

**Leaning:** B's reading side for the next build — show titles, allow no title
edits, rename nothing. It's pure *do no harm*, and his list becomes his list.
Whether A or C comes after depends on unknown 1: if Resoph resurrects old names
after a restart, A can never be safe and C is the way. Either way, b-notes
needs its own rank before he'll stop retitling to rank.

**New texts, whichever option:** the name mustn't be taken until the first line
is finished. Today's build creates the file on the first keystroke and renames
on every one after. Until the title is settled — he presses Enter, or leaves
that line — keep the draft in b-notes' own folder, where Resoph can't see it,
and create his file once.

## 5. Cleanup on his machines — *reminder for deployment*

To do by hand, before or while the next build goes in:

- **Do it on the Dell before it next goes online, with Resoph closed.** The
  test ran offline, so its debris hasn't reached Dropbox yet. Clean it there
  and no other machine ever sees it; clean it after it syncs and another
  machine's Resoph may already have it in memory.
- **Move b-notes' things out of his Resoph folder**: `settings.json`,
  `Verzije/`, `Obrisano/`, and `Arhiva/`. They go wherever §2 lands.
- **Remove what the test added to his list**, identified by the log, not by
  looking: the numbered copies the start-up renaming and Resoph made between
  them in eight groups, the version-named text `2026-09-26 18-23-43`, and
  anything Resoph made from files in b-notes' subfolders. All from 2026-09-26.
- **Don't clean up empty files as such.** In Resoph's format an empty file is a
  note with a title and nothing under it — an idea he jotted. Of the seven empty
  files on the Dell, five date from 2023 and one from August 2026: his. Only
  one appeared during the test, at 18:15:05. Go by date and by the log, never
  by size.
- **The three texts whose b-notes edits never saved** are the ones named in the
  log's *Could not save* lines. If he mentions writing something that isn't
  there, it's probably one of those.

A script could list exactly the files in each group from the log and the
folder, for a person to look over before anything is removed. It must never
delete.
