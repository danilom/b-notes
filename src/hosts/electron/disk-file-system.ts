import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type FileInfo,
  type FileSystem,
  FileMissing,
  FolderMissing,
} from '../../platform/file-system.ts';

const WRITING_SUFFIX = '.saving';

/** Tells two half-written copies apart while they wait in the same folder. */
let waiting = 0;

/*
  Where a half-written copy waits, out of the folder he syncs where that can be
  done safely.

  Beside the destination is where this wrote for its whole life, and the
  destination is inside Dropbox. Dropbox watches for new files and can open one
  the moment it appears; a handle held without FILE_SHARE_DELETE fails the
  rename, so the temporary copy became a way of causing the very failure it
  exists to survive. It also had Dropbox syncing a create and a delete for every
  autosave, for a file that was never his.

  Only while the two are on one volume, though. `rename` is atomic within a
  volume and degrades to copy-then-delete across two, and that copy has a window
  where the destination is half-written — which is the truncation this whole
  dance is here to prevent. `dev` is the volume serial number on Windows, so the
  question can be asked directly rather than guessed at from drive letters.
*/
export async function halfWrittenCopyFor(at: string, stagingFolder: string): Promise<string> {
  const beside = `${at}.${process.pid}${WRITING_SUFFIX}`;
  try {
    await mkdir(stagingFolder, { recursive: true });
    const [destination, staging] = await Promise.all([
      stat(path.dirname(at)),
      stat(stagingFolder),
    ]);
    if (destination.dev !== staging.dev) return beside;
    waiting += 1;
    return path.join(stagingFolder, `${process.pid}-${waiting}${WRITING_SUFFIX}`);
  } catch {
    /*
      Not logged, and this module has no logger to do it with: staging is an
      improvement on writing beside the destination, never a condition of it.
      Falling back costs the Dropbox protection and nothing else — the write
      still happens, still atomically — and if it is the disk itself that has
      gone, the write that follows fails and is reported by the caller, which is
      where a save that did not happen belongs.
    */
    return beside;
  }
}

/**
 * Real files on his disk. Nothing here knows what a note is.
 *
 * Paths arrive as forward-slash strings and Node accepts those on Windows, so
 * there's no translation to do — which is the point of the convention.
 *
 * `stagingFolder` is where a half-written copy waits before it is renamed into
 * place. It is handed in rather than worked out here, because only the main
 * process knows where Windows keeps our own folder.
 */
export function createFileSystem(stagingFolder: string): FileSystem {
  return {
    async list(folder: string): Promise<FileInfo[]> {
      // A missing folder is an empty one. His writing folder comes into being
      // on the first save, which mkdirs on the way, so nothing needs it made
      // early — and the app asks about folders it would rather not create.
      let entries: Dirent[];
      try {
        entries = await readdir(folder, { withFileTypes: true });
      } catch (error: unknown) {
        // Named rather than turned into an empty answer. Everything else goes
        // up as it came: a folder that is shut to us is not a folder that has
        // nothing in it, and only here can the two still be told apart.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        throw new FolderMissing(folder);
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

    async listFolders(folder: string): Promise<string[]> {
      let entries: Dirent[];
      try {
        entries = await readdir(folder, { withFileTypes: true });
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        throw new FolderMissing(folder);
      }
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    },

    async folderExists(folder: string): Promise<boolean> {
      try {
        return (await stat(folder)).isDirectory();
      } catch {
        // Not there, or there and shut to us. Not logged: this is asked in
        // order to report the answer on screen, so a false here is on its way
        // in front of someone already.
        return false;
      }
    },

    async read(at: string): Promise<string> {
      try {
        return await readFile(at, 'utf8');
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        throw new FileMissing(at);
      }
    },

    /**
     * Write to a sibling file and rename over the target, so a crash mid-write
     * can't truncate an essay.
     */
    async write(at: string, text: string): Promise<void> {
      await mkdir(path.dirname(at), { recursive: true });
      const temp = await halfWrittenCopyFor(at, stagingFolder);
      try {
        await writeFile(temp, text, 'utf8');
        await rename(temp, at);
      } catch (error: unknown) {
        /*
          A copy that never arrived is no use to anyone, and left alone it sits
          where it fell until something sweeps it — in his writing folder, if
          that is where it had to go. Removing it is best effort: the failure
          worth reporting is the one that brought us here, so it is the one
          rethrown, and a temporary file that cannot be removed is litter
          rather than a fault.
        */
        await unlink(temp).catch(() => undefined);
        throw error;
      }
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
