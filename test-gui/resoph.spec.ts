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

test('typing into a Resoph text writes b-notes own copy and leaves Resoph folder alone', async ({ page }) => {
  await start(page);
  const before = await held(page);
  const resophBefore = Object.fromEntries(Object.entries(before).filter(([path]) => path.startsWith('ResophNotes/')));

  await page.locator('#list .note').filter({ hasText: RANKED_NAME }).first().click();
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
  await expect(page.locator('#list .section-block').last().locator('.note').filter({ hasText: RANKED_NAME })).toHaveCount(1);
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

test('keeps both when a text changed in Resoph and in b-notes: his, and Resoph\'s marked beside it', async ({
  page,
}) => {
  await start(page);
  const rows = page.locator('#list .section-block').last().locator('.note').filter({ hasText: 'Pismo prijatelju' });
  await rows.first().click();
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Iz b-notes.');
  await page.clock.runFor(1200);

  // Resoph writes the same text meanwhile.
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<string, unknown>;
    all['ResophNotes/         Pismo prijatelju.txt'] = {
      text: '1\r\n\r\nDragi prijatelju, pisem ti iz grada. Iz Resopha.',
      updatedAt: Date.now() + 60_000,
    };
    localStorage.setItem('b-notes:mock-files', JSON.stringify(all));
    window.dispatchEvent(new Event('focus'));
  });

  // Two texts of that name now, and only Resoph's says it is the other version.
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.note-other')).toHaveCount(1);
  await expect(rows.locator('.note-other')).toHaveText('druga verzija');

  // His own stays as he left it, in front of him.
  // Where the caret was when he typed: just below the title, as a text opens.
  await expect(page.locator('#editor')).toHaveValue(/Iz b-notes\./);

  // Resoph's opens with Resoph's words; once he writes in it, it is simply his.
  await rows.filter({ has: page.locator('.note-other') }).click();
  await expect(page.locator('#editor')).toHaveValue(/Iz Resopha\.$/);
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially(' Moje.');
  await page.clock.runFor(1200);
  await expect(rows.locator('.note-other')).toHaveCount(0);
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
