import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Whether a run came from the installed app or from a build being worked on. */
export type RunMode = 'installed' | 'dev';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export interface LogRetention {
  /** Files for days older than this are deleted. */
  maxAgeDays: number;
  /** Once the surviving files exceed this, the oldest are deleted until they don't. */
  maxTotalBytes: number;
}

export const DEFAULT_RETENTION: LogRetention = {
  maxAgeDays: 30,
  maxTotalBytes: 10 * 1024 * 1024,
};

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
  /** A logger that tags its entries with a different source, e.g. the renderer. */
  scoped(source: string): Logger;
}

export interface LogFileInfo {
  name: string;
  day: string;
  sizeBytes: number;
}

const FILE_PREFIX = 'b-notes-';
const FILE_SUFFIX = '.log';
/** e.g. b-notes-2026-09-18-162537-31240-installed.log */
const FILE_PATTERN = /^b-notes-(\d{4}-\d{2}-\d{2})-\d{6}-\d+-(?:installed|dev)\.log$/;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Local time throughout. One user in one timezone, and the question being
 * answered is always "what happened just before he said it broke".
 */
export function dayStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One file per run, named for when it started and what kind of run it was.
 *
 * The pid keeps two instances started in the same second apart; the mode means
 * his logs can be told from a build being worked on without opening the file.
 */
export function logFileName(date: Date, pid: number, mode: RunMode): string {
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${FILE_PREFIX}${dayStamp(date)}-${time}-${pid}-${mode}${FILE_SUFFIX}`;
}

export function parseLogFileDay(fileName: string): string | null {
  return FILE_PATTERN.exec(fileName)?.[1] ?? null;
}

function dayToDate(day: string): Date {
  const match = DAY_PATTERN.exec(day);
  if (match === null) throw new Error(`Not a day stamp: ${day}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function describe(detail: unknown): string {
  if (detail instanceof Error) {
    return detail.stack ?? `${detail.name}: ${detail.message}`;
  }
  try {
    return JSON.stringify(detail) ?? String(detail);
  } catch (error) {
    // A circular or otherwise unserialisable payload must not cost us the entry itself.
    return `[unserialisable: ${error instanceof Error ? error.message : 'unknown'}]`;
  }
}

export function formatLine(
  date: Date,
  level: LogLevel,
  source: string,
  message: string,
  detail?: unknown,
): string {
  const time =
    `${dayStamp(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:` +
    `${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  const suffix = detail === undefined ? '' : ` ${describe(detail)}`;
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${source}] ${message}${suffix}`;

  // Entries are one per line, so an embedded newline (a stack trace, most often)
  // would otherwise split a single event into several unreadable fragments.
  return line.replace(/\r?\n/g, ' ⏎ ');
}

/**
 * Names to delete, oldest first: anything older than `maxAgeDays`, then the
 * oldest of what remains until the total fits `maxTotalBytes`.
 *
 * `activeName` is never returned — it's the file this run is writing to, and
 * it holds exactly the entries a live problem needs.
 */
export function filesToPrune(
  files: readonly LogFileInfo[],
  retention: LogRetention,
  today: string,
  activeName: string,
): string[] {
  const cutoffDate = dayToDate(today);
  cutoffDate.setDate(cutoffDate.getDate() - retention.maxAgeDays);
  const cutoff = dayStamp(cutoffDate);

  // Day and time are fixed width, so the name sorts chronologically.
  const sorted = [...files].sort((first, second) => first.name.localeCompare(second.name));
  const doomed: string[] = [];
  const surviving: LogFileInfo[] = [];

  for (const file of sorted) {
    if (file.name !== activeName && file.day < cutoff) {
      doomed.push(file.name);
    } else {
      surviving.push(file);
    }
  }

  let total = surviving.reduce((sum, file) => sum + file.sizeBytes, 0);
  for (const file of surviving) {
    if (total <= retention.maxTotalBytes) break;
    if (file.name === activeName) continue;
    doomed.push(file.name);
    total -= file.sizeBytes;
  }

  return doomed;
}

function readLogFiles(dir: string): LogFileInfo[] {
  const files: LogFileInfo[] = [];
  for (const name of readdirSync(dir)) {
    const day = parseLogFileDay(name);
    if (day === null) continue;
    files.push({ name, day, sizeBytes: statSync(path.join(dir, name)).size });
  }
  return files;
}

export function createFileLogger(
  dir: string,
  mode: RunMode,
  retention: LogRetention = DEFAULT_RETENTION,
): Logger {
  mkdirSync(dir, { recursive: true });

  const started = new Date();
  const fileName = logFileName(started, process.pid, mode);
  const file = path.join(dir, fileName);

  // Pruning happens once, at startup. Nothing rotates while the app is open,
  // because this run writes to this one file for its whole life.
  for (const name of filesToPrune(readLogFiles(dir), retention, dayStamp(started), fileName)) {
    try {
      unlinkSync(path.join(dir, name));
    } catch (error) {
      // Windows refuses to delete a file another instance still has open. Skip
      // it — the next run will get it — rather than abandoning the whole sweep.
      console.error(`Could not delete old log ${name}`, error);
    }
  }

  function write(level: LogLevel, source: string, message: string, detail?: unknown): void {
    try {
      // Synchronous on purpose: an entry buffered when the process dies is an
      // entry lost, and crashes are exactly what this file is for.
      appendFileSync(file, `${formatLine(new Date(), level, source, message, detail)}\n`, 'utf8');
    } catch (error) {
      // Logging must never take the app down with it, and this is the one
      // failure that cannot be written to the log.
      console.error('Logging failed', error);
    }
  }

  function at(source: string): Logger {
    return {
      debug: (message, detail) => write('debug', source, message, detail),
      info: (message, detail) => write('info', source, message, detail),
      warn: (message, detail) => write('warn', source, message, detail),
      error: (message, detail) => write('error', source, message, detail),
      scoped: at,
    };
  }

  return at('main');
}
