import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { createNoteLibrary } from '../src/notes/note-library.ts';
import { VERSIONS_FOLDER, copyNameFor } from '../src/notes/note-naming.ts';
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
  const resophFolder = createResophFolder(files, slashed(resoph), log);
  const store = createNoteLibrary(own, resophFolder, files, slashed(notes), log, () => undefined, NAMING);
  const whereabouts = () => readWhereabouts(files, slashed(notes), slashed(resoph));
  return { notes, resoph, store, whereabouts };
}

describe('where each text lives, for test mode', () => {
  it('says a text still in Resoph is there, at its own file', async () => {
    const { whereabouts } = await folders({ [RANKED]: 'Tekst.' });

    const found = (await whereabouts()).get(resophIdOf(RANKED));

    assert.equal(found?.origin, 'resoph');
    assert.ok(found?.path.endsWith(`ResophNotes/${RANKED}.txt`), found?.path);
  });

  it('says a text he has typed into was taken over, and where its Resoph file is', async () => {
    const { store, whereabouts } = await folders({ [RANKED]: 'Tekst.' });
    const copy = await store.save(resophIdOf(RANKED), `${RANKED}\n\nTekst. Dopisano.`);

    const found = (await whereabouts()).get(copy ?? '');

    assert.equal(found?.origin, 'copy');
    assert.ok(found?.resophPath?.endsWith(`ResophNotes/${RANKED}.txt`), found?.resophPath ?? 'no Resoph path');
  });

  it('knows a second copy of the same Resoph file by its numbered name', async () => {
    const { store, resoph, whereabouts } = await folders({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.');
    await writeFile(path.join(resoph, 'Pismo.txt'), 'Opet napisano u Resophu, cela recenica.');
    await store.list();
    const second = await store.save(resophIdOf('Pismo'), 'Pismo\n\nOpet napisano u Resophu. I jos.');

    assert.equal(second, `${copyNameFor('Pismo')} 2`);
    assert.equal((await whereabouts()).get(second ?? '')?.origin, 'copy');
  });

  it('says a text begun in b-notes is its own', async () => {
    const { store, whereabouts } = await folders();
    const id = await store.save(null, 'Novo\n\nTekst.');

    const found = (await whereabouts()).get(id ?? '');
    assert.equal(found?.origin, 'own');
    assert.equal(found?.resophPath, null);
  });

  it('marks texts changed behind its back, and Dropbox conflicted copies', async () => {
    const conflicted = "Pismo (Brano's conflicted copy 2026-09-26)";
    const { store, notes, whereabouts } = await folders({ [conflicted]: 'Drugo.' });
    const id = (await store.save(null, 'Novo\n\nTekst.')) ?? '';
    await mkdir(path.join(notes, VERSIONS_FOLDER, id), { recursive: true });
    await writeFile(path.join(notes, VERSIONS_FOLDER, id, '2026-09-27 10-00-00 izmenjeno drugde.txt'), 'Staro.');

    const all = await whereabouts();
    assert.equal(all.get(id)?.changedElsewhere, true);
    assert.equal(all.get(id)?.conflictedCopy, false);
    assert.equal(all.get(resophIdOf(conflicted))?.conflictedCopy, true);
  });
});
