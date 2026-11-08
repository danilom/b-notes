export interface DiffSample {
  /** What the pair is there to show. */
  name: string;
  current: string;
  proposed: string;
}

const isDiffSample = (value: unknown): value is DiffSample =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'current' in value &&
  typeof value.current === 'string' &&
  'proposed' in value &&
  typeof value.proposed === 'string';

/**
 * His real texts, where the server has any. They are kept out of the repository, so
 * a checkout may well have none, and a page goes on with the invented ones.
 */
export async function fetchRealSamples(): Promise<DiffSample[]> {
  try {
    const response = await fetch('/diff-samples.json');
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
    const received: unknown = await response.json();
    if (!Array.isArray(received)) throw new Error('The samples are not a list');
    return received.filter(isDiffSample);
  } catch (error) {
    console.error('Could not load the real samples', error);
    return [];
  }
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
const QUIET_BETWEEN = 'Selo ju je brzo zaboravilo.';

/**
 * A long paragraph, and the same told again in other words, as a Dubinska prerada does.
 * Sharing no phrase longer than a word or two, so that it is one change and not several.
 */
const LONG_BEFORE =
  'Godinama kasnije, kad je već i Marko bio pokojni, a djeca iz sela odrasla i razišla se po svijetu, neko je u kuću ponovo unio namještaj. Ljudi su govorili da je to njen unuk, koji je došao iz grada da vidi gdje je baka provela onu jednu zimu, ali niko to nije znao pouzdano, jer nije razgovarao ni sa kim i izlazio je samo uveče, kad su sokaci bili prazni. Jedne noći u prozoru se opet upalilo svjetlo, i stari ljudi su se prekrstili.';
const LONG_AFTER =
  'Prošlo je mnogo godina. Marko je umro, djeca su odrasla i otišla, a u napuštenu kuću jednog dana neko je donio stolove, krevete i ormar. Po selu se pričalo da je stigao njen unuk sa strane, željan da upozna mjesto na kojem je njegova baka prezimila, ali to niko nije mogao potvrditi: ni sa kim nije progovorio, a napolje je izlazio tek po mraku, kad bi se ulice ispraznile. Kad je jedne noći u prozoru ponovo zasvijetlilo, starci su se krstili.';

/**
 * Every kind of change the review has to draw, each once and far enough from the others
 * not to be merged with them, for judging how each one looks and answers: some are rare
 * in a real reply and easy to miss there.
 */
const EVERY_CASE: DiffSample = {
  name: 'Svi slučajevi: naslov, dodato, obrisano, prepisano, slova, zarezi, spojeni i podeljeni pasusi, dugačka izmena',
  current: [
    'Kuća na kraju sela',
    // A missing mark, a missing comma, and a word replaced.
    'Kuca na kraju sela stajala je prazna godinama. Prozori su uvijek bili čisti i niko nije znao ko ih pere.',
    // Only added: words at the end of a sentence.
    'Djeca su prolazila pored nje svakog jutra.',
    // Only removed: words in the middle of a sentence.
    'Stari Marko je tvrdio, onako kako je on to umio, da tamo noću gori svijeća.',
    // A whole sentence written anew.
    'Niko mu nije vjerovao jer je Marko volio da priča i ono što nije vidio, a često i ono što se nikad nije ni dogodilo.',
    // Two paragraphs that become one.
    'Jedne zime vrata su se otvorila.',
    'Na pragu je stajala žena u crnom kaputu.',
    // One paragraph that becomes two.
    'Niko je nije pitao odakle dolazi. Ona je ostala do proljeća.',
    // A whole paragraph taken out.
    'Tog proljeća rijeka je nabujala kao nikad prije.',
    // One short word for another.
    'Kad je otišla, kuća je opet ostala prazna i tiha.',
    // Unchanged, so that the paragraph put in above stays apart from the one below.
    QUIET_BETWEEN,
    // A long paragraph written anew from start to end: one change, and a long one.
    LONG_BEFORE,
  ].join('\n\n'),
  proposed: [
    // Only added, on the title line, where the bar has least room.
    'Kuća na samom kraju sela',
    'Kuća na kraju sela stajala je prazna godinama. Prozori su uvijek bili čisti, i niko nije znao ko ih održava.',
    'Djeca su prolazila pored nje svakog jutra, ne gledajući u dvorište.',
    'Stari Marko je tvrdio da tamo noću gori svijeća.',
    'Selo ga je slušalo s osmijehom, jer je dobro poznavalo njegovu ljubav prema pričama ljepšim od istine.',
    'Jedne zime vrata su se otvorila. Na pragu je stajala žena u crnom kaputu.',
    'Niko je nije pitao odakle dolazi.',
    'Ona je ostala do proljeća.',
    'Kad je otišla, kuća je opet ostala prazna a tiha.',
    // A whole paragraph put in.
    'Ali prozori su i dalje bili čisti.',
    QUIET_BETWEEN,
    LONG_AFTER,
  ].join('\n\n'),
};

export const DIFF_SAMPLES: readonly DiffSample[] = [
  EVERY_CASE,
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
