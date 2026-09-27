import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where ResophNotes keeps its settings, under his user folder.
 *
 * Plain XML, with its strings in base64. `<userdata9>` is the folder its notes
 * are mirrored into — which is the folder b-notes reads his texts from, so
 * the app can find it without asking anyone. See `RESOPH-COEXISTENCE.md` §1.
 */
export const RESOPH_CONFIG = path.join('.ResophNotes', 'resophnotesconfig.xml');

/** An absolute Windows path, or a UNC one. Anything else is not a folder we can use. */
const LOOKS_LIKE_A_FOLDER = /^([A-Za-z]:[\\/]|\\\\|\/)/;

/**
 * The notes folder named in Resoph's settings, or null when there is none to
 * be had.
 *
 * Read off disk and written by a program nobody maintains, so it is checked
 * rather than trusted: a missing tag, bad base64 or something that is not a
 * path all come out as "no Resoph folder", which starts the app without one
 * rather than not at all.
 */
export function resophFolderIn(configXml: string): string | null {
  const encoded = /<userdata9>([^<]*)<\/userdata9>/.exec(configXml)?.[1]?.trim();
  if (encoded === undefined || encoded.length === 0) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();
  if (!LOOKS_LIKE_A_FOLDER.test(decoded)) return null;
  return decoded.replaceAll('\\', '/').replace(/\/+$/, '');
}

/**
 * His Resoph folder, from Resoph's settings in `home`, or null.
 *
 * A missing settings file is ordinary — a machine without Resoph — and so is
 * one that cannot be read: either way there is no Resoph folder to offer.
 */
export function findResophFolder(home: string): string | null {
  let xml: string;
  try {
    xml = readFileSync(path.join(home, RESOPH_CONFIG), 'utf8');
  } catch {
    // No Resoph on this machine, which is the ordinary answer on most of them;
    // the caller logs which folder it settled on either way.
    return null;
  }
  return resophFolderIn(xml);
}
