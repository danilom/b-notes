import { defineConfig, devices } from '@playwright/test';

/**
 * The tests that need a real browser, and only those.
 *
 * Everything that can be decided without one belongs in `npm test`, which runs
 * against the sources with no build and no framework. What is left here is what
 * a unit test structurally cannot see: where things actually land on screen, in
 * what order the app does things to the real DOM, and what the browser hands
 * back afterwards.
 *
 * Three kinds of fault have reached this app through that gap. A control added
 * beside others and sized by nothing, because the rule that shapes them was a
 * list of ids it was not on. A row of buttons that grew past the window and
 * gave the whole app a scrollbar it has never had. And a save landing after an
 * operation had renamed the file under it — an ordering, invisible to any test
 * that does not run the real thing.
 *
 * Against the browser build rather than the packaged app. Electron has no true
 * headless on Windows, so driving the real window throws windows onto the
 * screen of whoever is working; the geometry being tested is the same either
 * way, since both run the same interface over the same rules.
 */
export default defineConfig({
  testDir: './test-gui',
  /*
    Twice the usual budget, because every test here starts by seeding six
    hundred texts into a fresh browser and several of them then drive real
    saves through the app. The ordering tests were finishing in the high
    twenties against the default thirty seconds, so they began failing the
    moment the suite grew — on the clock, not on anything they had found.
  */
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // Kept from a failure and thrown away otherwise, so a red run leaves
    // something to look at rather than a line of text to be believed.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The browser build copies through the page's own clipboard, which a
    // headless Chromium will not touch without being told to.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /*
    The build is the test command's job, not this one's.

    Reusing a server that is already up is what makes the suite quick to run
    while working — but the reused server is never rebuilt, so the tests
    quietly ran against a stale bundle and reported a fix as still broken. The
    `test:gui` script builds first, every time, whoever started the server.
  */
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
