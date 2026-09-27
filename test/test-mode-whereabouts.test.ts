import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { createNoteLibrary } from '../src/notes/note-library.ts';
import { RESOPH_LINKS_FOLDER, VERSIONS_FOLDER } from '../src/notes/note-naming.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { createResophFolder } from '../src/notes/resoph-folder.ts';
import { resophIdOf } from '../src/notes/resoph-note.ts';
import { readWhereabouts } from '../src/test-mode/test-mode-whereabouts.ts';
import { silentLog } from './silent-log.ts';

const NAMING = { machine: 'Test', now: () => new Date(2026, 8, 27, 10, 0, 0) };
const slashed = (dir: string): string => dir.replaceAll('\\', '/');
const RANKED = '                %2AGRAD Kilim';

/**
 * A Resoph folder holding what it is handed, b-notes' library over it, and a
 * way to read both from outside, as test mode does.
 */
async function folders(resophFiles: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-whereabouts-'));
  const notes = path.join(root, 'b-notes');
  const resoph = path.join(root, 'ResophNotes');
  await mkdir(notes);
  await mkdir(resoph);
  for (const [name, text] of Object.entries(resophFiles)) await writeFile(path.join(resoph, `${name}.txt`), text);

  const files = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
  const log = silentLog();
  const own = createNoteStore(files, slashed(notes), log, () => undefined, NAMING);
  const store = createNoteLibrary(own, createResophFolder(files, slashed(resoph), log), files, slashed(notes), log);
  const whereabouts = () => readWhereabouts(files, slashed(notes), slashed(resoph));
  return { notes, resoph, store, whereabouts };
}

describe('where each text lives, for test mode', () => {
  it('says a text still only in Resoph is there, at its own file', async () => {
    const { whereabouts } = await folders({ [RANKED]: 'Tekst.' });

    const found = (await whereabouts()).get(resophIdOf(RANKED));

    assert.equal(found?.origin, 'resoph');
    assert.ok(found?.path.endsWith(`ResophNotes/${RANKED}.txt`), found?.path);
  });

  it('says a text he has typed into is a copy, and where its Resoph original is', async () => {
    const { store, whereabouts } = await folders({ Pismo: 'Prvo.' });
    const copy = await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.');

    const all = await whereabouts();
    const found = all.get(copy ?? '');

    assert.equal(found?.origin, 'copy');
    assert.equal(found?.resophStem, 'Pismo');
    assert.ok(found?.resophPath?.endsWith('ResophNotes/Pismo.txt'), found?.resophPath ?? 'no Resoph path');
    assert.equal(found?.unlinked, false);
    assert.equal(found?.resophGone, false);
    assert.equal(all.has(resophIdOf('Pismo')), false);
  });

  it('finds the Resoph original of a copy whose title he ranked with spaces', async () => {
    // The spaces are the name: a link read with its edges trimmed names no file.
    const { store, whereabouts } = await folders({ [RANKED]: 'Tekst.' });
    const copy = (await store.save(resophIdOf(RANKED), `${RANKED}\n\nTekst. Dopisano.`)) ?? '';

    const found = (await whereabouts()).get(copy);
    assert.equal(found?.resophStem, RANKED);
    assert.equal(found?.resophGone, false);
  });

  it('says a text begun in b-notes is its own', async () => {
    const { store, whereabouts } = await folders();
    const id = await store.save(null, 'Novo\n\nTekst.');

    assert.equal((await whereabouts()).get(id ?? '')?.origin, 'own');
  });

  it('notices a copy whose Resoph file has gone: deleted there, or retitled', async () => {
    const { store, resoph, whereabouts } = await folders({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';
    await rm(path.join(resoph, 'Pismo.txt'));

    const gone = (await whereabouts()).get(copy);
    assert.equal(gone?.origin, 'copy');
    assert.equal(gone?.resophGone, true);
    assert.equal(gone?.resophPath, null);
  });

  it('knows a copy by its name when its link is missing, while the Resoph file is still there', async () => {
    const { store, notes, whereabouts } = await folders({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';
    await rm(path.join(notes, RESOPH_LINKS_FOLDER, `${copy}.txt`));

    const found = (await whereabouts()).get(copy);
    assert.equal(found?.origin, 'copy');
    assert.equal(found?.unlinked, true);
  });

  it('does not list a Resoph text as its own once its copy is put away, even with its link lost', async () => {
    const { store, notes, whereabouts } = await folders({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';
    await store.moveToDeleted(copy);
    await rm(path.join(notes, RESOPH_LINKS_FOLDER, `${copy}.txt`));

    const all = await whereabouts();
    assert.equal(all.has(resophIdOf('Pismo')), false);
    assert.equal(all.has(copy), false);
  });

  it('marks texts changed in both places, changed behind its back, and Dropbox conflicted copies', async () => {
    const conflicted = "Pismo (Brano's conflicted copy 2026-09-26)";
    const { store, notes, whereabouts } = await folders({ [conflicted]: 'Drugo.' });
    const id = (await store.save(null, 'Novo\n\nTekst.')) ?? '';
    await mkdir(path.join(notes, 'Menjano na dva mesta'), { recursive: true });
    await writeFile(path.join(notes, 'Menjano na dva mesta', `${id}.txt`), 'Pismo');
    await mkdir(path.join(notes, VERSIONS_FOLDER, id), { recursive: true });
    await writeFile(path.join(notes, VERSIONS_FOLDER, id, '2026-09-27 10-00-00 izmenjeno drugde.txt'), 'Staro.');

    const all = await whereabouts();
    assert.equal(all.get(id)?.changedInBoth, true);
    assert.equal(all.get(id)?.changedElsewhere, true);
    assert.equal(all.get(id)?.conflictedCopy, false);
    assert.equal(all.get(resophIdOf(conflicted))?.conflictedCopy, true);
  });
});
