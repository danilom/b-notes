import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
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
      await mkdir(folder, { recursive: true });
      const entries = await readdir(folder, { withFileTypes: true });

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
  };
}
