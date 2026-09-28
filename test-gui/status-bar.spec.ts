import { expect, test } from '@playwright/test';

/**
 * The strip along the foot of his writing, measured rather than described.
 *
 * Both of these are faults that actually shipped, and neither could have been
 * caught by a test that does not lay the page out: a button added beside the
 * others and sized by nothing because the rule that shapes them did not name
 * it, and a row that grew past the window and gave the whole app a horizontal
 * scrollbar with the last button off the side of the screen.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The seed lands before anything is worth measuring.
  await expect(page.locator('#list .note').first()).toBeVisible();
  // A text has to be open, or the buttons that act on one are disabled and
  // several of them are not laid out the way he will meet them.
  await page.locator('#list .note').first().click();
  await expect(page.locator('#editor')).not.toHaveValue('');
  // Typed into, so it is b-notes' own — taken over from Resoph if it was
  // there — and every button in the strip can be pressed, Premesti u Resoph
  // too: the strip as he meets it most.
  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially('x');
  await expect(page.locator('#move-to-resoph')).toBeEnabled();
});

test('every button in the strip is the same size as the others', async ({ page }) => {
  /*
    Kopiraj ceo tekst arrived half again as tall as its neighbours, a size
    larger, and laid out as a block rather than a row — because the rule that
    shapes them was written as a list of two ids and the new one was not on it.

    Measured against each other rather than against a number: what matters is
    that they match, and the numbers all move when he changes the text size.
  */
  const shapes = await page.locator('#status .status-action').evaluateAll((buttons) =>
    buttons.map((button) => {
      const seen = getComputedStyle(button);
      return {
        name: button.textContent?.trim() ?? '',
        height: Math.round(button.getBoundingClientRect().height),
        fontSize: seen.fontSize,
        display: seen.display,
      };
    }),
  );

  expect(shapes.length).toBeGreaterThan(3);
  const [first] = shapes;
  if (first === undefined) throw new Error('no buttons in the strip');
  for (const shape of shapes) {
    expect(shape, `${shape.name} against ${first.name}`).toMatchObject({
      height: first.height,
      fontSize: first.fontSize,
      display: first.display,
    });
  }
});

test('never gives the window a sideways scrollbar, however narrow it is', async ({ page }) => {
  /*
    Four buttons do not fit beside the status line on a narrow window. They
    wrap now; before that the row simply grew, and the app he has never
    scrolled sideways in his life acquired a bar along the bottom with Izgled
    somewhere past the edge of it.

    Narrow rather than his own window, because the way there on his screen is
    the largest text size: everything in the strip is sized in `em`.
  */
  for (const width of [1400, 1100, 900, 760]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      status: (() => {
        const strip = document.getElementById('status');
        return strip === null ? 0 : strip.scrollWidth - strip.clientWidth;
      })(),
    }));
    expect(overflow, `at ${width}px`).toEqual({ page: 0, status: 0 });
  }
});

/*
  His b-notes window on each of his laptops, maximised: both 1920 pixels wide
  at 150 %, so 1280 CSS pixels, less the title bar and taskbar in height. The
  same sizes as tools/his-screens.html, where they are explained.
*/
const HIS_WINDOWS = [
  { laptop: 'Dell', width: 1280, height: 730 },
  { laptop: 'Asus', width: 1280, height: 650 },
];

test('keeps the strip to its two rows at the size of his own windows', async ({ page }) => {
  // The buttons for his text on top; the status line, Premesti u Resoph and
  // Izgled below. Wrapping further is the fallback, not the arrangement: if
  // his own window starts needing a third row, the strip has outgrown the
  // space and wants deciding about rather than quietly taking another line of
  // his writing.
  for (const { laptop, width, height } of HIS_WINDOWS) {
    await page.setViewportSize({ width, height });
    const rows = await page.locator('#status .status-action').evaluateAll((buttons) => {
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      return new Set(tops).size;
    });

    expect(rows, `on his ${laptop}`).toBe(2);
  }
});

test('puts the strip on one row where the list is folded away and there is room', async ({ page }) => {
  // Every line the strip does not take is a line of his writing.
  for (const { laptop, width, height } of HIS_WINDOWS) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Sakrij listu tekstova' }).click();
    // Once the list has slid out of the way.
    await expect(page.locator('#side')).toBeHidden();
    const rows = await page.locator('#status .status-action').evaluateAll((buttons) => {
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      return new Set(tops).size;
    });
    const cut = await page.locator('#status-text').evaluate((element) => element.scrollWidth > element.clientWidth);

    expect(rows, `on his ${laptop}`).toBe(1);
    expect(cut, `the status line on his ${laptop}`).toBe(false);
    await page.getByRole('button', { name: 'Prikaži listu tekstova' }).click();
  }
});

test('shows the status line whole on his screens, and cut short with the whole of it on hover where it cannot be', async ({
  page,
}) => {
  const line = page.locator('#status-text');
  await expect(line).not.toHaveText('');

  for (const { laptop, width, height } of HIS_WINDOWS) {
    await page.setViewportSize({ width, height });
    const cut = await line.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(cut, `on his ${laptop}`).toBe(false);
    await expect(line, `on his ${laptop}`).not.toHaveAttribute('title');
  }

  // Narrower than any window of his, so the sentence cannot fit.
  await page.setViewportSize({ width: 560, height: 650 });
  await expect.poll(() => line.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(line).toHaveAttribute('title', (await line.textContent()) ?? '');
});
