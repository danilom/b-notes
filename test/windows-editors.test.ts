import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { editorsAmong, imageNamesIn, isWholeXml, stampFor } from '../src/hosts/electron/windows-editors.ts';
import { namesOf } from '../src/ui/other-editors-gate.ts';

/** What `tasklist /FO CSV /NH` prints, a few lines of it. */
const TASKLIST = [
  '"System Idle Process","0","Services","0","8 K"',
  '"ResophNotes.exe","4312","Console","1","41,220 K"',
  '"NOTEPAD.EXE","5120","Console","1","12,004 K"',
  '"Obsidian.exe","6001","Console","1","80,100 K"',
  '"Obsidian.exe","6002","Console","1","60,100 K"',
  '',
].join('\r\n');

describe('seeing which programs are running', () => {
  it('reads the program names out of what tasklist prints', () => {
    assert.deepEqual(imageNamesIn(TASKLIST), [
      'System Idle Process',
      'ResophNotes.exe',
      'NOTEPAD.EXE',
      'Obsidian.exe',
      'Obsidian.exe',
    ]);
  });

  it('knows each editor by its program, whatever the case, once however many processes', () => {
    assert.deepEqual(editorsAmong(imageNamesIn(TASKLIST)), ['ResophNotes', 'Notepad', 'Obsidian']);
  });

  it('finds none when none is running', () => {
    assert.deepEqual(editorsAmong(['explorer.exe', 'b-notes.exe']), []);
  });
});

describe("telling whether one of Resoph's files is all there", () => {
  it('accepts a file that closes what it opened', () => {
    assert.equal(isWholeXml('<?xml version="1.0" standalone="yes"?>\r\n<config>\r\n\t<systray>true</systray>\r\n</config>\r\n'), true);
    assert.equal(isWholeXml('<database>\n<object><content>eA==</content></object>\n</database>'), true);
  });

  it('refuses one cut short in the middle of being written', () => {
    assert.equal(isWholeXml('<database>\n<object><content>eA==</content></object>\n<obj'), false);
    assert.equal(isWholeXml(''), false);
  });

  it('ignores a byte-order mark in front', () => {
    assert.equal(isWholeXml('﻿<config></config>'), true);
  });
});

describe('naming the copies of Resoph database', () => {
  it('names each by its moment, so they sort in time', () => {
    assert.equal(stampFor(new Date(2026, 8, 27, 4, 5, 6)), '2026-09-27 04-05-06');
  });
});

describe('what the message calls the open programs', () => {
  it('names one as its window does', () => {
    assert.equal(namesOf(['ResophNotes'], 'i'), 'Resoph');
  });

  it('joins two with the word for and', () => {
    assert.equal(namesOf(['ResophNotes', 'Notepad'], 'i'), 'Resoph i Notepad');
  });

  it('lists three with commas, the last with and', () => {
    assert.equal(namesOf(['ResophNotes', 'Notepad', 'Obsidian'], 'and'), 'Resoph, Notepad and Obsidian');
  });
});
