/**
 * Fills the browser build with his own Resoph folder instead of the invented
 * corpus: every `.txt` at its top level, under its name exactly as on disk —
 * spaces, escapes and all — with its body as it is and dated as the file is.
 *
 * Writes testdata/resoph-corpus.json, which `npm run ui:his-corpus` serves on
 * a port of its own. A port of its own is an origin of its own, so the browser
 * keeps his texts and the invented ones apart, and the GUI tests — which take
 * whatever answers on 5173 — never see his.
 *
 * Private like the rest of testdata/. Prints counts only, never a title.
 *
 *   node scripts/make-resoph-corpus.mts [Resoph folder]   (default testdata/real-redacted)
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const from = path.resolve(process.argv[2] ?? 'testdata/real-redacted');
const out = path.resolve('testdata/resoph-corpus.json');

/** One file of the pretend Resoph folder, as `seedIfEmpty` takes it. */
interface ResophFile {
  name: string;
  body: string;
  updatedAt: number;
}

const files: ResophFile[] = [];
for (const entry of await readdir(from, { withFileTypes: true })) {
  // Resoph's folder is flat; anything in a subfolder is not one of its notes.
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.txt')) continue;
  const at = path.join(from, entry.name);
  const [body, info] = await Promise.all([readFile(at, 'utf8'), stat(at)]);
  files.push({ name: entry.name, body, updatedAt: info.mtimeMs });
}

await writeFile(out, JSON.stringify(files), 'utf8');
console.log(`${files.length} texts from ${from} written to ${path.relative(process.cwd(), out)}`);
