import { expect, test, type Page } from '@playwright/test';

/**
 * Copying his whole text, and the one thing on screen that says it happened.
 *
 * Both halves need a real browser. The clipboard is the browser's, and what it
 * hands back afterwards is the only proof the copy worked. And the toast is
 * the app's one piece of timing: it goes on its own after a while, and sooner
 * if he does anything at all — neither of which exists outside a running page.
 */

const COPY = 'Kopiraj ceo tekst';

const openFirstText = async (page: Page): Promise<string> => {
  await page.locator('#list .note').first().click();
  const text = await page.locator('#editor').inputValue();
  expect(text.length).toBeGreaterThan(0);
  return text;
};

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('puts the whole text on the clipboard, to the last character', async ({ page }) => {
  // What he does today is select it all by hand, which on a long essay is a
  // drag he has to get exactly right. All of it, or the button is a trap.
  const text = await openFirstText(page);

  await page.getByRole('button', { name: COPY }).click();

  await expect(page.locator('#toast')).toBeVisible();

  /*
    Line endings put back to one kind before comparing. Windows hands the
    clipboard back with carriage returns in it whatever was put on — the same
    thing the store already undoes when it reads one of his files, since his
    corpus came off Windows and the box he writes in cannot hold one.

    Nothing downstream cares: what he pastes into is Gmail. So this asks the
    question that matters — is every word there — rather than failing over a
    character neither he nor we ever chose.
  */
  const onClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(onClipboard.replaceAll('\r\n', '\n')).toBe(text);
});

test('says so, because nothing else on screen changes', async ({ page }) => {
  await openFirstText(page);

  await page.getByRole('button', { name: COPY }).click();

  const toast = page.locator('#toast');
  await expect(toast).toContainText('kopiran na klipbord');
  await expect(toast).toContainText('Ctrl+V');
});

test('takes the message away the moment he goes back to writing', async ({ page }) => {
  await openFirstText(page);
  await page.getByRole('button', { name: COPY }).click();
  await expect(page.locator('#toast')).toBeVisible();

  await page.locator('#editor').press('a');

  await expect(page.locator('#toast')).toBeHidden();
});

test('takes it away on its own if he does nothing', async ({ page }) => {
  await openFirstText(page);
  await page.getByRole('button', { name: COPY }).click();
  await expect(page.locator('#toast')).toBeVisible();

  // Still there after four seconds, gone by eight. The message is two lines
  // and he reads slowly; a toast that went in a second would be a flicker.
  await page.clock.runFor(4000);
  await expect(page.locator('#toast')).toBeVisible();
  await page.clock.runFor(4000);
  await expect(page.locator('#toast')).toBeHidden();
});

test('is not offered for a text with nothing in it', async ({ page }) => {
  // Emptying a text is how he deletes, so this is a state he reaches often.
  await page.getByRole('button', { name: 'Novi tekst' }).click();

  await expect(page.getByRole('button', { name: COPY })).toBeDisabled();
});
