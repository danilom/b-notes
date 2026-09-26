/**
 * Makes a copy of his corpus that can leave his machine, keeping everything
 * about it that makes it his.
 *
 * Every file is reproduced at the same place under a new root, with its name,
 * its bytes' shape, its line endings and its timestamps intact — and with his
 * words gone past the first thirty. What survives is the structure and the
 * strangeness: the names Windows programs choke on, the tabs nothing shows,
 * the encodings Notepad leaves behind. That is what the bugs live in.
 *
 * Standalone on purpose. It imports nothing from this project and nothing from
 * npm, so it can be copied to his machine on its own and run there:
 *
 *   node anonymize-corpus.mjs "C:\Users\...\Tekstovi" "C:\Users\...\Redigovano"
 *
 * The output folder must not exist yet, or be empty. The census of everything
 * odd it found goes beside it, not in it, so the copy stays a faithful mirror.
 * Every time is kept: modified and accessed through Node, and created through
 * one call to the PowerShell that ships with Windows, since Node cannot set it.
 * When it is done it reads the copy back and checks every name and every size
 * against the original. Exits non-zero if anything at all could not be copied,
 * given its times, or found again exactly as it should be.
 *
 * Options:
 *   --keep-words N      how many of his words survive at the head of each file
 *   --report FILE       where the census goes (default: <output>-report.json)
 *
 * What it does NOT hide: filenames, folder names, and the first thirty words of
 * every file. All three are deliberate — how he names and opens a text is the
 * thing being studied — and all three are why the output is still his writing
 * and should be treated as his.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * How much of the head of each file survives.
 *
 * A small privacy cost bought deliberately: he titles texts unpredictably, or
 * doesn't title them at all, and a corpus whose openings are all `xxx xxxx`
 * cannot answer a single question about how the list names things.
 */
const KEEP_WORDS = 30;

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

// ---------------------------------------------------------------------------
// Counting words, and where his writing stops being kept
// ---------------------------------------------------------------------------

/** ASCII whitespace, and nothing else. See `isWordUnit` for why. */
function isSpaceUnit(code) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/**
 * Something that makes a run of characters a word rather than decoration.
 *
 * A letter, a digit, or anything at all above ASCII — which is how Serbian
 * survives here without the script having to know what encoding it is in. In a
 * UTF-8 file `č` is two bytes both above 0x7f; in a single-byte file it is one.
 * Either way it counts towards a word and is never touched.
 *
 * The point of the distinction: he opens texts with rules of dashes, rows of
 * asterisks and bare brackets. Counting those as words would spend his thirty
 * on decoration and hand back a corpus with none of his openings in it.
 */
function isWordUnit(code) {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code >= 0x80
  );
}

/**
 * Where the nth word ends, as an index just past its last character.
 *
 * Returns the length when there are fewer words than that, which reads as
 * "keep all of it" — a file of four words is four words long either way, and
 * padding it with x's would only invent writing he never did.
 *
 * @param at reads one code unit: a byte, or a UTF-16 code unit.
 */
function endOfWords(length, at, keep) {
  if (keep <= 0) return 0;
  let counted = 0;
  let i = 0;
  while (i < length) {
    while (i < length && isSpaceUnit(at(i))) i += 1;
    if (i >= length) break;

    let isWord = false;
    while (i < length && !isSpaceUnit(at(i))) {
      if (isWordUnit(at(i))) isWord = true;
      i += 1;
    }
    if (!isWord) continue;

    counted += 1;
    if (counted >= keep) return i;
  }
  return length;
}

// ---------------------------------------------------------------------------
// Redacting
// ---------------------------------------------------------------------------

/**
 * Byte for byte, which is what makes this safe for an encoding we never
 * identified.
 *
 * Only the ASCII letters move. Every byte above 0x7f is left exactly as it was,
 * so a UTF-8 file stays valid UTF-8, a Windows-1250 file stays Windows-1250,
 * and a file that is neither still comes out the same length it went in. The
 * cost is that Serbian letters survive unredacted, which he has accepted: they
 * are the same bytes in his writing as in anybody's, and what leaks is a shape
 * rather than a word.
 */
function redactBytes(buffer, keepWords) {
  const hasBom = buffer.subarray(0, 3).equals(UTF8_BOM);
  const body = buffer.subarray(hasBom ? 3 : 0);
  const from = endOfWords(body.length, (i) => body[i], keepWords);

  const out = Buffer.from(body);
  for (let i = from; i < out.length; i += 1) {
    const byte = out[i];
    if (byte >= 0x61 && byte <= 0x7a) out[i] = 0x78; // a-z -> x
    else if (byte >= 0x41 && byte <= 0x5a) out[i] = 0x58; // A-Z -> X
  }
  return hasBom ? Buffer.concat([UTF8_BOM, out]) : out;
}

function redactText(text, from) {
  const out = [text.slice(0, from)];
  for (let i = from; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0x61 && code <= 0x7a) out.push('x');
    else if (code >= 0x41 && code <= 0x5a) out.push('X');
    else out.push(text[i]);
  }
  return out.join('');
}

/**
 * Two bytes to the character, which is what Notepad leaves behind when it is
 * asked for "Unicode".
 *
 * These cannot go through the byte path: every ASCII character there is a byte
 * and a zero, and a zero is not whitespace, so the whole file would count as
 * one enormous word and nothing would be redacted at all. That is the failure
 * worth spelling out — it loses nothing visibly and hands back his writing.
 *
 * Returns null for an odd number of bytes, which is not UTF-16 whatever the
 * mark at the front claims. The caller falls back to bytes and says so.
 */
function redactUtf16(buffer, order, keepWords) {
  const body = Buffer.from(buffer.subarray(2));
  if (body.length % 2 !== 0) return null;
  if (order === 'be') body.swap16();

  const text = body.toString('utf16le');
  const from = endOfWords(text.length, (i) => text.charCodeAt(i), keepWords);
  const encoded = Buffer.from(redactText(text, from), 'utf16le');
  if (order === 'be') encoded.swap16();

  return Buffer.concat([order === 'be' ? UTF16BE_BOM : UTF16LE_BOM, encoded]);
}

/**
 * One file's bytes in, one file's bytes out.
 *
 * @returns the new bytes and how they were read, so the census can say what it
 * found without guessing a second time.
 */
export function anonymize(buffer, keepWords = KEEP_WORDS) {
  if (buffer.subarray(0, 2).equals(UTF16LE_BOM)) {
    const bytes = redactUtf16(buffer, 'le', keepWords);
    if (bytes !== null) return { bytes, read: 'utf-16le' };
    return { bytes: redactBytes(buffer, keepWords), read: 'utf-16le, odd length' };
  }
  if (buffer.subarray(0, 2).equals(UTF16BE_BOM)) {
    const bytes = redactUtf16(buffer, 'be', keepWords);
    if (bytes !== null) return { bytes, read: 'utf-16be' };
    return { bytes: redactBytes(buffer, keepWords), read: 'utf-16be, odd length' };
  }
  if (buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return { bytes: redactBytes(buffer, keepWords), read: 'utf-8 with a mark' };
  }
  return { bytes: redactBytes(buffer, keepWords), read: 'bytes' };
}

// ---------------------------------------------------------------------------
// The census: what is strange about this corpus
// ---------------------------------------------------------------------------

/** Names Windows still refuses, forty years on, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

const FORBIDDEN_IN_NAMES = /[<>:"/\\|?*]/;

/**
 * What is unusual about one name.
 *
 * Reported rather than fixed. Every one of these is a name he made and Resoph
 * accepted, and the whole reason for carrying the corpus back is to have them
 * in hand rather than described over the telephone.
 */
export function oddityOfName(name) {
  const why = [];
  // One finding, not two: Windows trims the dots and spaces off the end of a
  // name together, so `Tekst. ` and `Tekst .` are the same trap.
  const trailing = /[. ]+$/.exec(name)?.[0];
  if (trailing !== undefined) why.push(`ends in ${JSON.stringify(trailing)}, which Windows trims`);
  if (/^[ ]/.test(name)) why.push('starts with a space');
  // The control characters are the point, so the range is written out.
  if (/[\u0000-\u001f\u007f]/.test(name)) why.push('holds a control character');
  if (FORBIDDEN_IN_NAMES.test(name)) why.push('holds a character Windows forbids');
  if (RESERVED.test(name)) why.push('is a reserved device name');
  if (name !== name.normalize('NFC')) why.push('is not in normal form');
  if (/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/.test(name)) why.push('holds an invisible mark');
  // `%2A` for `*`, `%3F` for `?`: how Resoph appears to write a title holding
  // a character Windows will not have in a name. Worth knowing which texts
  // carry them, since his title and his filename then disagree.
  if (/%[0-9a-f]{2}/i.test(name)) why.push('holds %-escapes');
  if (LOOKS_LIKE_SHORT_NAME.test(name)) why.push('looks like a Windows short name');
  if (name.length > 200) why.push(`is ${name.length} characters long`);
  return why;
}

function textOfUtf16(buffer, read) {
  const body = Buffer.from(buffer.subarray(2));
  if (read === 'utf-16be') body.swap16();
  return body.toString('utf16le');
}

/** What is unusual about one file's contents, read before anything is changed. */
export function oddityOfFile(buffer, read) {
  const why = [];
  if (buffer.length === 0) why.push('is empty');
  if (read !== 'bytes') why.push(`is ${read}`);

  const wide = read === 'utf-16le' || read === 'utf-16be';
  if (!wide && buffer.includes(0x00)) {
    // Either a binary that has no business here, or UTF-16 with no mark at the
    // front — which went through the byte path counted in the wrong units, so
    // it kept the wrong amount of his writing. Both are worth a look.
    why.push('holds NUL bytes but has no mark saying what it is');
  }

  // Read as characters, not bytes: in UTF-16 a carriage return is followed by
  // a zero rather than a line feed, and every Notepad "Unicode" file would be
  // reported as having lone ones.
  const text = wide ? textOfUtf16(buffer, read) : buffer.toString('latin1');
  if (text.includes('\t')) why.push('holds tabs');
  if (text.includes('\f')) why.push('holds a page break');
  if (/\r(?!\n)/.test(text)) why.push('has a carriage return on its own');
  if (/\r\n/.test(text) && /(?<!\r)\n/.test(text)) why.push('mixes line endings');
  if (buffer.length > 5_000_000) why.push(`is ${Math.round(buffer.length / 1e6)} MB`);
  return why;
}

// ---------------------------------------------------------------------------
// Walking the folder
// ---------------------------------------------------------------------------

/*
  No `\\?\` prefix anywhere, and no hand-built paths, and that is deliberate.

  Both were here, to stop Windows trimming `Tekst. ` to `Tekst`, refusing
  `CON.txt`, and giving up past 260 characters. A corpus built of exactly those
  came through byte-identical with both removed: Node's `fs` already prefixes
  every absolute path it is given on Windows, and `path.join` leaves trailing
  dots and spaces alone. A defence nothing can make fail is one the next reader
  has to wonder about, so they went.
*/

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

// ---------------------------------------------------------------------------
// Keeping the times
// ---------------------------------------------------------------------------

/**
 * When something was made, changed and last read, taken before we touch it.
 *
 * Before, because reading a file is itself an access, and on a machine that
 * still records those the copy would carry the moment of copying instead.
 * In nanoseconds, because NTFS keeps a tenth of a microsecond and a Date keeps
 * a thousandth of a second: two texts saved within a millisecond of each other
 * would come back in either order.
 */
async function timesOf(at) {
  return stat(at, { bigint: true });
}

/** Seconds, to the microsecond — as fine as `utimes` can carry. */
function secondsOf(nanoseconds) {
  return Number(nanoseconds / 1000n) / 1e6;
}

/**
 * Modified and accessed, which Node can set on both files and folders.
 *
 * Kept because the app sorts by modified time and shows it: a corpus that all
 * changed this morning cannot reproduce anything about Nedavni or the dates
 * down the right-hand side.
 */
async function keepTimes(to, was) {
  await utimes(to, secondsOf(was.atimeNs), secondsOf(was.mtimeNs));
}

/** Windows' own count: tenths of a microsecond since 1601. */
function fileTimeOf(nanoseconds) {
  return (nanoseconds / 100n + 116_444_736_000_000_000n).toString();
}

// Run once at the end rather than per file: starting PowerShell costs about a
// second, and doing it six hundred times would turn a quick copy into a long
// one. The list comes through a file because a command line cannot carry six
// hundred names that include ones like `Tekst. `.
const SET_CREATION_TIMES = String.raw`
$items = Get-Content -LiteralPath $env:CORPUS_CREATION_TIMES -Raw -Encoding UTF8 | ConvertFrom-Json
$failed = 0
foreach ($item in $items) {
  try {
    $when = [DateTime]::FromFileTimeUtc([long]$item.created)
    $literal = if ($item.path.StartsWith('\\')) { '\\?\UNC\' + $item.path.Substring(2) } else { '\\?\' + $item.path }
    if ($item.folder) { [System.IO.Directory]::SetCreationTimeUtc($literal, $when) }
    else { [System.IO.File]::SetCreationTimeUtc($literal, $when) }
  } catch {
    $failed++
    [Console]::Error.WriteLine($item.path + ' :: ' + $_.Exception.Message)
  }
}
[Console]::Out.WriteLine($failed)
`;

/**
 * When each file and folder was made, which Node has no way to set.
 *
 * Here the literal \\?\ prefix does matter, unlike everywhere Node does the
 * work: .NET tidies a path it is handed exactly the way Windows does, and a
 * name ending in a dot would have its creation time set on a file that is not
 * there.
 *
 * Windows only. Elsewhere there is no creation time to set, and the run says so
 * rather than claiming it kept one.
 */
async function keepCreationTimes(made, report) {
  if (made.length === 0) return;
  if (process.platform !== 'win32') {
    report.notes.push('Creation times were not kept: only Windows can set them.');
    return;
  }

  const listAt = path.join(tmpdir(), `corpus-creation-times-${process.pid}.json`);
  await writeFile(listAt, JSON.stringify(made), 'utf8');
  try {
    const { failed, complaints } = await runPowerShell(listAt);
    for (const line of complaints) {
      const [where, error] = line.split(' :: ');
      // Relative to the copy, since that is what could not be touched.
      const said = path.relative(report.to, where ?? line) || '.';
      report.failures.push({ path: said, error: `creation time: ${error}` });
    }
    if (failed > 0 && complaints.length === 0) {
      report.failures.push({ path: '.', error: `${failed} creation times were not kept` });
    }
  } finally {
    await rm(listAt, { force: true });
  }
}

function runPowerShell(listAt) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SET_CREATION_TIMES],
      { env: { ...process.env, CORPUS_CREATION_TIMES: listAt }, windowsHide: true },
    );
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const failed = Number(out.trim());
      if (code !== 0 || !Number.isInteger(failed)) {
        reject(new Error(`PowerShell could not set creation times: ${err.trim() || `exit ${code}`}`));
        return;
      }
      resolve({ failed, complaints: err.split(/\r?\n/).filter((line) => line.length > 0) });
    });
  });
}

// ---------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------

async function copyFile(from, to, report, keepWords) {
  const was = await timesOf(from);
  const buffer = await readFile(from);
  const { bytes, read } = anonymize(buffer, keepWords);

  const why = oddityOfFile(buffer, read);
  if (why.length > 0) report.oddFiles.push({ path: report.relative(from), why });

  // Never over anything. The copy starts empty, so a name that is already
  // taken can only be a short-name alias of something written a moment ago —
  // and writing through it would put this file's bytes into that one.
  await writeFile(to, bytes, { flag: 'wx' });
  await keepTimes(to, was);
  report.created.push({ path: to, folder: false, created: fileTimeOf(was.birthtimeNs) });

  const extension = extensionOf(path.basename(from));
  report.totals.files += 1;
  report.totals.bytes += buffer.length;
  report.extensions[extension] = (report.extensions[extension] ?? 0) + 1;
}

/**
 * A name Windows could also be using as the short alias of a long one.
 *
 * Every long name on a volume that keeps 8.3 names gets one, `LONGFI~1.TXT`
 * for `Long filename.txt`, and it opens the file exactly as the long name
 * does. So a copy that makes `Long filename.txt` first hands it `~1`, and then
 * "creating" `LONGFI~1.TXT` opens the long one and writes over it. Two files
 * become one, and nothing says so. His machine let both exist because the `~1`
 * file was there first, and the long one took `~2`.
 */
const LOOKS_LIKE_SHORT_NAME = /~\d/;

/**
 * The same entries, in an order that lets them all exist.
 *
 * Anything that could be an alias goes first, which is the order that made
 * them possible on his machine: once a literal `~1` name is taken, no long name
 * can be given it. Otherwise the order is whatever the folder listed.
 */
function inCreationOrder(entries) {
  const short = entries.filter((entry) => LOOKS_LIKE_SHORT_NAME.test(entry.name));
  const rest = entries.filter((entry) => !LOOKS_LIKE_SHORT_NAME.test(entry.name));
  return [...short, ...rest];
}

/**
 * One folder, and everything under it.
 *
 * Depth first and one directory created per directory found, so a folder that
 * is empty in his corpus is empty in the copy rather than missing from it.
 */
async function walk(from, to, report, keepWords) {
  const was = await timesOf(from);
  // Read before anything is made, so a folder that cannot be read leaves no
  // empty copy of itself behind to be mistaken for one that was empty.
  const entries = await readdir(from, { withFileTypes: true });
  // Only the root may already be there, and only empty. Anywhere below it, a
  // folder that exists already is an alias of one just made — the same trap
  // as a file, and it would merge two folders into one.
  await mkdir(to, { recursive: to === report.to });
  report.totals.folders += 1;

  for (const entry of inCreationOrder(entries)) {
    const here = path.join(from, entry.name);
    const there = path.join(to, entry.name);

    const why = oddityOfName(entry.name);
    if (why.length > 0) report.oddNames.push({ path: report.relative(here), why });

    if (entry.isSymbolicLink()) {
      // Not followed: a junction pointing at its own parent is a walk that
      // never ends, and a link pointing outside the corpus is a copy of
      // something he never put here.
      report.skipped.push({ path: report.relative(here), why: 'is a link' });
      continue;
    }

    try {
      if (entry.isDirectory()) await walk(here, there, report, keepWords);
      else if (entry.isFile()) await copyFile(here, there, report, keepWords);
      else report.skipped.push({ path: report.relative(here), why: 'is not a file or folder' });
    } catch (error) {
      // Carried on rather than abandoned: one unreadable file in six hundred
      // should not cost him the other five hundred and ninety-nine, and a
      // failure nobody hears about is the one thing worse than a slow copy.
      report.failures.push({ path: report.relative(here), error: String(error) });
    }
  }

  // Last, once everything inside it is written: every file put into a folder
  // moves the folder's own modified time, so setting it any earlier would be
  // setting it to be overwritten.
  await keepTimes(to, was);
  report.created.push({ path: to, folder: true, created: fileTimeOf(was.birthtimeNs) });
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

function readArguments(argv) {
  const plain = [];
  const options = { keepWords: KEEP_WORDS, report: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep-words') {
      const said = Number(argv[(i += 1)]);
      if (!Number.isInteger(said) || said < 0) throw new Error('--keep-words wants a whole number');
      options.keepWords = said;
    } else if (arg === '--report') options.report = argv[(i += 1)] ?? null;
    else if (arg.startsWith('--')) throw new Error(`I do not know the option ${arg}`);
    else plain.push(arg);
  }

  if (plain.length !== 2) throw new Error('Usage: node anonymize-corpus.mjs <from> <to> [options]');
  return { from: path.resolve(plain[0]), to: path.resolve(plain[1]), ...options };
}

/**
 * The two ways this can eat the thing it is copying, refused before it starts.
 *
 * Writing inside the folder being read is a walk that keeps finding its own
 * output; writing over a folder that already holds something is a mistake
 * nobody can undo. There is no option to do it anyway: every write refuses to
 * replace anything, so a second run into the same folder could only fail file
 * by file.
 */
async function checkWhereItIsGoing(from, to) {
  const inside = (outer, inner) =>
    inner === outer || inner.toLowerCase().startsWith(`${outer.toLowerCase()}${path.sep}`);
  if (inside(from, to)) throw new Error('The output folder is inside the input folder');
  if (inside(to, from)) throw new Error('The input folder is inside the output folder');

  let holds = [];
  try {
    holds = await readdir(to);
  } catch {
    // Not there yet, which is the ordinary case and exactly what we want.
    return;
  }
  if (holds.length > 0) {
    throw new Error(`${to} already has ${holds.length} things in it. Delete it, or name a new folder.`);
  }
}

// ---------------------------------------------------------------------------
// Checking the copy
// ---------------------------------------------------------------------------

/**
 * Every name under a folder, with each file's size, or -1 for a folder.
 *
 * Links and anything that is neither a file nor a folder are left out, the
 * same as the copy leaves them out, so they are not reported twice.
 */
async function treeOf(root, relative = '') {
  const found = new Map();
  const here = relative === '' ? root : path.join(root, relative);
  for (const entry of await readdir(here, { withFileTypes: true })) {
    const at = relative === '' ? entry.name : path.join(relative, entry.name);
    if (entry.isDirectory()) {
      found.set(at, -1);
      for (const [below, size] of await treeOf(root, at)) found.set(below, size);
    } else if (entry.isFile()) {
      found.set(at, (await stat(path.join(root, at))).size);
    }
  }
  return found;
}

/**
 * Reads the copy back and holds it against the original, name by name.
 *
 * The one guarantee that matters most is that every name comes back exactly
 * as it went in, and the only honest way to give it is to look. Sizes too:
 * nothing here changes a file's length, so a size that moved is a file that
 * was written into by something other than its own copy.
 */
async function checkCopy(from, to, report) {
  const [had, made] = await Promise.all([treeOf(from), treeOf(to)]);
  const known = new Set(report.failures.map((failed) => failed.path));
  const say = (at, error) => {
    if (!known.has(at)) report.failures.push({ path: at, error });
  };

  for (const [at, size] of had) {
    if (!made.has(at)) say(at, 'is missing from the copy');
    else if (made.get(at) !== size) say(at, `is ${made.get(at)} bytes in the copy, not ${size}`);
  }
  for (const at of made.keys()) {
    if (!had.has(at)) say(at, 'is in the copy but not in his corpus');
  }
  return had.size;
}

function summarise(report, where) {
  const { folders, files, bytes } = report.totals;
  console.log(`\n${files} files in ${folders} folders, ${(bytes / 1e6).toFixed(1)} MB read.`);
  console.log(`Extensions: ${JSON.stringify(report.extensions)}`);
  console.log(`Odd names: ${report.oddNames.length}`);
  console.log(`Odd files: ${report.oddFiles.length}`);
  console.log(`Skipped:   ${report.skipped.length}`);
  console.log(`Failed:    ${report.failures.length}`);

  for (const odd of report.oddNames.slice(0, 20)) {
    console.log(`  name: ${odd.path} — ${odd.why.join(', ')}`);
  }
  for (const note of report.notes) console.log(`  ${note}`);
  for (const failed of report.failures.slice(0, 20)) {
    console.log(`  FAILED: ${failed.path} — ${failed.error}`);
  }
  console.log(`\nThe whole census is in ${where}`);
}

async function run(argv) {
  const { from, to, keepWords, report: reportAt } = readArguments(argv);
  await checkWhereItIsGoing(from, to);

  const report = {
    from,
    to,
    keptWords: keepWords,
    ranAt: new Date().toISOString(),
    totals: { folders: 0, files: 0, bytes: 0 },
    extensions: {},
    oddNames: [],
    oddFiles: [],
    skipped: [],
    failures: [],
    notes: [],
    /** Every file and folder written, for the creation-time pass at the end. */
    created: [],
    // Not by slicing off the root: run on a drive's root, that root already
    // ends in a separator and every path would lose its first letter.
    relative: (full) => path.relative(from, full) || '.',
  };

  console.log(`Reading  ${from}`);
  console.log(`Writing  ${to}`);
  await walk(from, to, report, keepWords);
  try {
    await keepCreationTimes(report.created, report);
  } catch (error) {
    // Everything else is written and its times kept; only when each thing was
    // made is missing. Said, and the run carries on to its report.
    report.failures.push({ path: '.', error: String(error) });
  }

  // Last, so it sees the copy exactly as it will be carried away.
  const checked = await checkCopy(from, to, report);
  report.notes.push(`Every name and size checked against the original: ${checked} entries.`);

  const where = reportAt ?? `${to}-report.json`;
  const { relative, created, ...written } = report;
  await writeFile(path.resolve(where), `${JSON.stringify(written, null, 2)}\n`);
  summarise(report, where);

  // Non-zero when anything at all was left behind, so a run in a hurry cannot
  // look like a clean one.
  return report.failures.length === 0 ? 0 : 1;
}

// Only when run, never when imported by a test.
const startedFrom = process.argv[1];
if (startedFrom !== undefined && import.meta.url === pathToFileURL(startedFrom).href) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
