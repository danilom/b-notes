import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readClaudeStream } from '../src/platform/claude-reply-stream.ts';

const line = (event: object): string => `event: x\ndata: ${JSON.stringify(event)}\n\n`;

const WHOLE_REPLY = [
  line({ type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 1 } } }),
  line({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'ne ovo' } }),
  line({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Čitao ' } }),
  line({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'sam.' } }),
  line({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 340 } }),
  line({ type: 'message_stop' }),
].join('');

async function* bytesInPiecesOf(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  for (let at = 0; at < bytes.length; at += size) yield bytes.slice(at, at + size);
}

describe('readClaudeStream', () => {
  it('gathers the words, why it stopped and what it used, leaving out its thinking', async () => {
    const reply = await readClaudeStream(bytesInPiecesOf(WHOLE_REPLY, 100_000));
    assert.equal(reply.text, 'Čitao sam.');
    assert.equal(reply.stopReason, 'end_turn');
    assert.deepEqual(reply.usage, { inputTokens: 120, outputTokens: 340 });
    assert.equal(reply.error, null);
  });

  it('survives the network splitting a line and even a letter in two', async () => {
    const reply = await readClaudeStream(bytesInPiecesOf(WHOLE_REPLY, 1));
    assert.equal(reply.text, 'Čitao sam.');
    assert.deepEqual(reply.usage, { inputTokens: 120, outputTokens: 340 });
  });

  it('reports a refusal and its explanation', async () => {
    const refused = line({ type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { explanation: 'Ne mogu.' } }, usage: { output_tokens: 2 } });
    const reply = await readClaudeStream(bytesInPiecesOf(refused, 50));
    assert.equal(reply.stopReason, 'refusal');
    assert.equal(reply.explanation, 'Ne mogu.');
  });

  it('reports an error that arrives partway through', async () => {
    const failing = line({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Čit' } }) + line({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const reply = await readClaudeStream(bytesInPiecesOf(failing, 50));
    assert.deepEqual(reply.error, { type: 'overloaded_error', message: 'Overloaded' });
  });
});
