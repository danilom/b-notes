export interface ClaudeReply {
  text: string;
  stopReason: string | null;
  explanation: string | null;
  usage: { inputTokens: number; outputTokens: number };
  error: { type: string; message: string } | null;
}

export function readClaudeStream(chunks: AsyncIterable<Uint8Array>): Promise<ClaudeReply>;
