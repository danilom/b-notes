import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileInfo, FileSystem } from '../../platform/file-system.ts';

const WRITING_SUFFIX = '.saving';

/**
 * Real files on his disk. Nothing here knows what a note is.
 *
 * Paths arrive as forward-slash strings and Node accepts those on Windows, so
 * there's no translation to do — which is the point of the convention.
 */
export function createFileSystem(): FileSystem {
  return {
    async list(folder: string): Promise<FileInfo[]> {
      // A missing folder is an empty one. His writing folder comes into being
      // on the first save, which mkdirs on the way, so nothing needs it made
      // early — and the app asks about folders it would rather not create.
      let entries: Dirent[];
      try {
        entries = await readdir(folder, { withFileTypes: true });
      } catch (error: unknown) {
        // Only the one condition, and everything else goes on up. This is the
        // one place in the app that knows a missing folder from a folder it
        // could not open, and it is the reason the rule above exists.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        entries = [];
      }

      return Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry): Promise<FileInfo> => {
            const info = await stat(path.join(folder, entry.name));
            return {
              path: `${folder}/${entry.name}`,
              updatedAt: info.mtimeMs,
              bytes: info.size,
            };
          }),
      );
    },

    async read(at: string): Promise<string> {
      return readFile(at, 'utf8');
    },

    /**
     * Write to a sibling file and rename over the target, so a crash mid-write
     * can't truncate an essay.
     */
    async write(at: string, text: string): Promise<void> {
      await mkdir(path.dirname(at), { recursive: true });
      const temp = `${at}.${process.pid}${WRITING_SUFFIX}`;
      await writeFile(temp, text, 'utf8');
      await rename(temp, at);
    },

    async rename(from: string, to: string): Promise<void> {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
    },

    async removeEmptyFile(at: string): Promise<boolean> {
      try {
        // Read before removing, every time. The check and the unlink are what
        // make this safe, so they are not something a caller can skip.
        const text = await readFile(at, 'utf8');
        if (text.trim().length > 0) return false;
        await unlink(at);
        return true;
      } catch {
        // Gone already, held open, or unreadable. The caller keeps it instead.
        return false;
      }
    },

    async removeFile(at: string): Promise<void> {
      await unlink(at);
    },

    async removeEmptyFolder(folder: string): Promise<void> {
      try {
        // Plain rmdir, never recursive: it refuses a folder that still holds
        // something, which is the guarantee rather than an inconvenience.
        await rmdir(folder);
      } catch {
        // Already gone, not empty, or held open by Dropbox mid-sync. All three
        // mean the same thing here — leave it, and carry on with the work this
        // was only cleaning up behind.
      }
    },
  };
}
