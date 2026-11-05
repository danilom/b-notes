/*
  What is left of the money paid in for the thorough Lektor. Only ever an estimate: Anthropic
  offers no way to ask for a balance, so this starts from what was paid in and takes off what
  each reply is worth by its token counts. The real figure is on the Console's billing page.
*/

/** Dollars per token for Claude Opus 5.5, at the list price of October 2026. */
const INPUT_COST = 4 / 1_000_000;
const OUTPUT_COST = 20 / 1_000_000;

export interface TokensUsed {
  inputTokens: number;
  /** Includes its thinking, which is billed though never shown. */
  outputTokens: number;
}

export function costOfReply({ inputTokens, outputTokens }: TokensUsed): number {
  return inputTokens * INPUT_COST + outputTokens * OUTPUT_COST;
}

/** Never below nothing: the estimate may run ahead of the real balance, and a debt he doesn't have would alarm him. */
export function creditAfter(before: number, cost: number): number {
  return Math.max(0, before - cost);
}

/** In his notation, and approximate in so many words. */
export function creditLine(amount: number): string {
  return `preostalo oko ${amount.toFixed(2).replace('.', ',')} $`;
}

/** What was typed as the amount paid in, comma or point, or null if that isn't an amount. */
export function creditTyped(typed: string): number | null {
  const amount = Number(typed.trim().replace(/\s*\$$/, '').replace(',', '.'));
  return typed.trim() === '' || !Number.isFinite(amount) || amount < 0 ? null : amount;
}
