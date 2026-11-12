import { expect, test, type Page } from '@playwright/test';

/**
 * The AI Lektor from his side, on the browser build's fake network (src/hosts/mockup/
 * lektor-fake-network.ts): Google and OpenRouter as they really answer, reaching nothing, spending
 * nothing. Any request for the real services fails the test that makes one.
 */

const LONG_ENOUGH = 'Ovo je sasvim obican tekst koji je dovoljno dugacak da ga citalac moze da procita do kraja.';
const TITLE = 'Naslov teksta';

const FREE_38 = 'gemini-3.8-flash';
const FREE_36 = 'gemini-3.6-flash';
const PAID_FLASH = 'google/gemini-3.8-flash';
const OPUS = 'anthropic/claude-opus-5.5';
const FAST = { kind: 'answer', queueMs: 300, thinkMs: 200, writeMs: 400 };

let requestsToRealServices = 0;

interface Day {
  isOffline?: boolean;
  deadKeys?: string[];
  keysDieOnSend?: string[];
  balance?: number | null;
  turns?: Record<string, object[]>;
}

/** Keys saved and a day for the fake network, then the app as it starts with them. Any model not named answers quickly. */
async function setUp(page: Page, { keys = { googleKey: 'g-key', openRouterKey: 'or-key' }, day = {} }: { keys?: Record<string, string>; day?: Day } = {}): Promise<void> {
  const turns = Object.fromEntries([FREE_38, FREE_36, PAID_FLASH, OPUS].map((model) => [model, day.turns?.[model] ?? [FAST]]));
  await page.evaluate(
    ({ saved, fakeDay }) => {
      const key = 'b-notes:mock-files';
      const files = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      files['b-notes/lektor.json'] = { text: JSON.stringify(saved), updatedAt: Date.now() };
      files['Podaci/lektor-fake-network.json'] = { text: JSON.stringify(fakeDay), updatedAt: Date.now() };
      window.localStorage.setItem(key, JSON.stringify(files));
    },
    { saved: keys, fakeDay: { balance: 7.47, ...day, turns } },
  );
  await page.reload();
  await expect(page.locator('#list .note').first()).toBeVisible();
}

async function writeNewText(page: Page, body = LONG_ENOUGH): Promise<void> {
  await page.locator('#new-note').click();
  await page.locator('#editor').fill(`${TITLE}\n\n${body}`);
}

const side = (page: Page) => page.locator('#lektor-side');
const windowDialog = (page: Page) => page.locator('#lektor-dialog');

async function openPanel(page: Page): Promise<void> {
  await page.locator('#lektor-open').click();
  await expect(side(page).locator('.lektor-side-title')).toBeVisible();
}

async function toStepTwo(page: Page): Promise<void> {
  await side(page).getByRole('button', { name: /^Utisak o tekstu/ }).click();
  await expect(side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ })).toBeVisible();
}

async function readUtisak(page: Page): Promise<void> {
  await toStepTwo(page);
  await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
  await expect(side(page).locator('.lektor-response')).toContainText('Probni utisak', { timeout: 15_000 });
}

async function openWindowOn(page: Page, kind: string): Promise<void> {
  await side(page).getByRole('button', { name: /^Ispravke/ }).click();
  await windowDialog(page).getByText(kind, { exact: true }).click();
}

async function sendCorrections(page: Page): Promise<void> {
  await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
  await expect(windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
}

/** Closing the review, saying yes to the question it asks. */
async function closeReview(page: Page): Promise<void> {
  await windowDialog(page).locator('button.close').click();
  await page.locator('#confirm button.danger', { hasText: 'Zatvori' }).click();
  await expect(windowDialog(page)).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  requestsToRealServices = 0;
  await page.route('**/lektor-ai', async (route) => {
    requestsToRealServices += 1;
    await route.abort();
  });
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test.afterEach(() => {
  expect(requestsToRealServices).toBe(0);
});

test.describe('the panel', () => {
  test('asks nothing of any AI service until he opens the Lektor', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await page.locator('#list .note').nth(1).click();
    expect(await page.evaluate(() => document.querySelectorAll('#lektor-side *').length)).toBe(0);
  });

  test('offers the Lektor only on a text long enough to read', async ({ page }) => {
    await page.locator('#new-note').click();
    await expect(page.locator('#lektor-open')).toBeDisabled();
    await page.locator('#editor').fill(LONG_ENOUGH);
    await expect(page.locator('#lektor-open')).toBeEnabled();
  });

  test('with no keys, opens on the keys with no way back, and a pasted key that works leads to the menu', async ({ page }) => {
    await setUp(page, { keys: {} });
    await writeNewText(page);
    await openPanel(page);
    await expect(side(page)).toContainText('AI Lektor: podešavanje');
    await expect(side(page)).toContainText('Dovoljan je jedan.');
    await expect(side(page).getByRole('button', { name: 'Nazad' })).toHaveCount(0);
    await side(page).getByLabel('Besplatni (Google)').fill('novi-kljuc');
    await side(page).getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(side(page)).toContainText('API ključ radi i sačuvan je.');
    await expect(side(page).getByRole('button', { name: /^Utisak o tekstu/ })).toBeVisible();
  });

  test('says the internet is down, with a way to try again, keys or none', async ({ page }) => {
    for (const keys of [{}, { googleKey: 'g' }]) {
      await setUp(page, { keys, day: { isOffline: true } });
      await page.locator('#list .note').first().click();
      await openPanel(page);
      await expect(side(page)).toContainText('Internet ne radi, a AI Lektoru je potreban.');
      await expect(side(page).getByRole('button', { name: 'Pokušaj ponovo' })).toBeVisible();
    }
  });

  test('finds a dead key on opening, says so for the whole Lektor, and the keys screen says which', async ({ page }) => {
    await setUp(page, { day: { deadKeys: ['openrouter'] } });
    await writeNewText(page);
    await openPanel(page);
    await expect(side(page).locator('.lektor-dead-key')).toContainText('API ključ više ne radi.');
    await expect(side(page).getByRole('button', { name: /^Utisak o tekstu/ })).toHaveCount(0);
    await side(page).getByRole('button', { name: 'API ključevi' }).click();
    await expect(side(page)).toContainText('Ovaj ključ više ne radi. Zalepi novi.');
    await expect(side(page).getByLabel('Plaćeni (OpenRouter)')).toHaveAttribute('placeholder', 'Zalepi ključ ovde');
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveAttribute('placeholder', 'Sačuvan');
    await expect(side(page)).toContainText('✓ Radi');
  });

  test('starts step 2 on Besplatni with the tick box ticked and the balance, greying the box on Plaćeni', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await expect(side(page).getByLabel(/^Besplatni „Flash”/)).toBeChecked();
    const tick = side(page).getByLabel(/^Ako čeka duže od 2 minuta/);
    await expect(tick).toBeChecked();
    await expect(side(page)).toContainText('Na računu za plaćene lektore: $7,47');
    const send = side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ });
    await expect(send).toHaveAttribute('title', /Šalje se Guglu\nModel: gemini-3.8-flash \(ako je zauzet: gemini-3.6-flash\)\nAko čeka duže od 2 minuta: firmi OpenRouter, model google\/gemini-3.8-flash/);
    await side(page).getByLabel(/^Plaćeni „Opus”/).check();
    await expect(tick).toBeDisabled();
    await expect(send).toHaveAttribute('title', 'Šalje se firmi OpenRouter\nModel: anthropic/claude-opus-5.5');
    // Back to the menu and in again: Besplatni once more.
    await side(page).getByRole('button', { name: 'Nazad' }).click();
    await toStepTwo(page);
    await expect(side(page).getByLabel(/^Besplatni „Flash”/)).toBeChecked();
  });

  test('starts the tick box unticked under a dollar, saying "malo" in red', async ({ page }) => {
    await setUp(page, { day: { balance: 0.9 } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await expect(side(page).getByLabel(/^Ako čeka duže od 2 minuta/)).not.toBeChecked();
    await expect(side(page).locator('.lektor-balance-low')).toContainText('$0,90 (malo)');
  });

  test('hides the balance and leaves the box unticked when the balance cannot be read', async ({ page }) => {
    await setUp(page, { day: { balance: null } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await expect(side(page).locator('.lektor-balance')).toHaveCount(0);
    await expect(side(page).getByLabel(/^Ako čeka duže od 2 minuta/)).not.toBeChecked();
  });

  test('waits with the text named and a clock, gives up to step 2, and reads it again', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'answer', queueMs: 4000 }, FAST] } } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page)).toContainText(`AI Lektor čita tekst „${TITLE}”…`);
    await expect(side(page)).toContainText('Besplatni lektor često čeka na red');
    await expect(side(page).locator('.lektor-comment-clock')).toContainText(/Prošlo je \d+ s\./);
    await expect(side(page).locator('.lektor-side-dock')).toHaveCount(0);
    await side(page).getByRole('button', { name: 'Odustani od zahteva' }).click();
    await expect(side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ })).toBeVisible();
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page).locator('.lektor-response')).toContainText(`Utisak AI Lektora o tekstu „${TITLE}”:`, { timeout: 15_000 });
  });

  test('signs the utisak by who wrote it, with a paid one’s cost, and brings "AI može da pogreši" into view', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByLabel(/^Plaćeni „Opus”/).check();
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    const signed = side(page).locator('.lektor-comment-notes .lektor-service-line');
    await expect(signed).toContainText('AI Lektor: Plaćeni „Opus” · upravo sad · $0,05', { timeout: 15_000 });
    await side(page).locator('.lektor-response').click();
    await side(page).getByRole('button', { name: /AI može da pogreši/ }).click();
    await expect(side(page).locator('.lektor-about-ai')).toBeInViewport();
  });

  test('closing cancels a utisak being read, and opens again on step 2 with nothing arriving later', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'answer', queueMs: 1500 }] } } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page)).toContainText('AI Lektor čita tekst');
    await page.locator('#lektor-open').click();
    await expect(page.locator('body')).not.toHaveClass(/lektor-open/);
    await page.waitForTimeout(3500);
    await openPanel(page);
    await expect(side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ })).toBeVisible();
    await expect(side(page).locator('.lektor-response')).toHaveCount(0);
  });

  test('opens on the utisak whenever there is one, with the note after a big change', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await readUtisak(page);
    await page.locator('#lektor-open').click();
    await page.locator('#editor').fill(`${TITLE}\n\n${LONG_ENOUGH} ${LONG_ENOUGH} ${LONG_ENOUGH}`);
    await openPanel(page);
    await expect(side(page).locator('.lektor-response')).toContainText('Probni utisak');
    await expect(side(page).locator('.lektor-stale')).toContainText(/napisan pre tvojih poslednjih izmena \(oko \d+ reči\)/);
  });

  test('stays with a utisak being read while another text is open, and offers the way to it when done', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'answer', queueMs: 2500 }] } } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await page.locator('#list .note').nth(2).click();
    await expect(side(page)).toContainText(`AI Lektor čita tekst „${TITLE}”…`);
    await expect(side(page)).toContainText(`Utisak o tekstu „${TITLE}” je gotov.`, { timeout: 15_000 });
    await side(page).getByRole('button', { name: 'Otvori tekst i utisak' }).click();
    await expect(page.locator('#editor')).toHaveValue(new RegExp(`^${TITLE}`));
    await expect(side(page).locator('.lektor-response')).toContainText('Probni utisak');
  });

  test('stops a utisak whose text is deleted meanwhile, and says so plainly', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'answer', queueMs: 5000 }] } } });
    await writeNewText(page);
    await expect(page.locator('#status-text')).toContainText('Sačuvano');
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page)).toContainText('AI Lektor čita tekst');
    await page.locator('#delete-note').click();
    await page.locator('#confirm').getByRole('button', { name: 'Obriši', exact: true }).click();
    await expect(side(page)).toContainText(`Tekst „${TITLE}” je obrisan.`);
    await expect(side(page)).toContainText('Zato utisak o njemu neće stići.');
    await expect(side(page).locator('.lektor-problem')).toHaveCount(0);
  });

  test('says Google is busy with the service’s own words, and sends to the paid Lektor from there', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy' }] } } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByLabel(/^Ako čeka duže od 2 minuta/).uncheck();
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page).locator('.lektor-problem')).toContainText('Gugl je sada zauzet.', { timeout: 15_000 });
    await expect(side(page).locator('.lektor-service-said')).toContainText('high demand');
    await expect(side(page).getByRole('button', { name: 'Kopiraj poruku' })).toBeVisible();
    await expect(side(page).getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);
    await side(page).getByRole('button', { name: /^Pošalji plaćenom lektoru/ }).click();
    await expect(side(page).locator('.lektor-comment-notes')).toContainText('Plaćeni „Opus”', { timeout: 15_000 });
  });

  test('says when the free Lektor works again once its day is spent, with no retry', async ({ page }) => {
    await setUp(page, { keys: { googleKey: 'g' }, day: { turns: { [FREE_38]: [{ kind: 'daily-limit' }], [FREE_36]: [{ kind: 'daily-limit' }] } } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page).locator('.lektor-problem')).toContainText('Besplatni lektor je za danas potrošen.', { timeout: 15_000 });
    await expect(side(page).locator('.lektor-problem')).toContainText(/Ponovo radi posle \d\d:\d\d\./);
    await expect(side(page).getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);
  });

  test('shows the dead-key screen with a way back when a key is refused on sending, never as busy', async ({ page }) => {
    await setUp(page, { day: { keysDieOnSend: ['gemini'] } });
    await writeNewText(page);
    await openPanel(page);
    await toStepTwo(page);
    await side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ }).click();
    await expect(side(page).locator('.lektor-dead-key')).toContainText('API ključ više ne radi.', { timeout: 15_000 });
    await expect(side(page)).not.toContainText('zauzet');
    await side(page).getByRole('button', { name: 'Nazad' }).click();
    await expect(side(page).getByRole('button', { name: /^Pošalji tekst lektoru/ })).toBeVisible();
  });

  test('closes when a new text is started', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await expect(page.locator('body')).toHaveClass(/lektor-open/);
    await page.locator('#new-note').click();
    await expect(page.locator('body')).not.toHaveClass(/lektor-open/);
  });
});

test.describe('pasting the keys', () => {
  // Made up, of the right shapes: none of these is anyone's key.
  const GOOGLE = `AQ.${'Ab3_x-Yz9Q'.repeat(5)}`;
  const OPENROUTER = `sk-or-v1-${'0123456789abcdef'.repeat(4)}`;
  const MESSAGE = `Zdravo,\n\nevo ključeva za Lektor:\nOpenRouter: ${OPENROUTER}\nGoogle: ${GOOGLE}\n\nPozdrav`;

  /** Something on the clipboard, as he would have copied it. */
  async function copied(page: Page, text: string): Promise<void> {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate((what) => navigator.clipboard.writeText(what), text);
  }

  /** The keys as saved, read from the pretend b-notes folder. */
  async function savedKeys(page: Page): Promise<unknown> {
    return page.evaluate(() => {
      const files = JSON.parse(window.localStorage.getItem('b-notes:mock-files') ?? '{}') as Record<string, { text: string } | undefined>;
      const saved = files['b-notes/lektor.json'];
      return saved === undefined ? null : (JSON.parse(saved.text) as unknown);
    });
  }

  async function toKeys(page: Page): Promise<void> {
    await setUp(page, { keys: {} });
    await writeNewText(page);
    await openPanel(page);
    await expect(side(page)).toContainText('AI Lektor: podešavanje');
  }

  test('fills both boxes from a copied message, says so, and saves nothing until Sačuvaj', async ({ page }) => {
    await toKeys(page);
    await copied(page, MESSAGE);
    await side(page).getByRole('button', { name: 'Zalepi ključeve' }).click();
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveValue(GOOGLE);
    await expect(side(page).getByLabel('Plaćeni (OpenRouter)')).toHaveValue(OPENROUTER);
    await expect(side(page).locator('.lektor-keys-pasted')).toHaveText('Oba ključa su upisana. Pritisni Sačuvaj.');
    await expect(side(page).getByRole('button', { name: 'Sačuvaj' })).toBeFocused();
    expect(await savedKeys(page)).toEqual({});
    await page.keyboard.press('Enter');
    await expect(side(page)).toContainText('API ključ radi i sačuvan je.');
    expect(await savedKeys(page)).toEqual({ googleKey: GOOGLE, openRouterKey: OPENROUTER });
  });

  test('sorts a paste into one box into both, whichever box it went into', async ({ page }) => {
    await toKeys(page);
    await copied(page, `${OPENROUTER}${GOOGLE}`);
    await side(page).getByLabel('Plaćeni (OpenRouter)').click();
    await page.keyboard.press('Control+V');
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveValue(GOOGLE);
    await expect(side(page).getByLabel('Plaćeni (OpenRouter)')).toHaveValue(OPENROUTER);
    await expect(side(page).locator('.lektor-keys-pasted')).toHaveText('Oba ključa su upisana. Pritisni Sačuvaj.');
  });

  test('moves a single key pasted into the other box to its own, and names it', async ({ page }) => {
    await toKeys(page);
    await copied(page, ` ${OPENROUTER}\n`);
    await side(page).getByLabel('Besplatni (Google)').click();
    await page.keyboard.press('Control+V');
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveValue('');
    await expect(side(page).getByLabel('Plaćeni (OpenRouter)')).toHaveValue(OPENROUTER);
    await expect(side(page).locator('.lektor-keys-pasted')).toHaveText('Upisan je ključ za Plaćeni (OpenRouter). Pritisni Sačuvaj.');
  });

  test('says there is no key when what was copied holds none, and changes no box', async ({ page }) => {
    await toKeys(page);
    await copied(page, LONG_ENOUGH);
    await side(page).getByRole('button', { name: 'Zalepi ključeve' }).click();
    await expect(side(page).locator('.lektor-keys-pasted')).toHaveText('U kopiranom tekstu nema ključa. Kopiraj poruku s ključevima, pa pritisni ponovo.');
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveValue('');
    await expect(side(page).getByLabel('Plaćeni (OpenRouter)')).toHaveValue('');
  });

  test('leaves a paste holding no key in the box it went into, as any paste', async ({ page }) => {
    await toKeys(page);
    await copied(page, 'neki-drugi-kljuc');
    await side(page).getByLabel('Besplatni (Google)').click();
    await page.keyboard.press('Control+V');
    await expect(side(page).getByLabel('Besplatni (Google)')).toHaveValue('neki-drugi-kljuc');
    await expect(side(page).locator('.lektor-keys-pasted')).toHaveCount(0);
  });
});

test.describe('the corrections window', () => {
  test('shows the kinds with nothing picked, then Slova i zarezi said rather than asked, with the tick box', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await expect(windowDialog(page)).toContainText('Izaberi vrstu ispravke sa leve strane.');
    await expect(windowDialog(page)).toContainText('Tvoj tekst se ne menja dok je ovaj prozor otvoren.');
    await windowDialog(page).getByText('Slova i zarezi', { exact: true }).click();
    await expect(windowDialog(page).locator('.lektor-window-detail .lektor-service-line')).toHaveText('AI Lektor: Besplatni „Flash”');
    await expect(windowDialog(page).getByLabel(/^Ako čeka duže od 2 minuta/)).toBeChecked();
    await expect(windowDialog(page)).toContainText('Na računu za plaćene lektore: $7,47');
  });

  test('waits through its stages, reviews, puts the corrections in with a version kept, and the panel stays', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    const before = await page.locator('#editor').inputValue();
    await openPanel(page);
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await windowDialog(page).getByText('Slova i zarezi', { exact: true }).click();
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page).locator('.lektor-stages')).toContainText('Zahtev čeka u redu…');
    await expect(windowDialog(page).locator('.lektor-window-clock')).toContainText(/Prošlo je \d+ s/);
    await expect(windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
    await expect(windowDialog(page).locator('.lektor-review-head .lektor-service-line')).toContainText(/^Slova i zarezi · Besplatni „Flash” · upravo sad · veće promene: \d+, sitne popravke: \d+\.$/);
    await windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' }).click();
    await expect(page.locator('#toast')).toContainText('Izmene su unete u tekst.');
    await expect(page.locator('#editor')).not.toHaveValue(before);
    await expect(page.locator('#see-versions')).toContainText('(1)');
    await expect(page.locator('body')).toHaveClass(/lektor-open/);
    await expect(side(page).getByRole('button', { name: /^Utisak o tekstu/ })).toBeVisible();
  });

  test('does not touch the text when the version cannot be kept', async ({ page }) => {
    await page.goto('/?test');
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await sendCorrections(page);
    const before = await page.locator('#editor').inputValue();
    await page.evaluate(() => (window as unknown as { refuseTheNextWrites: (count: number) => void }).refuseTheNextWrites(1));
    await windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' }).click();
    await expect(page.locator('#status-text')).toContainText('Izmene nisu unete');
    await expect(page.locator('#editor')).toHaveValue(before);
  });

  test('hands a slow free request to paid Flash at two minutes, saying so, and signs it by Flash', async ({ page }) => {
    await page.clock.install();
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'queue-forever' }], [FREE_36]: [{ kind: 'queue-forever' }] } } });
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page)).toContainText('Ako ne krene za 2 minuta, šalje se plaćenom lektoru');
    await page.clock.fastForward('01:05');
    await expect(windowDialog(page)).toContainText('gemini-3.6-flash (rezervni)');
    await page.clock.fastForward('01:00');
    await expect(windowDialog(page).locator('.lektor-stages .lektor-service-line')).toHaveText('AI Lektor: Plaćeni „Flash”');
    await expect(windowDialog(page).locator('.lektor-stage-mark-moved')).toHaveCount(1);
    await page.clock.fastForward('00:05');
    await expect(windowDialog(page).locator('.lektor-review-head .lektor-service-line')).toContainText('Plaćeni „Flash” · ', { timeout: 15_000 });
    await expect(windowDialog(page).locator('.lektor-review-head .lektor-service-line')).toContainText('plaćeno $0,01');
  });

  test('keeps the set it made, shows it as a card on the next opening, and says when it is void', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await sendCorrections(page);
    await closeReview(page);
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await windowDialog(page).getByText('Slova i zarezi', { exact: true }).click();
    await expect(windowDialog(page).locator('.lektor-ready-card')).toHaveCount(1);
    await expect(windowDialog(page).locator('.lektor-ready-card')).toContainText('Predlozi lektora „Flash”');
    await windowDialog(page).getByRole('button', { name: 'Novi zahtev za ispravke…' }).click();
    await expect(windowDialog(page).getByRole('button', { name: 'Nazad na predloge' })).toBeVisible();
    await windowDialog(page).getByRole('button', { name: 'Nazad na predloge' }).click();
    await windowDialog(page).getByRole('button', { name: 'Pogledaj' }).click();
    await expect(windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible();
    // Nazad never asks, and leads back to the card.
    await windowDialog(page).getByRole('button', { name: 'Nazad' }).click();
    await expect(page.locator('#confirm')).toBeHidden();
    await expect(windowDialog(page).locator('.lektor-ready-card')).toHaveCount(1);
    await windowDialog(page).locator('footer').getByRole('button', { name: 'Zatvori' }).click();
    await page.locator('#confirm button.danger', { hasText: 'Zatvori' }).click();
    await expect(windowDialog(page)).toBeHidden();
    await page.locator('#editor').fill(`${TITLE}\n\n${LONG_ENOUGH} Promenjeno.`);
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await windowDialog(page).getByText('Slova i zarezi', { exact: true }).click();
    await expect(windowDialog(page)).toContainText('Stari predlozi više ne važe, tekst je promenjen.');
    await expect(windowDialog(page).locator('.lektor-ready-card')).toHaveCount(0);
  });

  test('asks before closing only when there are kept suggestions', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await windowDialog(page).locator('footer').getByRole('button', { name: 'Zatvori' }).click();
    await expect(windowDialog(page)).toBeHidden();
    await openWindowOn(page, 'Slova i zarezi');
    await sendCorrections(page);
    await windowDialog(page).getByRole('button', { name: 'Nazad' }).click();
    await windowDialog(page).locator('footer').getByRole('button', { name: 'Zatvori' }).click();
    await expect(page.locator('#confirm')).toContainText('Zatvori AI ispravke');
    await page.locator('#confirm button.danger', { hasText: 'Zatvori' }).click();
    await expect(windowDialog(page)).toBeHidden();
  });

  test('offers Opus for the rework kinds, holds Plaćeni across them until the window closes, and says what it cost last time', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Stilska dorada');
    await expect(windowDialog(page).getByLabel(/^Besplatni „Flash”/)).toBeChecked();
    await windowDialog(page).getByLabel(/^Plaćeni „Opus”/).check();
    await windowDialog(page).getByText('Dubinska prerada', { exact: true }).click();
    await expect(windowDialog(page).getByLabel(/^Plaćeni „Opus”/)).toBeChecked();
    await sendCorrections(page);
    await expect(windowDialog(page).locator('.lektor-review-head .lektor-service-line')).toContainText('Plaćeni „Opus” · upravo sad · plaćeno $0,05');
    await closeReview(page);
    await openWindowOn(page, 'Dubinska prerada');
    await windowDialog(page).getByRole('button', { name: 'Novi zahtev za ispravke…' }).click();
    await expect(windowDialog(page).getByLabel(/^Besplatni „Flash”/)).toBeChecked();
    await windowDialog(page).getByLabel(/^Plaćeni „Opus”/).check();
    await expect(windowDialog(page)).toContainText('Prošli put za ovaj tekst: $0,05');
  });

  test('folds the instructions, showing the whole English one sent and his own note when opened', async ({ page }) => {
    await setUp(page);
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Pravopis i gramatika');
    await expect(windowDialog(page).locator('.lektor-prompt')).toHaveCount(0);
    await windowDialog(page).getByRole('button', { name: /Uputstva za AI/ }).click();
    await expect(windowDialog(page).locator('.lektor-prompt')).toContainText('Return the whole text');
    await windowDialog(page).locator('.lektor-note').fill('Bez zareza');
    await windowDialog(page).locator('footer').getByRole('button', { name: 'Zatvori' }).click();
    await side(page).getByRole('button', { name: /^Ispravke/ }).click();
    await windowDialog(page).getByText('Pravopis i gramatika', { exact: true }).click();
    await expect(windowDialog(page).locator('.lektor-note')).toHaveValue('Bez zareza');
  });

  test('says the money is gone on paid, and sends to the free Lektor from there', async ({ page }) => {
    await setUp(page, { day: { turns: { [OPUS]: [{ kind: 'no-credit' }] } } });
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Dubinska prerada');
    await windowDialog(page).getByLabel(/^Plaćeni „Opus”/).check();
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page).locator('.lektor-problem')).toContainText('Plaćeni iznos je potrošen.', { timeout: 15_000 });
    await windowDialog(page).getByRole('button', { name: /^Pošalji besplatnom lektoru/ }).click();
    await expect(windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
  });

  test('says the free one could not take it and there is no money left, after a hand-over, with no shortcut', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'busy' }], [FREE_36]: [{ kind: 'busy' }], [PAID_FLASH]: [{ kind: 'no-credit' }] } } });
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page).locator('.lektor-problem')).toContainText('za plaćenog nema više novca', { timeout: 15_000 });
    await expect(windowDialog(page).getByRole('button', { name: /^Pošalji (besplatnom|plaćenom) lektoru/ })).toHaveCount(0);
  });

  test('sends a key refused on sending to the keys screen in the panel, closing the window', async ({ page }) => {
    await setUp(page, { day: { keysDieOnSend: ['gemini'] } });
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page).locator('.lektor-dead-key')).toContainText('Zovi za pomoć.', { timeout: 15_000 });
    await windowDialog(page).getByRole('button', { name: 'API ključevi' }).click();
    await expect(windowDialog(page)).toBeHidden();
    await expect(side(page)).toContainText('Ovaj ključ više ne radi. Zalepi novi.');
  });

  test('offers trying again when the internet goes as he sends, and that works once it is back', async ({ page }) => {
    await setUp(page, { day: { turns: { [FREE_38]: [{ kind: 'offline' }, FAST] } } });
    await writeNewText(page);
    await openPanel(page);
    await openWindowOn(page, 'Slova i zarezi');
    await windowDialog(page).getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
    await expect(windowDialog(page).locator('.lektor-problem')).toContainText('Internet ne radi, a AI Lektoru je potreban.', { timeout: 15_000 });
    await expect(windowDialog(page).getByRole('button', { name: /^Pošalji (besplatnom|plaćenom) lektoru/ })).toHaveCount(0);
    await windowDialog(page).getByRole('button', { name: 'Pokušaj ponovo' }).click();
    await expect(windowDialog(page).getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
  });

  test('draws every change in the look chosen, and the chosen one again closes what he opened', async ({ page }) => {
    await setUp(page);
    await writeNewText(page, `${LONG_ENOUGH} ${LONG_ENOUGH} ${LONG_ENOUGH}`);
    await openPanel(page);
    await openWindowOn(page, 'Dubinska prerada');
    await sendCorrections(page);
    const dialog = windowDialog(page);
    const result = dialog.getByLabel('samo rezultat');
    const marked = dialog.getByLabel('izmene označene');
    await expect(dialog.locator('.lektor-view-title')).toHaveText('Izgled izmena:');
    await expect(result).toBeChecked();
    const collapsed = await dialog.locator('.review-text .diff-resolved').count();
    expect(collapsed).toBeGreaterThan(1);
    await dialog.locator('.review-text .diff-resolved').first().click();
    await expect(dialog.locator('.review-text .diff-resolved')).toHaveCount(collapsed - 1);
    await result.click();
    await expect(dialog.locator('.review-text .diff-resolved')).toHaveCount(collapsed);
    await marked.click();
    await expect(dialog.locator('.review-text .diff-resolved')).toHaveCount(0);
    await expect(dialog.locator('.diff-legend')).toContainText('biće uneto');
  });

  test('raises the bar over a change on a click and never on hovering, and steps without it until a change is clicked', async ({ page }) => {
    await setUp(page);
    await writeNewText(page, `${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH}`);
    await openPanel(page);
    await openWindowOn(page, 'Stilska dorada');
    await sendCorrections(page);
    const dialog = windowDialog(page);
    const bar = dialog.locator('.diff-bar');
    const changes = dialog.locator('.review-text .diff-change');
    const next = dialog.locator('.review-steps').getByRole('button', { name: 'Sledeća' });
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await dialog.locator('.review-text').click({ position: { x: 5, y: 5 } });
    await expect(bar).toBeHidden();
    await changes.nth(2).hover();
    await page.waitForTimeout(800);
    await expect(bar).toBeHidden();
    await next.click();
    await expect(dialog.locator('.review-steps')).toContainText('Razlika 2 od');
    await expect(bar).toBeHidden();
    await changes.nth(2).click();
    await expect(bar).toBeVisible();
  });

  test('stands the bar on a band above its line, covering none of his words and leaving his line where it was', async ({ page }) => {
    await setUp(page);
    await writeNewText(page, `${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH}`);
    await openPanel(page);
    await openWindowOn(page, 'Stilska dorada');
    await sendCorrections(page);
    const dialog = windowDialog(page);
    const change = dialog.locator('.review-text .diff-change').nth(3);
    await dialog.locator('.review-text').click({ position: { x: 5, y: 5 } });
    await expect(dialog.locator('.diff-bar-band')).toHaveCount(0);
    const before = await wordsTop(change);
    await change.click();
    await expect(dialog.locator('.diff-bar-band .diff-bar')).toBeVisible();
    expect(Math.abs((await wordsTop(change)) - before)).toBeLessThan(1);
    expect(await wordsUnderBar(page)).toEqual([]);
    // A click on the band beside the buttons does nothing.
    const band = await dialog.locator('.diff-bar-band').boundingBox();
    const buttons = await dialog.locator('.diff-bar').boundingBox();
    if (band === null || buttons === null) throw new Error('The band or its bar is not drawn');
    await page.mouse.click(buttons.x + buttons.width + 20, band.y + band.height / 2);
    await expect(dialog.locator('.diff-bar-band .diff-bar')).toBeVisible();
    await dialog.locator('.diff-bar .stepper-close').click();
    await expect(dialog.locator('.diff-bar-band')).toHaveCount(0);
    expect(Math.abs((await wordsTop(change)) - before)).toBeLessThan(1);
  });

  test('keeps the band while he types his own wording, and closes it as he finishes', async ({ page }) => {
    await setUp(page);
    await writeNewText(page, `${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH}`);
    await openPanel(page);
    await openWindowOn(page, 'Stilska dorada');
    await sendCorrections(page);
    const dialog = windowDialog(page);
    const change = dialog.locator('.review-text .diff-change').nth(2);
    await change.click();
    const before = await wordsTop(change);
    await dialog.locator('.diff-bar').getByRole('button', { name: /^Izmeni/ }).click();
    const field = dialog.locator('.diff-edit');
    await expect(field).toBeFocused();
    await expect(dialog.locator('.diff-bar-band')).toHaveCount(1);
    await expect(dialog.locator('.diff-bar')).toBeHidden();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('nesto sasvim moje');
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.diff-bar-band')).toHaveCount(0);
    const mine = dialog.locator('.review-text .diff-current');
    await expect(mine).toContainText('nesto sasvim moje');
    expect(Math.abs((await wordsTop(mine)) - before)).toBeLessThan(1);
  });

  test('copies only the text as it will be, from either view, whatever the selection starts on', async ({ page }) => {
    await setUp(page);
    await writeNewText(page, `${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH} ${LONG_ENOUGH}\n\n${LONG_ENOUGH}`);
    await openPanel(page);
    await openWindowOn(page, 'Stilska dorada');
    await sendCorrections(page);
    const dialog = windowDialog(page);
    await dialog.locator('.review-text .diff-change').nth(1).click();
    await dialog.locator('.diff-bar').getByRole('button', { name: /^Vrati staro/ }).click();
    // A choice lands a moment after the click, once the other wordings have faded.
    await expect(dialog.locator('.review-text .diff-change').nth(1).locator('.diff-resolved')).toHaveCount(1);
    await dialog.locator('.review-text .diff-change').nth(3).click();
    await expect(dialog.locator('.diff-bar-band .diff-bar')).toBeVisible();
    const fromTheText = await copyOf(page, '.review-text');
    const fromTheLegend = await copyOf(page, '.diff-legend');
    await dialog.getByLabel('samo rezultat').click();
    const fromTheResult = await copyOf(page, '.review-text');
    await dialog.getByRole('button', { name: 'Unesi sve izmene u tekst' }).click();
    await expect(dialog).toBeHidden();
    const taken = await page.locator('#editor').inputValue();
    expect(fromTheText).toBe(taken);
    expect(fromTheLegend).toBe(taken);
    expect(fromTheResult).toBe(taken);
    expect(fromTheText).not.toMatch(/Vrati staro|Prihvati|Izmeni|↵|‸/);
  });
});

/** Where a change's words start on the screen: its letters, not its box, which the selection's grey reaches above. */
async function wordsTop(change: ReturnType<Page['locator']>): Promise<number> {
  return change.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.textContent?.trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getClientRects()[0];
      if (box !== undefined) return box.top;
    }
    throw new Error('The change has no words drawn');
  });
}

/** His words the bar is drawn over, if any. */
async function wordsUnderBar(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bar = document.querySelector('#lektor-dialog .diff-bar');
    const text = document.querySelector('#lektor-dialog .review-text');
    if (bar === null || text === null) throw new Error('No bar or no text');
    const over = bar.getBoundingClientRect();
    const covered: string[] = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (bar.contains(node) || node.textContent?.trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        const meets = line.right > over.left && line.left < over.right && line.bottom > over.top + 1 && line.top < over.bottom - 1;
        if (meets) covered.push(node.textContent ?? '');
      }
    }
    return covered;
  });
}

/**
 * What a copy of the review puts on the clipboard, for a selection from the start of what `from`
 * names to the end of the text, sent to the page as the browser sends it.
 */
async function copyOf(page: Page, from: string): Promise<string> {
  return page.evaluate((startAt) => {
    const start = document.querySelector(`#lektor-dialog ${startAt}`);
    const text = document.querySelector('#lektor-dialog .review-text');
    if (start === null || text === null) throw new Error(`Nothing to select from ${startAt}`);
    const range = document.createRange();
    range.setStartBefore(start);
    range.setEnd(text, text.childNodes.length);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const clipboard = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    selection?.removeAllRanges();
    return clipboard.getData('text/plain');
  }, from);
}

test('in dark mode, draws the marks brighter and keeps the menu pictures in their own colours', async ({ page }) => {
  await setUp(page);
  await writeNewText(page);
  await openPanel(page);
  await toStepTwo(page);
  const colours = async (): Promise<[string, string]> =>
    page.evaluate(() => {
      const mark = document.querySelector('#lektor-side .lektor-choice-mark-free');
      const wood = document.querySelector('#lektor-side .lektor-picture .ic-wood');
      return [mark === null ? '' : getComputedStyle(mark).color, wood === null ? '' : getComputedStyle(wood).fill];
    });
  const [lightMark, lightWood] = await colours();
  await page.evaluate(() => {
    document.documentElement.dataset['mode'] = 'dark';
  });
  const [darkMark, darkWood] = await colours();
  expect(darkMark).not.toBe(lightMark);
  expect(darkWood).toBe(lightWood);
});

test('switches the fake AI network on in Advanced, says so over the app, and turns it off from there', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'b-notes:mock-files';
    const files = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    files['b-notes/lektor.json'] = { text: JSON.stringify({ googleKey: 'g', openRouterKey: 'o' }), updatedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(files));
  });
  await page.locator('#appearance-button').click();
  await page.getByRole('button', { name: 'Advanced settings' }).click();
  await page.locator('#confirm input').fill('advanced');
  await page.locator('#confirm').getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Fake AI network').check();
  await page.getByRole('button', { name: 'Apply and restart' }).click();
  await expect(page.locator('#list .note').first()).toBeVisible();
  const overlay = page.locator('.fake-network-overlay');
  await expect(overlay).toContainText('FAKE AI NETWORK');
  await expect(overlay.getByLabel('Fake AI network scenario')).toHaveValue('normal');
  await overlay.getByLabel('Fake AI network scenario').selectOption('Google busy');
  // Kept over a restart, and above the Lektor's own window.
  await page.reload();
  await expect(overlay.getByLabel('Fake AI network scenario')).toHaveValue('Google busy');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await side(page).getByRole('button', { name: /^Ispravke/ }).click();
  await expect(windowDialog(page)).toBeVisible();
  await expect(overlay).toBeInViewport();
  await windowDialog(page).locator('footer').getByRole('button', { name: 'Zatvori' }).click();
  await overlay.getByRole('button', { name: 'Turn off' }).click();
  await expect(overlay).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#list .note').first()).toBeVisible();
  await expect(page.locator('.fake-network-overlay')).toHaveCount(0);
});
