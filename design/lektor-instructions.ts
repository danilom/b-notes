import { type CorrectionRequest, type EarlierReading, LektorServiceError } from './lektor-service.ts';

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

export const SECOND_LOOK_INSTRUCTION = `Ti si pažljiv čitalac koji je već jednom čitao ovaj tekst. Autor ga je u međuvremenu menjao. U jednom ili dva kratka pasusa, obraćajući mu se sa „ti”, reci šta njegove izmene menjaju u tvom utisku. Govori samo o onome što se između dve verzije zaista promenilo i navedi to mesto. Ako je izmena sitna, reci to u jednoj rečenici. Bez opšte hvale. Piši narečjem kojim je tekst pisan.
Vrati samo te pasuse, običnim tekstom, bez naslova i oznaka.`;

/** What he doesn't need to read: rules about the shape of the answer, added to what he does. */
const CORRECTION_RULES = `Zadrži naslov, prelome redova, prazne redove, razmake na početku reda i zvezdice između odeljaka tačno kako jesu. Ne dodaj naslove.
Govor ljudi pod navodnicima ne doteruj: autor namerno piše kako ti ljudi govore. Ispravi tu samo slova kojima nedostaju kukice.
Napomene koje je autor ostavio sam sebi ostavi kako jesu. Ako ne razumeš zašto nešto stoji u tekstu, ostavi ga.
Vrati ceo tekst, samo ispravljen, bez ikakvog komentara i bez oznaka oko njega.`;

/** "Only corrected" and "leave what you don't understand" held even a full rewrite down to a light edit. */
const REWRITE_RULES = `Zadrži naslove, zvezdice između odeljaka i razmake na početku reda tačno kako jesu, i redosled pasusa. Ne dodaj naslove.
Ono što je pod navodnicima prepiši kako jeste: autor namerno piše kako ti ljudi govore. Ispravi tu samo slova kojima nedostaju kukice.
Napomene koje je autor ostavio sam sebi ostavi kako jesu.
Vrati ceo tekst, bez ikakvog komentara i bez oznaka oko njega.`;

/** A corrected text this much shorter has lost something, rather than been corrected. */
const SHORTEST_SHARE_KEPT = 0.6;

export function secondLookInput(text: string, earlier: EarlierReading): string {
  return `Tekst kakav je bio:\n${earlier.text}\n\nTvoj raniji utisak:\n${earlier.comment}\n\nTekst sada:\n${text}`;
}

export function correctionInstruction(request: CorrectionRequest): string {
  const note = request.note.trim() === '' ? '' : `\n\nAutor još kaže: ${request.note.trim()}`;
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
 * Puts his title line back exactly as he wrote it, whatever was asked for and whatever came back:
 * it holds his filing, in marks and spellings no corrector can know the point of. The app does this
 * itself because asking the model hasn't been shown to be enough. If the reply dropped the title
 * rather than changing it, his goes back on top, since replacing the first line would lose a real one.
 */
export function withHisFirstLine(original: string, proposal: string): string {
  const his = FIRST_LINE.exec(original);
  const theirs = FIRST_LINE.exec(proposal);
  if (his === null || theirs === null) return proposal;
  const hisHead = original.slice(0, his.index + his[0].length);
  if (!isSameLine(his[0], theirs[0])) return `${hisHead}\n\n${proposal.trimStart()}`;
  return hisHead + proposal.slice(theirs.index + theirs[0].length);
}

/** A reply that came back much shorter is not offered: already accepted in the review, it would delete his text. */
export function proposalFrom(reply: string, original: string): string {
  const proposal = cleanedProposal(reply, original);
  if (proposal.length < original.length * SHORTEST_SHARE_KEPT) {
    throw new LektorServiceError('cut-off', `${proposal.length} characters back for ${original.length}`);
  }
  return proposal;
}
