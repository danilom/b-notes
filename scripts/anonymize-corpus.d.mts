/**
 * Types for the tests, and only for them.
 *
 * The script stays plain JavaScript so it can be copied to his machine on its
 * own and run by whatever Node is there. This file never needs to go with it.
 */

export interface Anonymized {
  bytes: Buffer;
  /** How the file was read: `bytes`, `utf-16le`, `utf-16be`, or with a note. */
  read: string;
}

export function anonymize(buffer: Buffer, keepWords?: number): Anonymized;
export function oddityOfName(name: string): string[];
export function oddityOfFile(buffer: Buffer, read: string): string[];
