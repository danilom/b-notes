import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type FileInfo, type FileSystem, requireSafePath } from '../shared/file-system.ts';

const WRITING_SUFFIX = '.saving';

/** Real files on his disk. Nothing here knows what a note is. */
export function createFileSystem(root: string): FileSystem {
  const resolve = (relative: string): string =>
    path.join(root, ...requireSafePath(relative).split('/'));

  return {
    async list(folder?: string): Promise<FileInfo[]> {
      const dir = folder === undefined ? root : resolve(folder);
      await mkdir(dir, { recursive: true });
      const entries = await readdir(dir, { withFileTypes: true });

      return Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry): Promise<FileInfo> => {
            const info = await stat(path.join(dir, entry.name));
            return {
              path: folder === undefined ? entry.name : `${folder}/${entry.name}`,
              updatedAt: info.mtimeMs,
              bytes: info.size,
            };
          }),
      );
    },

    async read(relative: string): Promise<string> {
      return readFile(resolve(relative), 'utf8');
    },

    /**
     * Write to a sibling file and rename over the target, so a crash mid-write
     * can't truncate an essay.
     */
    async write(relative: string, text: string): Promise<void> {
      const target = resolve(relative);
      await mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}${WRITING_SUFFIX}`;
      await writeFile(temp, text, 'utf8');
      await rename(temp, target);
    },

    async rename(from: string, to: string): Promise<void> {
      const target = resolve(to);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(resolve(from), target);
    },
  };
}
