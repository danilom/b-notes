import { expect, test, type Page } from '@playwright/test';

/**
 * Living beside Resoph, end to end in the browser build.
 *
 * The rules are covered without a browser — reading Resoph's format, copying
 * a text on first touch, bringing Resoph's changes in. What is only true in a
 * running app is that the list and the editor show his Resoph texts as Resoph
 * does, that typing into one never touches Resoph's folder, and that the app
 * waits behind its message while Resoph is open.
 *
 * The pretend Resoph folder holds a few files shaped like his
 * (`mock-resoph-sample.ts`); these tests use those rather than the generated
 * corpus, so they know what to look for.
 */

type Held = Record<string, { text: string; updatedAt: number }>;

const held = (page: Page): Promise<Held> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Held);

const RANKED = '                        %2AGRADSKE PRICE, prva';
// As the list shows it: the spaces are dots and the star is drawn in its own place.
const RANKED_NAME = 'GRADSKE PRICE, prva';

async function start(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
}

test('shows his Resoph titles without their spaces, marked by how high he ranked them', async ({ page }) => {
  await start(page);

  const row = page.locator('#list .note').filter({ hasText: RANKED_NAME }).first();
  await expect(row.locator('.note-title')).toHaveText(RANKED_NAME);
  await expect(row.locator('.note-rank')).toHaveAttribute('data-rank', '3');
  await expect(row.locator('.note-star')).toHaveCount(1);

  // His order: the text he ranked highest comes first in the whole list.
  const all = page.locator('#list .section-block').last();
  await expect(all.locator('.note .note-title').first()).toHaveText(RANKED_NAME);
});

test('a Resoph text opens as Resoph shows it, title first', async ({ page }) => {
  await start(page);

  await page.locator('#list .note').filter({ hasText: RANKED_NAME }).first().click();

  await expect(page.locator('#editor')).toHaveValue(
    '                        *GRADSKE PRICE, prva\n\nGrad se budi rano, prije nego iko od nas.\n\nPrva prica o gradu.',
  );
});

test('marks a text still in Resoph with Resoph\'s icon, and the icon really loads', async ({ page }) => {
  /*
    A picture that fails to load leaves a blank the size of the icon, which
    looks like no mark at all rather than like a fault. The first try at this
    was blocked by the page's CSP, and a file left out of the build would do
    the same.
  */
  await start(page);
  const mark = page.locator('#list .section-block').last().locator('.note').filter({ hasText: RANKED_NAME }).locator('.note-in-resoph');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-label', /U Resophu/);

  const width = await mark.evaluate(async (element) => {
    const url = /url\("?(.*?)"?\)/.exec(getComputedStyle(element).backgroundImage)?.[1];
    if (url === undefined) return 0;
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      // Not loading is the answer this test is after, not a fault in it.
      return 0;
    }
    return image.naturalWidth;
  });
  expect(width).toBeGreaterThan(0);
});

test('typing into a Resoph text takes it over, leaves a stub in Resoph, and says so', async ({ page }) => {
  await start(page);
  const row = page.locator('#list .section-block').last().locator('.note').filter({ hasText: RANKED_NAME });
  await expect(row.locator('.note-in-resoph')).toBeVisible();

  await row.first().click();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Dopisano.');
  await page.clock.runFor(1200);

  const after = await held(page);
  const copies = Object.entries(after).filter(([path]) => /^b-notes\/GRADSKE PRICE, prva ~[0-9A-Z]{6}\.txt$/.test(path));
  expect(copies).toHaveLength(1);
  expect(copies[0]?.[1].text).toContain('Dopisano.');
  // The Resoph file is still there, under the same name, holding the stub.
  expect(after[`ResophNotes/${RANKED}.txt`]?.text).toContain('PREMEŠTEN U B-NOTES');

  // One row for it, no longer Resoph's, and a word about what happened.
  await expect(row).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('Tekst je prenet iz Resopha u b-notes.');
  await page.clock.runFor(3000);
  await expect(row.locator('.note-in-resoph')).toHaveCount(0);
});

test('waits behind its message while Resoph and Notepad are open, and carries on once closed', async ({ page }) => {
  await page.addInitScript(() => {
    // Once, before the first load only: later loads must not reopen them.
    if (sessionStorage.getItem('pretended') !== null) return;
    sessionStorage.setItem('pretended', 'yes');
    localStorage.setItem('b-notes:mock-running', JSON.stringify({ running: ['ResophNotes', 'Notepad'], stubborn: false }));
  });
  await page.goto('/');

  const message = page.locator('#close-editors');
  await expect(message).toBeVisible();
  await expect(message.locator('.close-editors-open li')).toHaveText(['ResophNotes', 'Notepad']);
  // Nothing about Notepad's question until he has pressed the button.
  await expect(message.locator('.close-editors-asks')).toBeHidden();
  await expect(page.locator('#list .note')).toHaveCount(0);
  // Over a plain background, not an empty list that looks like a failed load.
  await expect(page.locator('#side')).toBeHidden();
  await expect(page.locator('#main')).toBeHidden();

  // Escape is not a way past it.
  await page.keyboard.press('Escape');
  await expect(message).toBeVisible();

  await message.getByRole('button', { name: 'Zatvori druge programe' }).click();
  // By design two or three seconds on the real clock — the pretend close, the
  // second given them to go, the next look — so more than the default five
  // for a machine that is slow that day.
  await expect(message).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test("tells him where Notepad's question is, when Notepad will not close", async ({ page }) => {
  // What a Notepad holding unsaved changes does when asked to close: it asks,
  // from behind b-notes, and stays open until he answers.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pretended') !== null) return;
    sessionStorage.setItem('pretended', 'yes');
    localStorage.setItem('b-notes:mock-running', JSON.stringify({ running: ['Notepad'], stubborn: true }));
  });
  await page.goto('/');

  const message = page.locator('#close-editors');
  await message.getByRole('button', { name: 'Zatvori druge programe' }).click();
  await expect(message.locator('.close-editors-asks')).toBeVisible();

  // He answers Notepad, and it closes: b-notes carries on by itself.
  await page.evaluate(() =>
    localStorage.setItem('b-notes:mock-running', JSON.stringify({ running: [], stubborn: false })),
  );
  // Up to the next look, two seconds apart on the real clock: room for a slow day.
  await expect(message).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('moves a text back into Resoph from the strip, where it shows as a Resoph text again', async ({ page }) => {
  await start(page);
  const row = page.locator('#list .section-block').last().locator('.note').filter({ hasText: RANKED_NAME });
  await row.first().click();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Dopisano.');
  await page.clock.runFor(1200);

  await page.getByRole('button', { name: 'Premesti u Resoph' }).click();

  await expect(page.locator('#toast')).toContainText('Tekst je premešten u Resoph.');
  const after = await held(page);
  expect(after[`ResophNotes/${RANKED}.txt`]?.text).toContain('Dopisano.');
  expect(Object.keys(after).some((path) => /^b-notes\/GRADSKE PRICE, prva ~[0-9A-Z]{6}\.txt$/.test(path))).toBe(false);
  await expect(row).toHaveCount(1);
  await expect(row.locator('.note-in-resoph')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Premesti u Resoph' })).toBeHidden();
  await expect(page.locator('#editor')).toHaveValue(/Dopisano\./);
});

test('checks again whenever he comes back, saving what he typed first', async ({ page }) => {
  await start(page);
  await page.locator('#list .note').filter({ hasText: 'Pismo prijatelju' }).first().click();
  await page.locator('#editor').press('End');
  // Typed, and not yet saved: the clock is held, so the save is still waiting.
  await page.locator('#editor').pressSequentially(' Upravo dopisano.');

  // Notepad opened while he was away, then he comes back to b-notes.
  await page.evaluate(() => {
    localStorage.setItem('b-notes:mock-running', JSON.stringify({ running: ['Notepad'], stubborn: false }));
    window.dispatchEvent(new Event('focus'));
  });

  const message = page.locator('#close-editors');
  await expect(message).toBeVisible();
  // His texts stay in view behind it: here nothing is missing.
  await expect(page.locator('#list .note').first()).toBeVisible();
  // His words reached disk before the message came up, not after.
  const saved = await page.evaluate(() =>
    Object.entries(JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<string, { text: string }>)
      .some(([path, file]) => /^b-notes\/[^/]+\.txt$/.test(path) && file.text.includes('Upravo dopisano.')),
  );
  expect(saved).toBe(true);

  // Coming back again while it is up starts nothing new.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(message.locator('.panel')).toHaveCount(1);

  await message.getByRole('button', { name: 'Zatvori druge programe' }).click();
  // The clock is held; let through the moment it gives them to close.
  await page.clock.runFor(1000);
  await expect(message).toBeHidden();

  // And with nothing open, coming back is just coming back.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(message).toBeHidden();
});
