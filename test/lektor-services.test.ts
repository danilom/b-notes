import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_BUSY, GOOGLE_WRONG_KEY, OPENROUTER_WRONG_KEY } from '../src/platform/lektor-fake-network.ts';
import { LEKTOR_STOPPED, LEKTOR_TIMED_OUT, LEKTOR_UNREACHED, type LektorRequest, type LektorResponse } from '../src/platform/lektor-remote.ts';
import { createGeminiAi } from '../src/ui/lektor/lektor-gemini-ai.ts';
import { createOpenRouterAi } from '../src/ui/lektor/lektor-openrouter-ai.ts';
import { type LektorService, LektorServiceError } from '../src/ui/lektor/lektor-service.ts';
import { recorded } from './lektor-api-fixtures.ts';

/*
  What each answer from Google and OpenRouter means to him (spec §10): the failure it is, never
  busy for a bad key, and the service's own words kept to show. Real recorded bodies where there
  are any; shaped as the docs give them where recording would spend a day's quota or the account.
*/

interface Seen {
  requests: LektorRequest[];
  warnings: string[];
  errors: string[];
}

function serviceAnswering(make: typeof createGeminiAi, response: LektorResponse): { service: LektorService; seen: Seen } {
  const seen: Seen = { requests: [], warnings: [], errors: [] };
  const service = make({
    ask: async (request) => {
      seen.requests.push(request);
      return response;
    },
    keyNow: () => 'the-key',
    warn: (message) => seen.warnings.push(message),
    error: (message) => seen.errors.push(message),
  });
  return { service, seen };
}

const asking = { model: 'm', system: 's', input: 'tekst' };
const signal = new AbortController().signal;

async function failureFrom(make: typeof createGeminiAi, response: LektorResponse): Promise<LektorServiceError> {
  const { service } = serviceAnswering(make, response);
  try {
    await service.ask(asking, signal);
  } catch (error) {
    assert.ok(error instanceof LektorServiceError, `threw ${String(error)}`);
    return error;
  }
  assert.fail('it answered');
}

const bodyOf = (name: string): unknown => JSON.parse(recorded(name).body);
const streamed = (error: { code: string; message: string }): unknown => ({ text: '', status: null, model: null, usage: null, error });

describe("Google's answers", () => {
  for (const [what, response, failure] of [
    ['503 high demand, as recorded', { status: 503, reply: bodyOf('google-busy-at-once-gemini-3.8-flash') }, 'busy'],
    ['429 quota_exceeded', { status: 429, reply: { error: { code: 'quota_exceeded', message: 'Quota exceeded' } } }, 'daily-limit'],
    ['429 rate_limit_exceeded, a per-minute limit', { status: 429, reply: { error: { code: 'rate_limit_exceeded', message: 'x' } } }, 'busy'],
    ['429 too_many_requests', { status: 429, reply: { error: { code: 'too_many_requests', message: 'x' } } }, 'busy'],
    ['a high-demand error event after queuing', { status: 503, reply: streamed({ code: 'service_unavailable', message: 'high demand' }) }, 'busy'],
    ['a quota error event mid-stream', { status: 429, reply: streamed({ code: 'quota_exceeded', message: 'x' }) }, 'daily-limit'],
    ['400 API_KEY_INVALID, as recorded', { status: 400, reply: bodyOf('google-wrong-key-interactions') }, 'bad-key'],
    ['403 PERMISSION_DENIED with no key, as recorded', { status: 403, reply: bodyOf('google-no-key-interactions') }, 'bad-key'],
    ['403 for a leaked key', { status: 403, reply: { error: { code: 403, message: 'Your API key was reported as leaked.', status: 'PERMISSION_DENIED' } } }, 'bad-key'],
    ['401 authentication', { status: 401, reply: { error: { code: 'authentication', message: 'x' } } }, 'bad-key'],
    ['a safety block', { status: 400, reply: { error: { code: 'safety', message: 'Blocked' } } }, 'declined'],
    ['400 for too many tokens', { status: 400, reply: { error: { code: 'invalid_request', message: 'The input token count exceeds the maximum' } } }, 'too-long'],
    ['no answer at all', { status: LEKTOR_UNREACHED, reply: { error: { message: 'TypeError' } } }, 'offline'],
    ['ten minutes without one', { status: LEKTOR_TIMED_OUT, reply: { error: { message: 'TimeoutError' } } }, 'busy'],
    ['a stream that stopped before completing', { status: 200, reply: { text: 'Pola', status: 'incomplete', model: 'm', usage: null, error: null } }, 'cut-off'],
    ['a completed stream with no words', { status: 200, reply: { text: ' ', status: 'completed', model: 'm', usage: null, error: null } }, 'cut-off'],
  ] as const) {
    it(`reads ${what} as ${failure}`, async () => {
      assert.equal((await failureFrom(createGeminiAi, response)).failure, failure);
    });
  }

  it("keeps Google's own words to show him, and none of ours when offline", async () => {
    assert.match((await failureFrom(createGeminiAi, { status: 503, reply: GOOGLE_BUSY })).serviceSaid, /high demand/);
    assert.equal((await failureFrom(createGeminiAi, { status: LEKTOR_UNREACHED, reply: { error: { message: 'TypeError' } } })).serviceSaid, '');
  });

  it('makes a note of a refusal it does not recognise, and calls it busy', async () => {
    const { service, seen } = serviceAnswering(createGeminiAi, { status: 418, reply: { error: { code: 'teapot', message: 'x' } } });
    await assert.rejects(service.ask(asking, signal), (error: unknown) => error instanceof LektorServiceError && error.failure === 'busy');
    assert.equal(seen.warnings.length, 1);
  });

  it('gives the words, and the model the reply names, for a completed stream', async () => {
    const { service, seen } = serviceAnswering(createGeminiAi, { status: 200, reply: { text: 'Utisak.', status: 'completed', model: 'gemini-3.6-flash', usage: null, error: null } });
    assert.deepEqual(await service.ask({ ...asking, model: 'gemini-3.8-flash' }, signal), { words: 'Utisak.', model: 'gemini-3.6-flash', cost: null });
    assert.deepEqual(
      seen.requests.map(({ provider, action, key, model }) => ({ provider, action, key, model })),
      [{ provider: 'gemini', action: 'send', key: 'the-key', model: 'gemini-3.8-flash' }],
    );
  });

  it('checks a key by asking for the model list, and refuses a wrong one as a bad key', async () => {
    const { service, seen } = serviceAnswering(createGeminiAi, { status: 400, reply: bodyOf('google-wrong-key-models') });
    await assert.rejects(service.keyCheck('pasted', signal), (error: unknown) => error instanceof LektorServiceError && error.failure === 'bad-key');
    assert.deepEqual(seen.requests.map(({ action, key }) => ({ action, key })), [{ action: 'check', key: 'pasted' }]);
  });
});

describe("OpenRouter's answers", () => {
  const ended = (finish: string, text = 'Reči.'): LektorResponse => ({ status: 200, reply: { text, finish, model: 'anthropic/claude-opus-5.5', cost: 0.02, usage: null, error: null } });

  for (const [what, response, failure] of [
    ['401 "User not found.", as recorded', { status: 401, reply: bodyOf('openrouter-wrong-key-completion') }, 'bad-key'],
    ['402, money gone', { status: 402, reply: { error: { code: 402, message: 'Insufficient credits' } } }, 'no-credit'],
    ['403, moderation', { status: 403, reply: { error: { code: 403, message: 'Input flagged' } } }, 'declined'],
    ['408, a timeout', { status: 408, reply: { error: { code: 408, message: 'x' } } }, 'busy'],
    ['429, a rate limit', { status: 429, reply: { error: { code: 429, message: 'x' } } }, 'busy'],
    ['502, the model down', { status: 502, reply: { error: { code: 502, message: 'x' } } }, 'busy'],
    ['503, no host free', { status: 503, reply: { error: { code: 503, message: 'x' } } }, 'busy'],
    ['400 for too long a context', { status: 400, reply: { error: { code: 400, message: "This endpoint's maximum context length is 1000 tokens" } } }, 'too-long'],
    ['an error chunk mid-stream', { status: 502, reply: { text: 'Po', finish: 'error', model: 'x', cost: null, usage: null, error: { code: 502, message: 'Provider disconnected' } } }, 'busy'],
    ['a reply cut off for length, as recorded', ended('length', ''), 'cut-off'],
    ['a reply stopped by the content filter', ended('content_filter'), 'declined'],
    ['a stream that ended without a finish', ended('', 'Pola'), 'cut-off'],
    ['no answer at all', { status: LEKTOR_UNREACHED, reply: { error: { message: 'TypeError' } } }, 'offline'],
  ] as const) {
    it(`reads ${what} as ${failure}`, async () => {
      assert.equal((await failureFrom(createOpenRouterAi, response)).failure, failure);
    });
  }

  it('reads "no host found" as busy, and logs it loudly as our own mistake', async () => {
    const { service, seen } = serviceAnswering(createOpenRouterAi, { status: 404, reply: bodyOf('openrouter-no-host') });
    await assert.rejects(service.ask(asking, signal), (error: unknown) => error instanceof LektorServiceError && error.failure === 'busy');
    assert.equal(seen.errors.length, 1);
  });

  it('gives the words, the model and what it cost, for a finished stream', async () => {
    const { service } = serviceAnswering(createOpenRouterAi, ended('stop'));
    assert.deepEqual(await service.ask(asking, signal), { words: 'Reči.', model: 'anthropic/claude-opus-5.5', cost: 0.02 });
  });

  it('checks a key by its own lookup, and refuses a wrong one as a bad key', async () => {
    const { service, seen } = serviceAnswering(createOpenRouterAi, { status: 401, reply: OPENROUTER_WRONG_KEY });
    await assert.rejects(service.keyCheck('pasted', signal), (error: unknown) => error instanceof LektorServiceError && error.failure === 'bad-key');
    assert.deepEqual(seen.requests.map(({ provider, action }) => ({ provider, action })), [{ provider: 'openrouter', action: 'check' }]);
  });
});

describe('never busy for a bad key', () => {
  for (const [make, response] of [
    [createGeminiAi, { status: 400, reply: GOOGLE_WRONG_KEY }],
    [createGeminiAi, { status: 403, reply: { error: { code: 403, message: 'x', status: 'PERMISSION_DENIED' } } }],
    [createOpenRouterAi, { status: 401, reply: OPENROUTER_WRONG_KEY }],
  ] as const) {
    it(`says a key refused with ${response.status} is a bad key`, async () => {
      assert.equal((await failureFrom(make, response)).failure, 'bad-key');
    });
  }
});

describe('being stopped', () => {
  it('comes back as stopping, not as a failure of the service', async () => {
    for (const make of [createGeminiAi, createOpenRouterAi]) {
      const { service } = serviceAnswering(make, { status: LEKTOR_STOPPED, reply: null });
      await assert.rejects(service.ask(asking, signal), (thrown: unknown) => thrown instanceof DOMException && thrown.name === 'AbortError');
    }
  });
});
