import { expect, test } from '@playwright/test';

/**
 * The text he was last in, when he opens the app again.
 *
 * The session file is the one place a name outlives the run: everything else
 * holds a handle, which means nothing between one morning and the next. So it
 * has to be written again whenever the name changes — and a name here changes
 * whenever he rewrites his opening line, which he does constantly.
 */

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('opens him back into the text he was in', async ({ page }) => {
  const editor = page.locator('#editor');
  await page.locator('#list .note').nth(1).click();
  const was = await editor.inputValue();
  await editor.fill(`${was} Dopisano.`);
  await page.clock.runFor(1200);

  await page.goto('/');

  await expect(editor).toHaveValue(new RegExp('Dopisano\.'));
});

test('opens him back into it after his first line changed its name', async ({ page }) => {
  // The rename is the case the session file used to miss: it was written when
  // he opened a text and never again, so a retitle left it pointing at a name
  // no longer on any file.
  const editor = page.locator('#editor');
  await page.locator('#list .note').nth(1).click();
  const was = await editor.inputValue();
  const body = was.split('\n').slice(1).join('\n');
  await editor.fill(`Sasvim drugi naslov\n${body}`);
  await page.clock.runFor(1200);

  await page.goto('/');

  await expect(editor).toHaveValue(new RegExp('Sasvim drugi naslov'));
});
