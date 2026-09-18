# The person this is for

b-notes has exactly one user. Every decision in this project answers to him, and
the constraints below are the specification — without them there'd be no reason
to build this rather than use one of the many editors that already exist.

Technical consequences of all this live in `DESIGN.md`. Things we want to ask or
observe directly are collected in `B-QUESTIONS.md`.

## Who he is

An elderly relative. A long-time computer user — 20+ years — with low computer
literacy and, more importantly, little capacity to absorb new computing
concepts. That is not a comment on his mind: he is brilliant, with unique
insights, remarkably varied interests, and a vast if somewhat disorganised
knowledge of history, philosophy, art, mathematics and science. The gap is
specifically with computers.

That distinction matters for the UI. Simple, never childish. Don't write
interface text that talks down to him.

He writes prodigiously, in Serbian, in Latin script. English is his second
language and he is proficient in it, so an English UI causes him no particular
trouble beyond the general trouble computers cause him — but Serbian is what he
writes in, and the UI should be too (see below).

He often omits the diacritics — writing `sdzcc` where `šđžčć` belong. Possibly he
doesn't know how to switch keyboard layouts. Correcting that is not our problem
and not a P1 or P2 concern, but it has one consequence we can't ignore: **search
has to match with and without diacritics, in both directions.** Typing `cesce`
must find `češće`, and typing `češće` must find a note where he wrote `cesce`.
With hundreds of notes, search is how he finds anything.

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
- He likes to write down instructions for himself, though it's unclear whether he
  ever reads them back.

## What has gone wrong before

He has lost data, fully or partially, on many occasions. The causes were never
established and probably never will be — as far as he's concerned things simply
keep disappearing. Plausible candidates, none confirmed:

- A glitch in whatever app he was using.
- Saving incorrectly, or not saving.
- Selecting text — deliberately or accidentally — and then typing over it. He may
  or may not know about Undo.
- Sync problems, particularly with ResophNotes/Simplenote.

Both in-app loss and sync loss have to be designed against, because there's no
way to know which did the damage.

Two anecdotes that say a lot:

- He used to wake up a family member to "save his file" back in his MS Word days.
  The word *save* is not itself a problem — "your text was saved 2 minutes ago"
  is reassuring and fine. What must never happen is the app *requiring* him to
  save, or leaving saving as something he could fail to do.
- He reports things having "disappeared" when a window is minimised, closed, or
  possibly just covered by another window. It isn't fully established which. To
  him, a window he can't see is work that is gone.

## What he has used

- **ResophNotes** — his mainstay, and he kind of liked it. Last real update 2018;
  the recent release is only a rebuild. Effectively unsupported. Some of his data
  losses may have been its sync. Stores notes as plain XML.
- **Simplenote** — possibly, alongside or before Resoph. A 2021 Simplenote backup
  holds on the order of **600 notes**; the current figure is unknown.
- **Notepad, GMail drafts, Obsidian** — all tried, none stuck. Not certain why in
  each case.
- He was still clinging to Resoph as of last year; unclear whether that survived
  the most recent data loss.
- His texts were moved to Dropbox as `.txt`/`.md`, which may have helped, but not
  fully.

## He does not start from a clean slate

His existing writing has to come with him — several hundred texts, in `.txt`/`.md`
files and/or ResophNotes' XML, either migrated into the app or edited in place.

This matters more than a normal import would, because **the mess already exists in
the data**. The three-to-five-variants problem isn't something he'll create in our
app; it's sitting in the files we're about to read. An import that faithfully
produces 600 flat entries, several of which are near-identical drafts of the same
essay, has moved the problem rather than solved it.

So migration is part of the versioning design, not a separate chore. Detecting
which texts are variants of one another is P1/P2 work.

**Migration is triggered, never ambient.** It's an explicit operation someone
runs, not something the app quietly does to his files in the background. He is
not the one who runs it.

**But human review cannot be the safety mechanism.** Nobody is going to
meaningfully audit 600 texts; realistically whoever triggers it glances at the
result and accepts. So grouping has to be safe by construction rather than safe
by approval:

- **Nothing is discarded.** Grouping is a layer over the texts, not a rewrite of
  them. Every version stays individually retrievable.
- **Every version stays searchable**, not just whichever is considered current.
  This is what makes a wrong grouping survivable: the text is still there and
  still findable, merely filed under a heading it doesn't belong to.
- **Grouping is reversible**, per group and wholesale.
- **Group conservatively.** The costs are lopsided. Failing to group leaves the
  mess he already lives with — no worse than today. Grouping wrongly is only
  untidy, provided the rules above hold. So when similarity is ambiguous, leave
  the texts apart.

## What will actually impress him first

Worth being clear-eyed about this, because it should drive the build order.

The writing area and autosave are, on first sight, unremarkable. They're a text
box that saves — he has had those before, and they are exactly the things that
have failed him. He'll come to value them once they've quietly worked for a few
months, but they won't land on day one.

**What will land is seeing everything he has ever written, gathered in one place,
visibly safe and findable.** That is the thing he has never had, and it is the
first impression worth optimising for.

Which means migration quality is the launch feature. A polished editor over a
badly imported mess is a worse first day than a plain editor over a collection
that finally makes sense to him.

## What he does with the writing

He emails his essays to people who read them — often several versions of the same
piece as he refines it. Always GMail, always in the browser.

**Anything the app does about sending is P3.** He already copies and pastes into
GMail and manages it fine, and that path works today. Anything we added would be
either a `mailto:` link, which hands him off to whatever Windows thinks the
default mail client is, or a copy to the clipboard — which is what he's already
doing. Both add a new way to fail to a route that currently doesn't. Webmail also
rules out any handoff more direct than the clipboard.

Worth considering for a different reason: a clearly labelled button that copies
the whole text. Not to help him send it, but so he never needs Ctrl+A. Select-all
creates a state where the entire essay is selected and one stray keystroke
replaces it, which is one of the suspected ways he has lost work.

## Language of the interface

Build **both Serbian (Latin) and English, with Serbian as the priority.** He
reads English fine, but he writes in Serbian and the interface should meet him
there.

The mechanical side of translation is cheap; getting the *wording* right is not.
Every string has to be plain, unambiguous, and speakable over the phone, in both
languages. Expect to spend real effort tuning the messages rather than
translating them.

Practical consequence: UI text lives in one place from the start. Retrofitting
that after strings have been scattered through the code is the expensive version.

## What the app has to be

A very clear, very safe sandbox in which he can never lose anything, with an
easy, non-confusing way to get old material back.

- **Nothing is ever lost.** This is the entire point of the project.
- **Autosave**, with reassurance: visible, plain confirmation of when a text was
  last saved.
- **Old versions are retrievable** without him having to have planned for it.
- **Clear controls with text labels**, not bare icons. Two reasons beyond
  legibility: he writes instructions down for himself, and labels give him
  something to write; and over the phone, "click Find" is a sentence that works,
  where "click the little magnifying-glass icon near the top right" is not.
- **Labels name the outcome and the destination, not the mechanism.** "Copy the
  whole text" invites the question *copy to where* — the clipboard is invisible
  and can't be reasoned about. Where something lands somewhere he can't see, the
  label has to say where, and ideally connect to a routine he already has.
- **Every action visibly confirms it happened.** A button that appears to do
  nothing is the same problem as the window that disappeared: he has no way to
  tell success from failure, so he retries, or assumes the worst.
- **No hidden gotchas and no invisible UI** — nothing that depends on knowing an
  unmarked gesture, shortcut or state.
- **UI zoom in and out**, which Electron gives us cheaply and which is very
  welcome.

## What the app must never do

- Ask him a question he has no way of answering.
- Show him a filename, a path, or a file dialog.
- Require him to save, or make saving something he could fail to do.
- Leave him unsure whether his work is safe.
- Require naming or organising to function.
- Present two near-identical things and ask which he wants.

## Rough shape

Loosely ResophNotes: a search box and a list of titles down the left, a large
writing area on the right. His current app looks like this:

```
+----------------------------------------------------------+
| [search box.................]  [icons]  | Add tag...      |
+-----------------------------------------+                 |
| [All Notes]                             |                 |
| hello                           3:16 pm | new note        |
| My note goes here               3:15 pm |                 |
| new note                        3:16 pm |                 |
|                                         |                 |
|  (list of titles, newest first)         |  (writing area) |
|                                         |                 |
+-----------------------------------------+-----------------+
| + -                      Count  Last Modified             |
+----------------------------------------------------------+
```

Resoph's problems to avoid: tagging and similar features he'd never use; a
minimalism that tips into unclear icons; and being hopelessly out of date.
