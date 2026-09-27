import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Log } from '../../platform/logging.ts';
import { OTHER_EDITORS, type OtherEditor, type OtherEditors } from '../../platform/other-editors.ts';

const run = promisify(execFile);

/** The program file each editor runs as. Obsidian runs as several processes. */
const IMAGE: Record<OtherEditor, string> = {
  ResophNotes: 'ResophNotes.exe',
  Notepad: 'notepad.exe',
  Obsidian: 'Obsidian.exe',
};

/** The program names in `tasklist /FO CSV /NH` output: the first field of each line. */
export function imageNamesIn(tasklistCsv: string): string[] {
  return tasklistCsv
    .split(/\r?\n/)
    .map((line) => /^"([^"]*)"/.exec(line.trim())?.[1])
    .filter((name): name is string => name !== undefined && name.length > 0);
}

/** Which editors those programs are, in a fixed order. Windows ignores case in names. */
export function editorsAmong(imageNames: readonly string[]): OtherEditor[] {
  const running = new Set(imageNames.map((name) => name.toLowerCase()));
  return OTHER_EDITORS.filter((editor) => running.has(IMAGE[editor].toLowerCase()));
}

/**
 * Whether an XML file is all there: it ends by closing the element it opened
 * with. What a file cut short while being written fails.
 */
export function isWholeXml(text: string): boolean {
  const body = text.replace(/^﻿/, '').replace(/^\s*<\?xml[^>]*\?>/, '').trim();
  const root = /^<([A-Za-z_][\w.-]*)/.exec(body)?.[1];
  return root !== undefined && new RegExp(`</${root}>$`).test(body);
}

/** Folder names for the database copies: sortable, and legal on Windows. */
export function stampFor(when: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}-${two(when.getMinutes())}-${two(when.getSeconds())}`;
}

/** How many database copies are kept. Each is a few MB, and the newest is the one that matters. */
const COPIES_KEPT = 10;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The running editors, and closing them, on Windows.
 *
 * @param resophHome the folder Resoph keeps its settings and database in.
 * @param copiesFolder where Resoph's database is copied before Resoph is ended.
 */
export function createOtherEditors(resophHome: string, copiesFolder: string, log: Log): OtherEditors {
  async function running(): Promise<OtherEditor[]> {
    try {
      const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true });
      return editorsAmong(imageNamesIn(stdout));
    } catch (failure: unknown) {
      // Not knowing must not stop him reaching his writing; said, and let pass.
      log.warn('Could not see which programs are running', failure);
      return [];
    }
  }

  /** Windows' own polite close: what clicking the window's X would do. */
  async function askToClose(editor: OtherEditor): Promise<void> {
    try {
      await run('taskkill', ['/IM', IMAGE[editor]], { windowsHide: true });
    } catch (failure: unknown) {
      // Refusing is an answer — Notepad asking about unsaved changes, Resoph
      // hiding in the tray — and `running` afterwards says what happened.
      log.info('Asked a program to close; it did not simply go', { editor, failure: String(failure) });
    }
  }

  async function stillRunning(editor: OtherEditor): Promise<boolean> {
    return (await running()).includes(editor);
  }

  async function databaseFiles(): Promise<string[]> {
    try {
      return (await readdir(resophHome)).filter((name) => name.toLowerCase().endsWith('.xml'));
    } catch (failure: unknown) {
      log.warn('Could not look at Resoph settings folder', { resophHome, failure: String(failure) });
      return [];
    }
  }

  /** Copies Resoph's settings and database aside, and prunes the oldest copies. */
  async function keepResophDatabase(names: readonly string[]): Promise<string> {
    const into = path.join(copiesFolder, stampFor(new Date()));
    await mkdir(into, { recursive: true });
    for (const name of names) await copyFile(path.join(resophHome, name), path.join(into, name));
    const kept = (await readdir(copiesFolder)).sort();
    for (const old of kept.slice(0, Math.max(0, kept.length - COPIES_KEPT))) {
      await rm(path.join(copiesFolder, old), { recursive: true, force: true });
    }
    log.info("Kept a copy of Resoph's database before closing it", { into, files: names });
    return into;
  }

  /**
   * Waits until none of Resoph's files has changed for two seconds, so it is
   * not in the middle of writing one. Gives up after ten: a database that never
   * settles is one Resoph keeps touching, and the copy is there either way.
   */
  async function untilSettled(names: readonly string[]): Promise<void> {
    const times = async (): Promise<string> =>
      (await Promise.all(names.map(async (name) => (await stat(path.join(resophHome, name))).mtimeMs))).join('|');
    let last = await times();
    let quietSince = Date.now();
    const giveUpAt = Date.now() + 10_000;
    while (Date.now() < giveUpAt) {
      await wait(500);
      const now = await times();
      if (now !== last) {
        last = now;
        quietSince = Date.now();
      } else if (Date.now() - quietSince >= 2_000) {
        return;
      }
    }
    log.warn("Resoph's database kept changing; closing Resoph anyway, with the copy kept");
  }

  /** After Resoph is ended: any file left cut short is put back from the copy. */
  async function checkResophDatabase(names: readonly string[], copy: string): Promise<void> {
    for (const name of names) {
      const at = path.join(resophHome, name);
      try {
        if (isWholeXml(await readFile(at, 'utf8'))) continue;
        await writeFile(at, await readFile(path.join(copy, name)));
        log.error('A Resoph file was cut short when Resoph was ended, so it was put back from the copy', { name });
      } catch (failure: unknown) {
        // Said loudly, and not thrown: he is waiting behind the message for
        // this, and the copy is still there for whoever reads the log.
        log.error('Could not check a Resoph file after ending Resoph', { name, copy, failure: String(failure) });
      }
    }
  }

  /**
   * Resoph first asked, as its own close button would; with minimize-to-tray on
   * that only hides it. Then, if it is still there: its database copied aside,
   * a wait until it is not writing, ended, and its files checked.
   */
  async function closeResoph(): Promise<void> {
    const names = await databaseFiles();
    const copy = names.length > 0 ? await keepResophDatabase(names) : null;
    await askToClose('ResophNotes');
    await wait(3_000);
    if (!(await stillRunning('ResophNotes'))) return;

    if (names.length > 0) await untilSettled(names);
    try {
      await run('taskkill', ['/F', '/IM', IMAGE.ResophNotes], { windowsHide: true });
      log.warn('Ended Resoph, which would only hide itself when asked to close');
    } catch (failure: unknown) {
      log.error('Could not end Resoph', failure);
      return;
    }
    await wait(1_000);
    if (copy !== null) await checkResophDatabase(names, copy);
  }

  return {
    running,
    async close(which: readonly OtherEditor[]): Promise<void> {
      log.info('Closing the other writing programs', { which });
      for (const editor of which) {
        if (editor === 'ResophNotes') await closeResoph();
        else await askToClose(editor);
      }
    },
  };
}
