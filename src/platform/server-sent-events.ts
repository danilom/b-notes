/*
  Server-sent events, as Google and OpenRouter both stream their replies: lines of `data: …`,
  comment lines starting with ":" while the service has nothing to say yet, and events split
  across network chunks wherever the network happened to split them.
*/

/** One line of the stream, as the stream readers need it. */
export type StreamLine = { kind: 'data'; data: string } | { kind: 'comment' };

/**
 * Reads the body line by line, handing on each `data:` line's payload and each comment. Other
 * lines (`event:`, `id:`, blank separators) carry nothing the Lektor uses.
 *
 * @param chunks The response body: bytes, split anywhere, even inside a character.
 */
export async function readStreamLines(chunks: AsyncIterable<Uint8Array>, onLine: (line: StreamLine) => void): Promise<void> {
  const decoder = new TextDecoder();
  let pending = '';
  const take = (raw: string): void => {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith(':')) onLine({ kind: 'comment' });
    else if (line.startsWith('data:')) onLine({ kind: 'data', data: line.slice('data:'.length).trim() });
  };
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) take(line);
  }
  pending += decoder.decode();
  if (pending !== '') take(pending);
}

/** A data line's JSON, or null for anything that isn't an object: a stream's last `[DONE]`, or damage. */
export function jsonOf(data: string): Record<string, unknown> | null {
  if (data === '[DONE]') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    // Not logged: this runs below any log. A line that can't be read is skipped, and a reply
    // missing what it needed is then read by the service as cut off, which is what it is.
    return null;
  }
}

export const recordOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
