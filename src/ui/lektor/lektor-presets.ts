import type { PresetId } from './lektor-service.ts';

/**
 * What each kind of correction tells the AI, which he also reads on the screen, exactly as sent.
 *
 * In English, because it fades less: asked in Serbian to rework a whole essay, Gemini reworked the
 * opening and copied out the rest in each run. In English it mostly carries through to the end,
 * though not always: about one run in five still fades. Telling it not to pad made it timid
 * throughout, so that line is gone, at the price of an occasional run that comes back longer.
 */
export const PRESET_PROMPTS: Readonly<Record<PresetId, string>> = {
  letters:
    'Fix letters missing their diacritics, typos, commas, spaces and line breaks. Do not change the words. The author writes exactly like this on purpose, even where a sentence seems unusual. Keep the dialect the text is written in.',
  grammar:
    'Fix letters, commas and spaces, and the grammar. Where a sentence is hard to follow or stumbles, rearrange it so it is clear, using as many of the author\'s words as possible. Leave alone what is fine. Keep the author\'s voice and the dialect the text is written in.',
  wording:
    'Fix mistakes and grammar, then edit the text as a good editor would: split overlong sentences, remove repetition and needless words, and find a better word where one is vague or clumsy. Do not hold back: the changes should show in every paragraph, through to the end of the text. Add nothing the author did not say. Keep his voice and the dialect the text is written in.',
  // Deliberately too much: next to this one, the one above looks about right.
  rewrite:
    'Rewrite this text boldly, as a writer retelling it in their own hand. Do not hesitate to change any sentence: its order, rhythm, images and choice of words; join and split sentences, and feel free to go further than necessary, because the author will choose what they like. Work equally boldly through the entire text, up to the last paragraph, not only at the beginning. Keep the author\'s main ideas, facts and names, and the dialect the text is written in. Do not invent events. The length may change, but not by much.',
};

export const PRESET_ORDER: readonly PresetId[] = ['letters', 'grammar', 'wording', 'rewrite'];
