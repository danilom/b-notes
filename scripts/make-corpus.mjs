/**
 * Builds a test corpus shaped like his real one: same titles, sizes and dates,
 * entirely invented prose.
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

let seed = 20260919;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
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

const notes = await loadSources();
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

// A trimmed copy for the browser, where the UI is developed. Same titles, dates
// and count; bodies cut short so the whole thing fits in localStorage. Editor
// behaviour on a 145KB essay has to be judged in the real app, not here.
const BROWSER_BODY_LIMIT = 400;
const browser = [];
for (const [name, note] of written) {
  browser.push({
    id: `${name}.txt`,
    text: note.content.slice(0, BROWSER_BODY_LIMIT),
    updatedAt: note.modified.getTime(),
  });
}
await writeFile(path.join(path.dirname(OUT), 'corpus.json'), JSON.stringify(browser), 'utf8');

const sizes = notes.map((n) => n.bytes).sort((a, b) => a - b);
console.log(`wrote ${notes.length} files to ${OUT}`);
console.log(`  total ${(total / 1048576).toFixed(2)} MB`);
console.log(`  empty ${empties}, title-only ${stubs}, deduped names ${duplicates}`);
console.log(`  pinned ${notes.filter((n) => n.pinned).length}`);
console.log(`  size p50 ${sizes[Math.floor(sizes.length / 2)]}, p90 ${sizes[Math.floor(sizes.length * 0.9)]}, max ${sizes[sizes.length - 1]}`);
