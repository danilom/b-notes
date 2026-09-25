import type { Language } from '../../language/wording.ts';
import type { Host } from '../../platform/host.ts';
import { type Log, describeError } from '../../platform/logging.ts';
import { openAdvancedPanel } from './advanced-panel.ts';
import type { Appearance } from './appearance.ts';
import { type OpenPanel, openAppearancePanel } from './appearance-panel.ts';
import type { Settings } from './app-settings.ts';
import { openConfirmDialog } from '../dialogs/confirm-dialog.ts';

export interface SettingsPanelsParts {
  appearancePane: HTMLDialogElement;
  advancedPane: HTMLDialogElement;
  confirmPane: HTMLDialogElement;
  /** Where the keyboard goes when the appearance panel closes. */
  button: HTMLButtonElement;
  host: Host;
  log: Log;
  languageNow: () => Language;
  settingsNow: () => Settings;
  /** Shown, not kept: what he is trying out goes on screen and nowhere else. */
  preview: (appearance: Appearance) => void;
  /** He said keep it, so it is his now. */
  keep: (appearance: Appearance) => void;
  say: (notice: string) => void;
}

export interface SettingsPanels {
  /** How the app looks, which is his to change. */
  showAppearance(): void;
  /** Where his writing is read from, which is not. */
  showAdvanced(): void;
  /** The question in front of the settings that are not his. */
  askBeforeAdvanced(): void;
  /**
   * What the appearance panel is showing while it is open, or null.
   *
   * Zoom can be stepped from the keyboard at any moment, and it has to step
   * from what is on screen: the panel's working copy while it is open, and the
   * saved settings otherwise. Reading the wrong one leaves the panel showing a
   * size the app is no longer at.
   */
  working(): Appearance | null;
  /** Put an appearance into the open panel, if one is open. */
  change(appearance: Appearance): boolean;
}

/**
 * The two panels behind the Izgled button: how the app looks, and where his
 * writing lives.
 *
 * They sit together because the second is reached only through the first, and
 * apart from the rest because neither touches his writing. One is his — the
 * size of the letters, the light or the dark — and the other is addressed to
 * whoever set the machine up, in English, behind a word he has to type.
 */
export function createSettingsPanels(parts: SettingsPanelsParts): SettingsPanels {
  const { appearancePane, advancedPane, confirmPane, button, host, log } = parts;

  let panel: OpenPanel | null = null;

  function hideAppearance(): void {
    panel?.close();
    panel = null;
    button.focus();
  }

  function showAdvanced(): void {
    if (advancedPane.open) return;

    const close = openAdvancedPanel(advancedPane, host, {
      onClose: () => {
        close();
      },
      onKeep: (folders) => {
        close();
        /*
          Started again rather than applied in place. Everything the app is
          holding — which text is open, what it has listed, the copies it has
          counted — belongs to the folder it was read from, and in the packaged
          app the folders are settled before a window exists, so a reload alone
          would be handed the old ones anyway.
        */
        void host
          .rememberFolders(folders)
          .then(() => host.restart())
          .catch((error: unknown) => {
            // English, like the panel it came from: the only person who can
            // have pressed that button reads English.
            parts.say('Could not save the folders. See the log.');
            log.error('Could not remember the folders', describeError(error));
          });
      },
    });
  }

  /**
   * A word to type, the same barrier `Uništi zauvek` uses — the point is not
   * that it is hard but that it cannot be walked through. In English, like
   * everything behind it: it is addressed to whoever set the machine up.
   */
  function askBeforeAdvanced(): void {
    const close = openConfirmDialog(
      confirmPane,
      {
        title: { mark: 'settings', label: 'Advanced settings' },
        body:
          'These decide where your writing is read from. Getting them wrong makes ' +
          'every text disappear from the list.',
        confirm: 'Continue',
        cancel: 'Cancel',
        phrase: { prompt: 'Type {} to continue.', words: ['advanced'] },
        danger: true,
        onConfirm: () => {
          close();
          showAdvanced();
        },
        onCancel: () => {
          close();
        },
      },
      parts.languageNow(),
    );
  }

  function showAppearance(): void {
    if (panel !== null) return;

    log.info('Opened the appearance panel');
    panel = openAppearancePanel(appearancePane, parts.settingsNow(), parts.languageNow(), {
      onPreview: parts.preview,

      onKeep: (appearance: Appearance) => {
        parts.keep(appearance);
        log.info('Changed how the app looks', appearance);
        hideAppearance();
      },

      onCancel: () => {
        // Whatever he was trying out goes back to what he walked in with. It
        // was never saved, so putting it back on screen is the whole of the
        // undo.
        parts.preview(parts.settingsNow());
        hideAppearance();
      },

      onAdvanced: askBeforeAdvanced,
    });
  }

  return {
    showAppearance,
    showAdvanced,
    askBeforeAdvanced,
    working: () => panel?.current() ?? null,
    change(appearance: Appearance): boolean {
      if (panel === null) return false;
      panel.change(appearance);
      return true;
    },
  };
}
