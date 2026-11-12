/*
  Where a new version of the app is on its way to this machine: nowhere, being downloaded, or
  downloaded and waiting for him to close the app, when it installs. Told by the main process,
  which alone runs the updater, and shown in the status line, so that an email telling him how to
  get a new version can say what to wait for. Sent across the process boundary as plain data.
*/

export type AppUpdate =
  | { kind: 'none' }
  | { kind: 'downloading'; version: string }
  /** Installs when he next closes the app; he is never asked. */
  | { kind: 'downloaded'; version: string };

export const NO_UPDATE: AppUpdate = { kind: 'none' };

/** Whether two states say the same: the same kind, and for one on its way, the same version. */
export function isSameUpdate(a: AppUpdate, b: AppUpdate): boolean {
  if (a.kind === 'none' || b.kind === 'none') return a.kind === b.kind;
  return a.kind === b.kind && a.version === b.version;
}

/** An update state as it arrives across a process boundary, checked before it is believed; anything else is none. */
export function appUpdateFrom(value: unknown): AppUpdate {
  if (typeof value !== 'object' || value === null) return NO_UPDATE;
  const { kind, version } = value as Record<string, unknown>;
  if ((kind === 'downloading' || kind === 'downloaded') && typeof version === 'string' && version !== '') return { kind, version };
  return NO_UPDATE;
}
