import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { claudeAi } from '../design/lektor-claude-ai.ts';
import { geminiAi } from '../design/lektor-gemini-ai.ts';
import { correctionInstruction, proposalFrom, withHisFilingMarks } from '../design/lektor-instructions.ts';
import { type LektorFailure, type LektorService, LektorServiceError } from '../design/lektor-service.ts';

/*
  Neither service ever reaches the network here: fetch is replaced for every test, and one
  that isn't given an answer fails rather than asking anyone. These tests cost nothing.
*/

function storage(): Storage {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
    key: () => null,
    get length() {
      return held.size;
    },
  };
}

interface Sent {
  provider?: string;
  model?: string;
  system?: string;
  input?: string;
}

const realFetch = globalThis.fetch;
let sent: Sent[] = [];

function answerWith(...answers: { status: number; body: unknown }[]): void {
  const queue = [...answers];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    const next = queue.shift();
    if (next === undefined) throw new Error('A test asked for more answers than it was given');
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
}

beforeEach(() => {
  sent = [];
  Object.defineProperty(globalThis, 'window', { value: { sessionStorage: storage(), localStorage: storage() }, configurable: true });
  globalThis.fetch = (() => {
    throw new Error('This test has no answer prepared, and must not reach the network');
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const signal = new AbortController().signal;

async function failureOf(service: LektorService): Promise<LektorServiceError> {
  try {
    await service.feedback('tekst', signal);
  } catch (error) {
    if (error instanceof LektorServiceError) return error;
    throw error;
  }
  throw new Error('It was expected to fail');
}

const error = (message: string): { error: { message: string } } => ({ error: { message } });
const CAP = 'Rate limit exceeded for model gemini-3.6-flash (limit: 20 requests per day on Free Tier). Please retry in 2h.';

describe('Gemini refusals', () => {
  const cases: [string, number, unknown, LektorFailure][] = [
    ['a server that could not reach Google as being offline', 502, error('TypeError'), 'offline'],
    ['running out of time as trouble with the service', 504, error('TimeoutError'), 'overloaded'],
    ['the free limit', 429, [error(CAP)], 'limit'],
    ['a key refused in a list, as Interactions sends it', 400, [error('API key not valid. Please pass a valid API key.')], 'bad-key'],
    ['a text over the limit', 400, error('The input token count exceeds the maximum'), 'too-long'],
    ['an overloaded model with no other to try', 503, error('high demand'), 'overloaded'],
  ];
  for (const [what, status, body, failure] of cases) {
    it(`reads ${what}`, async () => {
      answerWith({ status, body });
      assert.equal((await failureOf(geminiAi)).failure, failure);
    });
  }

  it('hands on Google\'s own words, and tells him the time for the daily cap', async () => {
    answerWith({ status: 429, body: error(CAP) });
    const failure = await failureOf(geminiAi);
    assert.equal(failure.serviceSaid, CAP);
    assert.match(failure.finalSentence, /^Današnjih 20 besplatnih pokušaja .* posle \d\d:\d\d\.$/);
  });

  it('keeps retrying possible for a limit that is not the daily one', async () => {
    answerWith({ status: 429, body: error('Rate limit exceeded (limit: 10 requests per minute). Please retry in 30s.') });
    assert.equal((await failureOf(geminiAi)).finalSentence, '');
  });

  it('passes the dev server\'s own words off as nobody\'s', async () => {
    answerWith({ status: 504, body: error('TimeoutError') });
    assert.equal((await failureOf(geminiAi)).serviceSaid, '');
  });

  it('never falls back to a cheaper model for a comment', async () => {
    answerWith({ status: 503, body: error('high demand') });
    await failureOf(geminiAi);
    assert.deepEqual(sent.map((request) => request.model), ['gemini-3.6-flash']);
  });

  it('moves plain corrections up to the better model when the quick one is overloaded', async () => {
    const text = 'Neki tekst koji treba ispraviti.';
    answerWith({ status: 503, body: error('high demand') }, { status: 200, body: { output_text: text } });
    await geminiAi.corrections({ text, preset: 'letters', instruction: 'x', note: '' }, signal);
    assert.deepEqual(sent.map((request) => request.model), ['gemini-3.1-flash-lite', 'gemini-3.6-flash']);
  });
});

describe('Claude replies', () => {
  const finished = (text: string): { text: string; stopReason: string; usage: object } => ({ text, stopReason: 'end_turn', usage: { inputTokens: 8_000, outputTokens: 11_000 } });

  it('asks the dev server for Claude and for Opus', async () => {
    answerWith({ status: 200, body: finished('Utisak.') });
    assert.equal(await claudeAi.feedback('tekst', signal), 'Utisak.');
    assert.equal(sent[0]?.provider, 'claude');
    assert.equal(sent[0]?.model, 'claude-opus-5-5');
  });

  it('hands on the explanation when it declines', async () => {
    answerWith({ status: 200, body: { text: '', stopReason: 'refusal', explanation: 'Ne mogu.', usage: { inputTokens: 1_000, outputTokens: 0 } } });
    const failure = await failureOf(claudeAi);
    assert.equal(failure.failure, 'declined');
    assert.equal(failure.serviceSaid, 'Ne mogu.');
  });

  it('asks the server about its own key, not Google\'s', async () => {
    answerWith({ status: 200, body: { hasKey: true } }, { status: 200, body: { hasKey: false } });
    assert.equal(await claudeAi.isKeySaved(signal), true);
    assert.equal(await geminiAi.isKeySaved(signal), false);
    assert.equal(sent[0]?.provider, 'claude');
    assert.equal(sent[1]?.provider, undefined);
  });

  it('treats a reply that hit the length limit as cut off', async () => {
    answerWith({ status: 200, body: { text: 'Polovi', stopReason: 'max_tokens', usage: {} } });
    assert.equal((await failureOf(claudeAi)).failure, 'cut-off');
  });

  for (const limit of ['You have reached your specified API usage limits.', 'You have reached your specified workspace API usage limits.']) {
    it(`treats a spend limit as the money being gone: ${limit}`, async () => {
      answerWith({ status: 400, body: error(limit) });
      const failure = await failureOf(claudeAi);
      assert.equal(failure.failure, 'no-credit');
      assert.notEqual(failure.finalSentence, '');
      assert.equal(failure.serviceSaid, limit);
    });
  }

  it('says the money is gone and offers no retry', async () => {
    answerWith({ status: 400, body: error('Your credit balance is too low to access the Anthropic API.') });
    const failure = await failureOf(claudeAi);
    assert.equal(failure.failure, 'no-credit');
    assert.notEqual(failure.finalSentence, '');
  });

  const cases: [string, number, string, LektorFailure][] = [
    ['no key anywhere, sent by the dev server without any words', 401, '', 'bad-key'],
    ['a refused key', 401, 'invalid x-api-key', 'bad-key'],
    ['the rate limit', 429, 'Number of requests has exceeded your rate limit', 'limit'],
    ['overload', 529, 'Overloaded', 'overloaded'],
    ['a text over the limit', 400, 'prompt is too long: 1200000 tokens > 1000000 maximum', 'too-long'],
    ['a server that could not reach Anthropic', 502, 'TypeError', 'offline'],
    ['running out of time', 504, 'TimeoutError', 'overloaded'],
  ];
  for (const [what, status, message, failure] of cases) {
    it(`reads ${what}`, async () => {
      answerWith({ status, body: error(message) });
      assert.equal((await failureOf(claudeAi)).failure, failure);
    });
  }
});

describe('correctionInstruction', () => {
  const request = { text: 't', instruction: 'Uputstvo.', note: '' };

  it('holds corrections to correcting', () => {
    const asked = correctionInstruction({ ...request, preset: 'grammar' });
    assert.match(asked, /samo ispravljen/);
    assert.match(asked, /Ako ne razumeš/);
  });

  it('frees a rewrite from correcting, while still protecting quoted speech and his notes', () => {
    const asked = correctionInstruction({ ...request, preset: 'rewrite' });
    assert.doesNotMatch(asked, /samo ispravljen/);
    assert.doesNotMatch(asked, /Ako ne razumeš/);
    assert.match(asked, /pod navodnicima/);
    assert.match(asked, /Napomene koje je autor/);
  });

  it('adds what he wrote himself, and nothing when he wrote only spaces', () => {
    assert.match(correctionInstruction({ ...request, preset: 'letters', note: ' Bez zareza. ' }), /Autor još kaže: Bez zareza\./);
    assert.doesNotMatch(correctionInstruction({ ...request, preset: 'letters', note: '   ' }), /Autor još kaže/);
  });
});

describe('withHisFilingMarks', () => {
  it('lets the title\'s words be corrected', () => {
    assert.equal(withHisFilingMarks('Cuprija- Sumrak\n\nStari most.\n', 'Ćuprija – Sumrak\n\nStari, stari most.\n'), 'Ćuprija – Sumrak\n\nStari, stari most.\n');
  });

  it('puts back the marks his filing relies on when the reply tidied them away', () => {
    assert.equal(withHisFilingMarks('* * Pismo( konacno)\nTekst\n', 'Pismo (konačno)\nTekst.\n'), '* * Pismo (konačno)\nTekst.\n');
    assert.equal(withHisFilingMarks('AA(E)Kafana\nTekst\n', 'Kafana\nTekst.\n'), 'AA(E)Kafana\nTekst.\n');
    assert.equal(withHisFilingMarks('(UP) II   12 Grad\nTekst\n', 'Grad\nTekst.\n'), '(UP) II   12 Grad\nTekst.\n');
  });

  it('does not double the marks when the reply kept them', () => {
    assert.equal(withHisFilingMarks('  * Pismo\nTekst\n', '  * Pismo!\nTekst.\n'), '  * Pismo!\nTekst.\n');
    assert.equal(withHisFilingMarks('  * Pismo\nTekst\n', '* Pismo\nTekst.\n'), '  * Pismo\nTekst.\n');
  });

  it('keeps blank lines and ranking spaces before his title', () => {
    assert.equal(withHisFilingMarks('\n    Naslov\nTekst\n', 'Naslov\nTekst.\n'), '\n    Naslov\nTekst.\n');
  });

  it('accepts a title reworded altogether, keeping only its filing', () => {
    assert.equal(withHisFilingMarks('zz Stari most\n\nDjed je govorio.\n', 'Most nad vodom\n\nDjed reče.\n'), 'zz Most nad vodom\n\nDjed reče.\n');
  });

  it('puts his title back on top when the reply dropped it, losing nothing', () => {
    assert.equal(withHisFilingMarks('Stari most\n\nDjed je govorio.\n', 'Djed je rekao.\n'), 'Stari most\n\nDjed je rekao.\n');
  });

  it('leaves a reply with no lines to the check for short replies', () => {
    assert.equal(withHisFilingMarks('Naslov\n', '  '), '  ');
  });
});

describe('proposalFrom', () => {
  const original = 'Jedan dugačak tekst koji se ispravlja.\n';

  it('takes off a code fence and gives back his own ending', () => {
    assert.equal(proposalFrom('```\nJedan dugačak tekst koji je ispravljen.\n```', original), 'Jedan dugačak tekst koji je ispravljen.\n');
  });

  it('refuses a reply so short that accepting it would delete his text', () => {
    assert.throws(() => proposalFrom('Jedan.', original), (thrown: unknown) => thrown instanceof LektorServiceError && thrown.failure === 'cut-off');
  });
});
