/**
 * Measures the shape of his writing, so design decisions can stop being guesses.
 *
 * Strictly read-only: it opens nothing for writing and creates nothing. Run it
 * against a copy rather than the live Dropbox folder, so that reading it cannot
 * itself provoke a sync.
 *
 * It prints counts, lengths and histograms. It never prints a title, a line, or
 * any of his words — the numbers are safe to paste back, the corpus is not.
 *
 *   node scripts/measure-writing.mjs --notes <notes.json> --folder <dir of .txt>
 *
 * Either source alone is useful; both together is better, because a text that
 * appears in each with different contents is a real before-and-after of his
 * editing rather than two texts that merely resemble one another.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (flag.startsWith('--')) args.set(flag.slice(2), process.argv[++i]);
}

const DAY = 86_400_000;

// ---------------------------------------------------------------- reporting

function histogram(label, values, edges, unit = '') {
  console.log(`\n${label}  (${values.length} measured)`);
  if (values.length === 0) return;

  const sorted = [...values].sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  console.log(
    `  median ${at(0.5)}${unit}   p90 ${at(0.9)}${unit}   p99 ${at(0.99)}${unit}   max ${sorted.at(-1)}${unit}`,
  );

  const counts = edges.map(() => 0);
  let over = 0;
  for (const value of sorted) {
    const bucket = edges.findIndex((edge) => value <= edge);
    if (bucket === -1) over += 1;
    else counts[bucket] += 1;
  }
  const widest = Math.max(...counts, over, 1);
  const bar = (n) => '#'.repeat(Math.round((n / widest) * 40));
  edges.forEach((edge, i) => {
    const from = i === 0 ? 0 : edges[i - 1] + 1;
    console.log(`  ${String(`${from}-${edge}${unit}`).padEnd(16)} ${String(counts[i]).padStart(5)}  ${bar(counts[i])}`);
  });
  console.log(`  ${String(`over ${edges.at(-1)}${unit}`).padEnd(16)} ${String(over).padStart(5)}  ${bar(over)}`);
}

const share = (part, whole) => (whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`);

// ---------------------------------------------------------------- the texts

/**
 * How a text ends its lines, before anything normalises them away.
 *
 * Worth counting on its own. His files came off Windows, and a textarea can
 * only ever hand back a bare newline — so the app rewrites every line of a file
 * the first time he touches one, which every measure below would otherwise read
 * as him having replaced the lot.
 */
function lineEndingOf(text) {
  const windows = (text.match(/\r\n/g) ?? []).length;
  const bare = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (windows > 0 && bare > 0) return 'both, mixed together';
  if (windows > 0) return 'windows (CR LF)';
  return bare > 0 ? 'bare newline (LF)' : 'no line endings at all';
}

const normalise = (text) => text.replace(/\r\n/g, '\n');

/** Everything about one text except what it says. */
function shapeOf(text) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const lines = text.split(/\r?\n/);
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  return {
    chars: text.length,
    words: words(text),
    lines: lines.length,
    paragraphs: paragraphs.length,
    paragraphChars: paragraphs.map((p) => p.length),
    paragraphWords: paragraphs.map(words),
    // How he separates his paragraphs decides how we can ever split them.
    blankLineBreaks: (text.match(/\n[ \t]*\n/g) ?? []).length,
    singleLineBreaks: (text.match(/[^\n]\n(?!\s*\n)/g) ?? []).length,
  };
}

/**
 * What changed between two versions of the same text.
 *
 * The common opening and the common ending are set aside, and what is left in
 * the middle is what he actually touched. It is the measure the app will use to
 * decide whether an edit is worth keeping a copy for, so the numbers here mean
 * the same thing there.
 */
function changeBetween(before, after) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = before.length - prefix - suffix;
  return {
    removed,
    added: after.length - prefix - suffix,
    removedShare: before.length === 0 ? 0 : Math.round((removed / before.length) * 100),
  };
}

// ---------------------------------------------------------------- loading

const firstLine = (text) => (text.split(/\r?\n/).find((l) => l.trim()) ?? '').trim();
const key = (text) => firstLine(text).toLowerCase().replace(/\s+/g, ' ').slice(0, 40);

async function loadNotesJson(file) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  return (raw.activeNotes ?? raw)
    .map((note) => ({
      ending: lineEndingOf(String(note.content ?? '')),
      text: normalise(String(note.content ?? '')),
      created: note.creationDate ? new Date(note.creationDate) : null,
      modified: note.lastModified ? new Date(note.lastModified) : null,
      pinned: Boolean(note.pinned),
    }))
    .filter((note) => note.text.trim());
}

async function loadFolder(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    if (!name.toLowerCase().endsWith('.txt')) continue;
    const full = path.join(dir, name);
    if (!(await stat(full)).isFile()) continue;
    const raw = await readFile(full, 'utf8');
    out.push({ name, ending: lineEndingOf(raw), text: normalise(raw) });
  }
  return out;
}

// ---------------------------------------------------------------- measures

function reportStructure(texts) {
  console.log('\n\n=== SHAPE OF HIS TEXTS ===');
  console.log(`texts: ${texts.length}`);

  const shapes = texts.map((t) => shapeOf(t.text));
  histogram('length', shapes.map((s) => s.chars), [200, 500, 1000, 2000, 5000, 15000, 50000], ' chars');
  histogram('paragraphs per text', shapes.map((s) => s.paragraphs), [1, 2, 3, 5, 8, 15, 30]);
  histogram('paragraph length', shapes.flatMap((s) => s.paragraphWords), [10, 25, 50, 100, 200, 400], ' words');

  const endings = new Map();
  for (const text of texts) endings.set(text.ending, (endings.get(text.ending) ?? 0) + 1);
  console.log('\nhow his lines end');
  for (const [style, count] of endings) {
    console.log(`  ${String(style).padEnd(26)} ${String(count).padStart(5)}  ${share(count, texts.length)}`);
  }
  console.log('  (a textarea gives back bare newlines, so anything else is rewritten on his first edit)');

  // The one that decides whether paragraph-level highlighting is worth building.
  const single = shapes.filter((s) => s.paragraphs <= 1).length;
  const blankSeparated = shapes.filter((s) => s.blankLineBreaks > 0).length;
  const onlySingleBreaks = shapes.filter((s) => s.blankLineBreaks === 0 && s.singleLineBreaks > 0).length;
  console.log('\nhow he breaks his text up');
  console.log(`  one unbroken block          ${String(single).padStart(5)}  ${share(single, shapes.length)}`);
  console.log(`  separated by blank lines    ${String(blankSeparated).padStart(5)}  ${share(blankSeparated, shapes.length)}`);
  console.log(`  only single line breaks     ${String(onlySingleBreaks).padStart(5)}  ${share(onlySingleBreaks, shapes.length)}`);
  console.log('  (if "one unbroken block" is large, marking whole paragraphs tells him nothing)');
}

function reportLongevity(notes) {
  const dated = notes.filter((n) => n.created && n.modified);
  if (dated.length === 0) return;

  console.log('\n\n=== HOW LONG A TEXT STAYS ALIVE ===');
  const alive = dated.map((n) => Math.max(0, Math.round((n.modified - n.created) / DAY)));
  const untouched = alive.filter((days) => days === 0).length;
  console.log(`written and never touched again: ${untouched} of ${dated.length}  ${share(untouched, dated.length)}`);
  console.log('  (if that is most of them, a destructive edit is a rare event and the threshold matters little)');
  histogram('days between writing it and last changing it', alive, [0, 1, 7, 30, 180, 365, 1095], ' d');

  const pinned = notes.filter((n) => n.pinned).length;
  console.log(`\npinned: ${pinned} of ${notes.length}  ${share(pinned, notes.length)}`);
}

function reportRevisions(label, pairs) {
  console.log(`\n\n=== ${label} ===`);
  const changed = pairs.filter(({ before, after }) => before !== after);
  console.log(`matched: ${pairs.length}   of which differ: ${changed.length}  ${share(changed.length, pairs.length)}`);
  if (changed.length === 0) {
    console.log('  nothing to measure — the two copies are the same, so they were taken together');
    return;
  }

  const changes = changed.map(({ before, after }) => changeBetween(before, after));
  histogram('removed', changes.map((c) => c.removed), [0, 20, 60, 150, 400, 1000, 4000], ' chars');
  histogram('removed, as a share of the text', changes.map((c) => c.removedShare), [1, 3, 8, 15, 30, 60, 90], '%');
  const pureInsertion = changes.filter((c) => c.removed === 0).length;
  console.log(`\npure insertion (nothing taken out): ${pureInsertion}  ${share(pureInsertion, changes.length)}`);
  console.log('  (these would never need a copy kept — the old text is still inside the new one)');
}

/** Texts that look like drafts of one another, found by the paragraphs they share. */
function reportVariants(texts) {
  console.log('\n\n=== DRAFTS OF THE SAME TEXT ===');
  const fingerprints = texts.map((t) => ({
    text: t.text,
    paragraphs: new Set(
      t.text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 40),
    ),
  }));

  const clusters = [];
  const claimed = new Set();
  for (let i = 0; i < fingerprints.length; i += 1) {
    if (claimed.has(i) || fingerprints[i].paragraphs.size === 0) continue;
    const group = [i];
    for (let j = i + 1; j < fingerprints.length; j += 1) {
      if (claimed.has(j) || fingerprints[j].paragraphs.size === 0) continue;
      let shared = 0;
      for (const p of fingerprints[j].paragraphs) if (fingerprints[i].paragraphs.has(p)) shared += 1;
      const smaller = Math.min(fingerprints[i].paragraphs.size, fingerprints[j].paragraphs.size);
      if (shared / smaller >= 0.5) {
        group.push(j);
        claimed.add(j);
      }
    }
    if (group.length > 1) clusters.push(group);
  }

  console.log(`clusters of two or more drafts: ${clusters.length}`);
  console.log(`texts involved: ${clusters.reduce((n, g) => n + g.length, 0)} of ${texts.length}`);
  histogram('drafts per cluster', clusters.map((g) => g.length), [2, 3, 4, 6, 10]);

  const pairs = [];
  for (const group of clusters) {
    const ordered = group.map((i) => fingerprints[i].text).sort((a, b) => a.length - b.length);
    for (let i = 1; i < ordered.length; i += 1) pairs.push({ before: ordered[i - 1], after: ordered[i] });
  }
  if (pairs.length === 0) return;
  reportRevisions('BETWEEN ONE DRAFT AND THE NEXT', pairs);

  /*
    The measure above only notices a change where it sits: it sets aside the
    common opening and the common ending, so anything that survived but moved
    counts as gone. Between drafts written months apart that is usually what has
    happened, which is why those shares run so close to the whole text. This
    asks the other question — how much of the earlier draft is still there
    *somewhere* — and the gap between the two is what he moved rather than cut.
  */
  const survival = pairs.map(({ before, after }) => {
    const older = before.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 40);
    if (older.length === 0) return 100;
    const newer = new Set(after.split(/\n\s*\n/).map((p) => p.trim()));
    return Math.round((older.filter((p) => newer.has(p)).length / older.length) * 100);
  });
  histogram('how much of the earlier draft survives anywhere in the later one', survival, [0, 10, 30, 60, 90, 99], '%');
}

function reportConflicts(files) {
  const CONFLICTED = /\(.+conflicted copy \d{4}-\d{2}-\d{2}(?: \d+)?\)/i;
  const conflicted = files.filter((f) => CONFLICTED.test(f.name));
  console.log('\n\n=== CONFLICTED COPIES DROPBOX HAS ALREADY MADE ===');
  console.log(`found: ${conflicted.length} of ${files.length} files`);
  if (conflicted.length === 0) {
    console.log('  none — so either he has not used two machines at once, or Dropbox has not caught him yet');
    return;
  }

  const byName = new Map(files.map((f) => [f.name, f]));
  const pairs = [];
  for (const copy of conflicted) {
    const base = copy.name.replace(CONFLICTED, '').replace(/\s+\./, '.').trim();
    const original = byName.get(base);
    if (original) pairs.push({ before: original.text, after: copy.text });
  }
  console.log(`paired with the text they came from: ${pairs.length}`);
  if (pairs.length > 0) reportRevisions('HOW FAR APART THE TWO SIDES ARE', pairs);
}

// ---------------------------------------------------------------- run

const notesPath = args.get('notes');
const folderPath = args.get('folder');
if (!notesPath && !folderPath) {
  console.error('usage: node scripts/measure-writing.mjs --notes <notes.json> --folder <dir>');
  process.exit(1);
}

const notes = notesPath ? await loadNotesJson(notesPath) : [];
const files = folderPath ? await loadFolder(folderPath) : [];

console.log('Read-only. Nothing below identifies a text; these are counts and lengths.');
if (notes.length > 0) console.log(`\nnotes.json: ${notes.length} texts`);
if (files.length > 0) console.log(`folder:     ${files.length} .txt files`);

reportStructure(notes.length > 0 ? notes : files);
if (notes.length > 0) reportLongevity(notes);
if (files.length > 0) reportConflicts(files);

if (notes.length > 0 && files.length > 0) {
  // Two texts that open with the same words cannot be told apart by their
  // opening words, and he has a good many that do. Pairing those would measure
  // a collision and report it as an edit, so they are counted and left out.
  const inNotes = new Map();
  for (const note of notes) {
    const k = key(note.text);
    inNotes.set(k, inNotes.has(k) ? null : note.text);
  }
  const timesInFolder = new Map();
  for (const file of files) {
    const k = key(file.text);
    timesInFolder.set(k, (timesInFolder.get(k) ?? 0) + 1);
  }

  const pairs = [];
  let ambiguous = 0;
  for (const file of files) {
    const k = key(file.text);
    const match = inNotes.get(k);
    if (match === undefined) continue;
    if (match === null || (timesInFolder.get(k) ?? 0) > 1) ambiguous += 1;
    else pairs.push({ before: match, after: file.text });
  }
  console.log(`\n\ntexts sharing an opening with another, so not compared: ${ambiguous}`);
  reportRevisions('THE SAME TEXT IN BOTH COPIES', pairs);
}

reportVariants(notes.length > 0 ? notes : files);
console.log('');
