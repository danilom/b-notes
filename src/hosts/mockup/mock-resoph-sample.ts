import { DAY, HOUR, type SampleFile } from './mock-sample-files.ts';

/**
 * A handful of Resoph files shaped like his, so the browser build shows what
 * his folder does to b-notes: ranking spaces in front of titles, `*` written
 * as `%2A`, a title-only note, and a Simplenote-era file with its title inside.
 *
 * Invented, like the rest of the corpus. Title in the filename, the rest in the
 * file, exactly as Resoph writes them.
 */
export function resophSample(resophFolder: string, now: number): SampleFile[] {
  const file = (name: string, text: string, ago: number): SampleFile => ({
    path: `${resophFolder}/${name}.txt`,
    text,
    updatedAt: now - ago,
  });
  return [
    file(
      '                        %2AGRADSKE PRICE, prva',
      'Grad se budi rano, prije nego iko od nas.\r\n\r\nPrva prica o gradu.',
      2 * HOUR,
    ),
    file('                %2A%2A Zvonce( konacna)', 'OVO JE KONACNA VERZIJA, NE DIRAJ\r\n\r\nZvonce je zvonilo.', 5 * DAY),
    file('         Pismo prijatelju', '1\r\n\r\nDragi prijatelju, pisem ti iz grada.', 9 * DAY),
    file('Osa i staklo, zunzara, strsljen prolaze kroz staklo', '', 400 * DAY),
    file('Stara biljeska', 'Stara biljeska\r\n\r\nNapisana dok je jos bio Simplenote.', 700 * DAY),
    file('zz Zaboravljeno', 'Nesto sto je gurnuo na dno liste.', 30 * DAY),
  ];
}
