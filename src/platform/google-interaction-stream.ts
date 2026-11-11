import type { LektorProgress } from './lektor-progress.ts';
import { jsonOf, readStreamLines, recordOf, textOf } from './server-sent-events.ts';

/*
  Reads Google's streamed `/interactions` reply to the end, reporting as it goes whether the
  request is still queued, has begun, is thinking or is writing. Parsed by each event's own
  `event_type`, as recorded (test/fixtures/lektor-api, spec §16): while queued only keep-alive
  comments come, `interaction.created` says work began, a `thought` step is the thinking (with no
  words to show), and the words come as `step.delta`s of the `model_output` step.
  Keeps nothing and logs nothing.
*/

export interface GoogleStreamReply {
  text: string;
  /** `completed` when it finished; anything else, or nothing, means it was cut off. */
  status: string | null;
  /** The model that ran, as the reply names it. */
  model: string | null;
  usage: unknown;
  /** An error event, which can come mid-stream after minutes in the queue. */
  error: { code: string; message: string } | null;
}

function applyEvent(event: Record<string, unknown>, reply: GoogleStreamReply, report: (progress: LektorProgress) => void): void {
  const type = event['event_type'];
  if (type === 'interaction.created') {
    const model = textOf(recordOf(event['interaction'])?.['model']) ?? '';
    report({ kind: 'started', model });
    return;
  }
  if (type === 'step.start') {
    const step = textOf(recordOf(event['step'])?.['type']);
    if (step === 'thought') report({ kind: 'thinking' });
    if (step === 'model_output') report({ kind: 'writing', characters: reply.text.length });
    return;
  }
  if (type === 'step.delta') {
    const delta = recordOf(event['delta']);
    const text = textOf(delta?.['text']);
    if (delta?.['type'] === 'text' && text !== null) {
      reply.text += text;
      report({ kind: 'writing', characters: reply.text.length });
    }
    return;
  }
  if (type === 'interaction.completed') {
    // Inside `interaction`, as `interaction.created` has its model, not beside `event_type`.
    const interaction = recordOf(event['interaction']);
    reply.status = textOf(interaction?.['status']);
    reply.model = textOf(interaction?.['model']) ?? reply.model;
    reply.usage = interaction?.['usage'] ?? null;
    return;
  }
  if (type === 'error') {
    const error = recordOf(event['error']);
    reply.error = { code: textOf(error?.['code']) ?? '', message: textOf(error?.['message']) ?? '' };
  }
}

/**
 * @param chunks The response body, split wherever the network split it.
 * @param onProgress Told each change; `started` comes at most once.
 */
export async function readGoogleStream(chunks: AsyncIterable<Uint8Array>, onProgress: (progress: LektorProgress) => void): Promise<GoogleStreamReply> {
  const reply: GoogleStreamReply = { text: '', status: null, model: null, usage: null, error: null };
  let hasStarted = false;
  const report = (progress: LektorProgress): void => {
    if (progress.kind === 'started') {
      if (hasStarted) return;
      hasStarted = true;
      reply.model = progress.model === '' ? reply.model : progress.model;
    }
    onProgress(progress);
  };
  await readStreamLines(chunks, (line) => {
    if (line.kind !== 'data') return;
    const event = jsonOf(line.data);
    if (event !== null) applyEvent(event, reply, report);
  });
  return reply;
}
