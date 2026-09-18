import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type LogFileInfo,
  type LogRetention,
  filesToPrune,
  formatLine,
  logFileName,
  parseLogFileDay,
} from '../src/main/log.ts';

const RETENTION: LogRetention = { maxAgeDays: 30, maxTotalBytes: 1000 };

function file(day: string, sizeBytes: number): LogFileInfo {
  return { name: `brano-notes-${day}.log`, day, sizeBytes };
}

describe('logFileName', () => {
  it('names a file after the local day', () => {
    assert.equal(logFileName(new Date(2026, 8, 18, 23, 30)), 'brano-notes-2026-09-18.log');
  });
});

describe('parseLogFileDay', () => {
  it('reads the day back out of a log file name', () => {
    assert.equal(parseLogFileDay('brano-notes-2026-09-18.log'), '2026-09-18');
  });

  it('ignores files that are not ours', () => {
    assert.equal(parseLogFileDay('notes.txt'), null);
    assert.equal(parseLogFileDay('brano-notes-2026-09.log'), null);
  });
});

describe('formatLine', () => {
  it('puts the time, level and source in front of the message', () => {
    const line = formatLine(new Date(2026, 8, 18, 15, 4, 5, 123), 'info', 'main', 'started');

    assert.equal(line, '2026-09-18 15:04:05.123 INFO  [main] started');
  });

  it('appends an error with its stack', () => {
    const error = new Error('no disk');
    error.stack = 'Error: no disk\n    at write';

    const line = formatLine(new Date(2026, 8, 18, 15, 4, 5, 123), 'error', 'main', 'failed', error);

    assert.ok(line.includes('Error: no disk'));
    assert.ok(line.includes('at write'));
  });

  it('keeps an entry on a single line so entries stay one per line', () => {
    const line = formatLine(new Date(2026, 8, 18), 'error', 'main', 'broke', 'first\nsecond');

    assert.equal(line.includes('\n'), false);
  });

  it('records a payload it cannot serialise rather than dropping the entry', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const line = formatLine(new Date(2026, 8, 18), 'warn', 'main', 'odd', circular);

    assert.ok(line.includes('unserialisable'));
  });
});

describe('filesToPrune', () => {
  it('keeps everything when inside both limits', () => {
    const files = [file('2026-09-17', 10), file('2026-09-18', 10)];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), []);
  });

  it('deletes files older than the age limit', () => {
    const files = [file('2026-08-18', 10), file('2026-09-18', 10)];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), ['brano-notes-2026-08-18.log']);
  });

  it('keeps a file exactly on the age limit', () => {
    const files = [file('2026-08-19', 10)];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), []);
  });

  it('stops deleting as soon as the total fits the size limit', () => {
    const files = [
      file('2026-09-15', 400),
      file('2026-09-16', 400),
      file('2026-09-17', 400),
      file('2026-09-18', 100),
    ];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), ['brano-notes-2026-09-15.log']);
  });

  it('deletes oldest first until the total fits the size limit', () => {
    const files = [
      file('2026-09-15', 500),
      file('2026-09-16', 500),
      file('2026-09-17', 500),
      file('2026-09-18', 100),
    ];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), [
      'brano-notes-2026-09-15.log',
      'brano-notes-2026-09-16.log',
    ]);
  });

  it('never deletes the active day, even when it alone exceeds the size limit', () => {
    const files = [file('2026-09-18', 5000)];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), []);
  });

  it('keeps the active day while clearing everything else to get under the limit', () => {
    const files = [file('2026-09-17', 800), file('2026-09-18', 900)];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), ['brano-notes-2026-09-17.log']);
  });

  it('applies both limits together', () => {
    const files = [
      file('2026-01-01', 10),
      file('2026-09-15', 900),
      file('2026-09-18', 200),
    ];

    assert.deepEqual(filesToPrune(files, RETENTION, '2026-09-18'), [
      'brano-notes-2026-01-01.log',
      'brano-notes-2026-09-15.log',
    ]);
  });

  it('respects configured thresholds rather than the defaults', () => {
    const files = [file('2026-09-16', 10), file('2026-09-18', 10)];
    const strict: LogRetention = { maxAgeDays: 1, maxTotalBytes: 1000 };

    assert.deepEqual(filesToPrune(files, strict, '2026-09-18'), ['brano-notes-2026-09-16.log']);
  });
});
