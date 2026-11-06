/*
  Reads Claude's streamed reply to the end and gives back what the Lektor needs from it.
  Streamed because a whole essay takes minutes to write, which a plain request may not
  survive. The Lektor gets it all at once regardless. Keeps nothing and logs nothing.
*/

export interface ClaudeReply {
  text: string;
  stopReason: string | null;
  explanation: string | null;
  usage: { inputTokens: number; outputTokens: number };
  error: { type: string; message: string } | null;
}

interface StreamEvent {
  type?: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string; stop_reason?: string; stop_details?: { explanation?: string } };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

function applyEvent(event: StreamEvent, reply: ClaudeReply): void {
  if (event.type === 'message_start') {
    reply.usage.inputTokens = event.message?.usage?.input_tokens ?? 0;
  } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    reply.text += event.delta.text ?? '';
  } else if (event.type === 'message_delta') {
    reply.stopReason = event.delta?.stop_reason ?? reply.stopReason;
    reply.explanation = event.delta?.stop_details?.explanation ?? reply.explanation;
    reply.usage.outputTokens = event.usage?.output_tokens ?? reply.usage.outputTokens;
  } else if (event.type === 'error') {
    reply.error = { type: event.error?.type ?? '', message: event.error?.message ?? '' };
  }
}

/**
 * @param chunks The response body: bytes, split wherever the network happened to split them.
 * @returns What it said, why it stopped, what it used, and any error it ended with.
 */
export async function readClaudeStream(chunks: AsyncIterable<Uint8Array>): Promise<ClaudeReply> {
  const reply: ClaudeReply = { text: '', stopReason: null, explanation: null, usage: { inputTokens: 0, outputTokens: 0 }, error: null };
  const decoder = new TextDecoder();
  let pending = '';
  const takeLine = (line: string): void => {
    if (line.startsWith('data:')) applyEvent(JSON.parse(line.slice('data:'.length)) as StreamEvent, reply);
  };
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) takeLine(line.trimEnd());
  }
  takeLine(pending.trimEnd());
  return reply;
}
