# Questions to ask him, or watch for

Things we can't settle from here, to resolve during the two weeks spent around
him — some by asking, several better answered by watching him work than by
asking, since he may not be able to describe what he does.

The intention is to hand him a first version without asking him anything. These
are for refining it afterwards.

## Better observed than asked

- **How does he lose work?** The single most valuable thing to witness. Watch for
  a select-all followed by a keystroke, a window closed on a half-finished
  thought, an accidental paste over a selection.
- **Does he use Undo?** And if something goes wrong, what does he reach for
  first?
- **What does "it disappeared" actually mean?** Minimised, closed, behind another
  window, or genuinely gone. Different answers point at very different fixes.
- **How does he move between texts?** Search, scrolling the list, or reopening
  whatever was last on screen.
- **Can he work the scrollbar we have given him?** The one that matters, because
  it gates the answer above. His list is 592 texts and about 17 rows of it are on
  screen at the default size — 8 at the largest, which is the size he is most
  likely to choose. Ours is a modern thin bar: 17px of target with 11px painted,
  and a thumb at about 1.5:1 against the page. Darkening it to clear 3:1 was
  tried and turned down, and so were arrows at the ends of the track.

  ResophNotes gave him the classic Windows scrollbar, stepper buttons and all,
  and he used it for years — so he may well reach for buttons that are not there.
  Against that: he reads web pages, which have had thin bars for a decade, so he
  may be perfectly fluent and the worry is ours rather than his. That is exactly
  why this is watched rather than asked.

  Watch for which he reaches for — the bar, the wheel, or neither. Someone who
  scrolls by searching for a word instead has told us something larger than the
  answer to this question.
- **How does a variant get created?** The moment a second copy of an essay comes
  into being is the thing we're trying to design away, and he probably can't
  narrate it.
- **What does he do when he can't find something?** Give up, search, or start
  rewriting it.
- **Does he read the instructions he writes down?** And what do they say — they
  are a record of what he found hard enough to need notes for.
- **How does he get a text into GMail?** Whether the copy-paste is smooth or
  fiddly decides whether the copy-everything button is worth building.

## Worth asking directly

- **Serbian or English interface?** We're building both, Serbian first, but his
  own preference decides the default.
- **What did he like about ResophNotes?** He stuck with it for years and rejected
  several alternatives; knowing what kept him there is worth a lot.
- **What went wrong with Notepad, GMail drafts and Obsidian?** Each rejection is
  a constraint we haven't identified yet.
- **When he has five versions of an essay, what is he actually trying to do?**
  Keep an old one safe, try a different angle, or just a copy made by accident.
- **Does he want old versions back, or only reassurance they exist?** Changes how
  prominent version history needs to be.
- **What does he call these things?** Notes, texts, essays, files — the app
  should use his word, in his language.
- **Which machines does he actually use, and how often?** Bearing on sync and on
  how stale a laptop might be when it wakes up.
- **Does he know his texts are in Dropbox?** And does it reassure him or worry
  him?

## A note on his data

His texts are private and are not to be read wholesale, including by Claude. Two
ways to learn from the corpus without that:

- **Filenames alone.** ResophNotes names files from each note's first line, so a
  bare list of filenames shows how many near-duplicate clusters exist and how
  consistently he titles things — without exposing any content.
- **Aggregates only.** A script run locally that reports similarity
  distributions, cluster sizes and counts, never text.

## To check on the machines themselves

- How many texts does he have now? (The 2021 Simplenote backup had ~600.)
- How many are near-duplicates of each other? This sizes the migration problem.
- **What shape do the near-duplicates take?** Measurable on the existing sample,
  and it decides whether a variant is a version or a separate text. Refinement
  drafts differ by small edits scattered throughout; ideas that diverged share an
  opening and then part ways. If the first pattern dominates, copies are debris
  that can collapse behind one live text. If the second is common, they're
  separate work and must stay separate. Worth measuring before designing the
  structure rather than deciding from intuition.
- Where do the files actually live — Dropbox, local folders, ResophNotes' own
  storage, or all three?
- Which format is authoritative: `.txt`/`.md`, or ResophNotes XML?
- **Does his Dropbox folder actually contain "conflicted copy" files?** The risk
  was inferred from several machines syncing while offline, not observed — the
  `(1)` duplicates in the backup look like Simplenote's sync rather than
  Dropbox's. A directory listing settles it, and a fair amount of design has been
  hanging off the assumption.
- What are the "gremlins"? Failing disk, full disk, aggressive antivirus, or
  something else. May explain some of the losses.
- What is his screen like — size, resolution, scaling? Decides default text size,
  and whether UI zoom is something he needs on day one.
