const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** The two sentences this builds, in his language. */
export interface DailyCapWords {
  dailyCap: (cap: string, atGoogle: string, comeBack: string) => string;
  atGoogle: (model: string | null) => string;
  comeBackAfter: (clockTime: string) => string;
  comeBackLater: string;
}

/** How long Google says to wait, from its "Please retry in 15h57m50s". */
function waitIn(detail: string): number | null {
  const found = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/.exec(detail);
  if (found === null) return null;
  const [, hours, minutes, seconds] = found;
  if (hours === undefined && minutes === undefined && seconds === undefined) return null;
  return (Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
}

const clockTime = (at: Date): string => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

function comeBackLine(detail: string, now: Date, words: DailyCapWords): string {
  const wait = waitIn(detail);
  if (wait === null) return words.comeBackLater;
  // The wait is counted to the second from when Google answered, and lands a moment either side of the reset.
  const back = new Date(Math.round((now.getTime() + wait) / FIVE_MINUTES_MS) * FIVE_MINUTES_MS);
  // No "tomorrow": said at one in the morning, or read after midnight, it would name the wrong day.
  return words.comeBackAfter(clockTime(back));
}

/** `gemini-3.6-flash` as Google writes it for people: Gemini 3.6 Flash. */
function modelNameIn(detail: string): string | null {
  const id = /for model ([\w.-]+)/.exec(detail)?.[1];
  if (id === undefined) return null;
  return id
    .split('-')
    .map((word) => (word.at(0)?.toUpperCase() ?? '') + word.slice(1))
    .join(' ');
}

/**
 * What he is told when Google's free daily cap has run out, read from Google's own refusal:
 * the cap and the wait are theirs to change, and the wait, added to this computer's clock,
 * gives the hour wherever he happens to be.
 *
 * @param detail Google's refusal, in its own words.
 * @returns The sentence, or null if this refusal isn't about the daily cap.
 */
export function dailyCapSentence(detail: string, now: Date, words: DailyCapWords): string | null {
  const cap = /limit: (\d+) requests per day/.exec(detail)?.[1];
  if (cap === undefined) return null;
  return words.dailyCap(cap, words.atGoogle(modelNameIn(detail)), comeBackLine(detail, now, words));
}
