import { filingFrontOf } from '../../notes/title-marks.ts';
import { type CorrectionRequest, LektorServiceError } from './lektor-service.ts';

/*
  What the Lektor asks, the same whichever AI is asked, so that any difference between
  them is theirs and not the wording's.
*/

export const FEEDBACK_INSTRUCTION = `Ti si pažljiv čitalac ovog teksta, a ne učitelj. Napiši autoru svoj utisak u najviše tri kratka pasusa, obraćajući mu se sa „ti”.

U prvom reci šta ti je ostalo i zašto, i navedi jedno konkretno mesto iz teksta, kratkim navodom.
U drugom reci gde si zastao ili želeo nešto više, i opet navedi to mesto.
U trećem reci nešto o celini.

Bez opšte hvale, bez ocena i bez spiska saveta. Ne izmišljaj lično iskustvo. Ako nisi siguran u neku činjenicu, nemoj je tvrditi. Piši narečjem kojim je tekst pisan.
Vrati samo te pasuse, običnim tekstom, bez naslova i oznaka.`;

/** What he doesn't need to read: rules about the shape of the answer, added to what he does. */
const CORRECTION_RULES = `Write in Serbian, in the alphabet the text uses. Keep the title, line breaks, blank lines, the spaces at the start of lines and the asterisks between sections exactly as they are, unless that is where a mistake lies. Do not add headings.
Keep quotation marks and dashes in the form the author typed them.
Do not polish people's speech in quotation marks: the author deliberately writes how those people speak. Only fix letters missing their diacritics there.
Leave notes the author left for himself as they are. If you do not understand why something is in the text, leave it.
Return the whole text, only corrected, with no comment and no markers around it.`;

/** "Only corrected" and "leave what you don't understand" held even a full rewrite down to a light edit. */
const REWRITE_RULES = `Write in Serbian, in the alphabet the text uses. Keep headings, the asterisks between sections, the spaces at the start of lines, and the order of the paragraphs exactly as they are. Do not add headings.
Copy what is in quotation marks as it is: the author deliberately writes how those people speak. Only fix letters missing their diacritics there.
Leave notes the author left for himself as they are.
Return the whole text, with no comment and no markers around it.`;

/** A corrected text this much shorter has lost something, rather than been corrected. */
const SHORTEST_SHARE_KEPT = 0.6;

export function correctionInstruction(request: CorrectionRequest): string {
  const note = request.note.trim() === '' ? '' : `\n\nThe author adds (in his own words): ${request.note.trim()}`;
  const rules = request.preset === 'rewrite' ? REWRITE_RULES : CORRECTION_RULES;
  return `${request.instruction}${note}\n\n${rules}`;
}

/** Whatever it wrapped the text in, and an ending that matches his. */
function cleanedProposal(reply: string, original: string): string {
  const unfenced = reply.replace(/^\s*```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  const body = unfenced.replace(/\s+$/, '');
  const ending = /\s*$/.exec(original)?.[0] ?? '';
  return body + ending;
}

const FIRST_LINE = /^[ \t]*\S.*$/m;
const SHARE_OF_WORDS_FOR_SAME_LINE = 0.5;

function wordsOfLine(line: string): string[] {
  const plain = line.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'dj').toLowerCase();
  return plain.match(/\p{L}+|\p{N}+/gu) ?? [];
}

/** Whether a line is his line, corrected, rather than something the reply put in its place. */
function isSameLine(his: string, theirs: string): boolean {
  const hisWords = wordsOfLine(his);
  if (hisWords.length === 0) return wordsOfLine(theirs).length === 0;
  const theirWords = new Set(wordsOfLine(theirs));
  return hisWords.filter((word) => theirWords.has(word)).length / hisWords.length >= SHARE_OF_WORDS_FOR_SAME_LINE;
}

/**
 * Puts back the part of his title that files the text, whatever came back: the spaces and marks
 * mean nothing to a corrector, and the app does this itself because asking hasn't been shown to be
 * enough. The words after them are the corrector's to change, in the review like any others.
 * If the reply dropped the title and started with what comes after it, his whole line goes back
 * on top, since treating the reply's first line as a title would lose a real line of the text.
 */
export function withHisFilingMarks(original: string, proposal: string): string {
  const his = FIRST_LINE.exec(original);
  const theirs = FIRST_LINE.exec(proposal);
  if (his === null || theirs === null) return proposal;
  const hisEnd = his.index + his[0].length;
  const hisNextLine = FIRST_LINE.exec(original.slice(hisEnd))?.[0];
  const droppedTitle = !isSameLine(his[0], theirs[0]) && hisNextLine !== undefined && isSameLine(hisNextLine, theirs[0]);
  if (droppedTitle) return `${original.slice(0, hisEnd)}\n\n${proposal.trimStart()}`;
  const theirWords = theirs[0].slice(filingFrontOf(theirs[0]).length);
  return original.slice(0, his.index) + filingFrontOf(his[0]) + theirWords + proposal.slice(theirs.index + theirs[0].length);
}

const SERBIAN_CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm',
  н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

function latinLetterOf(letter: string): string {
  const lower = letter.toLowerCase();
  const latin = SERBIAN_CYRILLIC_TO_LATIN[lower];
  if (latin === undefined) return letter;
  return letter === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
}

/**
 * Claude now and then writes a Cyrillic letter inside a Latin word, even when told not to. It looks
 * the same on screen, so no review would catch it, and his search would never find that word again.
 * A text that has Cyrillic of its own is left alone: there, the letters may be meant.
 */
function withoutStrayCyrillic(proposal: string, original: string): string {
  if (/\p{Script=Cyrillic}/u.test(original)) return proposal;
  return proposal.replace(/\p{Script=Cyrillic}/gu, latinLetterOf);
}

/** A reply that came back much shorter is not offered: already accepted in the review, it would delete his text. */
export function proposalFrom(reply: string, original: string): string {
  const proposal = withoutStrayCyrillic(cleanedProposal(reply, original), original);
  if (proposal.length < original.length * SHORTEST_SHARE_KEPT) {
    throw new LektorServiceError('cut-off', `${proposal.length} characters back for ${original.length}`);
  }
  return proposal;
}
