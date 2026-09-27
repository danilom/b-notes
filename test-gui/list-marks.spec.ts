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
