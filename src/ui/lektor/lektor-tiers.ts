import type { Choice, Work } from './lektor-service.ts';

/*
  The three Lektors he can meet (spec §2, §3): Besplatni „Flash” on Google's free tier, and
  through OpenRouter Plaćeni „Flash” and Plaćeni „Opus”. He chooses only free or paid; which paid
  model runs follows from the work, and who made a result follows from the model that actually ran.
*/

export type Tier = 'free' | 'paid-flash' | 'paid-opus';

export const FREE_FIRST = 'gemini-3.8-flash';
/** Free 3.6, standing in for 3.8 where the work allows it. Silently: he's never told which ran. */
export const FREE_STAND_IN = 'gemini-3.6-flash';
export const PAID_FLASH = 'google/gemini-3.8-flash';
export const PAID_OPUS = 'anthropic/claude-opus-5.5';

/**
 * The utisak and the light corrections may fall back from 3.8 to 3.6. Stilska and Dubinska don't:
 * on those, 3.6 loses his voice.
 */
export const fallsBack = (work: Work): boolean => work === 'comment' || work === 'letters' || work === 'grammar';

/** Paid: Opus where it writes better, Flash where both write alike and paying buys only not queuing. */
export const paidModelFor = (work: Work): string => (work === 'letters' || work === 'grammar' ? PAID_FLASH : PAID_OPUS);

/** The free models a request is asked of, in order. */
export const freeModelsFor = (work: Work): readonly string[] => (fallsBack(work) ? [FREE_FIRST, FREE_STAND_IN] : [FREE_FIRST]);

/**
 * Who made a result, by the model that ran: a handed-on utisak was Plaćeni „Flash”. Also reads
 * what older versions kept: `free` (Gemini direct) and `thorough` (Opus direct).
 */
export function tierOfModel(model: string): Tier | null {
  if (model.startsWith('anthropic/') || model.startsWith('claude') || model === 'thorough') return 'paid-opus';
  if (model.startsWith('google/')) return 'paid-flash';
  if (model.startsWith('gemini') || model === 'free') return 'free';
  return null;
}

export const choiceOfTier = (tier: Tier): Choice => (tier === 'free' ? 'free' : 'paid');
