import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/**
 * The AI Lektor in the app itself, Electron and all, the one place where a request crosses
 * from the window to the background process that sends it, and its progress crosses back.
 * The browser build has no such crossing, so nothing else tests it: a break there would leave
 * the wait screen on its first line until the answer came.
 *
 * The background process asks a stand-in on this computer (B_NOTES_LEKTOR_ADDRESSES), which
 * answers from the replies recorded from Google and OpenRouter (test/fixtures/lektor-api/),
 * streamed at their recorded pace, sped up. Nothing reaches a real service, and the run keeps
 * everything of its own in a temporary folder: settings (B_NOTES_TEST_DATA), notes, and the
 * home folder where Resoph's settings would be looked for, so this machine's are not touched.
 */

const ROOT = path.join(import.meta.dirname, '..');
const RECORDINGS = path.join(ROOT, 'test', 'fixtures', 'lektor-api');

/** Recorded pauses, shortened: a 51-second queue becomes a few seconds; and none shorter than a stage needs to be drawn. */
const PACE = 0.05;
const LONGEST_PAUSE_MS = 600;
const SHORTEST_PAUSE_MS = 120;

interface Recording {
  status: number;
  headers: Record<string, string>;
  pieces: { atMs: number; text: string }[];
}

function recording(name: string): Recording {
  const raw: unknown = JSON.parse(readFileSync(path.join(RECORDINGS, `${name}.json`), 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error(`${name} is not a recording`);
  const { status, headers, pieces } = raw as Partial<Recording>;
  if (typeof status !== 'number' || !Array.isArray(pieces)) throw new Error(`${name} has no status or pieces`);
  return { status, headers: headers ?? {}, pieces };
}

/** Which recording answers which address, by how the address ends. */
const ANSWERS: [ending: string, recording: string][] = [
  ['/google/models', 'google-models-page-1'],
  ['/google/interactions', 'google-stream-whole-gemini-3.6-flash'],
  ['/openrouter/key', 'openrouter-key'],
  ['/openrouter/credits', 'openrouter-credits'],
  ['/openrouter/chat/completions', 'openrouter-stream-gemini-3.8-flash'],
];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** A recorded reply, piece by piece, at its own pace sped up. */
async function replay(response: ServerResponse, recorded: Recording): Promise<void> {
  const type = recorded.headers['content-type'];
  response.writeHead(recorded.status, type === undefined ? {} : { 'content-type': type });
  let at = 0;
  for (const piece of recorded.pieces) {
    await sleep(Math.max(SHORTEST_PAUSE_MS, Math.min((piece.atMs - at) * PACE, LONGEST_PAUSE_MS)));
    at = piece.atMs;
    if (response.destroyed) return;
    response.write(piece.text);
  }
  response.end();
  replies.push(`ended after ${recorded.pieces.length} pieces`);
}

/** How each reply went, for when a test fails. */
const replies: string[] = [];

interface StandIn {
  server: Server;
  address: string;
  asked: string[];
}

async function startStandIn(): Promise<StandIn> {
  const asked: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const where = new URL(request.url ?? '/', 'http://stand-in').pathname;
    asked.push(where);
    const answer = ANSWERS.find(([ending]) => where.endsWith(ending));
    if (answer === undefined) {
      response.writeHead(404).end();
      return;
    }
    // The request body is read and dropped: the reply does not depend on it.
    request.resume();
    void replay(response, recording(answer[1])).catch((error: unknown) => {
      console.warn('The stand-in could not finish a reply', error);
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, address: `http://127.0.0.1:${port}`, asked };
}

/** A temporary place for everything the run keeps, with a key for each service in the notes folder. */
function walledOff(): { root: string; data: string; home: string; notes: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'b-notes-electron-'));
  const [data, home, notes] = ['data', 'home', 'notes'].map((name) => path.join(root, name));
  for (const folder of [data, home, notes]) mkdirSync(folder);
  // Windows finds Documents in the home folder, and the app does not start without one.
  mkdirSync(path.join(home, 'Documents'));
  writeFileSync(path.join(data, 'folders.json'), JSON.stringify({ notes }));
  writeFileSync(path.join(notes, 'lektor.json'), JSON.stringify({ googleKey: 'g-key', openRouterKey: 'or-key' }));
  return { root, data, home, notes };
}

let standIn: StandIn;
let app: ElectronApplication;
let place: ReturnType<typeof walledOff>;

test.beforeEach(async () => {
  standIn = await startStandIn();
  place = walledOff();
  app = await electron.launch({
    // The window works as one in front would, whatever covers it: the run opens it on the
    // screen, and Chromium all but stops a window other windows hide.
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      // Where os.homedir() looks, on Windows and elsewhere: Resoph's settings are looked for there.
      USERPROFILE: place.home,
      HOME: place.home,
      B_NOTES_TEST_DATA: place.data,
      B_NOTES_LEKTOR_ADDRESSES: JSON.stringify({ gemini: `${standIn.address}/google`, openrouter: `${standIn.address}/openrouter` }),
    },
  });
});

test.afterEach(async ({}, testInfo) => {
  // Failed, what the stand-in was asked and what the app said: the background process's own account, which no screen shows.
  if (testInfo.status !== testInfo.expectedStatus) {
    const logs = path.join(place.data, 'logs');
    const said = readdirSync(logs).map((file) => readFileSync(path.join(logs, file), 'utf8')).join('\n');
    await testInfo.attach('stand-in asked', { body: [...standIn.asked, ...replies].join('\n') });
    writeFileSync(testInfo.outputPath('app.log'), said);
  }
  await app.close();
  await new Promise((resolve) => standIn.server.close(resolve));
  rmSync(place.root, { recursive: true, force: true });
});

test('shows a correction request moving through its stages, as the background process streams it in', async () => {
  const window = await app.firstWindow();
  await window.locator('#new-note').click();
  await window.locator('#editor').fill('Naslov teksta\n\nOvo je sasvim obican tekst koji je dovoljno dugacak da ga citalac moze da procita do kraja.');
  await window.locator('#lektor-open').click();
  const side = window.locator('#lektor-side');
  await side.getByRole('button', { name: /^Ispravke/ }).click();
  const dialog = window.locator('#lektor-dialog');
  await dialog.getByText('Slova i zarezi', { exact: true }).click();
  // Every text the wait shows, as it changes: a stage can come and go between two looks at the screen.
  await window.evaluate(() => {
    const shown: string[] = [];
    (window as unknown as { stagesShown: string[] }).stagesShown = shown;
    new MutationObserver(() => {
      const stages = document.querySelector('#lektor-dialog .lektor-stages')?.textContent;
      if (stages !== undefined && stages !== null && shown.at(-1) !== stages) shown.push(stages);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await dialog.getByRole('button', { name: /^Pošalji zahtev za ispravke/ }).click();
  await expect(dialog.getByRole('button', { name: 'Unesi sve izmene u tekst' })).toBeVisible({ timeout: 30_000 });
  const shown = await window.evaluate(() => (window as unknown as { stagesShown: string[] }).stagesShown.join('\n'));
  expect(shown).toContain('Zahtev čeka u redu…');
  expect(shown).toContain('Lektor razmišlja…');
  expect(shown).toContain('Lektor ispravlja tekst…');
  expect(standIn.asked.filter((where) => where.endsWith('/google/interactions'))).toHaveLength(1);
});
