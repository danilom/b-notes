import { LektorServiceError } from './lektor-service.ts';

/*
  The way to the dev server, which holds the keys and alone may talk to an AI; in the app
  that part belongs to the main process. Nothing here logs text.
*/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function callServer(body: object, signal: AbortSignal): Promise<{ status: number; reply: unknown }> {
  let response: Response;
  try {
    response = await fetch('/lektor-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new LektorServiceError('offline');
  }
  const raw = await response.text();
  try {
    return { status: response.status, reply: JSON.parse(raw) };
  } catch (error) {
    console.error('The Lektor service answered with something unreadable', error);
    return { status: response.status, reply: null };
  }
}

/** What the server says to "has-key": whether it has one to use, and never the key itself. */
export function keyIsWithServer({ status, reply }: { status: number; reply: unknown }): boolean {
  return status === 200 && isRecord(reply) && reply['hasKey'] === true;
}

/** The service's own words about what went wrong, if it gave any. */
export function messageOf(answer: unknown): string {
  // Gemini's Interactions wraps its refusals in a list; nothing else does.
  const reply: unknown = Array.isArray(answer) ? answer.at(0) : answer;
  if (!isRecord(reply) || !isRecord(reply['error'])) return '';
  const message = reply['error']['message'];
  return typeof message === 'string' ? message : '';
}

/** Whether the internet can be reached, asked of the server rather than of any one AI. */
export async function connectionCheck(signal: AbortSignal): Promise<void> {
  const { status, reply } = await callServer({ action: 'ping' }, signal);
  if (status !== 200) throw new LektorServiceError('offline', `${status}: ${messageOf(reply)}`);
}
