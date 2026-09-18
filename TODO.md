# Human edited todo

[ ] sample

# TODO

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
