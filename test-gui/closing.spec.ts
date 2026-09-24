import { expect, test, type Page } from '@playwright/test';

/**
 * What he typed in the last moment, when the window goes.
 *
 * Autosave lands 800ms after he stops, and every keystroke pushes that back —
 * so what is at risk is not the last 800ms of typing but everything since his
 * last pause that long, which can be a whole sentence. Closing used to throw
 * all of it away: the only close this app knew about fired once the window was
 * already gone.
 *
 * The clock is held still, so the save is certainly still pending when the
 * page is asked to go. A test that merely hurried would pass by being quick.
 *
 * The mock host runs the same sequence the packaged app does — ask the
 * interface to finish, wait for the answer, then go — with the window left
 * out, so the half that lives in shared code is exercised here. What cannot be
 * reached either way is Electron's own half: that the close event is really
 * intercepted and the window really shuts afterwards.
 */

/** Closing the window, as the packaged app does it. Resolves once it would go. */
const closeTheWindow = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (window as unknown as { closeWindow: () => Promise<void> }).closeWindow(),
  );

const stored = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return Object.values(held).map((file) => file.text);
  });

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  // `install` alone does not stop the clock — timers go on firing in real
  // time, so anything relying on a save still being pending was racing it.
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('keeps what he typed in the moment before the window went', async ({ page }) => {
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  const typed = 'Pismo\n\nPoslednja recenica pre zatvaranja.';
  await page.locator('#editor').fill(typed);

  // Not a keystroke later, and the clock never moves, so the 800ms save is
  // still waiting when the page is told it is going.
  expect(await stored(page)).not.toContain(typed);

  await closeTheWindow(page);

  // By the time the window was free to go, his words were on disk. Not polled
  // for: the point is that closing waited, not that it caught up afterwards.
  expect(await stored(page)).toContain(typed);
});

test('leaves alone what was already saved', async ({ page }) => {
  // Closing must not write anything of its own when there is nothing pending.
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').fill('Pismo\n\nSve je vec sacuvano.');
  await page.clock.runFor(1200);
  const before = (await stored(page)).length;

  await closeTheWindow(page);
  await page.clock.runFor(1200);

  expect(await stored(page)).toHaveLength(before);
});
