import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFakeNetwork, type FakeDay } from '../src/platform/lektor-fake-network.ts';
import { createGeminiAi } from '../src/ui/lektor/lektor-gemini-ai.ts';
import { type ChainError, type ChainReply, type ChainRequest, runModelChain, type Stage } from '../src/ui/lektor/lektor-model-chain.ts';
import { createOpenRouterAi } from '../src/ui/lektor/lektor-openrouter-ai.ts';
import type { Work } from '../src/ui/lektor/lektor-service.ts';
import { createFakeClock } from './fake-clock.ts';

/*
  Which model a request goes to and when it moves on, on the real services, with Google and
  OpenRouter faked at the network as they really answer, and minutes passing on a fake clock.
*/

const OPUS = 'anthropic/claude-opus-5.5';
const PAID_FLASH = 'google/gemini-3.8-flash';
const FREE_38 = 'gemini-3.8-flash';
const FREE_36 = 'gemini-3.6-flash';

interface Outcome {
  reply?: ChainReply;
  error?: unknown;
  /** When it ended, in ms from sending. */
  at: number;
}

function setUp(day: FakeDay = {}) {
  const clock = createFakeClock();
  const network = createFakeNetwork(day, clock);
  const errors: string[] = [];
  const parts = (key: string) => ({ ask: network.ask, keyNow: () => key, warn: () => {}, error: (message: string) => errors.push(message) });
  const stagesSeen: (readonly Stage[])[] = [];
  const chain = {
    free: createGeminiAi(parts('google-key')),
    paid: createOpenRouterAi(parts('openrouter-key')),
    clock,
    onChange: (stages: readonly Stage[]) => stagesSeen.push(stages),
    log: () => {},
  };
  const sent = (): string[] => network.asked.filter((one) => one.action === 'send').map((one) => one.model);
  const lastStages = (): readonly Stage[] => stagesSeen.at(-1) ?? [];

  async function run(work: Work, choice: ChainRequest['choice'], mayHandOver = false, stop?: AbortController): Promise<Outcome> {
    let outcome: Outcome | undefined;
    const request = { work, choice, mayHandOver, system: work === 'comment' ? 'Napiši utisak.' : 'Fix it. Return the whole text.', input: 'Neki tekst od nekoliko reči.' };
    runModelChain(request, chain, stop?.signal ?? new AbortController().signal).then(
      (reply) => (outcome = { reply, at: clock.now() }),
      (error: unknown) => (outcome = { error, at: clock.now() }),
    );
    for (let waited = 0; waited < 700_000 && outcome === undefined; waited += 1000) await clock.advance(1000);
    if (outcome === undefined) throw new Error('The chain never finished');
    return outcome;
  }
  return { clock, network, sent, lastStages, errors, run };
}

const failureOf = (outcome: Outcome): { failure: string; side: string } => {
  const error = outcome.error as ChainError;
  assert.ok(error !== undefined, `it answered instead, by ${outcome.reply?.model}`);
  return { failure: error.failure, side: error.side };
};

describe('which model is asked first', () => {
  for (const [work, model] of [
    ['comment', OPUS],
    ['letters', PAID_FLASH],
    ['grammar', PAID_FLASH],
    ['wording', OPUS],
    ['rewrite', OPUS],
  ] as const) {
    it(`asks ${model} alone for paid ${work}, and signs it by that model`, async () => {
      const { run, sent } = setUp();
      const { reply } = await run(work, 'paid');
      assert.deepEqual(sent(), [model]);
      assert.equal(reply?.tier, model === OPUS ? 'paid-opus' : 'paid-flash');
      assert.ok((reply?.cost ?? 0) > 0);
    });
  }

  for (const work of ['comment', 'letters', 'grammar', 'wording', 'rewrite'] as const) {
    it(`asks free 3.8 first for free ${work}, and signs it as free with no cost`, async () => {
      const { run, sent } = setUp();
      const { reply } = await run(work, 'free');
      assert.deepEqual(sent(), [FREE_38]);
      assert.equal(reply?.tier, 'free');
      assert.equal(reply?.cost, null);
    });
  }
});

describe('free 3.6 standing in for 3.8', () => {
  for (const work of ['comment', 'letters', 'grammar'] as const) {
    it(`goes to 3.6 when 3.8 is busy, for ${work}, as one queue line whose model changes`, async () => {
      const { run, sent, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }] } });
      const { reply } = await run(work, 'free');
      assert.deepEqual(sent(), [FREE_38, FREE_36]);
      assert.equal(reply?.tier, 'free');
      const queues = lastStages().filter((stage) => stage.phase === 'queue');
      assert.equal(queues.length, 1);
      assert.equal(queues[0]?.model, FREE_36);
      assert.ok(!lastStages().some((stage) => stage.phase === 'refused'));
    });
  }

  it('goes to 3.6 when 3.8 has its day spent', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'daily-limit' }] } });
    await run('letters', 'free');
    assert.deepEqual(sent(), [FREE_38, FREE_36]);
  });

  it('gives 3.8 up for 3.6 when it is still queued at one minute', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }] } });
    const { reply, at } = await run('comment', 'free');
    assert.deepEqual(sent(), [FREE_38, FREE_36]);
    assert.equal(reply?.tier, 'free');
    assert.ok(at >= 60_000 && at < 70_000, `answered at ${at}`);
  });

  it('keeps 3.8 when it started before the minute, however long it then takes', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'answer', queueMs: 50_000, thinkMs: 200_000 }] } });
    const { reply } = await run('letters', 'free', true);
    assert.deepEqual(sent(), [FREE_38]);
    assert.equal(reply?.tier, 'free');
  });

  for (const work of ['wording', 'rewrite'] as const) {
    it(`never falls back on ${work}: busy 3.8 fails as busy, free`, async () => {
      const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }] } });
      assert.deepEqual(failureOf(await run(work, 'free')), { failure: 'busy', side: 'free' });
      assert.deepEqual(sent(), [FREE_38]);
    });
  }

  it('waits on 3.8 for rework past the minute when not ticked', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'answer', queueMs: 90_000 }] } });
    const { reply } = await run('wording', 'free');
    assert.deepEqual(sent(), [FREE_38]);
    assert.equal(reply?.tier, 'free');
  });
});

describe('a slow free request handed on to paid Flash', () => {
  it('goes to paid Flash, never Opus, when still queued two minutes after sending', async () => {
    const { run, sent, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }], [FREE_36]: [{ kind: 'queue-forever' }] } });
    const { reply, at } = await run('comment', 'free', true);
    assert.deepEqual(sent(), [FREE_38, FREE_36, PAID_FLASH]);
    assert.equal(reply?.tier, 'paid-flash');
    assert.equal(reply?.isHandedOver, true);
    assert.ok((reply?.cost ?? 0) > 0);
    const handedAt = lastStages().find((stage) => stage.tier === 'paid-flash')?.startedAt ?? -1;
    assert.equal(handedAt, 120_000);
    assert.ok(at > 120_000);
    assert.equal(lastStages().find((stage) => stage.phase === 'queue')?.isGivenUp, true);
  });

  it('counts the two minutes from sending, across both free models', async () => {
    const { run, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'queue-forever' }] } });
    await run('letters', 'free', true);
    assert.equal(lastStages().find((stage) => stage.tier === 'paid-flash')?.startedAt, 120_000);
  });

  for (const work of ['wording', 'rewrite'] as const) {
    it(`gives 3.8 both minutes on ${work}, with no 3.6 between, and hands on to Flash`, async () => {
      const { run, sent, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }] } });
      const { reply } = await run(work, 'free', true);
      assert.deepEqual(sent(), [FREE_38, PAID_FLASH]);
      assert.equal(reply?.tier, 'paid-flash');
      assert.equal(lastStages().find((stage) => stage.tier === 'paid-flash')?.startedAt, 120_000);
    });
  }

  it('hands on at once when the last free model is busy, noting the refusal as a line of its own', async () => {
    const { run, sent, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy' }] } });
    const { reply, at } = await run('comment', 'free', true);
    assert.deepEqual(sent(), [FREE_38, FREE_36, PAID_FLASH]);
    assert.equal(reply?.tier, 'paid-flash');
    assert.ok(at < 60_000);
    assert.deepEqual(
      lastStages().map((stage) => stage.phase),
      ['queue', 'refused', 'thinking', 'writing'],
    );
  });

  it('hands on at once when the last free model has its day spent, noted as spent', async () => {
    const { run, lastStages } = setUp({ turns: { [FREE_38]: [{ kind: 'daily-limit' }] } });
    await run('wording', 'free', true);
    assert.equal(lastStages()[1]?.phase, 'spent');
  });

  it('never moves a request whose work began, even past the two minutes', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }], [FREE_36]: [{ kind: 'answer', queueMs: 30_000, thinkMs: 200_000 }] } });
    const { reply, at } = await run('comment', 'free', true);
    assert.deepEqual(sent(), [FREE_38, FREE_36]);
    assert.equal(reply?.tier, 'free');
    assert.ok(at > 120_000);
  });

  it('tells money gone after a hand-over apart from money gone on a paid choice', async () => {
    const { run } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy' }], [PAID_FLASH]: [{ kind: 'no-credit' }] } });
    assert.deepEqual(failureOf(await run('comment', 'free', true)), { failure: 'broke-after-hand-over', side: 'paid' });
    const paid = setUp({ turns: { [OPUS]: [{ kind: 'no-credit' }] } });
    assert.deepEqual(failureOf(await paid.run('comment', 'paid')), { failure: 'no-credit', side: 'paid' });
  });
});

describe('a free request that is not ticked', () => {
  it('fails as busy when both free models are busy', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy' }] } });
    assert.deepEqual(failureOf(await run('letters', 'free')), { failure: 'busy', side: 'free' });
    assert.deepEqual(sent(), [FREE_38, FREE_36]);
  });

  it('fails as the day spent when the last free model has its day spent', async () => {
    const { run } = setUp({ turns: { [FREE_38]: [{ kind: 'daily-limit' }], [FREE_36]: [{ kind: 'daily-limit' }] } });
    assert.deepEqual(failureOf(await run('comment', 'free')), { failure: 'daily-limit', side: 'free' });
  });

  it('fails as busy at the ten-minute limit, never handed on', async () => {
    const { run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }] } });
    const outcome = await run('rewrite', 'free');
    assert.deepEqual(failureOf(outcome), { failure: 'busy', side: 'free' });
    assert.deepEqual(sent(), [FREE_38]);
    assert.ok(outcome.at >= 600_000);
  });

  it('fails as busy when 3.6 is refused mid-queue by an error event', async () => {
    const { run } = setUp({ turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy-after-queue', queueMs: 40_000 }] } });
    assert.deepEqual(failureOf(await run('grammar', 'free')), { failure: 'busy', side: 'free' });
  });
});

describe('failures that move nothing on', () => {
  it('stops at a dead free key: never busy, and 3.6 is not asked', async () => {
    const { run, sent } = setUp({ deadKeys: ['gemini'] });
    assert.deepEqual(failureOf(await run('comment', 'free', true)), { failure: 'bad-key', side: 'free' });
    assert.deepEqual(sent(), [FREE_38]);
  });

  it('stops at a dead paid key as the paid side', async () => {
    const { run } = setUp({ deadKeys: ['openrouter'] });
    assert.deepEqual(failureOf(await run('wording', 'paid')), { failure: 'bad-key', side: 'paid' });
  });

  it('stops offline as offline', async () => {
    const { run } = setUp({ isOffline: true });
    assert.deepEqual(failureOf(await run('letters', 'free', true)), { failure: 'offline', side: 'free' });
  });

  it('reads a cut-off paid reply as cut off, and a refusal to write as declined', async () => {
    const cut = setUp({ turns: { [OPUS]: [{ kind: 'cut-off' }] } });
    assert.deepEqual(failureOf(await cut.run('comment', 'paid')), { failure: 'cut-off', side: 'paid' });
    const declined = setUp({ turns: { [FREE_38]: [{ kind: 'declined' }] } });
    assert.deepEqual(failureOf(await declined.run('comment', 'free')), { failure: 'declined', side: 'free' });
  });

  it('shows no host found as paid busy, and logs it as our own mistake', async () => {
    const { run, errors } = setUp({ turns: { [OPUS]: [{ kind: 'no-host' }] } });
    assert.deepEqual(failureOf(await run('rewrite', 'paid')), { failure: 'busy', side: 'paid' });
    assert.equal(errors.length, 1);
  });

  it('stops when he gives up, asks nothing more, and is not handed on', async () => {
    const { clock, run, sent } = setUp({ turns: { [FREE_38]: [{ kind: 'queue-forever' }] } });
    const stop = new AbortController();
    clock.after(30_000, () => stop.abort());
    const outcome = await run('comment', 'free', true, stop);
    assert.equal((outcome.error as Error).name, 'AbortError');
    assert.deepEqual(sent(), [FREE_38]);
  });
});
