import {
  type FileSystem,
  absenceFrom,
} from '../../platform/file-system.ts';

/**
 * The filesystem as the window sees it, with the absences put back.
 *
 * Everything the renderer does to a file happens in the other process, and a
 * rejection crossing back arrives as a plain `Error`: Electron keeps the words
 * and throws the class away. The store is built on telling one absence from
 * every other kind of failure — `filesIn` returns nothing for a versions
 * folder that was never made, and rethrows anything else — and that test is
 * `instanceof`, which a flattened error cannot pass.
 *
 * So it failed open. In the browser the interface is developed in, the store
 * talks to the mock in its own process and every absence is itself; in the app
 * he installs, a folder that had never been made took down a rename, then a
 * count, then the startup read, and told him his writing could not be found.
 *
 * This is the one place that difference is undone. Everything above it can go
 * on believing that an absence is an absence, whichever process the file is in.
 */
export function withAbsences(files: FileSystem): FileSystem {
  const rebuilt = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (failure: unknown) {
      const absence = failure instanceof Error ? absenceFrom(failure.message) : null;
      // Anything that is not one of the two absences goes up exactly as it
      // came. A disk that has gone must not be made to look like an empty one.
      throw absence ?? failure;
    }
  };

  return {
    list: (folder) => rebuilt(() => files.list(folder)),
    listFolders: (folder) => rebuilt(() => files.listFolders(folder)),
    folderExists: (folder) => rebuilt(() => files.folderExists(folder)),
    read: (path) => rebuilt(() => files.read(path)),
    write: (path, text) => rebuilt(() => files.write(path, text)),
    rename: (from, to) => rebuilt(() => files.rename(from, to)),
    removeEmptyFolder: (folder) => rebuilt(() => files.removeEmptyFolder(folder)),
    removeEmptyFile: (path) => rebuilt(() => files.removeEmptyFile(path)),
    removeFile: (path) => rebuilt(() => files.removeFile(path)),
  };
}
