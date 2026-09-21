import { APP_VERSION, BUILD_STAMP } from '../platform/build-info.ts';
import { type Language, strings } from '../language/wording.ts';
import { icon } from './icons.ts';

/**
 * What the app says when his writing is not where it was.
 *
 * Not a dialog over the list, because there is no list behind it worth looking
 * at and nothing here he should be able to dismiss his way past. It takes the
 * whole window: the app has one thing to tell him and one thing for him to do.
 *
 * The line he reads out is the point of the screen. He has reported texts
 * "disappearing" for years with no way to tell a sync failure from a minimised
 * window, and this turns a telephone call that opens with "everything is gone"
 * into one that opens with a version number and a folder.
 */
export interface LostHandlers {
  onAdvanced: () => void;
}

export function showLostTexts(
  root: HTMLElement,
  folder: string,
  language: Language,
  handlers: LostHandlers,
): void {
  const words = strings(language);

  const screen = document.createElement('div');
  screen.className = 'lost';

  // No mark beside it. The bin was tried and is a lie — it means deleted, next
  // to a sentence saying nothing has been deleted — and there is no icon in the
  // set that means "something is wrong" without also meaning something else.
  const title = document.createElement('h1');
  title.textContent = words.lostTitle;

  const body = document.createElement('p');
  body.textContent = words.lostBody;

  const advice = document.createElement('p');
  advice.className = 'lost-advice';
  advice.textContent = words.lostAdvice;

  // Everything needed to tell what happened, in one block he can read aloud.
  // The folder is here despite paths being forbidden everywhere else: this is
  // the one moment where the answer is the path, and he is on the telephone.
  const said = document.createElement('div');
  said.className = 'lost-said';
  said.textContent = `b-notes ${APP_VERSION} · ${BUILD_STAMP}\n${folder}`;

  const door = document.createElement('button');
  door.type = 'button';
  door.className = 'keep';
  door.append(icon('settings'), document.createTextNode(` ${words.lostSettings}`));
  door.addEventListener('click', handlers.onAdvanced);

  screen.append(title, body, advice, said, door);

  /*
    The app is hidden rather than thrown away.

    Replacing the whole body took the dialogs with it, and one of those is the
    way out of this screen — so the escape hatch opened nothing. Everything that
    is not a dialog goes, the dialogs stay where they are, and this sits in
    front.
  */
  for (const each of [...root.children]) {
    if (each instanceof HTMLDialogElement) continue;
    each.setAttribute('hidden', '');
  }
  root.append(screen);
}
