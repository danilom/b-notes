import { expect, test } from '@playwright/test';

/**
 * His marks as the list draws them, measured rather than described: a sign
 * a pixel wider or a pixel higher than the one beside it looks like a fault
 * in the list, and nothing but the laid-out page can say it is.
 */

test('draws (UP) as its letters in the bars\' box, standing on the line the bars stand on', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();

  // Ranked and in his collection, so the bars and UP are on one row.
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').pressSequentially('      (UP) 12 Kafana na uglu');
  // The first of its rows: a new text is also among the recent ones.
  const row = page.locator('#list .note').filter({ hasText: 'Kafana na uglu' }).first();
  const sign = row.locator('.note-collection');
  await expect(sign).toHaveText('UP');
  await expect(sign).toHaveAttribute('aria-label', '(UP)');

  const measured = await row.evaluate((element) => {
    const bars = element.querySelector('.note-rank');
    const up = element.querySelector('.note-collection');
    if (bars === null || up === null) return null;
    // Where the letters stand: a box with no height sits on the baseline.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    up.append(probe);
    const upBaseline = probe.getBoundingClientRect().top;
    probe.remove();
    const barsBox = bars.getBoundingClientRect();
    return { barsWidth: barsBox.width, upWidth: up.getBoundingClientRect().width, barsFoot: barsBox.bottom, upBaseline };
  });
  if (measured === null) throw new Error('the row has no bars or no UP');

  expect(Math.abs(measured.upWidth - measured.barsWidth)).toBeLessThan(0.1);
  // The bars stand on the title's baseline; so must the letters.
  expect(Math.abs(measured.upBaseline - measured.barsFoot)).toBeLessThan(0.5);
});

test('marks what a search found in the titles it found it in, and nowhere in the rest of the list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();

  // One of the pretend Resoph titles: "GRADSKE PRICE, prva".
  await page.locator('#search').fill('price');
  const found = page.locator('#list .section-block').first();
  await expect(found.locator('.section')).toContainText('Pronađeni u naslovu');
  const row = found.locator('.note').filter({ hasText: 'GRADSKE PRICE, prva' });
  await expect(row.locator('.note-title mark.note-found')).toHaveText('PRICE');
  // The whole title still reads as it did.
  await expect(row.locator('.note-title')).toHaveText('GRADSKE PRICE, prva');

  // Svi tekstovi is every text, whatever he searched for: nothing marked there.
  await expect(page.locator('#list .note.aside mark.note-found')).toHaveCount(0);
});

test('marks the word in a title that a search of several words found partly further down', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();

  // "PRICE" is in the title, "budi" in the text under it: "Grad se budi rano".
  await page.locator('#search').fill('price budi');
  const found = page.locator('#list .section-block').first();
  await expect(found.locator('.section')).toContainText('Pronađeni u tekstu');
  const row = found.locator('.note').filter({ hasText: 'GRADSKE PRICE, prva' });
  await expect(row.locator('.note-title mark.note-found')).toHaveText('PRICE');
});
