import { expect, test, type Page } from '@playwright/test';

/**
 * Folding the list of texts away, which he asked for, and bringing it back,
 * which is the half he could lose. So what is tested hardest is the way back:
 * the tab, deleting a text, and a fresh start.
 */

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
}

test('folds the list away to a tab at the edge, and the tab brings it back', async ({ page }) => {
  await start(page);
  const tab = page.getByRole('button', { name: 'Prikaži listu tekstova' });
  await expect(tab).toBeHidden();

  await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
  await expect(page.locator('#side')).toBeHidden();
  await expect(tab).toBeVisible();
  await expect(page.locator('#editor')).toBeFocused();

  await tab.click();
  await expect(page.locator('#side')).toBeVisible();
  await expect(tab).toBeHidden();
});

test('brings the list back when he deletes the text in front of him', async ({ page }) => {
  // The text he was in is gone, and the list is what is left to work with.
  await start(page);
  await page.locator('#list .note').first().click();
  await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();

  await page.locator('#delete-note').click();
  await page.locator('#confirm').getByRole('button', { name: 'Obriši', exact: true }).click();

  await expect(page.locator('#side')).toBeVisible();
  await expect(page.locator('#search')).toBeFocused();
});

test('always starts with the list showing, however it was left', async ({ page }) => {
  // Not kept, on purpose: closing and opening the app is a way back he cannot lose.
  await start(page);
  await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
  await expect(page.locator('#side')).toBeHidden();

  await page.reload();
  await expect(page.locator('#list .note').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prikaži listu tekstova' })).toBeHidden();
});

test('keeps the tab clear of his text on his own screens', async ({ page }) => {
  for (const { laptop, width, height } of [
    { laptop: 'Dell', width: 1280, height: 730 },
    { laptop: 'Asus', width: 1280, height: 650 },
  ]) {
    await page.setViewportSize({ width, height });
    await start(page);
    await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
    await expect(page.locator('#side')).toBeHidden();

    const clearance = await page.evaluate(() => {
      const tab = document.getElementById('show-list')?.getBoundingClientRect();
      const editor = document.getElementById('editor');
      if (tab === undefined || editor === null) return null;
      const textStarts = editor.getBoundingClientRect().left + parseFloat(getComputedStyle(editor).paddingLeft);
      return textStarts - tab.right;
    });
    expect(clearance, `on his ${laptop}`).not.toBeNull();
    expect(clearance ?? 0, `on his ${laptop}`).toBeGreaterThan(16);
  }
});

test('folds the header up into the corner, the same height, with the chevron where the other was', async ({ page }) => {
  // Nothing moves under his pointer between the two: the one he pressed to
  // fold the list is where the one to bring it back appears.
  await page.setViewportSize({ width: 1280, height: 650 });
  await start(page);
  const middle = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { middle: box.top + box.height / 2, height: box.height };
    });
  const header = await middle('#toolbar');
  const before = await middle('#hide-list svg');

  await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
  const tab = await middle('#show-list');
  const after = await middle('#show-list svg');

  expect(Math.abs(tab.height - header.height)).toBeLessThan(0.5);
  expect(Math.abs(after.middle - before.middle)).toBeLessThan(0.5);
});

test('puts his text in the middle while the list is folded away', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await start(page);
  const margins = () =>
    page.locator('#editor').evaluate((editor) => {
      const seen = getComputedStyle(editor);
      return { left: parseFloat(seen.paddingLeft), right: parseFloat(seen.paddingRight) };
    });

  const open = await margins();
  expect(open.left).toBeLessThan(open.right);

  await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
  // Once it has slid there.
  await expect.poll(async () => {
    const folded = await margins();
    return Math.abs(folded.left - folded.right);
  }).toBeLessThan(1);
});

/** Where the list's left edge is, frame by frame, from the click that folds it. */
async function slideOf(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const side = document.getElementById('side');
    const button = document.getElementById('hide-list');
    if (side === null || button === null) return [];
    const seen: number[] = [];
    button.click();
    const until = performance.now() + 400;
    while (performance.now() < until) {
      seen.push(side.getBoundingClientRect().left);
      await new Promise((frame) => requestAnimationFrame(frame));
    }
    return seen;
  });
}

test('slides the list away rather than making it vanish', async ({ page }) => {
  await start(page);
  const edges = await slideOf(page);
  const width = await page.locator('#side').evaluate((side) => side.getBoundingClientRect().width);

  // Somewhere on the way out, not only in and then out.
  expect(edges.some((left) => left < -1 && left > -width + 1)).toBe(true);
  expect(edges.at(-1)).toBeCloseTo(-width, 0);
});

test('folds it at once where Windows is set to spare him animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  const edges = await slideOf(page);
  const width = await page.locator('#side').evaluate((side) => side.getBoundingClientRect().width);

  expect(edges.every((left) => Math.abs(left + width) < 1)).toBe(true);
});
