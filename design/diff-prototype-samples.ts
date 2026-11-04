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

/**
 * Each pair is one kind of edit a proofreader makes, rather than a realistic
 * essay, so that when one reads badly it is plain which kind that was.
 */
export const DIFF_SAMPLES: readonly DiffSample[] = [
  {
    name: 'One sentence reworded',
    current: [ROADS, WINTER, LETTER].join('\n\n'),
    proposed: [
      ROADS,
      'Te zime snijeg je pao neobično rano i zadržao se do kraja marta, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      LETTER,
    ].join('\n\n'),
  },
  {
    name: 'Commas and typos',
    current: [
      ROADS,
      'Majka je cuvala svako pismo u kutiji ispod kreveta i nijedno nije bacila cak ni ona koja su donosila lose vijesti.',
      HOUSE,
    ].join('\n\n'),
    proposed: [ROADS, LETTER, HOUSE].join('\n\n'),
  },
  {
    name: 'Two neighbouring paragraphs edited',
    current: [ROADS, WINTER, LETTER, HOUSE].join('\n\n'),
    proposed: [
      ROADS,
      'Te zime snijeg je pao rano i ostao do kraja aprila, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      'Majka je čuvala svako pismo u drvenoj kutiji ispod kreveta, i nijedno nije bacila, čak ni ona koja su donosila loše vijesti.',
      HOUSE,
    ].join('\n\n'),
  },
  {
    name: 'Every paragraph edited',
    current: [WINTER, LETTER].join('\n\n'),
    proposed: [
      'Te zime snijeg je pao rano i ostao do kraja aprila, pa su djeca išla u školu preko zaleđene rijeke, ne pitajući nikoga.',
      'Majka je čuvala svako pismo u drvenoj kutiji ispod kreveta, i nijedno nije bacila, čak ni ona koja su donosila loše vijesti.',
    ].join('\n\n'),
  },
  {
    name: 'One unbroken block, one word changed',
    current: `${ROADS} ${WINTER} ${LETTER}`,
    proposed: `${ROADS} ${WINTER.replace('marta', 'aprila')} ${LETTER}`,
  },
  {
    name: 'Spaces only',
    current: [ROADS, WINTER.replace('snijeg je', 'snijeg  je'), LETTER].join('\n\n'),
    proposed: [ROADS, WINTER, LETTER].join('\n\n'),
  },
  {
    name: 'Short paragraph changed',
    current: [ROADS, 'Niko nije došao.', LETTER].join('\n\n'),
    proposed: [ROADS, 'Niko nije stigao.', LETTER].join('\n\n'),
  },
  {
    name: 'Paragraph moved',
    current: [ROADS, WINTER, LETTER, HOUSE].join('\n\n'),
    proposed: [ROADS, LETTER, HOUSE, WINTER].join('\n\n'),
  },
  {
    name: 'Paragraph split in two',
    current: [HOUSE, `${ROADS} ${WINTER}`, LETTER].join('\n\n'),
    proposed: [HOUSE, ROADS, WINTER, LETTER].join('\n\n'),
  },
  {
    name: 'Line breaks inside a paragraph',
    current: [ROADS, 'Prvo treba promijeniti naslov i prvu rečenicu\nzatim skratiti treći dio cijelog teksta\npa onda poslati uredniku', LETTER].join('\n\n'),
    proposed: [ROADS, 'Prvo treba promijeniti naslov i prvu rečenicu\nzatim skratiti cijeli treći dio teksta\nzatim sve pročitati\npa onda poslati uredniku', LETTER].join('\n\n'),
  },
  {
    name: 'A paragraph added and one removed',
    current: [ROADS, WINTER, HOUSE].join('\n\n'),
    proposed: [ROADS, LETTER, WINTER].join('\n\n'),
  },
  {
    name: 'A long paragraph removed',
    current: [ROADS, `${WINTER} ${LETTER} ${HOUSE}`, LETTER].join('\n\n'),
    proposed: [ROADS, LETTER].join('\n\n'),
  },
  { name: 'Long text, so it scrolls', ...longPair() },
  { name: 'Empty', current: '', proposed: '' },
];
