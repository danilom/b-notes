# Human edited todo

[ ] sample

# TODO

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
