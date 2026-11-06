import { FileMissing, type FileSystem } from '../../platform/file-system.ts';
import { describeError, type Log } from '../../platform/logging.ts';

/*
  Whether this machine offers the test Lektor, set in the advanced panel. Per machine, in
  `userData`, so that it can never travel to his through the synced folder.
*/

/** How the test Lektor behaves, so that each thing that can go wrong can be seen without it going wrong. */
export const FAKE_BEHAVIOURS = ['ok', 'slow', 'offline', 'overloaded', 'limit', 'bad-key', 'cut-off', 'declined', 'no-credit'] as const;
export type FakeBehaviour = (typeof FAKE_BEHAVIOURS)[number];

const FILE = 'lektor-test.json';

export function fakeBehaviourFrom(raw: unknown): FakeBehaviour | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { behaviour } = raw as Record<string, unknown>;
  return FAKE_BEHAVIOURS.find((known) => known === behaviour) ?? null;
}

/** Read at startup: changing it restarts the app, like everything else in that panel. */
export async function readFakeBehaviour(files: FileSystem, appFolder: string, log: Log): Promise<FakeBehaviour | null> {
  try {
    return fakeBehaviourFrom(JSON.parse(await files.read(`${appFolder}/${FILE}`)));
  } catch (error) {
    // Absent on every machine but the one someone tests on, so only anything else is worth a line.
    if (!(error instanceof FileMissing)) log.warn('The test Lektor setting could not be read', describeError(error));
    return null;
  }
}

export async function writeFakeBehaviour(files: FileSystem, appFolder: string, behaviour: FakeBehaviour | null): Promise<void> {
  await files.write(`${appFolder}/${FILE}`, `${JSON.stringify({ behaviour })}\n`);
}
