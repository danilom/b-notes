import { FileMissing, type FileSystem, FolderMissing } from '../../platform/file-system.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import type { PresetId } from './lektor-service.ts';

/*
  Real replies for the test Lektor to give back, so the review can be tried in the app on what
  Opus actually sends. A folder beside the test Lektor's own setting, so only a machine someone
  tests on has one: `<name>.current.txt` is a text, and `<name>.lektor-<preset>.txt` beside it is
  a real service's corrections of it. Only that text, word for word, gets them.
*/
const FOLDER = 'lektor-test-replies';
const CURRENT_SUFFIX = '.current.txt';

/** Saved from Windows they have `\r\n`, and a text pasted into the app has `\n`: the same text either way. */
const withPlainLines = (text: string): string => text.replace(/\r\n/g, '\n').trimEnd();

/** The real reply saved for this text and preset, or null when there is none. */
export async function savedTestReply(files: FileSystem, appFolder: string, log: Log, text: string, preset: PresetId): Promise<string | null> {
  const folder = `${appFolder}/${FOLDER}`;
  try {
    for (const { path } of await files.list(folder)) {
      if (!path.endsWith(CURRENT_SUFFIX)) continue;
      if (withPlainLines(await files.read(path)) !== withPlainLines(text)) continue;
      const reply = withPlainLines(await files.read(`${path.slice(0, -CURRENT_SUFFIX.length)}.lektor-${preset}.txt`));
      // In the text's own line endings, or the review would show every line as changed.
      return text.includes('\r\n') ? reply.replace(/\n/g, '\r\n') : reply;
    }
    return null;
  } catch (error) {
    // No folder is every machine but a tester's, and no reply for this preset is a sample saved for others: both mean make one up.
    if (error instanceof FolderMissing || error instanceof FileMissing) return null;
    log.warn('A saved test reply could not be read', describeError(error));
    return null;
  }
}
