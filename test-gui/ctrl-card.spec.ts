import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_CTRL_CARD_AFTER_MS } from '../src/ui/settings/advanced-settings.ts';

/**
 * Past the wait, whatever the wait is.
 *
 * These said 500ms, which cleared the delay as it was and stopped clearing it
 * the day somebody decided he was slower than that. What the tests mean is
 * "long enough", so that is what they say.
 */
const PAST_THE_WAIT = DEFAULT_CTRL_CARD_AFTER_MS + 300;

/**
 * The keys he can use, shown while he holds the one they all start with.
 *
 * He should not have to remember four shortcuts, only that Ctrl shows him what
 * he can do. So the card has to arrive when he hesitates and stay out of the
 * way the rest of the time — which is almost entirely about when it does *not*
 * appear.
 */

const card = (page: Page) => page.locator('#ctrl-card');

const holdCtrl = (page: Page): Promise<void> =>
  page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true })),
  );

const releaseCtrl = (page: Page): Promise<void> =>
  page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true })),
  );

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
  await page.locator('#list .note').first().click();
  await expect(page.locator('#editor')).toBeFocused();
});

test('answers a text he has only just opened, because he can type in it already', async ({
  page,
}) => {
  /*
    This used to assert the opposite, and was right to: opening a text left the
    caret out of it, so those keys did nothing and neither did the card. Opening
    now puts the caret back where he left off and takes the focus with it, so
    Ctrl+C means something from the first moment — and a card that stayed silent
    would be silent exactly when he had no idea the keys were live.
  */
  await page.locator('#list .note').nth(1).click();
  await expect(page.locator('#editor')).toBeFocused();

  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT);

  await expect(card(page)).toBeVisible();
});

test('shows what he can do once he has held it long enough', async ({ page }) => {
  await holdCtrl(page);
  await expect(card(page)).toBeHidden();

  await page.clock.runFor(PAST_THE_WAIT);

  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('kbd')).toHaveText(['Ctrl', 'C', 'Ctrl', 'V', 'Ctrl', 'Z']);
});

test('says nothing to a man who already knows the shortcut', async ({ page }) => {
  // The whole reason for the wait: a press and a letter is somebody doing
  // something, not somebody wondering what they could do.
  await holdCtrl(page);
  await page.keyboard.press('Control+c');

  await page.clock.runFor(PAST_THE_WAIT + 1000);

  await expect(card(page)).toBeHidden();
});

test('goes when he lets go', async ({ page }) => {
  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT);
  await expect(card(page)).toBeVisible();

  await releaseCtrl(page);
  // Left slowly rather than snatched away: marked as leaving first, and gone
  // once the stylesheet has had its time.
  await expect(card(page)).toHaveAttribute('data-leaving', 'yes');
  await page.clock.runFor(300);

  await expect(card(page)).toBeHidden();
});

test('goes when he clicks anything at all', async ({ page }) => {
  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT);
  await expect(card(page)).toBeVisible();

  await page.locator('#editor').click();
  await page.clock.runFor(300);

  await expect(card(page)).toBeHidden();
});

test('does not answer the search box, where those keys mean something else', async ({ page }) => {
  await page.locator('#search').focus();

  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT + 1000);

  await expect(card(page)).toBeHidden();
});

test('does not answer while a dialog is in front of his writing', async ({ page }) => {
  /*
    Which needs no test of its own in the code: every dialog takes the focus
    when it opens, so the caret is no longer in his writing and the same rule
    that silences the search box silences this. A guard for it was written and
    then removed, because no mutation could make it fail.
  */
  await page.getByRole('button', { name: 'Izgled' }).click();

  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT + 1000);

  await expect(card(page)).toBeHidden();
});

test('offers a way out to a mouse that comes looking, and only then', async ({ page }) => {
  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT);
  const away = page.locator('#ctrl-card-close');

  // There, but not offering itself: nothing has gone wrong yet.
  await expect(away).toHaveCSS('opacity', '0');

  // A mouse that moves, rather than one that merely rests where the card
  // landed — which his often does, and which used to be enough to show it.
  await page.mouse.move(400, 400);
  await page.mouse.move(420, 410);

  await expect(away).toHaveCSS('opacity', '1');
});

test('never stands between him and his own writing', async ({ page }) => {
  // It took the pointer for a while so that hovering could reveal the way
  // out, and that stopped him clicking into his text wherever it happened to
  // be sitting.
  await holdCtrl(page);
  await page.clock.runFor(PAST_THE_WAIT);
  await expect(card(page)).toBeVisible();

  const box = await card(page).boundingBox();
  await page.mouse.click((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);

  await expect(page.locator('#editor')).toBeFocused();
});

test('does not appear for the Ctrl that AltGr is made of', async ({ page }) => {
  // Windows builds AltGr out of Ctrl and Alt, so typing `@` on his keyboard
  // sends a Control down. The Alt that follows is what takes it away.
  await holdCtrl(page);
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true })),
  );

  await page.clock.runFor(PAST_THE_WAIT + 1000);

  await expect(card(page)).toBeHidden();
});
