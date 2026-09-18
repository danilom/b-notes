import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type LogFileInfo,
  type LogRetention,
  filesToPrune,
  formatLine,
  logFileName,
  parseLogFileDay,
} from '../src/electron/log.ts';

const RETENTION: LogRetention = { maxAgeDays: 30, maxTotalBytes: 1000 };
const TODAY = '2026-09-18';

function file(day: string, time: string, sizeBytes: number): LogFileInfo {
  return { name: `b-notes-${day}-${time}-1234-dev.log`, day, sizeBytes };
}

/** The file the current run is writing to, which pruning must never touch. */
const ACTIVE = file(TODAY, '170000', 10);

describe('logFileName', () => {
  it('names a file after the run start time, pid and kind of run', () => {
    assert.equal(
      logFileName(new Date(2026, 8, 18, 16, 25, 37), 31240, 'installed'),
      'b-notes-2026-09-18-162537-31240-installed.log',
    );
  });

  it('marks a development run', () => {
    assert.equal(
      logFileName(new Date(2026, 8, 18, 16, 25, 37), 31240, 'dev'),
      'b-notes-2026-09-18-162537-31240-dev.log',
    );
  });

  it('gives two runs in the same second different names', () => {
    const at = new Date(2026, 8, 18, 16, 25, 37);

    assert.notEqual(logFileName(at, 100, 'dev'), logFileName(at, 200, 'dev'));
  });

  it('sorts chronologically by name', () => {
    const earlier = logFileName(new Date(2026, 8, 18, 9, 5, 1), 1, 'dev');
    const later = logFileName(new Date(2026, 8, 18, 16, 25, 37), 1, 'dev');

    assert.ok(earlier < later);
  });
});

describe('parseLogFileDay', () => {
  it('reads the day back out of a log file name', () => {
    assert.equal(
      parseLogFileDay('b-notes-2026-09-18-162537-31240-installed.log'),
      '2026-09-18',
    );
  });

  it('ignores files that are not ours', () => {
    assert.equal(parseLogFileDay('notes.txt'), null);
    assert.equal(parseLogFileDay('b-notes-2026-09-18.log'), null);
    assert.equal(parseLogFileDay('b-notes-2026-09-18-162537-31240.log'), null);
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
    const files = [file('2026-09-17', '120000', 10), ACTIVE];

    assert.deepEqual(filesToPrune(files, RETENTION, TODAY, ACTIVE.name), []);
  });

  it('deletes files older than the age limit', () => {
    const old = file('2026-08-18', '120000', 10);

    assert.deepEqual(filesToPrune([old, ACTIVE], RETENTION, TODAY, ACTIVE.name), [old.name]);
  });

  it('keeps a file exactly on the age limit', () => {
    const edge = file('2026-08-19', '120000', 10);

    assert.deepEqual(filesToPrune([edge, ACTIVE], RETENTION, TODAY, ACTIVE.name), []);
  });

  it('stops deleting as soon as the total fits the size limit', () => {
    const files = [
      file('2026-09-15', '120000', 400),
      file('2026-09-16', '120000', 400),
      file('2026-09-17', '120000', 400),
      ACTIVE,
    ];

    assert.deepEqual(filesToPrune(files, RETENTION, TODAY, ACTIVE.name), [
      'b-notes-2026-09-15-120000-1234-dev.log',
    ]);
  });

  it('deletes oldest first until the total fits the size limit', () => {
    const files = [
      file('2026-09-15', '120000', 500),
      file('2026-09-16', '120000', 500),
      file('2026-09-17', '120000', 500),
      ACTIVE,
    ];

    assert.deepEqual(filesToPrune(files, RETENTION, TODAY, ACTIVE.name), [
      'b-notes-2026-09-15-120000-1234-dev.log',
      'b-notes-2026-09-16-120000-1234-dev.log',
    ]);
  });

  it('never deletes the active file, even when it alone exceeds the size limit', () => {
    const huge = file(TODAY, '170000', 5000);

    assert.deepEqual(filesToPrune([huge], RETENTION, TODAY, huge.name), []);
  });

  it('deletes an earlier run from today once the total is too large', () => {
    const earlier = file(TODAY, '090000', 900);
    const active = file(TODAY, '170000', 900);

    assert.deepEqual(filesToPrune([earlier, active], RETENTION, TODAY, active.name), [earlier.name]);
  });

  it('orders several runs from one day oldest first', () => {
    const first = file(TODAY, '090000', 600);
    const second = file(TODAY, '100000', 600);
    const active = file(TODAY, '170000', 600);

    assert.deepEqual(filesToPrune([active, second, first], RETENTION, TODAY, active.name), [
      first.name,
      second.name,
    ]);
  });

  it('applies both limits together', () => {
    const ancient = file('2026-01-01', '120000', 10);
    const large = file('2026-09-15', '120000', 900);
    const active = file(TODAY, '170000', 200);

    assert.deepEqual(filesToPrune([ancient, large, active], RETENTION, TODAY, active.name), [
      ancient.name,
      large.name,
    ]);
  });

  it('respects configured thresholds rather than the defaults', () => {
    const old = file('2026-09-16', '120000', 10);
    const strict: LogRetention = { maxAgeDays: 1, maxTotalBytes: 1000 };

    assert.deepEqual(filesToPrune([old, ACTIVE], strict, TODAY, ACTIVE.name), [old.name]);
  });
});
