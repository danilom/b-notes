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
const RANKED_TITLE = '*GRADSKE PRICE, prva';

async function start(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
}

test('shows his Resoph titles without their spaces, marked by how high he ranked them', async ({ page }) => {
  await start(page);

  const row = page.locator('#list .note').filter({ hasText: RANKED_TITLE }).first();
  await expect(row.locator('.note-title')).toHaveText(RANKED_TITLE);
  await expect(row.locator('.note-rank')).toHaveAttribute('data-rank', '3');

  // His order: the text he ranked highest comes first in the whole list.
  const all = page.locator('#list .section-block').last();
  await expect(all.locator('.note .note-title').first()).toHaveText(RANKED_TITLE);
});

test('a Resoph text opens as Resoph shows it, title first', async ({ page }) => {
  await start(page);

  await page.locator('#list .note').filter({ hasText: RANKED_TITLE }).first().click();

  await expect(page.locator('#editor')).toHaveValue(
    '                        *GRADSKE PRICE, prva\nGrad se budi rano, prije nego iko od nas.\n\nPrva prica o gradu.',
  );
});

test('typing into a Resoph text writes b-notes own copy and leaves Resoph folder alone', async ({ page }) => {
  await start(page);
  const before = await held(page);
  const resophBefore = Object.fromEntries(Object.entries(before).filter(([path]) => path.startsWith('ResophNotes/')));

  await page.locator('#list .note').filter({ hasText: RANKED_TITLE }).first().click();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Dopisano.');
  await page.clock.runFor(1200);

  const after = await held(page);
  const resophAfter = Object.fromEntries(Object.entries(after).filter(([path]) => path.startsWith('ResophNotes/')));
  expect(resophAfter).toEqual(resophBefore);

  const copies = Object.entries(after).filter(
    ([path]) => /^b-notes\/GRADSKE PRICE, prva ~[0-9A-Z]{6}\.txt$/.test(path),
  );
  expect(copies).toHaveLength(1);
  expect(copies[0]?.[1].text).toContain('Dopisano.');
  // Still one row for it in the whole list: the copy, not the copy and the original.
  await expect(page.locator('#list .section-block').last().locator('.note').filter({ hasText: RANKED_TITLE })).toHaveCount(1);
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
  await expect(message).toContainText('Resoph i Notepad');
  await expect(page.locator('#list .note')).toHaveCount(0);

  // Escape is not a way past it.
  await page.keyboard.press('Escape');
  await expect(message).toBeVisible();

  await message.getByRole('button', { name: 'Zatvori ih' }).click();
  await expect(message).toBeHidden();
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('says so over a text that changed in both Resoph and b-notes, and leads to the versions', async ({ page }) => {
  await start(page);
  const row = page.locator('#list .note').filter({ hasText: 'Pismo prijatelju' }).first();
  await row.click();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Iz b-notes.');
  await page.clock.runFor(1200);

  // Resoph writes the same text meanwhile, later than b-notes did.
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<string, unknown>;
    all['ResophNotes/         Pismo prijatelju.txt'] = {
      text: '1\r\n\r\nDragi prijatelju, pisem ti iz grada. Iz Resopha.',
      updatedAt: Date.now() + 60_000,
    };
    localStorage.setItem('b-notes:mock-files', JSON.stringify(all));
    window.dispatchEvent(new Event('focus'));
  });

  const bar = page.locator('#changed-in-both');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Ovaj tekst je menjan i u Resoph-u. Druga verzija je sačuvana.');

  await bar.getByRole('button', { name: 'Pogledaj verzije' }).click();
  await expect(page.locator('#versions')).toBeVisible();
  await expect(bar).toBeHidden();
});
