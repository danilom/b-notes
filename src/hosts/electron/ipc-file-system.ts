import { type FileSystem, absenceIn } from '../../platform/file-system.ts';

/**
 * The filesystem as the window sees it, with the absences put back.
 *
 * Everything the renderer does to a file happens in the other process, and a
 * rejection crossing back arrives as a plain `Error`: Electron keeps the words
 * and throws the class away. So the other side answers with an absence instead
 * of rejecting, and this is where that answer becomes an absence again. The store is built on telling one absence from
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
    // Nothing is caught here. A real failure rejects and goes up exactly as it
    // came — a disk that has gone must not be made to look like an empty one.
    // Only an absence arrives as an answer, and only it is turned back.
    const answer = await work();
    const absence = absenceIn(answer);
    if (absence !== null) throw absence;
    return answer;
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
