/**
 * The folder a folder is in, for the forward-slash paths the filesystem contract uses.
 *
 * A drive's root keeps its slash: on Windows `E:` alone means "wherever E: was last
 * left", which is a folder somewhere on the drive rather than the drive itself, and
 * would answer "is the drive there" with the wrong folder. A root is its own parent.
 * A bare name, as the browser build's pretend folders are, is in the root of the
 * pretend disk, which is `''`.
 */
export function parentFolder(folder: string): string {
  const trimmed = folder.replaceAll('\\', '/').replace(/\/+$/, '');
  if (trimmed === '') return folder === '' ? '' : '/';
  const cut = trimmed.lastIndexOf('/');
  if (cut === -1) return trimmed.endsWith(':') ? `${trimmed}/` : '';
  const parent = trimmed.slice(0, cut);
  return parent === '' || parent.endsWith(':') ? `${parent}/` : parent;
}
