import { expect, test, type Page } from '@playwright/test';

/**
 * What the app does to his files, and in what order.
 *
 * The one fault this suite exists for that is not about geometry. Bringing a
 * text back out of Obrisano or Arhiva moves files while a save he has already
 * typed may still be waiting. If that save lands on the wrong file, or not at
 * all, he loses his last sentence or ends up with two of a text. No test that
 * does not run the real thing can see an ordering.
 *
 * The clock is held still rather than raced against. The save is scheduled
 * 800ms after he stops typing, so a test that simply hurried would pass by
 * being quick rather than by being right — and would go green on the broken
 * code the first time the machine was busy.
 */

const NOVI = 'Novi tekst';

/**
 * What every text in b-notes' own folder opening with `title` says. By content
 * rather than by name: names carry a tag made from the moment a text was
 * started, and with the clock held still two texts started a moment apart can
 * differ only in a count on the end.
 *
 * His own corpus holds a `Pismo iz Stoliva za Z`, which a prefix match would
 * count as one of ours; the title has to be the whole first line.
 */
const textsOpening = (page: Page, title: string): Promise<string[]> =>
  page.evaluate((wanted) => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<string, { text: string }>;
    return Object.entries(held)
      .filter(([path, file]) => /^b-notes\/[^/]+\.txt$/.test(path) && file.text.split('\n')[0] === wanted)
      .map(([, file]) => file.text)
      .sort();
  }, title);

/** Types into the editor and lets the save that follows actually happen. */
async function write(page: Page, text: string): Promise<void> {
  await page.locator('#editor').fill(text);
  await page.clock.runFor(1200);
}

test.beforeEach(async ({ page }) => {
  // Before the page, so nothing is scheduled against a clock we do not hold.
  await page.clock.install();
  // `install` alone does not stop the clock — timers go on firing in real
  // time, so anything relying on a save still being pending was racing it.
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('a text he typed into is not duplicated by bringing another one back', async ({ page }) => {
  await page.getByRole('button', { name: NOVI }).click();
  await write(page, 'Pismo\n\nPrvi.');
  expect(await textsOpening(page, 'Pismo')).toEqual(['Pismo\n\nPrvi.']);

  // Away it goes, leaving the name free again.
  await page.locator('#delete-note').click();
  await page.locator('#confirm').getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page.locator('#confirm')).toBeHidden();
  expect(await textsOpening(page, 'Pismo')).toEqual([]);

  // A second text that opens the same way, so the one coming back collides.
  await page.getByRole('button', { name: NOVI }).click();
  await write(page, 'Pismo\n\nDrugi.');
  expect(await textsOpening(page, 'Pismo')).toEqual(['Pismo\n\nDrugi.']);

  /*
    And now he types again and does not stop for the save. The clock stands
    still from here, so the save is certainly still waiting when the restore
    renames the file out from under it.
  */
  await page.locator('#editor').fill('Pismo\n\nDrugi, sa jos jednom recenicom.');

  await page.locator('#deleted-block').click();
  await page.locator('#deleted .review-row').first().click();
  await page.locator('#deleted').getByRole('button', { name: 'Vrati među tekstove' }).click();
  await expect(page.locator('#deleted')).toBeHidden();

  // Let everything that was waiting happen, including the save.
  await page.clock.runFor(2000);

  /*
    Two texts opening with Pismo, not three: the one brought back, and the one
    he was in, with his last sentence. Nothing is renamed to make room any
    more, but the order still matters — a save landing on the wrong file is
    how his open text came to exist twice before.
  */
  expect(await textsOpening(page, 'Pismo')).toEqual([
    'Pismo\n\nDrugi, sa jos jednom recenicom.',
    'Pismo\n\nPrvi.',
  ]);
});

test('his last keystrokes survive a text being brought back', async ({ page }) => {
  // The other half of the same guard. Flushing first must mean the save
  // actually lands, not that it is thrown away.
  await page.getByRole('button', { name: NOVI }).click();
  await write(page, 'Pismo\n\nPrvi.');
  await page.locator('#delete-note').click();
  await page.locator('#confirm').getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page.locator('#confirm')).toBeHidden();

  await page.getByRole('button', { name: NOVI }).click();
  await write(page, 'Pismo\n\nDrugi.');
  await page.locator('#editor').fill('Pismo\n\nDrugi, i jos ovo na kraju.');

  await page.locator('#deleted-block').click();
  await page.locator('#deleted .review-row').first().click();
  await page.locator('#deleted').getByRole('button', { name: 'Vrati među tekstove' }).click();
  await expect(page.locator('#deleted')).toBeHidden();
  await page.clock.runFor(2000);

  const kept = await page.evaluate(() => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return Object.entries(held)
      .filter(([path]) => /^b-notes\/Pismo ~[^/]*\.txt$/.test(path))
      .map(([, file]) => file.text);
  });

  expect(kept).toContain('Pismo\n\nDrugi, i jos ovo na kraju.');
});
