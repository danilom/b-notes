export type Language = 'sr' | 'en';

/**
 * Every word he reads lives here.
 *
 * Serbian first — it's what he writes in. Two rules the strings must hold to:
 *
 * - The direct singular imperative, never the polite plural: *Obriši*, not
 *   *Obrišite*. The app is talking to one person it knows.
 * - Ekavian, not ijekavian: *pre*, not *prije*. He writes ijekavian, so this
 *   isn't his own dialect — it's chosen because ekavian is consistently
 *   shorter, and these strings sit in a narrow column beside his titles. Both
 *   read as ordinary Serbian to him; only the width differs.
 */
const TEXT = {
  sr: {
    newNote: 'Novi tekst',
    appearance: 'Izgled',
    appearanceKeep: 'U redu',
    appearanceCancel: 'Otkaži',
    appearanceClose: 'Zatvori',
    appearanceWriting: 'Tvoj tekst',
    appearanceApp: 'Aplikacija',
    appearanceFont: 'Font',
    appearanceSize: 'Veličina',
    appearanceTextSize: 'Veličina teksta',
    appearanceColour: 'Boja',
    appearanceMode: 'Pozadina',
    appearanceReset: 'Vrati na početno',
    appearanceSmaller: 'Manje',
    appearanceLarger: 'Veće',
    modeNames: { light: 'Svetla', dark: 'Tamna' },
    accentNames: {
      blue: 'Plava',
      teal: 'Tirkizna',
      green: 'Zelena',
      gold: 'Zlatna',
      red: 'Crvena',
      violet: 'Ljubičasta',
    },
    searchLabel: 'Traži',
    searchPlaceholder: 'Traži po svemu napisanom',
    clearSearch: 'Poništi traženje',
    sectionFound: 'Pronađeni',
    sectionRecent: 'Nedavni',
    sectionAll: 'Svi tekstovi',
    nothingFound: 'Ništa nije pronađeno',
    noNotesYet: 'Još nema tekstova',
    untitled: 'Bez naslova',
    untitledNew: 'Novi tekst — bez naslova',
    foundAt: (at: number, total: number) => `${at} od ${total}`,
    foundOnce: 'samo jednom',
    foundPrevious: 'Prethodni',
    foundNext: 'Sledeći',
    savedAgo: (when: string) => `Sačuvano ${when}`,
    saving: 'Čuvam…',
    notSaved: 'Nije sačuvano',
    minutesAgo: (n: number) => `pre ${n} ${plural(n, 'minut', 'minuta', 'minuta')}`,
    hoursAgo: (n: number) => `pre ${n} ${plural(n, 'sat', 'sata', 'sati')}`,
    yesterday: 'juče',
    dayAndMonth: (date: Date) => `${date.getDate()}. ${MONTHS_SR[date.getMonth()]}`,
    year: (date: Date) => String(date.getFullYear()),
    noteCount: (n: number) => `${n} ${plural(n, 'tekst', 'teksta', 'tekstova')}`,

    deleteNote: 'Obriši tekst',
    deleteTitle: 'Obriši tekst',
    deleteBody: 'Ovaj tekst se sklanja među obrisane. Možeš ga vratiti kad god hoćeš.',
    deleteEmptyBody: 'U ovom tekstu nema ništa.',
    deleteKeep: 'Obriši',
    cancel: 'Otkaži',
    close: 'Zatvori',

    deleted: 'Obrisani tekstovi',
    deletedKept: 'Izaberi tekst da vidiš šta je u njemu, pa ga vrati ako želiš.',
    deletedSee: 'Vidi',
    deletedPreview: 'Pregled',
    deletedPreviewHelp: 'Ovde možeš samo da čitaš. Vrati tekst ako hoćeš da ga menjaš.',
    deletedEmpty: 'U ovom tekstu nema ništa.',
    // Lower case, like the times in his list beside it: juce, pre 5 minuta.
    deletedWhen: (when: string) => `obrisano ${when}`,
    /*
      What is kept beside it, not a claim about what he is reading: the file
      matches the newest version only when he emptied the text before deleting
      it, and not when he emptied it, wrote something else and deleted that. So
      no "jos" — with a text he emptied, the copy kept of it is word for word
      what is on the screen, and calling it one more would be a small lie.

      The verb is counted too, not only the thing: one version exists, two
      versions exist, five of them exists again.
    */
    deletedVersions: (n: number) =>
      `${plural(n, 'Postoji', 'Postoje', 'Postoji')} ${n} ` +
      `${plural(n, 'ranija verzija', 'ranije verzije', 'ranijih verzija')} ovog teksta.`,
    deletedMatching: (n: number, query: string) =>
      `${n} ${plural(n, 'obrisan tekst sadrži', 'obrisana teksta sadrže', 'obrisanih tekstova sadrži')} „${query}“`,
    showAll: 'Prikaži sve',
    restore: 'Vrati među tekstove',
    deletedBack: 'Nazad na obrisane',
    destroy: 'Uništi zauvek',
    destroyTitle: 'Uništi zauvek',
    destroyBody: 'Ovaj tekst se uništava zauvek. Ne može se vratiti.',
    destroyBodyWithVersions:
      'Ovaj tekst se uništava zauvek, zajedno sa svim ranijim verzijama. Ne može se vratiti.',
    /*
      `{}` is where each spelling goes, marked out in the accent so he can see
      what to copy without quotes around it. Both are offered so he is not
      hunting the keyboard for a letter he may not know how to reach; anything
      he types is folded before it is compared, so either one does.
    */
    destroyPrompt: 'Ukucaj {} ili {} da potvrdiš.',
    destroyWord: 'uništi',
    destroyWordPlain: 'unisti',
    restored: 'Tekst je vraćen',
    notDeleted: 'Tekst nije obrisan',
    notRestored: 'Tekst nije vraćen',
    notDestroyed: 'Tekst nije uništen',

    versions: 'Ranije verzije',
    versionsTitle: 'Ranije verzije',
    versionsNote: 'Ovako je tekst izgledao ranije. Izaberi kad, pa ga vrati ako hoćeš.',
    versionTitle: 'Ranija verzija',
    // The heading names the text, like every other dialog's. When it was
    // taken moves here, where it has room to be a sentence.
    versionWhen: (when: string) => `Ovako je izgledao ${when}.`,
    // Two numbers, because they answer two different questions. How long it
    // was tells him whether this is the essay he remembers; how it compares to
    // what he has now tells him whether opening it would get anything back.
    versionSize: (words: number, difference: number) => {
      const count = `${words.toLocaleString('sr-RS')} ${plural(words, 'reč', 'reči', 'reči')}`;
      // The same count says nothing about whether it is the same writing, and
      // the two lines under it are about to say what changed. A number that
      // only means "no answer here" is worse than no number.
      if (difference === 0) return count;
      const by = Math.abs(difference).toLocaleString('sr-RS');
      return `${count} (${by} ${difference > 0 ? 'više' : 'manje'} nego sada)`;
    },
    // "Aktivni tekst", never "tvoj tekst" and never "sadašnji tekst".
    //
    // Active in the sense that it is the one he can write in: a version is
    // read-only, which the dialog already says without words — no caret,
    // nothing to type into. The word names that difference rather than merely
    // pointing at whichever text is on screen.
    //
    // "Tvoj" distinguishes nothing, since every text in the app is his.
    // "Sadašnji" names a moment rather than a role, so it stops working the
    // moment one is replaced: "prethodni aktivni tekst" reads, "prethodni
    // sadašnji tekst" does not.
    // Only ever on a copy that opened differently from the way the text opens
    // now, where it is the whole reason he would pick that row.
    versionWasCalled: (title: string) => `Zvao se: „${title}“`,
    // Both read as the copy against his text: what it holds on top of what he
    // has, and what he has that it never did.
    versionAdded: (text: string) => `Dodato: „${text}“`,
    versionMissing: (text: string) => `Nedostaje: „${text}“`,
    versionsAllSame: 'Sve sačuvane verzije su iste kao aktivni tekst.',
    versionsBack: 'Nazad na verzije',
    versionRestore: 'Vrati ovaj tekst',
    // Said once, over the whole preview, rather than spelt out on every block.
    versionDiffNote:
      'Zeleno je ono čega u aktivnom tekstu više nema. Crveno je ono što je u aktivnom tekstu, a u ovoj verziji ga nema.',
    versionAddedTag: '(+) Dodato',
    versionMissingTag: '(−) Nedostaje',
    versionUnrelated: 'Ovo je sasvim drugi tekst — nijedan pasus se ne poklapa s aktivnim.',
    noteDeleted: 'Tekst je obrisan',
    emptiedHint: 'Tekst je prazan. Obriši ga ako ti više ne treba.',
  },
  en: {
    newNote: 'New text',
    appearance: 'Appearance',
    appearanceKeep: 'OK',
    appearanceCancel: 'Cancel',
    appearanceClose: 'Close',
    appearanceWriting: 'Your writing',
    appearanceApp: 'The app',
    appearanceFont: 'Font',
    appearanceSize: 'Size',
    appearanceTextSize: 'Text size',
    appearanceColour: 'Colour',
    appearanceMode: 'Background',
    appearanceReset: 'Back to the start',
    appearanceSmaller: 'Smaller',
    appearanceLarger: 'Larger',
    modeNames: { light: 'Light', dark: 'Dark' },
    accentNames: {
      blue: 'Blue',
      teal: 'Teal',
      green: 'Green',
      gold: 'Gold',
      red: 'Red',
      violet: 'Violet',
    },
    searchLabel: 'Search',
    searchPlaceholder: 'Search everything written',
    clearSearch: 'Clear the search',
    sectionFound: 'Found',
    sectionRecent: 'Recent',
    sectionAll: 'All texts',
    nothingFound: 'Nothing found',
    noNotesYet: 'No texts yet',
    untitled: 'Untitled',
    untitledNew: 'New text — untitled',
    foundAt: (at: number, total: number) => `${at} of ${total}`,
    foundOnce: 'only once',
    foundPrevious: 'Previous',
    foundNext: 'Next',
    savedAgo: (when: string) => `Saved ${when}`,
    saving: 'Saving…',
    notSaved: 'Not saved',
    minutesAgo: (n: number) => `${n} minute${n === 1 ? '' : 's'} ago`,
    hoursAgo: (n: number) => `${n} hour${n === 1 ? '' : 's'} ago`,
    yesterday: 'yesterday',
    dayAndMonth: (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    year: (date: Date) => String(date.getFullYear()),
    noteCount: (n: number) => `${n} text${n === 1 ? '' : 's'}`,

    deleteNote: 'Delete text',
    deleteTitle: 'Delete text',
    deleteBody: 'This text is moved to the deleted ones. You can bring it back whenever you want.',
    deleteEmptyBody: 'There is nothing in this text.',
    deleteKeep: 'Delete',
    cancel: 'Cancel',
    close: 'Close',

    deleted: 'Deleted texts',
    deletedKept: 'Pick a text to see what is in it, then bring it back if you want.',
    deletedSee: 'View',
    deletedPreview: 'Preview',
    deletedPreviewHelp: 'You can only read here. Bring the text back if you want to change it.',
    deletedEmpty: 'There is nothing in this text.',
    deletedWhen: (when: string) => `deleted ${when}`,
    deletedVersions: (n: number) =>
      `There ${n === 1 ? 'is' : 'are'} ${n} earlier version${n === 1 ? '' : 's'} of this text.`,
    deletedMatching: (n: number, query: string) =>
      `${n} deleted text${n === 1 ? '' : 's'} contain${n === 1 ? 's' : ''} “${query}”`,
    showAll: 'Show all',
    restore: 'Bring this text back',
    deletedBack: 'Back to deleted texts',
    destroy: 'Destroy forever',
    destroyTitle: 'Destroy forever',
    destroyBody: 'This text is destroyed for good. It cannot be brought back.',
    destroyBodyWithVersions:
      'This text is destroyed for good, along with every earlier version of it. It cannot be brought back.',
    destroyPrompt: 'Type {} to confirm.',
    destroyWord: 'destroy',
    destroyWordPlain: 'destroy',
    restored: 'Text brought back',
    notDeleted: 'Text not deleted',
    notRestored: 'Text not brought back',
    notDestroyed: 'Text not destroyed',

    versions: 'Earlier versions',
    versionsTitle: 'Earlier versions',
    versionsNote: 'This is how the text looked before. Pick when, then bring it back if you want.',
    versionTitle: 'Earlier version',
    versionWhen: (when: string) => `This is how it looked ${when}.`,
    versionSize: (words: number, difference: number) => {
      const count = `${words.toLocaleString('en-GB')} word${words === 1 ? '' : 's'}`;
      if (difference === 0) return count;
      const by = Math.abs(difference).toLocaleString('en-GB');
      return `${count} (${by} ${difference > 0 ? 'more' : 'fewer'} than now)`;
    },
    versionWasCalled: (title: string) => `Was called: “${title}”`,
    versionAdded: (text: string) => `Extra: “${text}”`,
    versionMissing: (text: string) => `Missing: “${text}”`,
    versionsAllSame: 'Every copy kept is the same as the active text.',
    versionsBack: 'Back to versions',
    versionRestore: 'Bring this text back',
    versionDiffNote:
      'Green is what the active text no longer has. Red is what the active text has and this copy does not.',
    versionAddedTag: '(+) Extra',
    versionMissingTag: '(−) Missing',
    versionUnrelated: 'This is a different text altogether — not one paragraph matches the active one.',
    noteDeleted: 'Text deleted',
    emptiedHint: 'This text is empty. Delete it if you no longer need it.',
  },
} satisfies Record<
  Language,
  Record<string, string | Record<string, string> | ((...args: never[]) => string)>
>;

/**
 * Serbian has three plural forms and he would notice them being wrong:
 * 1 tekst, 2 teksta, 5 tekstova — and 21 tekst, but 11 tekstova.
 */
function plural(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

const MONTHS_SR = [
  'januara',
  'februara',
  'marta',
  'aprila',
  'maja',
  'juna',
  'jula',
  'avgusta',
  'septembra',
  'oktobra',
  'novembra',
  'decembra',
];

export function strings(language: Language): (typeof TEXT)['sr'] {
  return TEXT[language];
}

const DAY_MS = 86400000;

/**
 * How long the day-and-month form stays meaningful.
 *
 * It carries no year, so it starts lying the moment it can be confused with the
 * same date twelve months back. Eleven months keeps it clear of that, and is
 * deliberately not shorter: his writing spans years, so almost everything in the
 * list is past this line anyway and a tighter threshold would only cost
 * precision on the recent end without narrowing the column.
 */
const DAY_AND_MONTH_MS = 330 * DAY_MS;

/**
 * When a text was last touched, in the terms he'd use out loud.
 *
 * Precision decays with age — minutes, hours, yesterday, a date, finally just a
 * year — because that's how the answer stops being useful. For something from
 * 2019 the day and month tell him nothing; which year it was from tells him
 * where he was in his life. It also keeps the column's widest forms on the
 * newest rows, of which there are only ever a handful.
 */
export function describeWhen(at: number, language: Language, now = Date.now()): string {
  const words = strings(language);
  const minutes = Math.floor((now - at) / 60000);

  if (minutes < 1) return language === 'sr' ? 'upravo sad' : 'just now';
  if (minutes < 60) return words.minutesAgo(minutes);

  const date = new Date(at);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (at >= startOfToday.getTime()) return words.hoursAgo(Math.floor(minutes / 60));
  if (at >= startOfToday.getTime() - DAY_MS) return words.yesterday;
  if (now - at < DAY_AND_MONTH_MS) return words.dayAndMonth(date);
  return words.year(date);
}
