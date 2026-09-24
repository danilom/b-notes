import { expect, test, type Page } from '@playwright/test';

/**
 * Taking a text out of Arhiva, end to end.
 *
 * The store's half is covered without a browser — moving the file, carrying
 * its copies, claiming a name. What is only true in a running app is the
 * wiring either side of it: that pressing the strip reads folders nothing has
 * read yet, that what comes back is what ends up in front of him, and that the
 * marks the list draws still say what the filenames say afterwards.
 *
 * Nothing here names a text. The corpus is generated and which texts the
 * archives borrow can change with it, so every test finds what it needs by
 * what the app says about it.
 */

const BRING = 'Prenesi među moje tekstove';
const ALREADY = 'Već imaš tekst koji ovako počinje.';

/** Every live text's id, and the number the list drew beside it, if any. */
const marksInList = (page: Page): Promise<[string, string | null][]> =>
  page.locator('#list .note[data-id]').evaluateAll((rows) =>
    rows.map((row): [string, string | null] => [
      row.getAttribute('data-id') ?? '',
      row.querySelector('.note-mark')?.textContent ?? null,
    ]),
  );

const archivedPaths = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}'))
      .filter((path) => path.startsWith('Tekstovi/Arhiva/') && path.endsWith('.txt'))
      .sort(),
  );

async function openArchive(page: Page): Promise<void> {
  await page.locator('#archive-block').click();
  await expect(page.locator('#archive .review-row').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  // `install` alone does not stop the clock — timers go on firing in real
  // time, so anything relying on a save still being pending was racing it.
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('a text taken out of the archive is the one in front of him afterwards', async ({ page }) => {
  await openArchive(page);

  // One that is in no other folder, so nothing is renamed around it and the
  // only thing under test is the journey.
  const row = page.locator('#archive .review-row').filter({ hasNotText: ALREADY }).first();
  const title = (await row.locator('.review-title').textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);

  const before = await archivedPaths(page);
  await row.click();
  await page.locator('#archive').getByRole('button', { name: BRING }).click();
  await expect(page.locator('#archive')).toBeHidden();

  // In the editor, because he asked for this text and should not have to go
  // looking for it in six hundred others.
  await expect(page.locator('#editor')).toHaveValue(new RegExp(`^${escaped(title)}`));
  // And gone from where it was: a move, not a copy. Two of a text is the thing
  // the archive exists to avoid.
  const after = await archivedPaths(page);
  expect(after.length).toBe(before.length - 1);
  expect(after.some((path) => path.endsWith(`/${title}.txt`))).toBe(false);
});

test('the numbers the list draws are the numbers on the files', async ({ page }) => {
  /*
    Bringing in a text he already has one of is what makes a group, and the
    whole promise of those numbers is that the one he reads is the one on the
    file — so that the folder and the list cannot disagree when he is in
    Notepad with the app shut and somebody on the telephone.
  */
  await openArchive(page);
  const row = page.locator('#archive .review-row').filter({ hasText: ALREADY }).first();
  await row.click();
  await page.locator('#archive').getByRole('button', { name: BRING }).click();
  await expect(page.locator('#archive')).toBeHidden();

  const drawn = await marksInList(page);
  expect(drawn.length).toBeGreaterThan(0);
  const wrong = drawn.filter(([id, mark]) => {
    const numbered = / \((\d+)\)$/.exec(id);
    const onTheFile = numbered === null ? null : `(${numbered[1]})`;
    return mark !== onTheFile;
  });

  expect(wrong).toEqual([]);
});

test('what he had just typed is not lost by taking a text out', async ({ page }) => {
  /*
    The same ordering as restoring from Obrisano, down a different path.
    Bringing a text in claims a name in his list, and where something is
    holding that name plainly, that something is renamed — so a save already
    scheduled would land under a name that is no longer his text's, and he
    would have two of it.

    The collision is built rather than looked for. Picking a text the dialog
    marks as one he already has is not enough: where he has two of a name they
    are both numbered already, nothing is holding it plainly, and the rename
    never happens — the test then passes by nothing occurring, which is how
    this one first went green against the bug.
  */
  await openArchive(page);
  // One that is in no other folder, so its name is free for him to take.
  const spare = page.locator('#archive .review-row').filter({ hasNotText: ALREADY }).first();
  const title = (await spare.locator('.review-title').textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);
  // The footer's, not the X: both are called Zatvori and both do the same.
  await page.locator('#archive footer button').click();
  await expect(page.locator('#archive')).toBeHidden();

  // His own text of that name, which is then the one holding it plainly.
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').fill(`${title}\n\nMoje.`);
  await page.clock.runFor(1200);
  const holder = await page.locator('#list .note[aria-current="true"]').first().getAttribute('data-id');
  expect(holder, 'his text must be the one holding the name plainly').toBe(title);

  // And now he types on without stopping. The clock stands still from here,
  // so the save is certainly still waiting when the rename happens.
  const typed = `${title}\n\nMoje, sa jos jednom recenicom.`;
  await page.locator('#editor').fill(typed);

  await openArchive(page);
  /*
    By its title now, not by the absence of the mark. Making a text of that
    name is exactly what puts the mark on this row, so the filter that found
    it a moment ago now finds a different text — which is how this test came
    to bring back something that collided with nothing.
  */
  await page.locator('#archive .review-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first()
    .click();
  await page.locator('#archive').getByRole('button', { name: BRING }).click();
  await expect(page.locator('#archive')).toBeHidden();
  await page.clock.runFor(2000);

  /*
    Two files of that name, not three.

    Counted rather than searched for by content, which is what this asked
    first and why it went green against the bug: the waiting save carries what
    he last typed, and the file renamed out from under it carries what he
    typed before — so exactly one file holds his last words either way. What
    differs is that the broken order leaves a third file behind, under the
    name the rename had just emptied.
  */
  const group = await page.evaluate((wanted) => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    const inGroup = new RegExp(`^Tekstovi/${wanted}( \\(\\d+\\))?\\.txt$`);
    return Object.entries(held)
      .filter(([path]) => inGroup.test(path))
      .map(([path, file]) => [path, file.text] as const);
  }, title);

  expect(group).toHaveLength(2);
  expect(group.map(([, said]) => said)).toContain(typed);
});

test('searching the archive pushes the rest down rather than taking it away', async ({ page }) => {
  await openArchive(page);
  const rows = page.locator('#archive .review-row');
  const total = await rows.count();
  expect(total).toBeGreaterThan(2);

  // A word out of one of them, so something matches and something does not.
  const word = ((await rows.first().locator('.review-snippet').textContent()) ?? '')
    .split(/\s+/)
    .find((candidate) => candidate.length > 4);
  if (word === undefined) throw new Error('no word to search for');

  await page.locator('#archive .shelf-search').fill(word.replace(/[^\p{L}]/gu, ''));

  // Nothing is ever hidden: a row that goes when he types reads as a text that
  // has gone, which in a shelf reads as the shelf being incomplete.
  await expect(rows).toHaveCount(total);
  await expect(page.locator('#archive .review-group')).toHaveCount(2);
  const dimmed = await page.locator('#archive .review-row.aside').count();
  expect(dimmed).toBeGreaterThan(0);
  expect(dimmed).toBeLessThan(total);
});

test('opens showing everything, whatever he had typed in the list search', async ({ page }) => {
  /*
    Nothing outside the dialog can search the archive, so the strip that sent
    him here said "ten texts" and could say nothing about his words. Arriving
    at two of them would read as the other eight having gone missing.
  */
  await page.locator('#search').fill('nepostojeća reč');
  // His own list has found nothing, which is the moment he is most likely to
  // try in here — and the moment an archive that looked empty would be worst.
  await expect(page.locator('#list .section-block').first()).toContainText('Ništa nije pronađeno');

  await openArchive(page);

  await expect(page.locator('#archive .shelf-search')).toHaveValue('');
  await expect(page.locator('#archive .review-group')).toHaveCount(0);
  await expect(page.locator('#archive .review-row.aside')).toHaveCount(0);
});


/** A title put into a regular expression as the literal text it is. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
