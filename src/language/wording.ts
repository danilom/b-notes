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
    searchLabel: 'Traži',
    searchPlaceholder: 'Traži po svemu napisanom',
    clearSearch: 'Poništi traženje',
    sectionFound: 'Pronađeni',
    sectionRecent: 'Nedavni',
    sectionAll: 'Svi tekstovi',
    nothingFound: 'Ništa nije pronađeno',
    noNotesYet: 'Još nema tekstova',
    untitled: 'Bez naslova',
    savedAgo: (when: string) => `Sačuvano ${when}`,
    saving: 'Čuvam…',
    notSaved: 'Nije sačuvano',
    minutesAgo: (n: number) => `pre ${n} ${plural(n, 'minut', 'minuta', 'minuta')}`,
    hoursAgo: (n: number) => `pre ${n} ${plural(n, 'sat', 'sata', 'sati')}`,
    yesterday: 'juče',
    dayAndMonth: (date: Date) => `${date.getDate()}. ${MONTHS_SR[date.getMonth()]}`,
    year: (date: Date) => String(date.getFullYear()),
    noteCount: (n: number) => `${n} ${plural(n, 'tekst', 'teksta', 'tekstova')}`,
  },
  en: {
    newNote: 'New text',
    searchLabel: 'Search',
    searchPlaceholder: 'Search everything written',
    clearSearch: 'Clear the search',
    sectionFound: 'Found',
    sectionRecent: 'Recent',
    sectionAll: 'All texts',
    nothingFound: 'Nothing found',
    noNotesYet: 'No texts yet',
    untitled: 'Untitled',
    savedAgo: (when: string) => `Saved ${when}`,
    saving: 'Saving…',
    notSaved: 'Not saved',
    minutesAgo: (n: number) => `${n} minute${n === 1 ? '' : 's'} ago`,
    hoursAgo: (n: number) => `${n} hour${n === 1 ? '' : 's'} ago`,
    yesterday: 'yesterday',
    dayAndMonth: (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    year: (date: Date) => String(date.getFullYear()),
    noteCount: (n: number) => `${n} text${n === 1 ? '' : 's'}`,
  },
} satisfies Record<Language, Record<string, string | ((...args: never[]) => string)>>;

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
