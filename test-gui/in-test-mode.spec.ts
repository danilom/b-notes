import { expect, test } from '@playwright/test';

/*
  Test mode must never change what is being tested. Its badges float over the
  rows, and a badge that crept back into the row's layout would move every
  title in the list — without anything looking broken.
*/
test('marks every row with where it lives, without moving anything', async ({ page }) => {
  await page.goto('/');
  const title = page.locator('#list .note[data-id] .note-title').first();
  await expect(title).toBeVisible();
  const without = await title.boundingBox();

  await page.goto('/?test');
  await expect(page.locator('#toolbar .test-mode-tag')).toHaveText('[test-mode]');
  const badges = page.locator('#list .note[data-id] .test-mode-badge');
  await expect(badges.first()).toBeVisible();

  expect(await page.locator('#list .note[data-id] .note-title').first().boundingBox()).toEqual(without);
  await expect(badges).toHaveCount(await page.locator('#list .note[data-id]').count());
});

test("opens the browser build's pretend files from the files button", async ({ page }) => {
  await page.goto('/?test');
  await page.locator('#toolbar .test-mode-files').click();
  await expect(page.getByPlaceholder(/filter by path/)).toBeVisible();
});
