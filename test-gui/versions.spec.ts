import { expect, test, type Page } from '@playwright/test';

/**
 * The copies kept of a text, and what happens when he takes one back.
 *
 * The diff itself is decided without a browser and tested there. What needs
 * one is everything around it. The stepper steers him through a long copy by
 * scrolling it, and whether it appears at all depends on a measurement — does
 * this copy overflow its box — that is zero until the panel is laid out. And
 * restoring is deliberately *not* a write: it goes through the editor so the
 * ordinary save carries it out, which is a claim about order that only the
 * running app can be asked about.
 */

/** Long enough to scroll, which is what the stepper exists for. */
const LONG = 'Long diff sample';
/** Short, with a copy of every shape the list can show. */
const SHORT = 'Versions sample';

const RESTORE = 'Vrati tekst na ovu verziju';
const NEXT = 'Sledeća';
const BACK = 'Prethodna';

const fileOf = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((wanted) => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return held[`Tekstovi/${wanted}.txt`]?.text ?? null;
  }, id);

/** How far down the copy on the right the panel has scrolled. */
const scrolledTo = (page: Page): Promise<number> =>
  page.locator('#versions .review-text').first().evaluate((box) => box.scrollTop);

async function openCopyOf(page: Page, title: string): Promise<void> {
  await page.locator('#search').fill(title);
  await page.locator('#list .note[data-id]').filter({ hasText: title }).first().click();
  await expect(page.locator('#editor')).toHaveValue(new RegExp(`^${title}`));
  await page.locator('#see-versions').click();
  await page.locator('#versions .index-row:not(.index-row-active)').first().click();
  await expect(page.locator('#versions .review-text').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  // `install` alone does not stop the clock — timers go on firing in real
  // time, so anything relying on a save still being pending was racing it.
  await page.clock.pauseAt(Date.now());
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('steers him through a long copy, one difference at a time', async ({ page }) => {
  await openCopyOf(page, LONG);

  const at = page.locator('#versions .stepper-at');
  await expect(at).toHaveText(/^Razlika 1 od \d+$/);
  const total = Number(/od (\d+)/.exec((await at.textContent()) ?? '')?.[1] ?? '0');
  expect(total).toBeGreaterThan(1);

  const first = await scrolledTo(page);
  await page.locator('#versions').getByRole('button', { name: NEXT }).click();

  await expect(at).toHaveText(`Razlika 2 od ${total}`);
  // The number moving is worth nothing on its own. What it counts is where in
  // the copy he is looking, so the copy has to move with it.
  expect(await scrolledTo(page)).not.toBe(first);
});

test('stops at the last difference rather than going round again', async ({ page }) => {
  // He has no way of knowing he has been round once, so the end of the run is
  // a place he can feel: the way on stops being a way on.
  await openCopyOf(page, LONG);
  const at = page.locator('#versions .stepper-at');
  const total = Number(/od (\d+)/.exec((await at.textContent()) ?? '')?.[1] ?? '0');
  const next = page.locator('#versions').getByRole('button', { name: NEXT });
  const back = page.locator('#versions').getByRole('button', { name: BACK });

  await expect(back).toBeDisabled();
  for (let step = 1; step < total; step += 1) await next.click();

  await expect(at).toHaveText(`Razlika ${total} od ${total}`);
  await expect(next).toBeDisabled();
  await expect(back).toBeEnabled();
});

test('offers no stepper over a copy he can see all of at once', async ({ page }) => {
  /*
    Deliberate, and the kind of thing that quietly comes back. A copy that fits
    in its box has nothing to steer through, and a control floating over it
    would be chrome he has to read past.

    It depends on a measurement taken after the panel is laid out, which is
    exactly the sort of thing that returns zero when it is moved a line
    earlier — and then the stepper appears over every copy in the app.
  */
  await openCopyOf(page, SHORT);

  await expect(page.locator('#versions .stepper')).toBeHidden();
});

test('takes a copy back through the editor, not straight to the file', async ({ page }) => {
  /*
    The design claim this guards: restoring puts the old text in front of him
    and lets the ordinary save carry it out, so what it writes over is itself
    kept first and it reports like any other edit.

    With the clock held still the save cannot have run yet — so if the file has
    already changed, something wrote to disk behind the editor. The copy's own
    words are not compared against: the pane carries the difference marks and
    their labels as well as his writing.
  */
  const before = await fileOf(page, SHORT);
  expect(before).not.toBeNull();

  await openCopyOf(page, SHORT);
  await page.locator('#versions').getByRole('button', { name: RESTORE }).click();
  await expect(page.locator('#versions')).toBeHidden();

  const nowInFront = await page.locator('#editor').inputValue();
  expect(nowInFront).not.toBe(before);
  expect(await fileOf(page, SHORT)).toBe(before);

  // And then the ordinary save carries it out, with nothing else asked of him.
  await page.clock.runFor(2000);
  expect(await fileOf(page, SHORT)).toBe(nowInFront);
});

test('keeps what was in it before replacing it', async ({ page }) => {
  /*
    The dialog promises in so many words that what is there now will be kept.
    The ordinary save rule would not always have kept it — it declines when
    little enough is going — so the restore takes that copy itself.

    Asked as "is it there afterwards" rather than "was one more written",
    because it very often is there already: what he had is frequently a copy
    still sitting in the folder, and writing a second identical one is how a
    restore used to breed them.
  */
  const before = await fileOf(page, SHORT);
  expect(before).not.toBeNull();

  await openCopyOf(page, SHORT);
  await page.locator('#versions').getByRole('button', { name: RESTORE }).click();
  await expect(page.locator('#versions')).toBeHidden();
  await page.clock.runFor(2000);

  expect(await keptTextsOf(page, SHORT)).toContain(before);
});

/** What every copy kept of a text says. */
const keptTextsOf = (page: Page, id: string): Promise<string[]> =>
  page.evaluate((wanted) => {
    const held = JSON.parse(localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<
      string,
      { text: string }
    >;
    return Object.entries(held)
      .filter(([path]) => path.startsWith(`Tekstovi/Verzije/${wanted}/`))
      .map(([, file]) => file.text);
  }, id);
