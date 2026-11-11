import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLektorLines } from '../src/hosts/mockup/lektor-through-dev-server.ts';
import type { LektorProgress } from '../src/platform/lektor-progress.ts';

/* The browser build reading the dev server's lines: progress as it comes, the answer last. */

function streamOf(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream({
    pull: (controller) => {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

describe("reading the dev server's lines", () => {
  const lines = [{ progress: { kind: 'started', model: 'gemini-3.8-flash' } }, { progress: { kind: 'writing', characters: 12 } }, { progress: { kind: 'bogus' } }, { status: 200, reply: { text: 'Čuo sam.' } }]
    .map((line) => JSON.stringify(line))
    .join('\n');

  it('tells each progress line on and gives the last line as the answer, however the bytes were split', async () => {
    for (const size of [1, 5, 1000]) {
      const told: LektorProgress[] = [];
      const answer = await readLektorLines(streamOf(`${lines}\n`, size), (progress) => told.push(progress));
      assert.deepEqual(told, [
        { kind: 'started', model: 'gemini-3.8-flash' },
        { kind: 'writing', characters: 12 },
      ]);
      assert.deepEqual(answer, { status: 200, reply: { text: 'Čuo sam.' } });
    }
  });

  it('refuses to make up an answer when the server ended without one', async () => {
    await assert.rejects(readLektorLines(streamOf('{"progress":{"kind":"thinking"}}\n', 4), () => {}));
  });
});
