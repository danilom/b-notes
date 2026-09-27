/**
 * Does b-notes read his Resoph folder the way Resoph does?
 *
 * Resoph's own database holds every note as Resoph shows it — title, a line
 * break, the rest — so it is the ground truth for the format b-notes infers
 * from the folder (`resoph-note.ts`). This reads each `.txt` in the folder the
 * way b-notes does and looks for exactly that text among the database's notes.
 *
 * Prints counts and positions only, never a word of his: his texts are
 * private, and this is meant to be run on his own machines as well.
 *
 *   node scripts/check-resoph-reading.mts [notes folder] [Resoph settings folder]
 *
 * With no arguments, the folder Resoph's settings name, and the settings
 * folder under his user folder. Read-only: it writes nothing anywhere.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { resophFolderIn } from '../src/hosts/electron/resoph-config.ts';
import { composeResophText, titleOfResophName } from '../src/notes/resoph-note.ts';

const settings = process.argv[3] ?? path.join(homedir(), '.ResophNotes');
const folder =
  process.argv[2] ?? resophFolderIn(readFileSync(path.join(settings, 'resophnotesconfig.xml'), 'utf8')) ?? '';
if (folder.length === 0) throw new Error('No notes folder given, and none in Resoph settings');

const database = readFileSync(path.join(settings, 'resophnotesdata.xml'), 'utf8');
const inResoph = new Map<string, number>();
for (const [, object] of database.matchAll(/<object>([\s\S]*?)<\/object>/g)) {
  if (/<delete>true<\/delete>/.test(object ?? '')) continue;
  const encoded = /<content>([^<]*)<\/content>/.exec(object ?? '')?.[1] ?? '';
  const text = Buffer.from(encoded, 'base64').toString('utf8').replaceAll('\r\n', '\n');
  inResoph.set(text, (inResoph.get(text) ?? 0) + 1);
}

const counts = { files: 0, same: 0, titleShownTwiceByResoph: 0, notFound: 0 };
const missed: string[] = [];

for (const name of readdirSync(folder).filter((each) => each.toLowerCase().endsWith('.txt')).sort()) {
  counts.files += 1;
  const stem = name.slice(0, -'.txt'.length);
  const body = readFileSync(path.join(folder, name), 'utf8').replaceAll('\r\n', '\n');
  const title = titleOfResophName(stem);
  const asBNotes = composeResophText(title, body);

  if (inResoph.has(asBNotes)) {
    counts.same += 1;
    continue;
  }
  // b-notes shows a title once where the file carries it too; Resoph shows it
  // twice. A difference on purpose, counted apart.
  const asResophDoubles = `${title}\n\n${body}`;
  if (inResoph.has(asResophDoubles)) {
    counts.titleShownTwiceByResoph += 1;
    continue;
  }

  counts.notFound += 1;
  // Where the nearest Resoph note first differs, by position and character
  // code only — enough to see a space, a tab or a line ending, and no words.
  let best = { at: -1, ours: '', theirs: '', lengths: '' };
  for (const text of inResoph.keys()) {
    if (text.slice(0, 20).trim() !== asBNotes.slice(0, 20).trim() && text.length !== asBNotes.length) continue;
    let at = 0;
    while (at < text.length && text[at] === asBNotes[at]) at += 1;
    if (at > best.at) {
      const code = (character: string | undefined): string =>
        character === undefined ? 'end' : `U+${character.codePointAt(0)?.toString(16).padStart(4, '0')}`;
      best = { at, ours: code(asBNotes[at]), theirs: code(text[at]), lengths: `${asBNotes.length} vs ${text.length}` };
    }
  }
  missed.push(
    best.at < 0
      ? `  no Resoph note starts alike (b-notes text ${asBNotes.length} chars, name ${stem.length} chars)`
      : `  differs at ${best.at} (title is ${title.length} chars): b-notes ${best.ours}, Resoph ${best.theirs}; ${best.lengths}`,
  );
}

console.log(`Resoph folder: ${counts.files} files; Resoph's database: ${[...inResoph.values()].reduce((a, b) => a + b, 0)} notes`);
console.log(`  read exactly as Resoph holds them:       ${counts.same}`);
console.log(`  title once in b-notes, twice in Resoph:  ${counts.titleShownTwiceByResoph}`);
console.log(`  not matched:                             ${counts.notFound}`);
for (const line of missed.slice(0, 40)) console.log(line);
