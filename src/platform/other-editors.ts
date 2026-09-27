/**
 * The other programs he opens his texts in, which b-notes asks him to close
 * before it starts.
 *
 * Three editors on the same notes at once is a habit no cleverness can make
 * safe, so b-notes does not try to live alongside them: at startup it waits,
 * behind one plain message and a button that closes them for him. Resoph hides
 * in the tray when its close button is pressed, so telling him to close it
 * would send him looking for something he cannot find. See
 * `RESOPH-COEXISTENCE.md` §4.10.
 *
 * Obsidian is here because he was once moved to it, not because he is known to
 * use it.
 */
export const OTHER_EDITORS = ['ResophNotes', 'Notepad', 'Obsidian'] as const;

export type OtherEditor = (typeof OTHER_EDITORS)[number];

/**
 * Resoph's *minimize to tray* on this machine, as the advanced panel reports
 * it: for whoever sets the machine up, to see at a glance that b-notes has
 * switched it off.
 */
export interface ResophTray {
  /** Whether Resoph's close button only hides it. Null where there are no Resoph settings to read. */
  on: boolean | null;
  /** When b-notes switched it off on this machine, or null if it never has. */
  switchedOffAt: number | null;
}

/** What a host provides: seeing them, and closing them. */
export interface OtherEditors {
  /** Resoph's tray setting, and whether b-notes has switched it off here. */
  resophTray(): Promise<ResophTray>;
  /**
   * Which of them are running now. Answers "none" when it cannot tell: not
   * knowing must never stop him getting to his writing.
   */
  running(): Promise<OtherEditor[]>;
  /**
   * Closes them as their own close buttons would — Notepad may ask about
   * unsaved changes in its own window first, which is his to answer. Resoph,
   * whose close button only hides it, is ended once its database has been
   * copied somewhere safe. Resolves when every attempt has been made; ask
   * `running` afterwards for the result.
   */
  close(which: readonly OtherEditor[]): Promise<void>;
}
