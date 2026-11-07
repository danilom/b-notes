import { expect, test, type Page } from '@playwright/test';

/**
 * The AI Lektor from his side, on the test Lektor: no AI, no network, no cost. Any request
 * for an AI service fails the test that makes one, so none of this can ever spend anything.
 */

const LONG_ENOUGH = 'Ovo je sasvim obican tekst koji je dovoljno dugacak da ga citalac moze da procita do kraja.';

let requestsToAi = 0;

async function withTestLektor(page: Page, behaviour: string): Promise<void> {
  await page.evaluate((chosen) => {
    const key = 'b-notes:mock-files';
    const files = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    files['Podaci/lektor-test.json'] = { text: JSON.stringify({ behaviour: chosen }), updatedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(files));
  }, behaviour);
  await page.reload();
  await expect(page.locator('#list .note').first()).toBeVisible();
}

async function writeNewText(page: Page): Promise<void> {
  await page.locator('#new-note').click();
  await page.locator('#editor').fill(`Naslov teksta\n\n${LONG_ENOUGH}`);
}

test.beforeEach(async ({ page }) => {
  requestsToAi = 0;
  await page.route('**/lektor-ai', async (route) => {
    requestsToAi += 1;
    await route.abort();
  });
  await page.goto('/');
  await expect(page.locator('#list .note').first()).toBeVisible();
});

test('asks nothing of any AI service until he opens the Lektor', async ({ page }) => {
  await writeNewText(page);
  await page.locator('#list .note').nth(1).click();
  expect(requestsToAi).toBe(0);
});

test('offers the Lektor only on a text long enough to read', async ({ page }) => {
  await page.locator('#new-note').click();
  await expect(page.locator('#lektor-open')).toBeDisabled();
  await page.locator('#editor').fill(LONG_ENOUGH);
  await expect(page.locator('#lektor-open')).toBeEnabled();
});

test('asks for the keys, by name, when there are none', async ({ page }) => {
  await page.route('**/lektor-ai', (route) => route.fulfill({ json: {} }));
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await expect(page.getByText('API ključ za Google (besplatan)')).toBeVisible();
  await expect(page.getByText('API ključ za Anthropic (plaćen)')).toBeVisible();
});

async function withOnlyKey(page: Page, keys: Record<string, string>): Promise<void> {
  await page.evaluate((saved) => {
    const key = 'b-notes:mock-files';
    const files = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    files['b-notes/lektor.json'] = { text: JSON.stringify(saved), updatedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(files));
  }, keys);
  await page.reload();
  await expect(page.locator('#list .note').first()).toBeVisible();
}

test('with only the free key, greys out the paid Lektor and goes straight to the first step', async ({ page }) => {
  await page.route('**/lektor-ai', (route) => route.fulfill({ json: {} }));
  await withOnlyKey(page, { googleKey: 'not-a-real-key' });
  await writeNewText(page);
  await page.locator('#lektor-open').click();

  await expect(page.getByLabel(/\(Google\)/)).toBeChecked();
  await expect(page.getByLabel(/\(Anthropic\)/)).toBeDisabled();
  await expect(page.locator('label', { hasText: '(Anthropic)' })).toHaveAttribute('title', 'Nije unet API ključ.');
  await expect(page.locator('label', { hasText: '(Google)' })).not.toHaveAttribute('title', /./);
  await expect(page.getByRole('button', { name: /^Pošalji ceo tekst/ })).toHaveAttribute('title', 'Model: gemini-3.6-flash (besplatan)');
});

test('with only the paid key, starts on it, and saving the keys box with nothing new leads back', async ({ page }) => {
  await page.route('**/lektor-ai', (route) => route.fulfill({ json: {} }));
  await withOnlyKey(page, { anthropicKey: 'not-a-real-key' });
  await writeNewText(page);
  await page.locator('#lektor-open').click();

  await expect(page.getByLabel(/\(Anthropic\)/)).toBeChecked();
  await expect(page.getByLabel(/\(Google\)/)).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Pošalji ceo tekst/ })).toHaveAttribute('title', 'Model: claude-opus-5-5 (plaćen)');

  await page.getByRole('button', { name: 'API ključevi' }).click();
  await page.getByRole('button', { name: 'Sačuvaj' }).click();
  await expect(page.getByLabel(/\(Anthropic\)/)).toBeChecked();
});

test('keeps the old text as a version when corrections go in, and says these are only a test', async ({ page }) => {
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  const before = await page.locator('#editor').inputValue();

  await page.locator('#lektor-open').click();
  await expect(page.getByLabel('Probni (bez AI)')).toBeChecked();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await expect(page.locator('.lektor-response')).toContainText('PROBNI', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Pređi na ispravke' }).click();
  await page.getByLabel('Dubinska prerada').check();
  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  await expect(page.getByText('Probni predlozi, bez pravog AI')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Unesi sve izmene u tekst' }).click();
  await expect(page.locator('#toast')).toContainText('Izmene su unete u tekst.');
  await expect(page.locator('#editor')).not.toHaveValue(before);
  await expect(page.locator('#see-versions')).toContainText('(1)');
  expect(requestsToAi).toBe(0);

  // The job is done, so the sidebar goes; opened again after so small a change, the comment is there and says it is about an earlier text.
  await expect(page.locator('body')).not.toHaveClass(/lektor-open/);
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-response')).toContainText('PROBNI');
  await expect(page.locator('.lektor-stale')).toBeVisible();
});

test('does not touch the text when the version cannot be kept', async ({ page }) => {
  await page.goto('/?test');
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  const apply = page.getByRole('button', { name: 'Unesi sve izmene u tekst' });
  await expect(apply).toBeVisible({ timeout: 15_000 });
  const before = await page.locator('#editor').inputValue();

  await page.evaluate(() => (window as unknown as { refuseTheNextWrites: (count: number) => void }).refuseTheNextWrites(1));
  await apply.click();

  await expect(page.locator('#status-text')).toContainText('Izmene nisu unete');
  await expect(page.locator('#editor')).toHaveValue(before);
  await expect(page.getByRole('button', { name: 'Pogledaj ispravke' })).toBeVisible();
});

test('shows corrections already made instead of sending again, until the request or the text differs', async ({ page }) => {
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  await expect(page.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#lektor-dialog button.close').click();
  // Not one stray click away: these may have cost money.
  await expect(page.locator('body')).toHaveClass(/lektor-open/);
  await page.locator('#confirm').getByRole('button', { name: 'Zatvori bez unošenja' }).click();
  await expect(page.locator('body')).not.toHaveClass(/lektor-open/);

  // The text is still what was read, so the comment is what he comes back to, with no send button in the way.
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-response')).toContainText('PROBNI');
  await expect(page.getByRole('button', { name: /^Pošalji ceo tekst/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click();
  const see = page.getByRole('button', { name: 'Pogledaj ispravke' });
  const send = page.getByRole('button', { name: 'Pošalji zahtev za ispravke' });
  await expect(see).toBeVisible();
  await expect(see).toHaveAttribute('title', /^Model: /);
  await expect(page.getByRole('button', { name: 'Pošalji nov zahtev' })).toHaveAttribute('title', /^Model: /);

  await page.getByLabel('Dubinska prerada').check();
  await expect(send).toBeVisible();
  await expect(see).toHaveCount(0);
  await page.getByLabel('Slova i zarezi').check();
  await expect(see).toBeVisible();

  await page.locator('.lektor-note').fill('Bez zareza');
  await expect(send).toBeVisible();
  await page.locator('.lektor-note').fill('');
  await expect(see).toBeVisible();

  await see.click();
  await expect(page.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible();
  await page.locator('#lektor-dialog button.close').click();
  await page.locator('#confirm').getByRole('button', { name: 'Zatvori bez unošenja' }).click();

  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click();
  await page.locator('#editor').fill(`Naslov teksta\n\n${LONG_ENOUGH} Jos jedna recenica.`);
  await expect(send).toBeVisible();
  await expect(see).toHaveCount(0);
});

test('once there is a comment, opens on it with only a note after a change, and sends corrections without asking', async ({ page }) => {
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  await expect(page.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#lektor-dialog button.close').click();
  await page.locator('#confirm').getByRole('button', { name: 'Zatvori bez unošenja' }).click();

  await page.locator('#editor').fill(`Naslov teksta\n\n${LONG_ENOUGH} Jos.`);
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-stale')).toHaveText('Ovaj utisak je o ranijoj verziji teksta.');
  await expect(page.locator('.lektor-stale button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click();

  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  await expect(page.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
});

test('opens on the comment however much has changed and however he last left it', async ({ page }) => {
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Pošalji zahtev za ispravke' }).click();
  await expect(page.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#lektor-dialog button.close').click();
  await page.locator('#confirm').getByRole('button', { name: 'Zatvori bez unošenja' }).click();

  await page.locator('#editor').fill(`Naslov teksta\n\n${LONG_ENOUGH} ${LONG_ENOUGH}`);
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-stale')).toBeVisible();

  // Left on the corrections step.
  await page.getByRole('button', { name: 'Pređi na ispravke' }).click();
  await page.locator('#lektor-open').click();
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-response')).toContainText('PROBNI');

  // Left on the first step, which is still there to go to.
  await page.getByRole('button', { name: 'Traži novi utisak' }).click();
  await expect(page.getByRole('button', { name: 'Postojeći AI utisak' })).toBeVisible();
  await page.locator('#lektor-open').click();
  await page.locator('#lektor-open').click();
  await expect(page.locator('.lektor-response')).toContainText('PROBNI');
});

test('offers no retry once the daily tries are gone, and passes on what the service said', async ({ page }) => {
  await withTestLektor(page, 'limit');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await page.getByRole('button', { name: /^Pošalji ceo tekst/ }).click();
  await expect(page.locator('.lektor-problem')).toContainText('Današnjih 20 besplatnih pokušaja', { timeout: 15_000 });
  await expect(page.locator('.lektor-service-said')).toContainText('requests per day');
  await expect(page.getByRole('button', { name: 'Kopiraj poruku' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pokušaj ponovo' })).toHaveCount(0);
});

test('closes when a new text is started', async ({ page }) => {
  await withTestLektor(page, 'ok');
  await writeNewText(page);
  await page.locator('#lektor-open').click();
  await expect(page.locator('body')).toHaveClass(/lektor-open/);
  await page.locator('#new-note').click();
  await expect(page.locator('body')).not.toHaveClass(/lektor-open/);
});
