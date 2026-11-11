import { readFileSync } from 'node:fs';
import path from 'node:path';

/*
  The real replies recorded from Google and OpenRouter (test/fixtures/lektor-api/README.md), for
  tests to feed the stream readers exactly as the network delivered them, or cut finer still.
*/

export interface Recorded {
  status: number;
  /** The whole body. */
  body: string;
  /** The body as the network delivered it, piece by piece. */
  pieces: string[];
}

const FOLDER = path.join(import.meta.dirname, 'fixtures', 'lektor-api');

export function recorded(name: string): Recorded {
  const raw = JSON.parse(readFileSync(path.join(FOLDER, `${name}.json`), 'utf8')) as { status: number; pieces: { text: string }[] };
  const pieces = raw.pieces.map((piece) => piece.text);
  return { status: raw.status, body: pieces.join(''), pieces };
}

const encoder = new TextEncoder();

/** The pieces as bytes, one chunk each, as they came. */
export async function* asRecorded(pieces: readonly string[]): AsyncIterable<Uint8Array> {
  for (const piece of pieces) yield encoder.encode(piece);
}

/** The whole body in chunks of a few bytes: events, lines and multi-byte letters all cut in half. */
export async function* inSmallChunks(body: string, size = 7): AsyncIterable<Uint8Array> {
  const bytes = encoder.encode(body);
  for (let at = 0; at < bytes.length; at += size) yield bytes.slice(at, at + size);
}
