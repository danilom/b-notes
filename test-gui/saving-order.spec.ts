import { expect, test, type Page } from '@playwright/test';

/**
 * What the app does to his files, and in what order.
 *
 * The one fault this suite exists for that is not about geometry. Several
 * things in the app rename a file he is not in — bringing a text back out of
 * Obrisano or Arhiva claims a name in his list, and numbers whatever was
 * holding it. If a save he had already typed lands *after* that, it writes his
 * open text back under the name it no longer has, and he ends up with two of
 * it. No test that does not run the real thing can see an ordering.
 *
 * The clock is held still rather than raced against. The save is scheduled
 * 800ms after he stops typing, so a test that simply hurried would pass by
 * being quick rather than by being right — and would go green on the broken
 * code the first time the machine was busy.
 */

const NOVI = 'Novi tekst';

/**
 * Every file on the pretend disk in one base's group: the plain name and any
 * numbered form of it, and nothing that merely starts with the same letters.
 *
 * His own corpus holds a `Pismo iz Stoliva za Z`, which a prefix match counts
 * as one of ours.
 */
const filesCalled = (page: Page, base: string): Promise<string[]> =>
  page.evaluate((wanted) => {
    const group = new RegExp(`^Tekstovi/${wanted}( \\(\\d+\\))?\\.txt$`);
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as object;
    return Object.keys(held).filter((path) => group.test(path)).sort();
  }, base);

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
  expect(await filesCalled(page, 'Pismo')).toEqual(['Tekstovi/Pismo.txt']);

  // Away it goes, leaving the name free again.
  await page.locator('#delete-note').click();
  await page.locator('#confirm').getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page.locator('#confirm')).toBeHidden();
  expect(await filesCalled(page, 'Pismo')).toEqual([]);

  // A second text that opens the same way, so the one coming back collides.
  await page.getByRole('button', { name: NOVI }).click();
  await write(page, 'Pismo\n\nDrugi.');
  expect(await filesCalled(page, 'Pismo')).toEqual(['Tekstovi/Pismo.txt']);

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
    Two texts called Pismo, not three. Before the flush was moved ahead of the
    restore, the waiting save wrote `Pismo.txt` back after the restore had
    renamed it to `Pismo (1).txt`, and his open text existed twice.
  */
  expect(await filesCalled(page, 'Pismo')).toEqual([
    'Tekstovi/Pismo (1).txt',
    'Tekstovi/Pismo (2).txt',
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
      .filter(([path]) => path.startsWith('Tekstovi/Pismo') && path.endsWith('.txt'))
      .map(([, file]) => file.text);
  });

  expect(kept).toContain('Pismo\n\nDrugi, i jos ovo na kraju.');
});
