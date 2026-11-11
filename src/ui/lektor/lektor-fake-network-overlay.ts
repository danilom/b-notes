import { FAKE_SCENARIOS, type FakeScenario, isFakeScenario } from '../../platform/lektor-fake-network.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import type { FakeNetworkSwitch } from './lektor-fake-network-switch.ts';

/*
  While the fake AI network is on, a strip over everything says so, so it can't be mistaken for
  the real thing: which scenario it acts out, a way to pick another, and a way to turn it off.
  For whoever is testing, so in English and plain, like the Advanced panel it is switched on from.

  In the browser's top layer (a popover), so it sits above the Lektor's window and every other
  dialog too; a dialog opened after it would cover it, so it is raised again whenever one opens.
  While a modal dialog is open everything outside it is inert, the strip too: it shows, but its
  controls work only once the dialog is closed.
*/

export function showFakeNetworkOverlay(fakeSwitch: FakeNetworkSwitch, log: Log): void {
  if (!fakeSwitch.isOn()) return;
  const overlay = document.createElement('div');
  overlay.className = 'fake-network-overlay';
  overlay.setAttribute('popover', 'manual');
  overlay.setAttribute('role', 'status');

  const said = document.createElement('strong');
  said.textContent = 'FAKE AI NETWORK: no real AI, nothing is sent';

  const label = document.createElement('label');
  label.textContent = 'Scenario ';
  const choice = document.createElement('select');
  choice.setAttribute('aria-label', 'Fake AI network scenario');
  choice.append(...Object.keys(FAKE_SCENARIOS).map((name) => new Option(name, name)));
  choice.value = fakeSwitch.scenario();
  choice.addEventListener('change', () => {
    const picked: FakeScenario = isFakeScenario(choice.value) ? choice.value : 'normal';
    fakeSwitch.choose(picked).catch((error: unknown) => log.warn('The fake AI network scenario could not be saved', describeError(error)));
  });
  label.append(choice);

  const off = document.createElement('button');
  off.type = 'button';
  off.textContent = 'Turn off';
  off.addEventListener('click', () => {
    fakeSwitch.turnOff().catch((error: unknown) => log.warn('The fake AI network setting could not be removed', describeError(error)));
    watcher.disconnect();
    overlay.hidePopover();
    overlay.remove();
  });

  overlay.append(said, label, off);
  document.body.append(overlay);
  overlay.showPopover();

  // Back on top whenever a dialog opens, since the top layer stacks in the order things enter it.
  const raise = (): void => {
    if (!overlay.isConnected) return;
    overlay.hidePopover();
    overlay.showPopover();
  };
  const watcher = new MutationObserver((changes) => {
    if (changes.some((change) => change.target instanceof HTMLDialogElement && change.target.open)) raise();
  });
  watcher.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
}
