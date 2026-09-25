import { expect, test, type Page } from '@playwright/test';

/**
 * A save that fails, and then works.
 *
 * Dropbox holds a file open while it uploads it and Windows refuses to touch
 * one that is held, so a transient failure is the ordinary case rather than a
 * freak. What the interface does about it could only be reasoned about until
 * the mock could be told to refuse a write.
 *
 * The clock is held still throughout, so every attempt happens because the
 * test moved time forward and not because it waited long enough.
 */

const refuseTheNextWrites = (page: Page, count: number): Promise<void> =>
  page.evaluate(
    (n) => (window as unknown as { refuseTheNextWrites: (n: number) => void }).refuseTheNextWrites(n),
    count,
  );

const storedText = (page: Page, holding: string): Promise<boolean> =>
  page.evaluate((needle) => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return Object.values(held).some((file) => file.text.includes(needle));
  }, holding);

/**
 * The texts themselves, and not the copies kept of them.
 *
 * `storedText` looks through every file there is, and saving keeps a copy of
 * what a text was before it changed — so words written over in his own file are
 * still found in `Verzije` beside it. Which made the one test here that guards
 * against losing his writing pass while it was being lost.
 */
const liveTexts = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return Object.entries(held)
      .filter(([at]) => /^[^/]+\/[^/]+\.txt$/.test(at))
      .map(([, file]) => file.text);
  });

const fileCount = (page: Page): Promise<number> =>
  page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}')).length,
  );

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now());
  await page.goto('/?test');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('says nothing about one failure, which is the ordinary one', async ({ page }) => {
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').fill('Pismo\n\nPrva recenica.');
  await refuseTheNextWrites(page, 1);

  await page.clock.runFor(1000);

  // One refusal is Dropbox holding the file for a second. Telling him about
  // that weekly is how he learns to pass over the line when it matters.
  await expect(page.locator('#status-text')).toHaveText('');
});

test('says his latest words are not written once it keeps failing', async ({ page }) => {
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').fill('Pismo\n\nPrva recenica.');
  await refuseTheNextWrites(page, 5);

  await page.clock.runFor(1000);
  await page.clock.runFor(2000);

  await expect(page.locator('#status-text')).toHaveText('Poslednje izmene nisu sačuvane');
});

test('takes it back once a later attempt gets through', async ({ page }) => {
  await page.getByRole('button', { name: 'Novi tekst' }).click();
  await page.locator('#editor').fill('Pismo\n\nPrva recenica.');
  await refuseTheNextWrites(page, 2);

  await page.clock.runFor(1000);
  await page.clock.runFor(2000);
  await expect(page.locator('#status-text')).toHaveText('Poslednje izmene nisu sačuvane');

  // The third attempt is allowed through.
  await page.clock.runFor(4000);

  await expect(page.locator('#status-text')).not.toHaveText('Poslednje izmene nisu sačuvane');
  expect(await storedText(page, 'Prva recenica.')).toBe(true);
});

test('never writes the words he has left behind over the ones he has now', async ({ page }) => {
  /*
    The way this could lose his writing. A save fails and its text waits; he
    goes on typing and the next save succeeds with what he has now; the attempt
    still waiting must not wake up and put back what he had then.

    One of his own texts rather than a new one, which is what makes this bite:
    a new text has no id yet, so a stale attempt would write a second file and
    leave the newer one standing. Over a text that already has a name, it
    writes over him.
  */
  const editor = page.locator('#editor');
  await page.locator('#list .note').first().click();
  await expect(editor).not.toHaveValue('');
  const before = await editor.inputValue();

  await editor.fill(`${before} Prva.`);
  await refuseTheNextWrites(page, 1);
  /*
    Just past the save at 800ms, which fails and leaves an attempt waiting a
    second behind it. Stopping short deliberately: he has to type again soon
    enough that the save which succeeds lands *before* that attempt wakes.
    Arriving together, the good save goes last and hides the whole fault.
  */
  await page.clock.runFor(900);

  // He keeps writing, and this save is allowed through.
  await editor.fill(`${before} Prva. Druga.`);
  await page.clock.runFor(1000);
  expect((await liveTexts(page)).some((text) => text.includes('Prva. Druga.'))).toBe(true);
  const files = await fileCount(page);

  // Long past when the attempt for the older words would have run.
  await page.clock.runFor(60_000);

  // In his own file, not merely somewhere: the copy kept of what it was
  // before is not his text, and finding the words there proves nothing.
  expect((await liveTexts(page)).some((text) => text.includes('Prva. Druga.'))).toBe(true);
  // And not as a second copy beside it, which is the other way to lose one.
  expect(await fileCount(page)).toBe(files);
  await expect(page.locator('#status-text')).not.toHaveText('Poslednje izmene nisu sačuvane');
});

test('goes on trying for a text he has left, and does not warn him about it', async ({ page }) => {
  const editor = page.locator('#editor');
  const notes = page.locator('#list .note');

  await notes.first().click();
  await expect(editor).not.toHaveValue('');
  const first = await editor.inputValue();
  await editor.fill(`${first} Ostavljena.`);
  await refuseTheNextWrites(page, 1);
  await page.clock.runFor(900);

  // Away to another text, and nothing typed there.
  await notes.nth(1).click();
  await expect(editor).not.toHaveValue(`${first} Ostavljena.`);

  /*
    Refused here rather than counted out in advance: opening a text writes
    which one he had open, so a refusal set aside earlier is spent on that
    instead of on the attempt this is about.
  */
  await refuseTheNextWrites(page, 1);
  await page.clock.runFor(1200);

  /*
    Two failures now, which is what the line speaks for — but they belong to a
    text he is not looking at. What is in front of him is written and safe, and
    saying otherwise tells him his writing is at risk where it is not.
  */
  await expect(page.locator('#status-text')).not.toHaveText('Poslednje izmene nisu sačuvane');

  // Still being attempted all the same, and it gets through.
  await page.clock.runFor(60_000);
  expect((await liveTexts(page)).some((text) => text.includes('Ostavljena.'))).toBe(true);
});

test('does not throw away one text because another one saved', async ({ page }) => {
  /*
    How this lost writing before the waiting texts were kept apart: a single
    slot, cleared by any save that succeeded. He types in one, the write is
    refused, he moves to another and writes there — and the words in the first
    were dropped by the save of the second.
  */
  const editor = page.locator('#editor');
  const notes = page.locator('#list .note');

  await notes.first().click();
  const first = await editor.inputValue();
  await editor.fill(`${first} Ostavljena.`);
  await refuseTheNextWrites(page, 1);
  await page.clock.runFor(900);

  await notes.nth(1).click();
  await editor.fill(`${await editor.inputValue()} Druga.`);
  await page.clock.runFor(1000);

  await page.clock.runFor(60_000);

  expect((await liveTexts(page)).some((text) => text.includes('Ostavljena.'))).toBe(true);
  expect((await liveTexts(page)).some((text) => text.includes('Druga.'))).toBe(true);
});
