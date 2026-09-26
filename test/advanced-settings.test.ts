import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NOTHING_SET, advancedFrom, writeAdvanced } from '../src/ui/settings/advanced-settings.ts';

/**
 * The knobs that are not his.
 *
 * Meant to be changed by hand in a file, which makes a bad value the expected
 * input rather than the surprising one: a missing comma, a word where a number
 * should be, a minus sign. None of it may leave the app in a state he would
 * have to describe over the telephone.
 */
describe('reading the advanced settings', () => {
  it('takes a number it can use', () => {
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 250 }), { ctrlCardAfterMs: 250 });
  });

  it('falls back when the file says something that is not a number', () => {
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 'brzo' }), NOTHING_SET);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: null }), NOTHING_SET);
  });

  it('refuses a wait that is not a wait', () => {
    // Negative, or so long the card would never come: either is a mistake, and
    // living with the default beats behaving in a way nobody can account for.
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: -1 }), NOTHING_SET);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 60_000 }), NOTHING_SET);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: Number.NaN }), NOTHING_SET);
  });

  it('survives a file that is not what it should be at all', () => {
    assert.deepEqual(advancedFrom(null), NOTHING_SET);
    assert.deepEqual(advancedFrom('a string'), NOTHING_SET);
    assert.deepEqual(advancedFrom({}), NOTHING_SET);
  });

  it('lets it be switched off outright', () => {
    // Zero is a real answer: show it the moment he touches the key. Not the
    // same as a mistake, so it is not corrected into one.
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 0 }), { ctrlCardAfterMs: 0 });
  });

  it('tells nothing set apart from zero', () => {
    // The two look alike and mean opposite things: zero is "at once", and
    // nothing is "you decide". Emptying the box has to say the second, or a
    // number set once outlives every later judgement about the right one.
    assert.equal(advancedFrom({}).ctrlCardAfterMs, null);
    assert.equal(advancedFrom({ ctrlCardAfterMs: 0 }).ctrlCardAfterMs, 0);
  });
});

describe('writing the advanced settings', () => {
  /** A pretend disk, so the rules can be checked without one. */
  function held(starting: string | null) {
    const files: Record<string, string> = {};
    if (starting !== null) files['Podaci/advanced.json'] = starting;
    return {
      files: {
        read: async (at: string) => {
          const held = files[at];
          if (held === undefined) throw new Error(`no such file: ${at}`);
          return held;
        },
        write: async (at: string, text: string) => {
          files[at] = text;
        },
      } as unknown as Parameters<typeof writeAdvanced>[0],
      now: () => JSON.parse(files['Podaci/advanced.json'] ?? '{}') as Record<string, unknown>,
    };
  }

  it('writes the number it was given', async () => {
    const disk = held(null);

    await writeAdvanced(disk.files, 'Podaci', { ctrlCardAfterMs: 250 });

    assert.deepEqual(disk.now(), { ctrlCardAfterMs: 250 });
  });

  it('takes the key out when nothing is set, rather than writing a null', async () => {
    // So the file reads as one nobody has touched, and the app's own number
    // applies — including a later, better one.
    const disk = held('{ "ctrlCardAfterMs": 250 }');

    await writeAdvanced(disk.files, 'Podaci', { ctrlCardAfterMs: null });

    assert.deepEqual(disk.now(), {});
  });

  it('leaves alone what it does not recognise', async () => {
    // A machine left off for months comes back running an older build, and
    // that build must not strip a setting a newer one wrote.
    const disk = held('{ "ctrlCardAfterMs": 250, "somethingLater": true }');

    await writeAdvanced(disk.files, 'Podaci', { ctrlCardAfterMs: null });

    assert.deepEqual(disk.now(), { somethingLater: true });
  });
});
