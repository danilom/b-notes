import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readGoogleStream } from '../src/platform/google-interaction-stream.ts';
import type { LektorProgress } from '../src/platform/lektor-progress.ts';
import { readOpenRouterStream } from '../src/platform/openrouter-reply-stream.ts';
import { asRecorded, inSmallChunks, recorded } from './lektor-api-fixtures.ts';

/*
  The two stream readers on the replies Google and OpenRouter really sent, as delivered and cut
  into pieces of seven bytes, so an event, a line or a letter split across chunks is read whole.
*/

const kinds = (progress: readonly LektorProgress[]): string[] => progress.map((one) => one.kind).filter((kind, at, all) => kind !== all[at - 1]);

describe("reading Google's stream", () => {
  const whole = recorded('google-stream-whole-gemini-3.6-flash');

  for (const [how, chunks] of [
    ['as delivered', () => asRecorded(whole.pieces)],
    ['in seven-byte pieces', () => inSmallChunks(whole.body)],
  ] as const) {
    it(`reads the whole utisak, its model and its finish, ${how}`, async () => {
      const progress: LektorProgress[] = [];
      const reply = await readGoogleStream(chunks(), (one) => progress.push(one));
      assert.equal(reply.status, 'completed');
      assert.equal(reply.model, 'gemini-3.6-flash');
      assert.equal(reply.error, null);
      assert.match(reply.text, /\S/);
      assert.ok(reply.text.length > 200, `only ${reply.text.length} characters`);
      assert.deepEqual(kinds(progress), ['started', 'thinking', 'writing']);
      assert.deepEqual(progress[0], { kind: 'started', model: 'gemini-3.6-flash' });
    });
  }

  it('reports nothing while only keep-alives come, so the request reads as still queued', async () => {
    const queuedOnly = ': keep-alive\n\n: keep-alive\n\n';
    const progress: LektorProgress[] = [];
    const reply = await readGoogleStream(inSmallChunks(queuedOnly), (one) => progress.push(one));
    assert.deepEqual(progress, []);
    assert.equal(reply.status, null);
  });

  it('reads an error event that comes after minutes in the queue', async () => {
    const event = { event_type: 'error', error: { code: 'service_unavailable', message: 'gemini-3.8-flash is currently experiencing high demand' } };
    const body = `: keep-alive\n\nevent: error\ndata: ${JSON.stringify(event)}\n\n`;
    const reply = await readGoogleStream(inSmallChunks(body), () => undefined);
    assert.deepEqual(reply.error, event.error);
    assert.equal(reply.status, null);
  });

  it('counts a stream that ends without completing as unfinished', async () => {
    const cut = whole.body.slice(0, whole.body.indexOf('interaction.completed'));
    const reply = await readGoogleStream(inSmallChunks(cut), () => undefined);
    assert.equal(reply.status, null);
  });
});

describe("reading OpenRouter's stream", () => {
  for (const [name, model, cost] of [
    ['openrouter-stream-gemini-3.8-flash', 'google/gemini-3.8-flash', 0.00680925],
    ['openrouter-stream-claude-opus-5.5', 'anthropic/claude-opus-5.5', 0.015804],
  ] as const) {
    const stream = recorded(name);
    for (const [how, chunks] of [
      ['as delivered', () => asRecorded(stream.pieces)],
      ['in seven-byte pieces', () => inSmallChunks(stream.body)],
    ] as const) {
      it(`reads ${model}'s utisak, its finish and its cost, ${how}`, async () => {
        const progress: LektorProgress[] = [];
        const reply = await readOpenRouterStream(chunks(), (one) => progress.push(one));
        assert.equal(reply.finish, 'stop');
        assert.equal(reply.model, model);
        assert.equal(reply.cost, cost);
        assert.equal(reply.error, null);
        assert.ok(reply.text.length > 500, `only ${reply.text.length} characters`);
        assert.equal(reply.text.trimStart().slice(0, 6), reply.text.trimStart().slice(0, 6).normalize());
        assert.deepEqual(kinds(progress), ['started', 'thinking', 'writing']);
      });
    }
  }

  it('reads a reply cut off for length, with no words, as cut off', async () => {
    const reply = await readOpenRouterStream(asRecorded(recorded('openrouter-stream-cut-off').pieces), () => undefined);
    assert.equal(reply.finish, 'length');
    assert.equal(reply.text, '');
    assert.ok(reply.cost !== null && reply.cost > 0);
  });

  it('reads an error that ends the stream mid-way', async () => {
    const chunk = { id: 'x', model: 'anthropic/claude-opus-5.5', error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] };
    const body = `: OPENROUTER PROCESSING\n\ndata: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
    const reply = await readOpenRouterStream(inSmallChunks(body), () => undefined);
    assert.deepEqual(reply.error, { code: 502, message: 'Provider disconnected' });
    assert.equal(reply.finish, 'error');
  });

  it('reports nothing while only its processing comments come', async () => {
    const progress: LektorProgress[] = [];
    await readOpenRouterStream(inSmallChunks(': OPENROUTER PROCESSING\n\n: OPENROUTER PROCESSING\n\n'), (one) => progress.push(one));
    assert.deepEqual(progress, []);
  });
});
