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
    // Said rather than left blank. Two thirds of what he has put away is empty
    // — the husks of deleting by emptying — and a row with nothing under its
    // title is both unexplained and half the height of the others to hit.
    untexted: 'Bez teksta',
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
    // Said, rather than the strip going. What he has thrown away is a place in
    // the app, and a place he can see is empty is one he knows the shape of.
    deletedNone: 'nema obrisanih',
    deletedKept: 'Izaberi tekst da vidiš šta je u njemu, pa ga vrati ako želiš.',
    deletedSee: 'Vidi',
    deletedPreview: 'Pregled obrisanog',
    // A dialog's second line says what to do on this screen. What the box is
    // it says without words: his writing set on a tinted, bordered surface
    // that is not the page, at a smaller size, with no caret in it and an
    // arrow over it rather than an I-beam.
    deletedPreviewCheck: 'Proveri da li je ovo tekst koji želiš da vratiš.',
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
    /*
      What a search did not match, under what it did. Never taken away — a row
      that goes when he types reads as a text that has gone, which in a shelf
      would read as the shelf being incomplete.
    */
    shelfRest: 'Ostali tekstovi',
    restore: 'Vrati među tekstove',
    deletedBack: 'Nazad na obrisane',

    /*
      Arhiva rather than Rezervne kopije, which would promise a backup this app
      does not make, and rather than Stari tekstovi, which says time and would
      read against Nedavni directly above it.

      The strip is only there when a folder of imported writing exists, and one
      only exists because somebody put it there. Unlike Obrisani tekstovi,
      which he fills himself simply by using the app, an empty Arhiva is not
      empty for now — it is not a thing on this machine, and a control he can
      never make work is worse than no control.
    */
    archive: 'Arhiva',
    archiveSearch: 'Traži po arhivi',
    /*
      Preneseš, not vratiš. Vratiti is what the deleted dialog does — give back
      something that was his and went away. Nothing in here was ever in his
      list, so the word for it is carrying it in, and the button below says the
      same thing.
    */
    archiveIntro:
      'Ovo su tekstovi doneseni sa drugih mesta. Nisu među tvojim tekstovima dok ih ne preneseš.',
    archivePreview: 'Pregled iz arhive',
    archivePreviewCheck: 'Proveri da li je ovo tekst koji želiš da preneseš među svoje.',
    archiveEmpty: 'U ovom tekstu nema ništa.',
    /*
      Two forms of the same fact, because the row and the preview have
      different room. On a row it shares the line with his title, so it is the
      folder and the year and nothing else. In the preview it has a line of its
      own and is the first thing he reads about the text, so it says what the
      folder is — `Stari laptop 2021` on its own could be a title.

      Sačuvano rather than pisano: the date is the file's, and a file's date
      is the moment it was last written down. He knows that word from every
      other program.
    */
    archiveFrom: (archive: string, when: string) => `${archive} · ${when}`,
    archiveOrigin: (archive: string, when: string) =>
      `Iz arhive „${archive}“ · sačuvano ${when}`,
    /*
      Said plainly and without alarm. It is not a claim that the two are the
      same text — nothing can know that — only that one of his own opens the
      same way, which is what decides whether he wants another.
    */
    archiveAlsoLive: 'Već imaš tekst koji ovako počinje.',
    archiveVersions: (n: number) =>
      `${plural(n, 'Uz njega dolazi', 'Uz njega dolaze', 'Uz njega dolazi')} ${n} ` +
      `${plural(n, 'ranija verzija', 'ranije verzije', 'ranijih verzija')}.`,
    archiveBring: 'Prenesi među moje tekstove',
    archiveBack: 'Nazad na arhivu',
    archiveMatching: (n: number, query: string) =>
      `${n} ${plural(n, 'tekst iz arhive sadrži', 'teksta iz arhive sadrže', 'tekstova iz arhive sadrži')} „${query}“`,
    archiveBrought: 'Tekst je prenet među tvoje tekstove.',
    archiveNotBrought: 'Tekst nije prenet. Pokušaj ponovo.',
    archiveUnreadable: 'Arhiva se ne može otvoriti.',
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
    versionTitle: 'Pregled verzije',
    // Where he is in the list, not which copy this is. It is there so that a
    // row and the page it opens are recognisably the same thing — every copy
    // of a text carries the same title, so the heading cannot tell them apart
    // on its own, and the date it shows moves under him.
    versionNumber: (at: number) => `#${at}`,
    // The heading names the text, like every other dialog's. This line says
    // where the thing he is looking at came from: the app kept it, at a
    // moment, and that is the whole of what he needs to know about it.
    versionsNote: 'Izaberi verziju da vidiš po čemu se razlikuje, pa je vrati ako želiš.',
    // At the head of the list, above the copies. Every row below it counts
    // itself against "sada", which until now was a thing he could not see.
    activeText: 'Aktivni tekst',
    activeTextNow: 'Ovo je tekst koji sada imaš.',
    // On the copy a restore made of what he had. Every copy in the list was
    // the active text once, so "prethodni" is doing the work: the one
    // immediately before this, not merely one from earlier.
    previouslyActive: 'Prethodni aktivni tekst',
    versionWhen: (when: string) => `Ova verzija je sačuvana ${when}.`,
    // Two numbers, because they answer two different questions. How long it
    // was tells him whether this is the essay he remembers; how it compares to
    // what he has now tells him whether opening it would get anything back.
    versionWords: (count: number) =>
      `${count.toLocaleString('sr-RS')} ${plural(count, 'reč', 'reči', 'reči')}`,
    // On its own line under the count, and left out when there is no difference
    // to report: a number that only means "no answer here" is worse than none.
    versionCompared: (difference: number) => {
      const by = Math.abs(difference);
      const counted = `${by.toLocaleString('sr-RS')} ${plural(by, 'reč', 'reči', 'reči')}`;
      return `${counted} ${difference > 0 ? 'više' : 'manje'} nego sada`;
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
    versionsAllSame: 'Sve sačuvane verzije su iste kao aktivni tekst.',
    /*
      Razlika rather than izmena, which is the name of one of the three kinds
      of block this counts — (±) Izmenjeno. Counting all three by the name of
      one of them puts "Izmena 2 od 3" over a block reading (+) Dodato.

      It is also the word the rest of the screen already uses ("po čemu se
      razlikuje", "manje nego sada"), and it takes no side about which text
      moved: an izmena is something done to something, and which way round the
      marks run is the one thing the tags are at pains to spell out.

      Feminine either way, so Prethodna/Sledeca are untouched — the search
      pane's own Prethodni/Sledeci are counting something else.
    */
    changeAt: (at: number, total: number) => `Razlika ${at} od ${total}`,
    changePrevious: 'Prethodna',
    changeNext: 'Sledeća',
    versionRestore: 'Vrati tekst na ovu verziju',
    // Beside the button rather than in a dialog in front of it. Nothing here
    // is lost, so there is nothing to stop him for — but "vrati" alone does
    // not say that the text he is looking at goes somewhere, and he should not
    // have to press it to find out where.
    versionRestoreNote: 'Ova verzija postaje aktivni tekst.',
    versionRestoreKept: 'Ono što je sada u njemu čuva se kao nova verzija.',
    // Each block says which way round it is, rather than sending him back to a
    // sentence at the top of the page to work it out. Both halves are spelt
    // out because "dodato" alone begs the question added to what.
    versionAddedTag: '(+) Dodato',
    versionAddedWhy: '(nije u aktivnom tekstu, postoji u ovoj verziji)',
    versionMissingTag: '(−) Nedostaje',
    versionMissingWhy: '(nije u ovoj verziji, postoji u aktivnom tekstu)',
    // The third case: one paragraph that is in both and is not the same in
    // both. Its parenthetical has a second job the other two do not — saying
    // which way round the marks inside it run.
    versionChangedTag: '(±) Izmenjeno',
    versionChangedWhy: '(postoji u oba teksta; precrtano je staro, zeleno je novo)',
    versionUnrelated: 'Ovo je sasvim drugi tekst — nijedan pasus se ne poklapa s aktivnim.',
    noteDeleted: 'Tekst je obrisan',
    /*
      The worst thing that can happen, said in the fewest words that are true.

      He has reported writing "disappearing" for years, and the causes were
      never established — a minimised window, a sync gone wrong, or nothing at
      all. This is the app saying which of those it is: it can see that his
      texts were here yesterday and are not here now, and it is saying so
      instead of greeting him with "Još nema tekstova", which is the single
      worst sentence it could put in front of him.

      No blame, no jargon, and one instruction: do not touch anything, and read
      this line out. The line is what turns a phone call that begins "everything
      is gone" into one that begins with a version number.
    */
    lostTitle: 'Ne mogu da nađem tvoje tekstove',
    lostBody:
      'Tvoji tekstovi nisu obrisani. Aplikacija ne može da dođe do mesta na kom se čuvaju — ' +
      'možda je fascikla premeštena ili disk nije priključen.',
    lostAdvice: 'Nemoj ništa da menjaš. Pozovi za pomoć i pročitaj ovo:',
    lostSettings: 'Napredna podešavanja',
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
    untexted: 'No text',
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
    deletedNone: 'none deleted',
    deletedKept: 'Pick a text to see what is in it, then bring it back if you want.',
    deletedSee: 'View',
    deletedPreview: 'Deleted text preview',
    deletedPreviewCheck: 'Check whether this is the text you want back.',
    deletedEmpty: 'There is nothing in this text.',
    deletedWhen: (when: string) => `deleted ${when}`,
    deletedVersions: (n: number) =>
      `There ${n === 1 ? 'is' : 'are'} ${n} earlier version${n === 1 ? '' : 's'} of this text.`,
    deletedMatching: (n: number, query: string) =>
      `${n} deleted text${n === 1 ? '' : 's'} contain${n === 1 ? 's' : ''} “${query}”`,
    shelfRest: 'The rest',
    restore: 'Bring this text back',
    deletedBack: 'Back to deleted texts',

    archive: 'Archive',
    archiveSearch: 'Search the archive',
    archiveIntro:
      'This is writing brought in from elsewhere. It is not among your texts until you bring it in.',
    archivePreview: 'Archived text preview',
    archivePreviewCheck: 'Check whether this is the text you want among your own.',
    archiveEmpty: 'There is nothing in this text.',
    archiveFrom: (archive: string, when: string) => `${archive} · ${when}`,
    archiveOrigin: (archive: string, when: string) =>
      `From the archive “${archive}” · saved ${when}`,
    archiveAlsoLive: 'You already have a text that starts this way.',
    archiveVersions: (n: number) =>
      `${n} earlier version${n === 1 ? '' : 's'} come${n === 1 ? 's' : ''} with it.`,
    archiveBring: 'Bring this into my texts',
    archiveBack: 'Back to the archive',
    archiveMatching: (n: number, query: string) =>
      `${n} archived text${n === 1 ? '' : 's'} contain${n === 1 ? 's' : ''} "${query}"`,
    archiveBrought: 'The text is now among your texts.',
    archiveNotBrought: 'The text was not brought in. Try again.',
    archiveUnreadable: 'The archive cannot be opened.',
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
    versionTitle: 'Version preview',
    versionNumber: (at: number) => `#${at}`,
    versionsNote: 'Pick a version to see how it differs, then bring it back if you want.',
    activeText: 'Active text',
    activeTextNow: 'This is the text you have now.',
    previouslyActive: 'Previous active text',
    versionWhen: (when: string) => `This copy was kept ${when}.`,
    versionWords: (count: number) =>
      `${count.toLocaleString('en-GB')} word${count === 1 ? '' : 's'}`,
    versionCompared: (difference: number) => {
      const by = Math.abs(difference);
      return `${by.toLocaleString('en-GB')} word${by === 1 ? '' : 's'} ${difference > 0 ? 'more' : 'fewer'} than now`;
    },
    versionWasCalled: (title: string) => `Was called: “${title}”`,
    versionsAllSame: 'Every copy kept is the same as the active text.',
    changeAt: (at: number, total: number) => `Difference ${at} of ${total}`,
    changePrevious: 'Previous',
    changeNext: 'Next',
    versionRestore: 'Take the text back to this version',
    versionRestoreNote: 'This version becomes the active text.',
    versionRestoreKept: 'What is in it now is kept as a new version.',
    versionAddedTag: '(+) Extra',
    versionAddedWhy: '(not in the active text, present in this copy)',
    versionMissingTag: '(−) Missing',
    versionMissingWhy: '(not in this copy, present in the active text)',
    versionChangedTag: '(±) Changed',
    versionChangedWhy: '(in both; struck through is the old wording, green the new)',
    versionUnrelated: 'This is a different text altogether — not one paragraph matches the active one.',
    noteDeleted: 'Text deleted',
    lostTitle: 'I cannot find your texts',
    lostBody:
      'Your texts have not been deleted. The app cannot reach the place where they are kept — ' +
      'the folder may have moved, or the drive may not be connected.',
    lostAdvice: 'Do not change anything. Call for help and read this out:',
    lostSettings: 'Advanced settings',
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
