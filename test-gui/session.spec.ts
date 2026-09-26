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

/*
  Coming back to the top of a long essay is not coming back. What makes this a
  GUI test rather than a unit one is that nothing below the browser knows how
  far down a box is scrolled, and the value has to survive being written at the
  close and read at the open.
*/
test('opens him back where he had got to in it, not at the top', async ({ page }) => {
  const editor = page.locator('#editor');
  await page.locator('#list .note').nth(1).click();
  // Long enough to have somewhere to be, since a text that fits on screen
  // cannot be scrolled and would pass this without doing anything.
  await editor.fill(`Naslov\n${'Jedan pasus o zimi i o moru.\n\n'.repeat(200)}`);
  await page.clock.runFor(1200);

  await editor.evaluate((box: HTMLTextAreaElement) => {
    box.setSelectionRange(900, 900);
    box.scrollTop = 700;
  });
  await page.evaluate(async () => {
    await (window as unknown as { closeWindow: () => Promise<void> }).closeWindow();
  });

  await page.goto('/');

  await expect
    .poll(async () => editor.evaluate((box: HTMLTextAreaElement) => box.scrollTop))
    .toBe(700);
  expect(await editor.evaluate((box: HTMLTextAreaElement) => box.selectionStart)).toBe(900);
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
