import type { Language } from '../language/wording.ts';
import type { FileSystem } from '../platform/file-system.ts';
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  MAX_ZOOM,
  clampScale,
  isAccentChoice,
  isFontChoice,
  isModeChoice,
  isScale,
  isWritingFontChoice,
} from './appearance.ts';

/**
 * How he likes the app set up, split by whether the answer travels with him.
 *
 * Which letters and which colour are taste, and taste travels: having chosen
 * them once he should find them already chosen on every machine.
 *
 * The zoom is taste too — he is no less particular about how big the app is —
 * but the *number* is not portable even when the preference is. The same wish
 * to read comfortably comes out as one figure on the old laptop and another on
 * the desktop, so syncing it would have each machine undoing the other in his
 * name. It stays where the screen it answers to is.
 */
const SHARED_FILE = 'settings.json';
const LOCAL_FILE = 'screen.json';

/** Travels with his writing. */
export interface SharedSettings {
  language: Language;
  font: Appearance['font'];
  accent: Appearance['accent'];
  /**
   * How his own writing is set. Taste rather than screen, so it follows him:
   * having found the letters he likes to write in, he should find them already
   * chosen on every machine. The zoom below is the one that answers the screen.
   */
  writingFont: Appearance['writingFont'];
  writingSize: Appearance['writingSize'];
}

/**
 * Stays on the machine, beside the log.
 *
 * Dark is here rather than in the shared file for the same reason size is, and
 * more sharply: it exists for whoever is working on the app, on the machine
 * they work on. Syncing it would reach across and turn his screen black
 * overnight for no reason he could name.
 */
export interface LocalSettings {
  zoom: Appearance['zoom'];
  mode: Appearance['mode'];
}

export type Settings = SharedSettings & LocalSettings;

/** Where each half lives. Both come off the host; neither is ever shown to him. */
export interface SettingsFolders {
  readonly writingFolder: string;
  readonly appFolder: string;
}

export const DEFAULT_SETTINGS: Settings = { language: 'sr', ...DEFAULT_APPEARANCE };

function asObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Safe to delete, either of them. A missing or unreadable file gives him the
 * defaults and the app carries on — nothing here is worth a moment of his
 * writing, and treating it as precious would mean an unreadable one could stop
 * him working.
 */
async function readRaw(files: FileSystem, path: string): Promise<Record<string, unknown>> {
  const text = await files.read(path).catch(() => null);
  return text === null ? {} : (asObject(text) ?? {});
}

/**
 * Every field falls back on its own.
 *
 * A file with one unrecognised value still yields the rest, because the
 * alternative — throwing the whole thing away — means one bad key silently
 * resets everything he chose.
 */
export function settingsFrom(
  shared: Record<string, unknown>,
  local: Record<string, unknown>,
): Settings {
  const language = shared['language'];
  return {
    language: language === 'en' || language === 'sr' ? language : DEFAULT_SETTINGS.language,
    font: isFontChoice(shared['font']) ? shared['font'] : DEFAULT_SETTINGS.font,
    accent: isAccentChoice(shared['accent']) ? shared['accent'] : DEFAULT_SETTINGS.accent,
    writingFont: isWritingFontChoice(shared['writingFont'])
      ? shared['writingFont']
      : DEFAULT_SETTINGS.writingFont,
    writingSize: isScale(shared['writingSize'])
      ? clampScale(shared['writingSize'])
      : DEFAULT_SETTINGS.writingSize,
    // Clamped rather than rejected: a file naming a zoom we no longer allow
    // still means he wanted it big, so bring it to the nearest size we do.
    zoom: isScale(local['zoom']) ? clampScale(local['zoom'], MAX_ZOOM) : DEFAULT_SETTINGS.zoom,
    mode: isModeChoice(local['mode']) ? local['mode'] : DEFAULT_SETTINGS.mode,
  };
}

export async function readSettings(
  files: FileSystem,
  folders: SettingsFolders,
): Promise<Settings> {
  const [shared, local] = await Promise.all([
    readRaw(files, `${folders.writingFolder}/${SHARED_FILE}`),
    readRaw(files, `${folders.appFolder}/${LOCAL_FILE}`),
  ]);
  return settingsFrom(shared, local);
}

/**
 * Writes his choices back without disturbing anything it doesn't recognise.
 *
 * A laptop left off for months comes back running an old build, and that build
 * must not strip settings a newer one wrote — especially on the shared file,
 * which every machine reads. So each file is read, the keys belonging to it are
 * laid over what was there, and everything else is left exactly as found.
 */
async function writeSettings(
  files: FileSystem,
  folders: SettingsFolders,
  settings: Settings,
): Promise<void> {
  const { language, font, accent, writingFont, writingSize, zoom, mode } = settings;
  const sharedPath = `${folders.writingFolder}/${SHARED_FILE}`;
  const localPath = `${folders.appFolder}/${LOCAL_FILE}`;

  const [shared, local] = await Promise.all([
    readRaw(files, sharedPath),
    readRaw(files, localPath),
  ]);

  // Both every time rather than only what changed: two tiny writes he makes a
  // handful of times, against a bookkeeping mistake that would lose a choice.
  await Promise.all([
    files.write(
      sharedPath,
      `${JSON.stringify({ ...shared, language, font, accent, writingFont, writingSize }, null, 2)}\n`,
    ),
    files.write(localPath, `${JSON.stringify({ ...local, zoom, mode }, null, 2)}\n`),
  ]);
}

/**
 * Saves his choices, in the order he made them.
 *
 * Writing is a read-modify-write of two files and he can click three options
 * faster than one of those round trips completes. Left to race, the write that
 * lands last is not the choice he made last, and the setting he is looking at
 * loses to one he already changed his mind about — silently, until the next
 * time he starts the app. So only one write is ever in flight, and anything
 * that arrives meanwhile is collapsed into a single write of the latest state:
 * intermediate values are worth nothing, only the newest one.
 *
 * @param onError called for a failed write. Settings are not his writing, so a
 * failure is logged and the app carries on rather than interrupting him.
 */
export function createSettingsWriter(
  files: FileSystem,
  folders: SettingsFolders,
  onError: (error: unknown) => void,
): (settings: Settings) => void {
  let writing = false;
  let pending: Settings | null = null;

  return (settings) => {
    pending = settings;
    if (writing) return;
    writing = true;

    // The loop check and the flag reset share a synchronous stretch, so nothing
    // can slip in between them and leave a pending write with nobody draining it.
    void (async () => {
      try {
        while (pending !== null) {
          const next = pending;
          pending = null;
          await writeSettings(files, folders, next);
        }
      } catch (error) {
        onError(error);
      } finally {
        writing = false;
      }
    })();
  };
}
