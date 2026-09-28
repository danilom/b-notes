import { DAY, type SampleFile, rawArchiveFolderFor } from './mock-sample-files.ts';

/**
 * A folder in `Arhiva-raw` shaped like the ones off his machines, so the
 * import in Advanced settings has something real-shaped to work on in the
 * browser: `.md` files named the way Resoph names them, most with their
 * title only in the name, one Simplenote-era file with its title inside, an
 * empty jot, and a `.txt` among them.
 *
 * The browser build used to show no sign of the trouble at all, because the
 * sample archives were `.txt` in b-notes' shape and the real ones were not.
 * Invented, like the rest of the corpus.
 */
export function rawArchiveSample(notesFolder: string, now: number): SampleFile[] {
  const folder = rawArchiveFolderFor(notesFolder, 'stari_laptop_2019');
  const file = (name: string, text: string, ago: number): SampleFile => ({
    path: `${folder}/${name}`,
    text,
    updatedAt: now - ago,
  });
  return [
    file('        %2AKOTOR, jesen.md', 'Zaliv je bio mirniji nego ikad.\r\n\r\nPisao sam sa terase.', 1900 * DAY),
    file('(UP) 12 Pisma bratu.md', 'Dragi brate,\r\n\r\ndugo ti se nisam javio.', 2100 * DAY),
    file('Recept za pitu%3F.md', 'Tri jaja, kasika secera.', 2300 * DAY),
    file('Beleske sa puta.md', 'Beleske sa puta\r\n\r\nVoz je kasnio cetiri sata.', 2500 * DAY),
    file('Ideja za pricu o satu.md', '', 2200 * DAY),
    file('Spisak.txt', 'Slavina u kupatilu.\r\nVrata od ostave.', 1800 * DAY),
  ];
}
