export interface DiffSample {
  /** What the pair is there to show. */
  name: string;
  current: string;
  proposed: string;
}

const ROADS =
  'Put do starog mosta vodio je kroz šumu, a djed je govorio da ga pamti još iz vremena kad su tuda prolazili vozovi.';
const WINTER =
  'Te zime snijeg je pao rano i ostao do kraja marta, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.';
const LETTER =
  'Majka je čuvala svako pismo u kutiji ispod kreveta, i nijedno nije bacila, čak ni ona koja su donosila loše vijesti.';
const HOUSE =
  'Kuća na kraju sela stajala je prazna godinama, ali su prozori uvijek bili čisti, i niko nije znao ko ih pere.';

/** Long enough to scroll, with a word changed in every seventh paragraph. */
function longPair(): Pick<DiffSample, 'current' | 'proposed'> {
  const sentences = [ROADS, WINTER, LETTER, HOUSE];
  const paragraphs = Array.from(
    { length: 42 },
    (_, at) => `${at + 1}. ${sentences[at % sentences.length] ?? ''}`,
  );
  const edited = paragraphs.map((paragraph, at) =>
    at % 7 === 3 ? paragraph.replace(/ i | a /, ' pa ') : paragraph,
  );
  return { current: paragraphs.join('\n\n'), proposed: edited.join('\n\n') };
}

const WITHOUT_DIACRITICS = new Map([
  ['š', 's'],
  ['đ', 'd'],
  ['ž', 'z'],
  ['č', 'c'],
  ['ć', 'c'],
  ['Š', 'S'],
  ['Đ', 'D'],
  ['Ž', 'Z'],
  ['Č', 'C'],
  ['Ć', 'C'],
]);

const withoutDiacritics = (text: string): string =>
  text.replace(/[šđžčćŠĐŽČĆ]/g, (letter) => WITHOUT_DIACRITICS.get(letter) ?? letter);

/** Double spaces every so many words, and a line broken in the middle of some. */
function untidySpacing(paragraph: string, at: number): string {
  const words = paragraph.split(' ');
  return words
    .map((word, index) => {
      if (at % 3 === 0 && index === 9) return `${word}\n`;
      return word + (index === words.length - 1 ? '' : index % 7 === 3 ? '  ' : ' ');
    })
    .join('');
}

/**
 * What a proofreader would make of a long text typed his way: diacritics dropped,
 * spacing and line breaks untidy, and only here and there a change of wording.
 */
function untidyPair(): Pick<DiffSample, 'current' | 'proposed'> {
  const sentences = [ROADS, WINTER, LETTER, HOUSE];
  const clean = Array.from(
    { length: 120 },
    (_, at) => `${at + 1}. ${sentences[at % sentences.length] ?? ''} ${sentences[(at + 1) % sentences.length] ?? ''}`,
  );

  const reworded = (paragraph: string, at: number): string =>
    at % 37 === 20 ? paragraph.replace('djed je govorio', 'stari je pričao').replace('prazna godinama', 'pusta decenijama') : paragraph;

  const untidy = clean.map((paragraph, at) => withoutDiacritics(untidySpacing(paragraph, at)));
  const breaks = untidy.map((paragraph, at) => paragraph + (at % 5 === 4 ? '  \n\n\n' : '\n\n'));

  return { current: breaks.join('').trimEnd(), proposed: clean.map(reworded).join('\n\n') };
}

/**
 * Each pair is one kind of edit a proofreader makes, rather than a realistic
 * essay, so that when one reads badly it is plain which kind that was.
 */
export const DIFF_SAMPLES: readonly DiffSample[] = [
  {
    name: 'Jedna rečenica preformulisana',
    current: [ROADS, WINTER, LETTER].join('\n\n'),
    proposed: [
      ROADS,
      'Te zime snijeg je pao neobično rano i zadržao se do kraja marta, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      LETTER,
    ].join('\n\n'),
  },
  {
    name: 'Zarezi i slovne greške',
    current: [
      ROADS,
      'Majka je cuvala svako pismo u kutiji ispod kreveta i nijedno nije bacila cak ni ona koja su donosila lose vijesti.',
      HOUSE,
    ].join('\n\n'),
    proposed: [ROADS, LETTER, HOUSE].join('\n\n'),
  },
  {
    name: 'Izmenjena dva susedna pasusa',
    current: [ROADS, WINTER, LETTER, HOUSE].join('\n\n'),
    proposed: [
      ROADS,
      'Te zime snijeg je pao rano i ostao do kraja aprila, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      'Majka je čuvala svako pismo u drvenoj kutiji ispod kreveta, i nijedno nije bacila, čak ni ona koja su donosila loše vijesti.',
      HOUSE,
    ].join('\n\n'),
  },
  {
    name: 'Izmenjen svaki pasus',
    current: [WINTER, LETTER].join('\n\n'),
    proposed: [
      'Te zime snijeg je pao rano i ostao do kraja aprila, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      'Majka je čuvala svako pismo u drvenoj kutiji ispod kreveta, i nijedno nije bacila, čak ni ona koja su donosila loše vijesti.',
    ].join('\n\n'),
  },
  {
    name: 'Jedan neprekinut blok, izmenjena jedna reč',
    current: `${ROADS} ${WINTER} ${LETTER}`,
    proposed: `${ROADS} ${WINTER.replace('marta', 'aprila')} ${LETTER}`,
  },
  {
    name: 'Samo razmaci',
    current: [ROADS, WINTER.replace('snijeg je', 'snijeg  je'), LETTER].join('\n\n'),
    proposed: [ROADS, WINTER, LETTER].join('\n\n'),
  },
  {
    name: 'Izmenjen kratak pasus',
    current: [ROADS, 'Niko nije došao.', LETTER].join('\n\n'),
    proposed: [ROADS, 'Niko nije stigao.', LETTER].join('\n\n'),
  },
  {
    name: 'Premešten pasus',
    current: [ROADS, WINTER, LETTER, HOUSE].join('\n\n'),
    proposed: [ROADS, LETTER, HOUSE, WINTER].join('\n\n'),
  },
  {
    name: 'Pasus podeljen na dva',
    current: [HOUSE, `${ROADS} ${WINTER}`, LETTER].join('\n\n'),
    proposed: [HOUSE, ROADS, WINTER, LETTER].join('\n\n'),
  },
  {
    name: 'Prelomi redova unutar pasusa',
    current: [ROADS, 'Prvo treba promijeniti naslov i prvu rečenicu\nzatim skratiti treći dio cijelog teksta\npa onda poslati uredniku', LETTER].join('\n\n'),
    proposed: [ROADS, 'Prvo treba promijeniti naslov i prvu rečenicu\nzatim skratiti cijeli treći dio teksta\nzatim sve pročitati\npa onda poslati uredniku', LETTER].join('\n\n'),
  },
  {
    name: 'Jedan pasus dodat, drugi uklonjen',
    current: [ROADS, WINTER, HOUSE].join('\n\n'),
    proposed: [ROADS, LETTER, WINTER].join('\n\n'),
  },
  {
    name: 'Uklonjen dugačak pasus',
    current: [ROADS, `${WINTER} ${LETTER} ${HOUSE}`, LETTER].join('\n\n'),
    proposed: [ROADS, LETTER].join('\n\n'),
  },
  {
    name: 'Prepisan ceo pasus',
    current: [ROADS, WINTER, LETTER].join('\n\n'),
    proposed: [
      ROADS,
      'Zima je te godine stigla prije vremena, snijeg se nije topio sve do marta, a djeca su do škole hodala po ledu.',
      LETTER,
    ].join('\n\n'),
  },
  {
    name: 'Sasvim drugi tekst',
    current: [ROADS, WINTER].join('\n\n'),
    proposed: [LETTER, HOUSE].join('\n\n'),
  },
  { name: 'Dugačak tekst, pomera se', ...longPair() },
  { name: 'Dugačak neuredan tekst: razmaci, prelomi, slova bez kukica', ...untidyPair() },
  {
    // Some right and one wrong: `pas` should not have become `paš`. Nothing can tell
    // which, so they all look the same, and he has to be able to read each.
    name: 'Dvosmislene kukice',
    current: [
      'Sto si dosao tako kasno? Na stolu je bilo sto casa i niko ih nije brojao.',
      'Kuca je stajala na kraju sela. Neko kuca na vrata, a niko ne otvara.',
      'Nas pas je lajao cijelu noc, pa se niko u selu nije naspavao.',
    ].join('\n\n'),
    proposed: [
      'Što si došao tako kasno? Na stolu je bilo sto čaša i niko ih nije brojao.',
      'Kuća je stajala na kraju sela. Neko kuca na vrata, a niko ne otvara.',
      'Naš paš je lajao cijelu noć, pa se niko u selu nije naspavao.',
    ].join('\n\n'),
  },
  { name: 'Prazno', current: '', proposed: '' },
];
