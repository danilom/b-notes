import { type LektorProgress, lektorProgressFrom } from '../../platform/lektor-progress.ts';
import { LEKTOR_STOPPED, LEKTOR_UNREACHED, type LektorRequest, type LektorResponse } from '../../platform/lektor-remote.ts';

/*
  The browser build's way to an AI service: through the dev server's `/lektor-ai`, which runs
  the same code the app's main process does and answers in lines of JSON, progress first and the
  answer last (scripts/serve.mjs).
*/

/** The answer from the dev server's lines, telling each progress line on as it comes. */
export async function readLektorLines(body: ReadableStream<Uint8Array>, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let answer: LektorResponse | null = null;
  const take = (line: string): void => {
    if (line.trim() === '') return;
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null) return;
    const { progress, status, reply } = parsed as Record<string, unknown>;
    const told = lektorProgressFrom(progress);
    if (told !== null) onProgress(told);
    if (typeof status === 'number') answer = { status, reply };
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) take(line);
  }
  take(pending);
  if (answer === null) throw new Error('The dev server ended without an answer');
  return answer;
}

/** Answers rather than rejects, as the packaged app's does. */
export async function askThroughDevServer(request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void): Promise<LektorResponse> {
  try {
    const response = await fetch('/lektor-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: stop,
    });
    if (response.body === null) throw new Error(`The dev server answered ${String(response.status)} with nothing`);
    return await readLektorLines(response.body, onProgress);
  } catch (error) {
    if (stop.aborted) return { status: LEKTOR_STOPPED, reply: null };
    console.warn('The dev server gave no answer about the Lektor', error);
    return { status: LEKTOR_UNREACHED, reply: { error: { message: 'No answer from the dev server' } } };
  }
}
