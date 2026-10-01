import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fileNameShown } from '../src/ui/deleted-and-archived/archive-dialog.ts';

describe('the file name shown on hover over an archived text', () => {
  it('puts the archive folder over the exact file name', () => {
    assert.equal(fileNameShown({ archive: 'Dell', fileName: 'Pismo.md' }), 'Dell\\\nPismo.md');
  });

  it('shows every space, so ones at either end and in a run can be counted', () => {
    assert.equal(
      fileNameShown({ archive: 'Stari Dell', fileName: '  Pismo  Mladenu .md' }),
      'Stari·Dell\\\n··Pismo··Mladenu·.md',
    );
  });
});
