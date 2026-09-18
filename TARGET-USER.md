# The person this is for

b-notes has exactly one user. Every decision in this project answers to him, and
the constraints below are the specification — without them there'd be no reason
to build this rather than use one of the many editors that already exist.

Technical consequences of all this live in `DESIGN.md`.

## Who he is

An elderly relative. A long-time computer user — 20+ years — with low computer
literacy and, more importantly, little capacity to absorb new computing
concepts. That is not a comment on his mind: he is brilliant, with unique
insights, remarkably varied interests, and a vast if somewhat disorganised
knowledge of history, philosophy, art, mathematics and science. The gap is
specifically with computers.

That distinction matters for the UI. Simple, never childish. Don't write
interface text that talks down to him.

He writes prodigiously, in Serbian. His first language is English and his
working knowledge of it is good, so an English UI causes him no particular
trouble beyond the general trouble computers cause him.

## How he works

- Not systematic. He will not name, file, tag or organise anything, and any
  feature that depends on him doing so will go unused.
- Very messy in practice: in ResophNotes he routinely ends up with three or five
  variants of the same text, differing slightly, and then can't tell which one is
  the latest or which he actually meant to edit.
- Uses several laptops, often with no internet connection, which adds to the
  mess.
- All his machines seem prone to random catastrophes — things fail at an
  unexpected rate, as if the machines have gremlins, while still more or less
  working.

## What has gone wrong before

He has lost data, fully or partially, on many occasions. The causes were never
established. Plausible candidates, none confirmed:

- A glitch in whatever app he was using.
- Saving incorrectly, or not saving.
- Selecting text — deliberately or accidentally — and then typing over it. He may
  or may not know about Undo.
- Sync problems, particularly with ResophNotes/Simplenote.

Two anecdotes that say a lot:

- He used to wake up a family member to "save his file" back in his MS Word days.
  The word *save* carries anxiety for him and shouldn't appear in this app.
- He reports things having "disappeared" when a window is minimised, closed, or
  possibly just covered by another window. It isn't fully established which. To
  him, a window he can't see is work that is gone.

## What he has used

- **ResophNotes** — his mainstay, and he kind of liked it. Last real update 2018;
  the recent release is only a rebuild. Effectively unsupported. Some of his data
  losses may have been its sync.
- **Simplenote** — possibly, alongside or before Resoph.
- **Notepad, GMail drafts, Obsidian** — all tried, none stuck. Not certain why in
  each case.
- He was still clinging to Resoph as of last year; unclear whether that survived
  the most recent data loss.
- His texts were moved to Dropbox as `.txt`/`.md`, which may have helped, but not
  fully.

## What he does with the writing

He emails his essays to people who read them — often several versions of the same
piece as he refines it. That is the output of the whole system; everything else
exists to get a text to a reader.

## What the app has to be

A very clear, very safe sandbox in which he can never lose anything, with an
easy, non-confusing way to get old material back.

- **Nothing is ever lost.** This is the entire point of the project.
- **Autosave**, with reassurance: visible, plain confirmation of when a text was
  last edited or saved.
- **Old versions are retrievable** without him having to have planned for it.
- **Clear controls with text labels**, not bare icons. (Exact design to be worked
  out; Resoph's icons were too cryptic.)
- **No hidden gotchas and no invisible UI** — nothing that depends on knowing an
  unmarked gesture, shortcut or state.
- **UI zoom in and out**, which Electron gives us cheaply and which is very
  welcome.

## What the app must never do

- Ask him a question he has no way of answering.
- Show him a filename, a path, or a file dialog.
- Use the word "save".
- Leave him unsure whether his work is safe.
- Require naming or organising to function.
- Present two near-identical things and ask which he wants.

## Rough shape

Loosely ResophNotes: a large search pane with a list of titles, and an area where
he writes.

Resoph's problems to avoid: features like tagging that he'd never use; a
minimalism that tips into unclear icons; and being hopelessly out of date.

## Open questions

- Does he write Serbian in Cyrillic, Latin, or both? If both, search may need to
  match across scripts, since he won't remember which he used.
- Would a Serbian/Croatian UI serve him better than English? He can handle
  English, but his writing language is Serbian. Worth deciding before UI text
  gets scattered through the code.
- Roughly how many texts does he have? It shapes how the list and search work.
- How does he actually send email — a desktop client or webmail? It determines
  what "send this to someone" can do.
- Which of his data losses were sync, and which were in-app? Unknowable now, but
  worth keeping in mind that both must be designed against.
