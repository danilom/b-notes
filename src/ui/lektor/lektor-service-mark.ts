/*
  A small mark for each Lektor, always beside its name and never instead of it. He needn't know
  what they stand for: a shape and a colour to tell the two apart at a glance, and to name on the telephone.

  The two real ones are the companies' own files, unchanged, and their trademarks: Anthropic's from
  its press kit (anthropic.com/press-kit), Google's as gemini.google.com serves it.
*/

const FILE_OF: Readonly<Record<string, string>> = {
  free: 'lektor-mark-google.svg',
  thorough: 'lektor-mark-anthropic.svg',
  fake: 'lektor-mark-test.svg',
};

export function serviceMark(level: string): HTMLImageElement {
  const mark = document.createElement('img');
  mark.className = `lektor-service-mark lektor-service-mark-${level}`;
  mark.src = FILE_OF[level] ?? '';
  // Decoration: its name is always right beside it.
  mark.alt = '';
  return mark;
}

/** The mark with the Lektor's name, for saying who something came from. Nothing at all when that isn't known, as with a comment from an older version. */
export function serviceLine(level: string, names: Readonly<Record<string, string>>): HTMLElement[] {
  const name = names[level];
  if (name === undefined) return [];
  const line = document.createElement('p');
  line.className = 'lektor-service-line';
  const words = document.createElement('span');
  words.textContent = name;
  line.append(serviceMark(level), words);
  return [line];
}
