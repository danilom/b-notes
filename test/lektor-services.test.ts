import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { strings } from '../src/language/wording.ts';
import { LEKTOR_STOPPED, LEKTOR_TIMED_OUT, LEKTOR_UNREACHED, type LektorRequest } from '../src/platform/lektor-remote.ts';
import { createClaudeAi } from '../src/ui/lektor/lektor-claude-ai.ts';
import { createGeminiAi } from '../src/ui/lektor/lektor-gemini-ai.ts';
import { correctionInstruction, proposalFrom, withHisFilingMarks } from '../src/ui/lektor/lektor-instructions.ts';
import { type LektorFailure, type LektorService, LektorServiceError } from '../src/ui/lektor/lektor-service.ts';

/*
  Neither service reaches anything here: they are handed a stand-in for the host, and one
  that isn't given an answer fails rather than asking anyone. These tests cost nothing.
*/

const words = strings('sr').lektor;

let sent: LektorRequest[] = [];
let answers: { status: number; body: unknown }[] = [];
let warnings: string[] = [];

const parts = {
  ask: async (request: LektorRequest) => {
    sent.push(request);
    const next = answers.shift();
    if (next === undefined) throw new Error('A test asked for more answers than it was given');
    return { status: next.status, reply: next.body };
  },
  keyNow: () => 'test-key',
  noCreditSentence: () => words.noCredit,
  dailyCapWords: () => words,
  warn: (message: string) => {
    warnings.push(message);
  },
};

const geminiAi = createGeminiAi(parts);
const claudeAi = createClaudeAi(parts);

function answerWith(...next: { status: number; body: unknown }[]): void {
  answers = next;
}

beforeEach(() => {
  sent = [];
  answers = [];
  warnings = [];
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
    ['not reaching Google as being offline', LEKTOR_UNREACHED, error('TypeError'), 'offline'],
    ['running out of time as trouble with the service', LEKTOR_TIMED_OUT, error('TimeoutError'), 'overloaded'],
    ['the free limit', 429, [error(CAP)], 'limit'],
    ['a key refused in a list, as Interactions sends it', 400, [error('API key not valid. Please pass a valid API key.')], 'bad-key'],
    ['no key at all, with no words', 401, error(''), 'bad-key'],
    ['a text over the limit', 400, error('The input token count exceeds the maximum'), 'too-long'],
    ['an overloaded model', 503, error('high demand'), 'overloaded'],
  ];
  for (const [what, status, body, failure] of cases) {
    it(`reads ${what}`, async () => {
      answerWith({ status, body });
      assert.equal((await failureOf(geminiAi)).failure, failure);
    });
  }

  it("hands on Google's own words, and tells him the time for the daily cap", async () => {
    answerWith({ status: 429, body: error(CAP) });
    const failure = await failureOf(geminiAi);
    assert.equal(failure.serviceSaid, CAP);
    assert.match(failure.finalSentence, /^Današnjih 20 besplatnih pokušaja .* posle \d\d:\d\d\.$/);
  });

  it('keeps retrying possible for a limit that is not the daily one', async () => {
    answerWith({ status: 429, body: error('Rate limit exceeded (limit: 10 requests per minute). Please retry in 30s.') });
    assert.equal((await failureOf(geminiAi)).finalSentence, '');
  });

  it('passes our own words about a timeout off as nobody\'s', async () => {
    answerWith({ status: LEKTOR_TIMED_OUT, body: error('TimeoutError') });
    assert.equal((await failureOf(geminiAi)).serviceSaid, '');
  });

  it('never falls back to a cheaper model for a comment', async () => {
    answerWith({ status: 503, body: error('high demand') });
    await failureOf(geminiAi);
    assert.deepEqual(sent.map((request) => request.model), ['gemini-3.6-flash']);
  });

  for (const preset of ['letters', 'grammar', 'wording', 'rewrite'] as const) {
    it(`asks the one model for ${preset}, and asks it only once when it is overloaded`, async () => {
      const text = 'Neki tekst koji treba ispraviti.';
      answerWith({ status: 503, body: error('high demand') });
      await assert.rejects(geminiAi.corrections({ text, preset, instruction: 'x', note: '' }, signal), (thrown: unknown) => thrown instanceof LektorServiceError && thrown.failure === 'overloaded' && thrown.serviceSaid === 'high demand');
      assert.deepEqual(sent.map((request) => request.model), ['gemini-3.6-flash']);
    });
  }

  it('makes a note of a refusal it does not recognise', async () => {
    answerWith({ status: 400, body: error('Something new from Google') });
    assert.equal((await failureOf(geminiAi)).failure, 'overloaded');
    assert.equal(warnings.length, 1);
  });

  it('sends the key it is given, and asks Google', async () => {
    answerWith({ status: 200, body: { output_text: 'Utisak.' } });
    await geminiAi.feedback('tekst', signal);
    assert.equal(sent[0]?.provider, 'gemini');
    assert.equal(sent[0]?.key, 'test-key');
  });
});

describe('Claude replies', () => {
  const finished = (text: string): { text: string; stopReason: string; usage: object } => ({ text, stopReason: 'end_turn', usage: { inputTokens: 8_000, outputTokens: 11_000 } });

  it('asks for Claude and for Opus, with the key it is given', async () => {
    answerWith({ status: 200, body: finished('Utisak.') });
    assert.equal(await claudeAi.feedback('tekst', signal), 'Utisak.');
    assert.equal(sent[0]?.provider, 'claude');
    assert.equal(sent[0]?.model, 'claude-opus-5-5');
    assert.equal(sent[0]?.key, 'test-key');
  });

  it('hands on the explanation when it declines', async () => {
    answerWith({ status: 200, body: { text: '', stopReason: 'refusal', explanation: 'Ne mogu.', usage: { inputTokens: 1_000, outputTokens: 0 } } });
    const failure = await failureOf(claudeAi);
    assert.equal(failure.failure, 'declined');
    assert.equal(failure.serviceSaid, 'Ne mogu.');
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
    assert.equal(failure.finalSentence, words.noCredit);
  });

  const cases: [string, number, string, LektorFailure][] = [
    ['no key anywhere, with no words', 401, '', 'bad-key'],
    ['a refused key', 401, 'invalid x-api-key', 'bad-key'],
    ['the rate limit', 429, 'Number of requests has exceeded your rate limit', 'limit'],
    ['overload', 529, 'Overloaded', 'overloaded'],
    ['a text over the limit', 400, 'prompt is too long: 1200000 tokens > 1000000 maximum', 'too-long'],
    ['not reaching Anthropic', LEKTOR_UNREACHED, 'TypeError', 'offline'],
    ['running out of time', LEKTOR_TIMED_OUT, 'TimeoutError', 'overloaded'],
  ];
  for (const [what, status, message, failure] of cases) {
    it(`reads ${what}`, async () => {
      answerWith({ status, body: error(message) });
      assert.equal((await failureOf(claudeAi)).failure, failure);
    });
  }
});

describe('being stopped', () => {
  it('comes back as stopping, not as a failure of the service', async () => {
    answerWith({ status: LEKTOR_STOPPED, body: null });
    await assert.rejects(geminiAi.feedback('tekst', signal), (thrown: unknown) => thrown instanceof DOMException && thrown.name === 'AbortError');
  });
});

describe('correctionInstruction', () => {
  const request = { text: 't', instruction: 'Uputstvo.', note: '' };

  it('holds corrections to correcting', () => {
    const asked = correctionInstruction({ ...request, preset: 'grammar' });
    assert.match(asked, /only corrected/);
    assert.match(asked, /do not understand/);
  });

  it('frees a rewrite from correcting, while still protecting quoted speech and his notes', () => {
    const asked = correctionInstruction({ ...request, preset: 'rewrite' });
    assert.doesNotMatch(asked, /only corrected/);
    assert.doesNotMatch(asked, /do not understand/);
    assert.match(asked, /quotation marks/);
    assert.match(asked, /notes the author/);
  });

  it('adds what he wrote himself, and nothing when he wrote only spaces', () => {
    assert.match(correctionInstruction({ ...request, preset: 'letters', note: ' Bez zareza. ' }), /The author adds \(in his own words\): Bez zareza\./);
    assert.doesNotMatch(correctionInstruction({ ...request, preset: 'letters', note: '   ' }), /The author adds/);
  });
});

describe('withHisFilingMarks', () => {
  it("lets the title's words be corrected", () => {
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

  it('turns Cyrillic letters that slipped into a Latin text into the Latin ones they stand for', () => {
    assert.equal(proposalFrom('Štеđen i nasloжen, Љepota zapršкан tekst.', 'Stedjen i naslozen, Ljepota zaprshkan tekst.'), 'Šteđen i nasložen, Ljepota zaprškan tekst.');
  });

  it('leaves the Cyrillic alone in a text that has Cyrillic of its own', () => {
    assert.equal(proposalFrom('Цитат на ћирилици и ostatak teksta.', 'Citat: цитат на ћирилици и ostatak teksta.'), 'Цитат на ћирилици и ostatak teksta.');
  });
});
