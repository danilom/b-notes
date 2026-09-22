/**
 * Builds a test corpus shaped like his real one: same titles, sizes and dates,
 * entirely invented prose. The newest handful of texts are dated forward onto
 * today — see `freshenNewest` for why.
 *
 * His writing is private, so the metadata this reads and the corpus it writes
 * both live under testdata/, which is gitignored. Nothing here prints a title.
 *
 *   node scripts/make-corpus.mjs                    (uses testdata/metadata)
 *   node scripts/make-corpus.mjs --count 600        (invents titles instead)
 *   node scripts/make-corpus.mjs --notes <f> --sizes <f> --out <dir>
 *
 * testdata/metadata holds the only copy of that metadata and is required to
 * regenerate the corpus. It is not in the repository and not backed up by it.
 */
import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';

import { BORROWED_COUNT, archiveSample } from '../src/hosts/mockup/mock-archive-sample.ts';
import { MOCK_WRITING_FOLDER } from '../src/hosts/mockup/mock-file-system.ts';
import { longDiffSample } from '../src/hosts/mockup/mock-long-diff-sample.ts';
import { versionsSample } from '../src/hosts/mockup/mock-versions-sample.ts';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i]);
}

const OUT = path.resolve(args.get('out') ?? 'testdata/corpus');
const MAX_TITLE = 50;

// Both built by code point so no invisible character ends up in this file.
const combiningMarks = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const reservedCharacters = new RegExp('[<>:"/\\\\|?*' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']', 'g');

const WORDS =
  `i u na za se je da ne su bio bila kao sve što još samo tada onda ovdje tamo
   čovjek žena dijete kuća grad more planina put voda kamen drvo sunce mjesec
   noć dan jutro veče ljeto zima pamćenje priča riječ jezik pjesma slika boja
   vrijeme godina sjećanje tišina glas korak ruka oko srce misao san istina
   lice prozor vrata sto stolica knjiga papir olovka pismo brat sestra majka
   otac djed baba prijatelj susjed vojnik general voz brod most rijeka polje
   šuma snijeg kiša vjetar oblak zvijezda pas mačka ptica konj cvijet trava`
    .split(/\s+/)
    .filter(Boolean);

/*
  `Math.imul`, not `*`. The obvious spelling overflows: the state times the
  multiplier is about 2.2e16, past the largest integer a double holds exactly,
  so the low bits are lost and the sequence collapses — it repeated after 10,466
  draws, which left the whole corpus built from one short loop and 175 distinct
  paragraphs shared across 581 texts. `imul` does the multiplication in 32 bits
  the way the constant expects.
*/
let seed = 20260919;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** He types diacritics inconsistently, so a third of generated words drop them. */
const maybeStrip = (w) =>
  rnd() < 0.33 ? w.normalize('NFD').replace(combiningMarks, '').replace(/đ/g, 'd') : w;

function sentence() {
  const n = 4 + Math.floor(rnd() * 14);
  const words = Array.from({ length: n }, () => maybeStrip(pick(WORDS)));
  const text = words.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${rnd() < 0.12 ? '?' : '.'}`;
}

/** Prose of roughly `bytes` length, in paragraphs. */
function body(bytes) {
  const parts = [];
  let size = 0;
  while (size < bytes) {
    const para = Array.from({ length: 1 + Math.floor(rnd() * 6) }, sentence).join(' ');
    parts.push(para);
    size += Buffer.byteLength(para, 'utf8') + 2;
  }
  return parts.join('\n\n');
}

function invent() {
  const n = 1 + Math.floor(rnd() * 5);
  const words = Array.from({ length: n }, () => maybeStrip(pick(WORDS)));
  const t = words.join(' ');
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

/** Mirrors the title rules the app itself will use. */
function toTitle(first) {
  let t = first
    .replace(reservedCharacters, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .trim();
  if (t.length > MAX_TITLE) {
    const cut = t.slice(0, MAX_TITLE);
    const space = cut.lastIndexOf(' ');
    t = (space > MAX_TITLE * 0.6 ? cut.slice(0, space) : cut).trim();
  }
  return t || 'Bez naslova';
}

const METADATA = 'testdata/metadata';

async function loadSources() {
  // Fall back to the metadata folder unless told otherwise, and only invent
  // titles when explicitly asked with --count.
  const invented = args.has('count');
  const notesPath = args.get('notes') ?? (invented ? undefined : `${METADATA}/notes_redacted.json`);
  const sizesPath = args.get('sizes') ?? (invented ? undefined : `${METADATA}/b_simplenote_backup_filenames.txt`);

  // Resoph truncates its filenames at ~40 characters and we cap titles at 50,
  // so the two only agree on a shorter prefix. Key the sizes on that.
  const key = (s) =>
    s
      .replace(reservedCharacters, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 28);

  const sizes = new Map();
  if (sizesPath) {
    for (const line of (await readFile(sizesPath, 'utf8')).split(/\r?\n/)) {
      const m = line.match(/^(.*?\.txt)\s+(\d+)\s*$/);
      if (m && !m[1].startsWith('trash')) sizes.set(key(path.basename(m[1], '.txt')), Number(m[2]));
    }
  }

  if (notesPath) {
    let text;
    try {
      text = await readFile(notesPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new Error(
        `No metadata at ${notesPath}.\n` +
          `It is the only copy and is not in the repository. Restore it there, ` +
          `or run with --count 600 to invent titles instead.`,
      );
    }
    const raw = JSON.parse(text);
    let matched = 0;
    const notes = (raw.activeNotes ?? raw).map((n) => {
      const first = String(n.content ?? '').split(/\r?\n/).find((l) => l.trim()) ?? '';
      const found = first ? sizes.get(key(first)) : 0;
      if (found !== undefined) matched += 1;
      return {
        title: toTitle(first),
        // An empty note really is empty — those are his emptied-out deletions.
        bytes: found ?? (first ? 200 + Math.floor(rnd() * 3000) : 0),
        created: n.creationDate ? new Date(n.creationDate) : new Date(),
        modified: n.lastModified ? new Date(n.lastModified) : new Date(),
        pinned: Boolean(n.pinned),
      };
    });
    console.log(`matched real sizes for ${matched} of ${notes.length}`);
    return notes;
  }

  const count = Number(args.get('count') ?? 600);
  return Array.from({ length: count }, () => {
    const modified = new Date(Date.now() - Math.floor(rnd() * 1200) * 86400000);
    return {
      title: toTitle(invent()),
      bytes: rnd() < 0.16 ? Math.floor(rnd() * 90) : Math.floor(rnd() ** 3 * 40000),
      created: modified,
      modified,
      pinned: rnd() < 0.19,
    };
  });
}

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Long texts put at the very top, so Nedavni always has something that scrolls. */
const LONG_ON_TOP = 3;

/**
 * Drags a handful of texts forward onto today.
 *
 * His archive stops in 2021, so every text in it is old enough to show as a
 * bare year and the rest of the time ladder — minutes, hours, juče, a date —
 * never appears while the UI is being developed.
 *
 * The longest ones go first, which is not what recency would do but is what
 * development needs: whatever is in Nedavni is what gets opened without
 * thinking, and if those are all four-line jots then the editor never scrolls,
 * the measure is never tested past one screen, and nothing that only shows up
 * in a long text — the scrollbar, walking between matches — is ever seen. The
 * rest of the slots go to the genuinely most recent.
 *
 * Offsets are relative, so generating the corpus just after midnight folds the
 * intra-day ones into "juče". It corrects itself on the next run.
 */
function freshenNewest(notes, now = Date.now()) {
  const offsets = [2 * MINUTE, 40 * MINUTE, 3 * HOUR, 27 * HOUR, 3 * DAY, 11 * DAY, 70 * DAY, 250 * DAY];

  const chosen = [...notes].sort((a, b) => b.bytes - a.bytes).slice(0, LONG_ON_TOP);
  for (const note of [...notes].sort((a, b) => b.modified - a.modified)) {
    if (chosen.length >= offsets.length) break;
    if (!chosen.includes(note)) chosen.push(note);
  }

  chosen.forEach((note, index) => {
    note.modified = new Date(now - offsets[index]);
  });
  return chosen;
}

const notes = await loadSources();
const freshened = freshenNewest(notes);
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const used = new Set();
const written = new Map();
let stubs = 0;
let empties = 0;
let duplicates = 0;
let total = 0;

for (const note of notes) {
  // Same collision rule the app uses: the title comes from the text, and a
  // suffix only ever disambiguates the filename.
  let name = note.title;
  if (used.has(name.toLowerCase())) {
    duplicates += 1;
    for (let n = 1; used.has(`${note.title} (${n})`.toLowerCase()); n += 1) name = `${note.title} (${n + 1})`;
    if (name === note.title) name = `${note.title} (1)`;
  }
  used.add(name.toLowerCase());

  let content;
  if (note.bytes === 0) {
    content = '';
    empties += 1;
  } else if (note.bytes <= Buffer.byteLength(note.title, 'utf8') + 8) {
    content = note.title;
    stubs += 1;
  } else {
    content = `${note.title}\n\n${body(note.bytes - Buffer.byteLength(note.title, 'utf8') - 2)}`;
  }

  const file = path.join(OUT, `${name}.txt`);
  await writeFile(file, content, 'utf8');
  await utimes(file, note.modified, note.modified);
  written.set(name, { content, modified: note.modified });
  total += Buffer.byteLength(content, 'utf8');
}

/*
  A trimmed copy for the browser, where the UI is developed. Same titles, dates
  and count, but the bodies have to fit in localStorage — Chromium allows about
  5MB, counted in UTF-16, so roughly 2.5 million characters against a corpus of
  nearly three million.

  Most are cut to a few lines, which is all the list needs. But a handful are
  kept long, because nothing about how a page of his writing actually reads —
  the measure, the line spacing, the scrollbar, how the text sits when it runs
  past the window — can be judged on four hundred characters. His real corpus
  runs to a 145KB essay; these stand in for it.
*/
const BROWSER_SHORT = 400;
const BROWSER_LONG = 40_000;
const LONG_SAMPLES = 10;

const longest = new Set(
  [...written.entries()]
    .sort(([, a], [, b]) => b.content.length - a.content.length)
    .slice(0, LONG_SAMPLES)
    .map(([name]) => name),
);
if (longest.size < LONG_SAMPLES) throw new Error('fewer long samples than asked for');

const browser = [];
for (const [name, note] of written) {
  const limit = longest.has(name) ? BROWSER_LONG : BROWSER_SHORT;
  browser.push({
    id: `${name}.txt`,
    text: note.content.slice(0, limit),
    updatedAt: note.modified.getTime(),
  });
}
/*
  The two development samples go in here with everything else.

  They used to be written into the browser's store on every load, on the
  reasoning that a fixture which has been edited is no use for looking at. What
  that actually bought was a second way for files to arrive, and it produced two
  bugs on its own: samples breeding a fresh set of copies every reload, and a
  second Versions sample appearing once the app renamed the first. Seeded like
  any other text they are ordinary texts, and getting them back as they were is
  this script plus an empty browser.

  Their ages are relative to when this runs, so re-running is also how they stop
  reading as months old.
*/
const now = Date.now();

/*
  What the archives borrow from his list, so most of what is in them is an
  older copy of something he already has — which is what an import actually
  looks like. Taken from the longest texts, because a copy cut back to an
  earlier state needs paragraphs to have lost.

  Picked here rather than in the sample module: titles are his first lines, and
  that module is in the repository.
*/
const lendable = [...written.entries()]
  .sort(([, a], [, b]) => b.content.length - a.content.length)
  .slice(LONG_SAMPLES, LONG_SAMPLES + BORROWED_COUNT)
  .map(([name, note]) => ({ name, text: note.content }));
if (lendable.length < BORROWED_COUNT) throw new Error('not enough texts to lend to the archives');

for (const file of [
  ...versionsSample(now, MOCK_WRITING_FOLDER),
  ...longDiffSample(now, MOCK_WRITING_FOLDER),
  ...archiveSample(now, MOCK_WRITING_FOLDER, lendable),
]) {
  browser.push({
    id: file.path.slice(MOCK_WRITING_FOLDER.length + 1),
    text: file.text,
    updatedAt: file.updatedAt,
  });
}

const browserChars = browser.reduce((sum, note) => sum + note.text.length, 0);
await writeFile(path.join(path.dirname(OUT), 'corpus.json'), JSON.stringify(browser), 'utf8');

const sizes = notes.map((n) => n.bytes).sort((a, b) => a - b);
console.log(`wrote ${notes.length} files to ${OUT}`);
console.log(`  total ${(total / 1048576).toFixed(2)} MB`);
console.log(`  empty ${empties}, title-only ${stubs}, deduped names ${duplicates}`);
console.log(
  `  pinned ${notes.filter((n) => n.pinned).length}, dated onto today ${freshened.length}` +
    ` (top of Nedavni: ${freshened.slice(0, LONG_ON_TOP).map((n) => `${(n.bytes / 1024).toFixed(0)}KB`).join(', ')})`,
);
const archived = browser.filter((note) => note.id.startsWith('Arhiva/'));
console.log(
  `  archives ${new Set(archived.map((note) => note.id.split('/')[1])).size},` +
    ` ${archived.filter((note) => !note.id.includes('/Verzije/')).length} texts in them,` +
    ` ${archived.filter((note) => note.id.includes('/Verzije/')).length} kept copies`,
);
console.log(
  `  browser copy ${(browserChars / 1000).toFixed(0)}k chars ` +
    `(~${((browserChars * 2) / 1048576).toFixed(1)} MB in localStorage), ` +
    `${LONG_SAMPLES} kept long`,
);
console.log(`  size p50 ${sizes[Math.floor(sizes.length / 2)]}, p90 ${sizes[Math.floor(sizes.length * 0.9)]}, max ${sizes[sizes.length - 1]}`);
