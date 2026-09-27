import type { Whereabouts } from './test-mode-whereabouts.ts';

/** One short code on a row's badge, and what it stands for. */
export interface Code {
  code: string;
  means: string;
}

const ORIGIN: Record<Whereabouts['origin'], Code> = {
  resoph: { code: 'R', means: 'only in his Resoph folder, not copied yet' },
  copy: { code: 'R→b', means: "b-notes' copy of a Resoph text" },
  own: { code: 'b', means: 'begun in b-notes' },
};

/** The flags, in the order they are shown, each only where it applies. */
const FLAGS: readonly { applies: (where: Whereabouts) => boolean; code: Code }[] = [
  {
    applies: (where) => where.otherVersion,
    code: { code: '⇄', means: 'the other version of a text both sides changed, until he writes in it' },
  },
  {
    applies: (where) => where.resophGone,
    code: { code: 'R✕', means: 'its Resoph file is gone: deleted there, or retitled' },
  },
  {
    applies: (where) => where.changedElsewhere,
    code: { code: 'ext', means: 'changed on disk behind b-notes at least once; a version was kept' },
  },
  {
    applies: (where) => where.conflictedCopy,
    code: { code: 'cc', means: 'a Dropbox conflicted copy' },
  },
];

/** A row's codes: where it lives, then whatever has happened to it. */
export function codesFor(where: Whereabouts): Code[] {
  return [ORIGIN[where.origin], ...FLAGS.filter((flag) => flag.applies(where)).map((flag) => flag.code)];
}

/** What the badge says when hovered: each of its codes, spelled out. */
export function legendOf(codes: readonly Code[]): string {
  return ['[test-mode]', ...codes.map(({ code, means }) => `${code}  ${means}`)].join('\n');
}

/**
 * What the row says when hovered: where it is, as a path to paste into
 * Explorer, and for a copy the Resoph file it came from.
 */
export function pathsOf(where: Whereabouts): string {
  const said = [`[test-mode] ${ORIGIN[where.origin].means}${where.unlinked ? ' (known by its name; its link is missing)' : ''}`];
  said.push(shownPath(where.path));
  if (where.origin !== 'copy') return said.join('\n');
  said.push(
    where.resophPath === null
      ? `from ${dotted(`${where.resophStem ?? ''}.txt`)}, no longer in the Resoph folder`
      : `from ${shownPath(where.resophPath)}`,
  );
  return said.join('\n');
}

/**
 * A path as Windows writes it, with every space in the file's name shown as a
 * dot: the leading spaces he ranks by are the thing most often being checked,
 * and a tooltip shows spaces as nothing at all.
 */
export function shownPath(path: string): string {
  const cut = path.lastIndexOf('/');
  return `${path.slice(0, cut + 1).replaceAll('/', '\\')}${dotted(path.slice(cut + 1))}`;
}

const dotted = (name: string): string => name.replaceAll(' ', '·');
