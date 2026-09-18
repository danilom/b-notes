import type { Language } from '../language/wording.ts';
import type { FileSystem } from '../platform/file-system.ts';

const FILE = 'settings.json';

/** How he likes the app set up. Per machine, and never synced. */
export interface Settings {
  language: Language;
}

const DEFAULTS: Settings = { language: 'sr' };

/**
 * Safe to delete. A missing or unreadable file gives him the defaults and the
 * app carries on — nothing here is worth a moment of his writing, and treating
 * it as precious would mean an unreadable one could stop him working.
 */
export async function readSettings(files: FileSystem, folder: string): Promise<Settings> {
  const text = await files.read(`${folder}/${FILE}`).catch(() => null);
  if (text === null) return DEFAULTS;

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const language = (parsed as Record<string, unknown>)['language'];
    return { language: language === 'en' || language === 'sr' ? language : DEFAULTS.language };
  } catch {
    return DEFAULTS;
  }
}

export async function writeSettings(
  files: FileSystem,
  folder: string,
  settings: Settings,
): Promise<void> {
  await files.write(`${folder}/${FILE}`, `${JSON.stringify(settings, null, 2)}\n`);
}
