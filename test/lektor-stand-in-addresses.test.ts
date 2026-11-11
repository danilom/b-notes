import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testLektorAddresses } from '../src/platform/lektor-remote.ts';

/*
  The stand-ins a test run of the app may name for Google and OpenRouter. A wrong answer here
  looks like no answer at all, the app working as ever, while his keys and text go wherever the
  environment said: so only this computer is ever taken.
*/

const quiet = { warn: () => {} };

describe('stand-in addresses for the Lektor services', () => {
  it('takes none when nothing is named, so the services are asked', () => {
    assert.deepEqual(testLektorAddresses(undefined, quiet), {});
    assert.deepEqual(testLektorAddresses('', quiet), {});
  });

  it('takes stand-ins on this computer', () => {
    const named = JSON.stringify({ gemini: 'http://127.0.0.1:4711/v1beta', openrouter: 'http://localhost:4711/api/v1' });
    assert.deepEqual(testLektorAddresses(named, quiet), { gemini: 'http://127.0.0.1:4711/v1beta', openrouter: 'http://localhost:4711/api/v1' });
  });

  it('refuses an address anywhere else, and says so', () => {
    const warned: string[] = [];
    const named = JSON.stringify({
      gemini: 'https://example.com/v1beta',
      openrouter: 'http://127.0.0.1.example.com:80/api',
    });
    assert.deepEqual(testLektorAddresses(named, { warn: (message) => warned.push(message) }), {});
    assert.equal(warned.length, 2);
  });

  it('refuses what is not JSON, or not addresses', () => {
    assert.deepEqual(testLektorAddresses('http://127.0.0.1:1', quiet), {});
    assert.deepEqual(testLektorAddresses('[]', quiet), {});
    assert.deepEqual(testLektorAddresses(JSON.stringify({ gemini: 4711 }), quiet), {});
  });
});
