import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { freeResetTime } from '../src/ui/lektor/lektor-daily-reset.ts';

/* When the free Lektor works again: the next midnight Pacific, on his own clock wherever he is. */

describe('when the free day starts again', () => {
  const november = new Date('2026-11-11T17:30:00Z');
  const july = new Date('2026-07-01T17:30:00Z');

  for (const [zone, inNovember, inJuly] of [
    ['Europe/Belgrade', '09:00', '09:00'],
    ['Asia/Bangkok', '15:00', '14:00'],
    ['America/New_York', '03:00', '03:00'],
    ['America/Los_Angeles', '00:00', '00:00'],
  ] as const) {
    it(`is ${inNovember} in ${zone} in November and ${inJuly} in July, with no day word`, () => {
      assert.equal(freeResetTime(november, zone), inNovember);
      assert.equal(freeResetTime(july, zone), inJuly);
    });
  }
});
