import { FileMissing, type FileSystem } from '../../platform/file-system.ts';
import { createFakeNetwork, FAKE_DAY_FILE, FAKE_SCENARIOS, type FakeDay, type FakeScenario, fakeDayFrom, isFakeScenario } from '../../platform/lektor-fake-network.ts';
import type { LektorProgress } from '../../platform/lektor-progress.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import { describeError, type Log } from '../../platform/logging.ts';

/*
  Advanced → "Fake AI network": every Lektor's requests answered by the fake network instead of
  Google and OpenRouter, so the whole Lektor can be tried without spending anything or sending
  anything. Below the Lektors, not beside them: the screens and the choices are the real ones.

  A file of its own in `userData` (`lektor-fake-network.json`), so per machine: it can never reach
  his machines through the synced folder. While it is on, an overlay over the app says so.
*/

type Ask = (request: LektorRequest, stop: AbortSignal, onProgress: (progress: LektorProgress) => void) => Promise<LektorResponse>;

export interface FakeNetworkSetting {
  scenario: FakeScenario;
  /** Anything written into the file beyond the scenario, laid over it: the GUI tests' own days. */
  extra: FakeDay;
}

const fileIn = (appFolder: string): string => `${appFolder}/${FAKE_DAY_FILE}`;

/** What the file says, checked: a scenario name and a day to lay over it, or null for anything unreadable. */
export function fakeNetworkSettingFrom(raw: unknown): FakeNetworkSetting | null {
  const extra = fakeDayFrom(raw);
  if (extra === null) return null;
  const scenario = (raw as Record<string, unknown>)['scenario'];
  return { scenario: isFakeScenario(scenario) ? scenario : 'normal', extra };
}

/** The day a setting means: its scenario, with whatever the file adds laid over it. */
export const dayOf = (setting: FakeNetworkSetting): FakeDay => ({ ...FAKE_SCENARIOS[setting.scenario], ...setting.extra });

/** Null when it is off, which on every machine but a tester's is always. */
export async function readFakeNetworkSetting(files: FileSystem, appFolder: string, log: Log): Promise<FakeNetworkSetting | null> {
  try {
    return fakeNetworkSettingFrom(JSON.parse(await files.read(fileIn(appFolder))));
  } catch (error) {
    // Absent everywhere it was never switched on: the ordinary answer, not worth a line.
    if (!(error instanceof FileMissing)) log.warn('The fake AI network setting could not be read', describeError(error));
    return null;
  }
}

export async function writeFakeNetworkSetting(files: FileSystem, appFolder: string, scenario: FakeScenario | null): Promise<void> {
  if (scenario === null) {
    try {
      await files.removeFile(fileIn(appFolder));
    } catch (error) {
      // Already gone is already off.
      if (!(error instanceof FileMissing)) throw error;
    }
    return;
  }
  await files.write(fileIn(appFolder), `${JSON.stringify({ scenario })}\n`);
}

export interface FakeNetworkSwitch {
  /** What the Lektor asks through: the fake while it is on, the real network otherwise. */
  ask: Ask;
  isOn: () => boolean;
  scenario: () => FakeScenario;
  /** From the next request on. Saved, so it holds after a restart. */
  choose: (scenario: FakeScenario) => Promise<void>;
  /** Back to the real network from the next request on, and off after a restart too. */
  turnOff: () => Promise<void>;
}

export interface SwitchParts {
  real: Ask;
  files: FileSystem;
  appFolder: string;
  log: Log;
  /** A real reply saved for a sample text, where the host has any (the browser build's dev server). */
  savedCorrection?: (text: string, system: string) => Promise<string | null>;
}

export function createFakeNetworkSwitch(parts: SwitchParts, setting: FakeNetworkSetting | null): FakeNetworkSwitch {
  let now = setting;
  let day: FakeDay = now === null ? {} : dayOf(now);
  const withSaved = (base: FakeDay): FakeDay => (parts.savedCorrection === undefined ? base : { ...base, savedCorrection: parts.savedCorrection });
  day = withSaved(day);
  const fake = createFakeNetwork(() => day);
  if (now !== null) parts.log.warn('The Lektor talks to the fake AI network', { scenario: now.scenario });

  return {
    ask: (request, stop, onProgress) => (now === null ? parts.real(request, stop, onProgress) : fake.ask(request, stop, onProgress)),
    isOn: () => now !== null,
    scenario: () => now?.scenario ?? 'normal',
    choose: async (scenario) => {
      now = { scenario, extra: {} };
      day = withSaved(dayOf(now));
      parts.log.info('The fake AI network acts out a scenario', { scenario });
      await writeFakeNetworkSetting(parts.files, parts.appFolder, scenario);
    },
    turnOff: async () => {
      now = null;
      parts.log.info('The fake AI network was switched off');
      await writeFakeNetworkSetting(parts.files, parts.appFolder, null);
    },
  };
}
