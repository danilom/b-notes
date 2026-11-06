/*
  A rough idea of what the thorough Lektor has cost so far. Not a balance: Anthropic offers
  no way to ask for one, so nothing here claims to know what is left. Counted from each reply's
  tokens, on this computer only. The real figures are on the Console's billing page.
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

/** In his notation, and approximate in so many words. */
export function spentLine(amount: number): string {
  return `potrošeno dosad oko ${amount.toFixed(2).replace('.', ',')} $`;
}
