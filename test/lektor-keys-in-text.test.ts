import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keysInText } from '../src/ui/lektor/lektor-keys-in-text.ts';

// Made up, of the right shapes: none of these is anyone's key.
const GOOGLE_NEWER = `AQ.${'Ab3_x-Yz9Q'.repeat(5)}`;
const GOOGLE_OLDER = `AIza${'Sy0_bC-dE9'.repeat(3)}12345`;
const OPENROUTER = `sk-or-v1-${'0123456789abcdef'.repeat(4)}`;

describe('keysInText', () => {
  it('finds both keys separated by a space, in either order', () => {
    assert.deepEqual(keysInText(`${GOOGLE_NEWER} ${OPENROUTER}`), { free: GOOGLE_NEWER, paid: OPENROUTER });
    assert.deepEqual(keysInText(`${OPENROUTER} ${GOOGLE_NEWER}`), { free: GOOGLE_NEWER, paid: OPENROUTER });
  });

  it('finds both keys on lines of their own, with Windows line ends and tabs', () => {
    assert.deepEqual(keysInText(`\t${OPENROUTER}\r\n\r\n${GOOGLE_NEWER}\r\n`), { free: GOOGLE_NEWER, paid: OPENROUTER });
  });

  it('separates two keys with nothing between them, in either order', () => {
    assert.deepEqual(keysInText(`${GOOGLE_NEWER}${OPENROUTER}`), { free: GOOGLE_NEWER, paid: OPENROUTER });
    assert.deepEqual(keysInText(`${OPENROUTER}${GOOGLE_NEWER}`), { free: GOOGLE_NEWER, paid: OPENROUTER });
    assert.deepEqual(keysInText(`${GOOGLE_OLDER}${OPENROUTER}`), { free: GOOGLE_OLDER, paid: OPENROUTER });
  });

  it('finds them inside a message, past labels, quotes and punctuation', () => {
    const message = `Zdravo,\n\nevo ključeva:\nGoogle: "${GOOGLE_NEWER}",\nOpenRouter – «${OPENROUTER}».\n\nPozdrav`;

    assert.deepEqual(keysInText(message), { free: GOOGLE_NEWER, paid: OPENROUTER });
  });

  it('finds them in the JSON the app keeps them in', () => {
    const kept = JSON.stringify({ googleKey: GOOGLE_NEWER, openRouterKey: OPENROUTER }, null, 2);

    assert.deepEqual(keysInText(kept), { free: GOOGLE_NEWER, paid: OPENROUTER });
  });

  it('reads through the invisible characters mail programs put inside text', () => {
    const broken = `${GOOGLE_NEWER.slice(0, 20)}​${GOOGLE_NEWER.slice(20)} ${OPENROUTER.slice(0, 30)}﻿${OPENROUTER.slice(30)}`;

    assert.deepEqual(keysInText(broken), { free: GOOGLE_NEWER, paid: OPENROUTER });
  });

  it('finds the older kind of Google key', () => {
    assert.deepEqual(keysInText(`ključ: ${GOOGLE_OLDER}.`), { free: GOOGLE_OLDER });
  });

  it('finds one key alone', () => {
    assert.deepEqual(keysInText(OPENROUTER), { paid: OPENROUTER });
    assert.deepEqual(keysInText(` ${GOOGLE_NEWER} `), { free: GOOGLE_NEWER });
  });

  it('finds nothing in ordinary writing', () => {
    assert.deepEqual(keysInText('Mali narod izolovan istorijom i položajem. AQ. je skraćenica. sk-or-v1- nije ključ.'), {});
    assert.deepEqual(keysInText(''), {});
  });

  it('takes the first of each when there are several', () => {
    const otherOpenRouter = `sk-or-v1-${'f'.repeat(64)}`;

    assert.deepEqual(keysInText(`${OPENROUTER} ${otherOpenRouter}`), { paid: OPENROUTER });
  });
});
