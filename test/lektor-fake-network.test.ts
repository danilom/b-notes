import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFakeNetwork, GOOGLE_BUSY, GOOGLE_WRONG_KEY, OPENROUTER_WRONG_KEY } from '../src/platform/lektor-fake-network.ts';
import { lektorLogDetail } from '../src/platform/lektor-remote.ts';
import { recorded } from './lektor-api-fixtures.ts';

/*
  The fake network the tests run on must answer as Google and OpenRouter do, or every test built
  on it proves only that the app agrees with the fake. Its refusals are copies of the recorded
  ones; these hold the copies to the recordings.
*/

describe('the fake network', () => {
  for (const [copy, name] of [
    [GOOGLE_BUSY, 'google-busy-at-once-gemini-3.8-flash'],
    [GOOGLE_WRONG_KEY, 'google-wrong-key-interactions'],
    [OPENROUTER_WRONG_KEY, 'openrouter-wrong-key-completion'],
  ] as const) {
    it(`refuses with the body recorded in ${name}`, () => {
      assert.deepEqual(copy, JSON.parse(recorded(name).body));
    });
  }

  it('sends nothing on an empty key, as the real network does', async () => {
    const network = createFakeNetwork({});
    const answer = await network.ask({ provider: 'openrouter', action: 'send', key: '', model: 'x', system: '', input: '' }, new AbortController().signal, () => {});
    assert.equal(answer.status, 401);
  });
});

describe('what is logged about a request', () => {
  it('names the model that answered and what it cost, and never the key, the instruction or the words', () => {
    const request = { provider: 'openrouter', action: 'send', key: 'sk-or-v1-secret', model: 'anthropic/claude-opus-5.5', system: 'SYSTEM-WORDS', input: 'HIS-TEXT' } as const;
    const response = { status: 200, reply: { text: 'REPLY-WORDS', finish: 'stop', model: 'anthropic/claude-opus-5.5', cost: 0.0158, usage: { prompt_tokens: 546 }, error: null } };
    const detail = lektorLogDetail(request, response, 11_178);
    assert.equal(detail['answeredBy'], 'anthropic/claude-opus-5.5');
    assert.equal(detail['cost'], 0.0158);
    const logged = JSON.stringify(detail);
    for (const secret of ['sk-or-v1-secret', 'SYSTEM-WORDS', 'HIS-TEXT', 'REPLY-WORDS']) assert.ok(!logged.includes(secret), secret);
  });

  it('names the free model that answered, as Google says it', () => {
    const request = { provider: 'gemini', action: 'send', key: 'AIza-secret', model: 'gemini-3.8-flash', system: '', input: '' } as const;
    const detail = lektorLogDetail(request, { status: 200, reply: { text: 'x', status: 'completed', model: 'gemini-3.6-flash', usage: null, error: null } }, 5);
    assert.equal(detail['answeredBy'], 'gemini-3.6-flash');
    assert.equal(detail['cost'], undefined);
  });
});
