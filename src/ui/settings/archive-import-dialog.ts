import type { ArchiveImport, RawArchive, RawArchives } from '../../notes/archive-import.ts';
import { type Log, describeError } from '../../platform/logging.ts';
import { type Shown, showAsModal } from '../dialogs/modal.ts';
import { icon } from '../icons.ts';

/**
 * Turning the folders in `Arhiva-raw` into archives, from Advanced settings.
 *
 * Deliberately plain: a console and two buttons. It is for whoever sets his
 * machine up, run a handful of times in the app's life, and what that person
 * needs is to see exactly what was found and what was done — which a console
 * says better than any layout would. English, like the panel it opens from.
 *
 * Opening it only looks. Nothing is written until Import is pressed.
 */
export interface ArchiveImportHandlers {
  onClose: () => void;
  /** Something was written into Arhiva, so the strip under his list should count again. */
  onImported: () => void;
}

/** One raw folder as a console line. */
function describe(archive: RawArchive): string {
  const files = `${archive.sources} ${archive.sources === 1 ? 'file' : 'files'}`;
  const state = archive.state;
  let where: string;
  if (state.kind === 'new') where = 'not imported';
  else if (state.kind === 'partial') where = `partly imported (${state.present} of ${archive.sources})`;
  else if (state.record === null) where = 'imported (its record could not be read)';
  else {
    const on = new Date(state.record.importedAt).toLocaleString('en-GB');
    const failed = state.record.failed.length > 0 ? `, ${state.record.failed.length} failed` : '';
    where = `imported ${on} (${state.record.written} texts${failed})`;
  }
  return `  ${archive.name.padEnd(28)} ${files.padStart(10)}   ${where}`;
}

/** What is still to do: the folders not finished, with something in them. */
const pending = (survey: RawArchives): RawArchive[] =>
  survey.archives.filter((archive) => archive.state.kind !== 'done' && archive.sources > 0);

/** What is in Arhiva-raw, said so the person setting up knows what Import would do. */
function surveyLines(survey: RawArchives): string[] {
  const where = `Put each machine's or export's folder of texts inside it, one folder per source, e.g.\n  ${survey.where}\\Stari laptop 2021\\`;
  if (!survey.present) {
    return [`There is no Arhiva-raw folder. Make one here:`, `  ${survey.where}`, where, 'Then open this again.'];
  }
  if (survey.archives.length === 0) return [`${survey.where} is empty.`, where, 'Then open this again.'];
  const todo = pending(survey).length;
  return [
    `In ${survey.where}:`,
    ...survey.archives.map(describe),
    '',
    todo === 0 ? 'Nothing to import.' : `${todo} ${todo === 1 ? 'folder' : 'folders'} to import. Press Import to go on.`,
  ];
}

export function openArchiveImportDialog(
  container: HTMLDialogElement,
  importer: ArchiveImport,
  log: Log,
  handlers: ArchiveImportHandlers,
): () => void {
  let modal: Shown | null = null;
  let running = false;
  let toImport: RawArchive[] = [];

  const panel = document.createElement('div');
  panel.className = 'panel advanced-panel archive-import';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const output = document.createElement('pre');
  output.className = 'import-console';
  output.setAttribute('aria-live', 'polite');
  const say = (line: string): void => {
    output.textContent += `${line}\n`;
    output.scrollTop = output.scrollHeight;
  };

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'keep';
  start.textContent = 'Import';
  start.disabled = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';

  // Not while it is writing: the next import would carry on from where it
  // stopped, but a person who closed it would not know what state it was in.
  const leave = (): void => {
    if (!running) handlers.onClose();
  };
  close.addEventListener('click', leave);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'close';
  dismiss.title = 'Close';
  dismiss.setAttribute('aria-label', 'Close');
  dismiss.append(icon('close'));
  dismiss.addEventListener('click', leave);

  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = 'Import archives';
  header.append(title, dismiss);

  const footer = document.createElement('footer');
  footer.append(start, close);
  panel.append(header, output, footer);

  async function look(): Promise<void> {
    say('Looking in Arhiva-raw…');
    try {
      const survey = await importer.survey();
      toImport = pending(survey);
      for (const line of surveyLines(survey)) say(line);
      start.disabled = toImport.length === 0;
    } catch (failure: unknown) {
      say(`Could not look in Arhiva-raw: ${failure instanceof Error ? failure.message : String(failure)}`);
      log.error('Could not look in Arhiva-raw', describeError(failure));
    }
  }

  async function run(): Promise<void> {
    running = true;
    start.disabled = true;
    close.disabled = true;
    dismiss.disabled = true;
    say('');
    log.info('Importing archives', { folders: toImport.map((archive) => archive.name) });
    try {
      for (const archive of toImport) await importer.importOne(archive.name, say);
      say('');
      say('Done. The archives are in Arhiva now.');
    } catch (failure: unknown) {
      say(`Stopped: ${failure instanceof Error ? failure.message : String(failure)}. Import again to carry on.`);
      log.error('An archive import stopped', describeError(failure));
    } finally {
      running = false;
      close.disabled = false;
      dismiss.disabled = false;
      toImport = [];
      handlers.onImported();
    }
  }

  start.addEventListener('click', () => {
    void run();
  });

  modal = showAsModal(container, panel, leave);
  void look();
  return () => modal?.close();
}
