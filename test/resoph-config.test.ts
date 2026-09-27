import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { RESOPH_CONFIG, findResophFolder, resophFolderIn } from '../src/hosts/electron/resoph-config.ts';

const encoded = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

/** The settings file as Resoph writes it, trimmed to what matters here. */
const config = (userdata9: string): string =>
  [
    '<?xml version="1.0" standalone="yes"?>',
    '<config>',
    `\t<userdata3>${encoded('Tahoma')}</userdata3>`,
    `\t<userdata9>${userdata9}</userdata9>`,
    '\t<systray>true</systray>',
    '\t<fileincludetitle>false</fileincludetitle>',
    '</config>',
  ].join('\r\n');

describe('the folder named in Resoph settings', () => {
  it('reads the notes folder out of userdata9', () => {
    // The value in Danilo's own copy, decoded.
    assert.equal(
      resophFolderIn(config('RDovQi1ub3Rlcy1kaWFnbm9zdGljL0QtUmVzcG9waC10cnlvdXQ=')),
      'D:/B-notes-diagnostic/D-Respoph-tryout',
    );
  });

  it('keeps paths in the forward slashes the app uses, with no trailing one', () => {
    assert.equal(
      resophFolderIn(config(encoded('C:\\Users\\Brano\\Dropbox\\ResophNotes_Brano\\'))),
      'C:/Users/Brano/Dropbox/ResophNotes_Brano',
    );
  });

  it('keeps his letters, which Resoph writes as UTF-8', () => {
    assert.equal(resophFolderIn(config(encoded('C:/Users/Brano/Dropbox/Beleške'))), 'C:/Users/Brano/Dropbox/Beleške');
  });

  it('has nothing to say when the tag is missing or empty', () => {
    assert.equal(resophFolderIn('<config><systray>true</systray></config>'), null);
    assert.equal(resophFolderIn(config('')), null);
  });

  it('refuses anything that is not a folder', () => {
    assert.equal(resophFolderIn(config(encoded('Regular'))), null);
    assert.equal(resophFolderIn(config('%%% not base64 %%%')), null);
  });
});

describe('finding Resoph on this machine', () => {
  it('reads the settings file under his user folder', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'b-notes-home-'));
    await mkdir(path.join(home, '.ResophNotes'));
    await writeFile(path.join(home, RESOPH_CONFIG), config(encoded('D:/Tekstovi')), 'utf8');

    assert.equal(findResophFolder(home), 'D:/Tekstovi');
  });

  it('finds nothing on a machine without Resoph', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'b-notes-home-'));

    assert.equal(findResophFolder(home), null);
  });
});
