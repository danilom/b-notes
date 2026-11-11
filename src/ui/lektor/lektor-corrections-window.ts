import { describeWhen, type Language } from '../../language/wording.ts';
import { describeError, type Log } from '../../platform/logging.ts';
import { titleOf } from '../dialogs/dialog-heading.ts';
import { openConfirmDialog } from '../dialogs/confirm-dialog.ts';
import { type Shown, showAsModal } from '../dialogs/modal.ts';
import { icon } from '../icons.ts';
import { flashToast } from '../toast.ts';
import { paidIfSlowByDefault } from './lektor-balance.ts';
import { lektorChoice, type PaidIfSlow, paidIfSlowBox } from './lektor-choice.ts';
import type { LektorConnection } from './lektor-connection.ts';
import { freeResetTime } from './lektor-daily-reset.ts';
import { failureView } from './lektor-failures.ts';
import { correctionInstruction, proposalFrom, withHisFilingMarks } from './lektor-instructions.ts';
import { areSetsVoid, type KeptProposal, type KeptResults, keptSet, withCorrections, withEndingOf } from './lektor-kept-results.ts';
import { markOf } from './lektor-marks.ts';
import { ChainError, type ChainFailure, isStopped, type Stage } from './lektor-model-chain.ts';
import { balanceLine, button, deadKeyNoticeOf, el, elapsedWords, type LektorWords, type ProblemParts, problemBox, sendButton, sendTooltip, serviceLineOf, tierFor } from './lektor-pieces.ts';
import { PRESET_ORDER, PRESET_PROMPTS } from './lektor-presets.ts';
import { createReviewPanel } from './lektor-review.ts';
import { type Choice, LektorServiceError, type PresetId } from './lektor-service.ts';
import { FREE_STAND_IN, fallsBack, tierOfModel, type Tier } from './lektor-tiers.ts';

/*
  The corrections, all in one modal window (spec §8): choosing the kind, the request, the wait, a
  failure with its way on, and the review. From the moment he opens it his text is held still. The
  kind first, since it is what he wants done; the Lektor follows from it. Laid out as
  design/lektor-corrections-window-prototype.ts, which is the source for its words and look.
*/

type View = 'choosing' | 'waiting' | 'failed' | 'review';

type Proposals = Pick<KeptResults, 'proposals' | 'proposalsFor' | 'paidCosts'>;

/** The text the window is about, and where its kept sets live: the panel's state for it. */
export interface WindowText {
  text: string;
  title: string;
  proposals: () => Proposals;
  keep: (next: Proposals) => void;
  note: () => string;
  setNote: (note: string) => void;
}

export interface WindowParts extends ProblemParts {
  dialog: HTMLDialogElement;
  confirmPane: HTMLDialogElement;
  connection: LektorConnection;
  languageNow: () => Language;
  log: Log;
  /** Gets the text ready to be sent: on disk with his last words, and brought over from Resoph. */
  prepareToSend: () => Promise<boolean>;
  /** Makes these corrections his text, a version kept first. False if that couldn't be done. */
  applyCorrections: (text: string) => Promise<boolean>;
  /** The keys screen is the panel's: the window closes and the panel opens on it. */
  openKeysInPanel: () => void;
  /** The window has gone, taken or not. */
  onClosed: () => void;
  /** Said under the review's title when the reply is a saved one, by the model it names (the browser build only). */
  savedNoteFor: (model: string) => string | null;
}

interface Failed {
  failure: ChainFailure;
  side: Choice;
  serviceSaid: string;
}

export function openCorrectionsWindow(parts: WindowParts, text: WindowText): void {
  const words = (): LektorWords => parts.words();
  const { connection, log } = parts;
  let view: View = 'choosing';
  let preset: PresetId | null = null;
  let isAskingAgain = false;
  // Every opening starts on Besplatni; Plaćeni, once picked, holds for both rework kinds until the window closes.
  let reworkChoice: Choice = 'free';
  let isPaidIfSlow = paidIfSlowByDefault(connection.hasKey().paid, connection.balance());
  let isPromptOpen = text.note().trim() !== '';
  let failed: Failed | null = null;
  let sentTo: Choice = 'free';
  let stages: readonly Stage[] = [];
  let writtenShare = 0;
  let runStartedAt = 0;
  let running: AbortController | null = null;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let reviewing: { preset: PresetId; kept: KeptProposal; isJustMade: boolean } | null = null;
  let shown: Shown | null = null;
  let leaveNow: () => void = () => {};

  const other = (choice: Choice): Choice => (choice === 'free' ? 'paid' : 'free');

  /** Who a kind goes to: the free one for the first two, his choice for rework; whichever has a key if one hasn't. */
  function lektorFor(kind: PresetId): Choice {
    const wanted = fallsBack(kind) ? 'free' : reworkChoice;
    return connection.hasKey()[wanted] ? wanted : other(wanted);
  }

  function stopClock(): void {
    if (clockTimer !== undefined) clearInterval(clockTimer);
    clockTimer = undefined;
  }

  /** Closing while it runs stops it: the wait is the window's, and nothing is kept from it. */
  function close(): void {
    running?.abort();
    running = null;
    stopClock();
    shown?.close();
    shown = null;
    log.info('Closed the AI corrections window');
    parts.onClosed();
  }

  /** On the choosing step, asked only when this text has kept suggestions, in the review's own words (spec §7). */
  function leaveChoosing(): void {
    const { proposals, proposalsFor } = text.proposals();
    if (view === 'waiting' || proposals.length === 0 || areSetsVoid({ proposals, proposalsFor }, text.text)) {
      close();
      return;
    }
    const said = words().review;
    const question = openConfirmDialog(
      parts.confirmPane,
      {
        title: { mark: 'lektor', label: said.leaveTitle },
        body: said.leaveBody,
        confirm: said.leave,
        cancel: said.leaveCancel,
        danger: true,
        onConfirm: () => {
          question();
          close();
        },
        onCancel: () => question(),
      },
      parts.languageNow(),
    );
  }

  function show(next: View): void {
    view = next;
    draw();
  }

  function pick(kind: PresetId): void {
    preset = kind;
    failed = null;
    isAskingAgain = false;
    log.info('Chose a kind of correction', { preset: kind });
    show('choosing');
  }

  /* The left column: the four kinds, each with how far it goes. */

  function kindOption(kind: PresetId): HTMLElement {
    const option = el('label', 'lektor-preset');
    const input = el('input');
    input.type = 'radio';
    input.name = 'lektor-window-kind';
    input.checked = preset === kind;
    input.disabled = view === 'waiting';
    input.addEventListener('change', () => pick(kind));
    const about = el('span', 'lektor-kind-about');
    const summary = words().window.kinds[kind];
    about.append(el('span', '', summary.does), el('span', 'lektor-kind-keeps', summary.keeps));
    option.append(input, el('span', '', words().presets[kind]), about);
    const row = el('div', 'lektor-kind');
    row.append(option);
    return row;
  }

  function choicesColumn(): HTMLElement {
    const kinds = el('div', 'lektor-kind-list');
    for (const kind of PRESET_ORDER) {
      // The first three fix his text; Dubinska replaces it, so a line sets it apart.
      if (kind === 'rewrite') kinds.append(el('hr', 'lektor-kind-divider'));
      kinds.append(kindOption(kind));
    }
    const column = el('div', 'lektor-window-side');
    column.append(el('p', 'lektor-heading', words().window.chooseKind), kinds);
    return column;
  }

  /* The right column, choosing: nothing yet, what is ready, or the request. */

  function emptyDetail(): HTMLElement {
    const empty = el('div', 'lektor-window-big lektor-window-empty');
    empty.append(el('p', '', words().window.chooseKindLeft));
    return empty;
  }

  /** When a set was made, after "od"; nothing for one made just now, as "od upravo sad" reads badly. */
  function madeWhen(kept: KeptProposal): string {
    if (kept.madeAt === 0 || Date.now() - kept.madeAt < 60_000) return '';
    return describeWhen(kept.madeAt, parts.languageNow());
  }

  /** The one kept set of this kind: whose by name, from when, what it cost, and the way into it. */
  function readyCard(kind: PresetId, kept: KeptProposal): HTMLElement {
    const said = words().window;
    const tier = tierOfModel(kept.model) ?? 'free';
    const when = madeWhen(kept);
    const card = el('div', 'lektor-ready-card');
    const line = el('span', 'lektor-ready-words', said.readyCard(words().families[tier], when === '' ? '' : said.readyWhen(when), kept.cost === null ? '' : said.readyPaid(words().dollars(kept.cost))));
    line.title = said.readyBy(words().names[tier]);
    card.append(markOf(tier), line, button(said.look, () => openReview(kind, kept, false), 'lektor-main-action'));
    return card;
  }

  /** Where the cards were, once his text has changed: one grey line, however many sets there were. */
  function voidLine(): HTMLElement[] {
    return areSetsVoid(text.proposals(), text.text) ? [el('p', 'lektor-where lektor-stale-kept', words().window.voidSets)] : [];
  }

  function readyDetail(kind: PresetId, kept: KeptProposal): HTMLElement[] {
    const again = button(words().window.askAgain, () => {
      isAskingAgain = true;
      show('choosing');
    }, 'lektor-ask-again');
    return [el('p', 'lektor-window-kind-title', words().presets[kind]), readyCard(kind, kept), again];
  }

  const windowPaidIfSlow: PaidIfSlow = {
    get isTicked() {
      return isPaidIfSlow;
    },
    tick: (isTicked) => {
      isPaidIfSlow = isTicked;
      // Redrawn, so the send button's tooltip says where a slow one goes.
      draw();
    },
  };

  const mayHandOver = (to: Choice): boolean => to === 'free' && isPaidIfSlow && connection.hasKey().paid;

  /** For the first two kinds, said rather than asked, with the tick box under it; for rework, the choice. */
  function lektorPart(kind: PresetId): HTMLElement[] {
    const has = connection.hasKey();
    if (fallsBack(kind)) {
      const to = lektorFor(kind);
      if (to !== 'free' || !has.paid) return [serviceLineOf(words(), tierFor(to, kind))];
      const row = el('div', 'lektor-choice-options');
      row.append(paidIfSlowBox(words(), windowPaidIfSlow, false));
      return [serviceLineOf(words(), 'free'), row, ...balanceLine(words(), connection.balance())];
    }
    return lektorChoice({
      words: words(),
      group: 'lektor-window-level',
      work: kind,
      chosen: lektorFor(kind),
      choose: (choice) => {
        reworkChoice = choice;
        draw();
      },
      why: { paid: words().why.reworkPaid },
      hasKey: has,
      paidIfSlow: windowPaidIfSlow,
      balance: connection.balance(),
      isLocked: false,
    });
  }

  /** What this kind cost last time on this text, when it was paid: a fact, where a guess would be wrong. */
  function lastCost(kind: PresetId): HTMLElement[] {
    const cost = text.proposals().paidCosts[kind];
    if (lektorFor(kind) !== 'paid' || cost === undefined) return [];
    return [el('p', 'lektor-where', words().window.lastTime(words().dollars(cost)))];
  }

  /** "▸ Uputstva za AI", pointing right while folded, down while open. */
  function promptToggle(): HTMLButtonElement {
    const toggle = button('', () => {
      isPromptOpen = !isPromptOpen;
      draw();
    }, 'lektor-prompt-toggle');
    toggle.setAttribute('aria-expanded', String(isPromptOpen));
    toggle.append(el('span', 'lektor-prompt-arrow', isPromptOpen ? '▾' : '▸'), el('span', '', words().window.instructions));
    return toggle;
  }

  /** His own, under the fold's heading. */
  function noteField(): HTMLElement[] {
    const said = words().window;
    const label = el('label', 'lektor-prompt-sub', said.yourOwn);
    label.append(el('span', 'lektor-label-aside', said.optional));
    const box = el('textarea', 'lektor-note');
    box.rows = 3;
    box.placeholder = said.notePlaceholder;
    box.value = text.note();
    box.addEventListener('input', () => text.setNote(box.value));
    return [label, box];
  }

  /**
   * The instructions, open: everything that goes to the model for this kind, in English because that
   * is what is sent, read-only; then his own note. Folded, the opener sits on the send line instead.
   */
  function promptPart(kind: PresetId): HTMLElement[] {
    if (!isPromptOpen) return [];
    const sent = correctionInstruction({ text: text.text, preset: kind, instruction: PRESET_PROMPTS[kind], note: '' });
    const instruction = el('p', 'lektor-prompt', sent);
    instruction.lang = 'en';
    const group = el('div', 'lektor-prompt-group');
    group.append(el('p', 'lektor-prompt-sub', words().window.forThisKind), instruction, ...noteField());
    return [promptToggle(), group];
  }

  function sendRow(kind: PresetId): HTMLElement {
    const said = words().window;
    const row = el('div', 'lektor-window-actions');
    if (isAskingAgain) {
      row.append(button(said.backToReady, () => {
        isAskingAgain = false;
        show('choosing');
      }, 'lektor-back-to-ready'));
    }
    const to = lektorFor(kind);
    const send = sendButton(said.send, tierFor(to, kind), () => void run(kind, to), 'lektor-main-action', sendTooltip(words(), to, kind, mayHandOver(to)));
    const line = el('div', 'lektor-send-line');
    line.append(...(isPromptOpen ? [] : [promptToggle()]), el('span', 'lektor-wait-small lektor-send-note', said.sendNote));
    row.append(line, send);
    return row;
  }

  function requestDetail(kind: PresetId): HTMLElement[] {
    const kept = keptSet(text.proposals(), text.text, kind);
    return [el('p', 'lektor-window-kind-title', words().presets[kind]), ...(kept === null ? voidLine() : []), ...lektorPart(kind), ...lastCost(kind), ...promptPart(kind), sendRow(kind)];
  }

  /* The right column, running. */

  const stageTier = (stage: Stage): Tier => stage.tier;
  const isTurnedAway = (stage: Stage): boolean => stage.phase === 'refused' || stage.phase === 'spent';

  function durationWords(ms: number): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return words().window.took(Math.floor(seconds / 60), seconds % 60);
  }

  /** A finished stage ticked, the current one turning, one given up or refused a soft "!": not a cross. */
  function stageMark(stage: Stage, isCurrent: boolean): HTMLElement {
    if (isCurrent) return el('span', 'lektor-stage-mark lektor-reading');
    if (stage.isGivenUp || isTurnedAway(stage)) return el('span', 'lektor-stage-mark lektor-stage-mark-moved', '!');
    return el('span', 'lektor-stage-mark', '✓');
  }

  function progressRow(): HTMLElement {
    const percent = Math.round(writtenShare * 100);
    const bar = el('div', 'lektor-progress');
    const filled = el('div', 'lektor-progress-done');
    filled.style.width = `${percent}%`;
    bar.append(filled);
    const row = el('div', 'lektor-stage-progress');
    row.append(bar, el('span', 'lektor-stage-time', `${percent}%`));
    return row;
  }

  /** Under the queue while it lasts: that free requests wait, and, if he ticked, when it goes to the paid one. */
  function underStage(stage: Stage): HTMLElement[] {
    if (stage.endedAt !== null) return [];
    if (stage.phase === 'queue') {
      const next = mayHandOver(sentTo) ? ` ${words().expectHandOver}` : '';
      return [el('p', 'lektor-wait-small lektor-stage-note', `${words().window.queueNote}${next}`)];
    }
    return stage.phase === 'writing' ? [progressRow()] : [];
  }

  function stagesList(): HTMLElement {
    const list = el('div', 'lektor-stages');
    stages.forEach((stage, index) => {
      const before = stages[index - 1];
      // Where it was handed to another Lektor, that one's own "AI Lektor:" line: the one change here he should notice, since it costs.
      if (before !== undefined && stageTier(before) !== stageTier(stage)) list.append(serviceLineOf(words(), stageTier(stage)));
      const isCurrent = stage.endedAt === null;
      const [going, done] = words().window.stages[stage.phase];
      const row = el('div', 'lektor-stage');
      const took = isCurrent || isTurnedAway(stage) || stage.endedAt === null ? '' : durationWords(stage.endedAt - stage.startedAt);
      row.append(stageMark(stage, isCurrent), el('span', 'lektor-stage-words', isCurrent ? going : done));
      if (took !== '') row.append(el('span', 'lektor-stage-leader'), el('span', 'lektor-stage-time', took));
      list.append(row, ...underStage(stage));
    });
    return list;
  }

  /** The model working now, in small grey under the clock: the one place it is shown outright. */
  function modelLine(): HTMLElement[] {
    const now = stages.at(-1);
    if (now === undefined) return [];
    return [el('p', 'lektor-wait-small', `${now.model}${now.model === FREE_STAND_IN ? words().window.standingIn : ''}`)];
  }

  function waitingDetail(kind: PresetId): HTMLElement[] {
    const first = stages[0];
    const column = el('div', 'lektor-wait-column');
    column.append(
      el('p', 'lektor-heading lektor-wait-name', text.title),
      el('p', '', words().window.kindIs(words().presets[kind])),
      serviceLineOf(words(), first?.tier ?? tierFor(sentTo, kind)),
      stagesList(),
      el('p', 'lektor-window-clock', elapsedWords(runStartedAt, performance.now(), words().window.elapsed)),
      ...modelLine(),
    );
    const big = el('div', 'lektor-window-big lektor-window-wait');
    big.append(column);
    const stop = el('div', 'lektor-window-actions');
    // Giving up on it, which is what it is, even though paid may already be charging for the work begun.
    stop.append(button(words().giveUp, giveUp));
    return [big, stop];
  }

  function giveUp(): void {
    running?.abort();
    running = null;
    stopClock();
    log.info('Gave up a request for corrections');
    // A paid request may be charged for work begun, so the balance is read again.
    void connection.rereadBalance();
    show('choosing');
  }

  /* The right column, failed. */

  function sendToButton(kind: PresetId, to: Choice): HTMLButtonElement {
    const made = sendButton(to === 'free' ? words().sendToFree : words().sendToPaid, tierFor(to, kind), () => void run(kind, to), 'lektor-main-action', sendTooltip(words(), to, kind, mayHandOver(to)));
    return made;
  }

  function failedDetail(kind: PresetId, failure: Failed): HTMLElement[] {
    const big = el('div', 'lektor-window-big');
    const back = button('', () => {
      failed = null;
      show('choosing');
    }, 'lektor-back-to-ready');
    back.append(icon('back'), el('span', '', words().back));
    const row = el('div', 'lektor-window-actions');
    row.append(back);
    if (failure.failure === 'bad-key') {
      big.append(deadKeyNotice());
      row.append(button(words().keysLink, () => {
        close();
        parts.openKeysInPanel();
      }, 'lektor-main-action'));
      return [big, row];
    }
    const viewed = failureView({ failure: failure.failure, side: failure.side, hasKey: connection.hasKey(), resetTime: freeResetTime(new Date()) }, words());
    const whose = failure.side === 'free' ? words().whoseWords.google : words().whoseWords.openrouter;
    big.append(problemBox(parts, viewed.sentence, viewed.wayOn, failure.serviceSaid === '' ? '' : `${whose}: ${failure.serviceSaid}`));
    if (viewed.shortcut !== null) row.append(sendToButton(kind, viewed.shortcut));
    if (viewed.isRetried) row.append(button(words().tryAgain, () => void run(kind, sentTo), 'lektor-main-action'));
    return [big, row];
  }

  function deadKeyNotice(): HTMLElement {
    return deadKeyNoticeOf(words());
  }

  function detailColumn(): HTMLElement {
    const column = el('div', 'lektor-window-detail');
    if (preset === null) {
      column.append(emptyDetail());
      return column;
    }
    const kept = keptSet(text.proposals(), text.text, preset);
    if (view === 'waiting') column.append(...waitingDetail(preset));
    else if (view === 'failed' && failed !== null) column.append(...failedDetail(preset, failed));
    else if (kept !== null && !isAskingAgain) column.append(...readyDetail(preset, kept));
    else column.append(...requestDetail(preset));
    return column;
  }

  /* Sending. */

  function failWith(failure: Failed): void {
    failed = failure;
    if (failure.failure === 'bad-key') connection.dead[failure.side] = true;
    log.warn('The Lektor did not make corrections', { failure: failure.failure, side: failure.side });
    show('failed');
  }

  async function run(kind: PresetId, to: Choice): Promise<void> {
    running?.abort();
    const controller = new AbortController();
    running = controller;
    failed = null;
    sentTo = to;
    stages = [];
    writtenShare = 0;
    runStartedAt = performance.now();
    stopClock();
    clockTimer = setInterval(() => {
      const clock = parts.dialog.querySelector('.lektor-window-clock');
      if (clock !== null) clock.textContent = elapsedWords(runStartedAt, performance.now(), words().window.elapsed);
    }, 1000);
    show('waiting');
    try {
      if (!(await parts.prepareToSend())) throw new LektorServiceError('not-brought-over', 'not on disk');
      const request = { work: kind, choice: to, mayHandOver: mayHandOver(to), system: correctionInstruction({ text: text.text, preset: kind, instruction: PRESET_PROMPTS[kind], note: text.note() }), input: text.text };
      log.info('The Lektor was asked for corrections', { preset: kind, choice: to, mayHandOver: request.mayHandOver, hasNote: text.note().trim() !== '' });
      const reply = await connection.run(request, (now, share) => {
        stages = now;
        writtenShare = share;
        if (view === 'waiting' && running === controller) draw();
      }, controller.signal);
      const proposed = withHisFilingMarks(text.text, proposalFrom(reply.words, text.text));
      const kept: KeptProposal = { preset: kind, proposed, model: reply.model, madeAt: Date.now(), cost: reply.cost };
      text.keep(withCorrections(text.proposals(), text.text, kept));
      void connection.rereadBalance();
      if (running !== controller) return;
      running = null;
      stopClock();
      openReview(kind, kept, true);
    } catch (error) {
      if (running !== controller) return;
      running = null;
      stopClock();
      if (isStopped(error)) return;
      void connection.rereadBalance();
      if (error instanceof ChainError) failWith({ failure: error.failure, side: error.side, serviceSaid: error.serviceSaid });
      else if (error instanceof LektorServiceError) failWith({ failure: error.failure, side: to, serviceSaid: error.serviceSaid });
      else {
        log.error('The Lektor failed', describeError(error));
        failWith({ failure: 'busy', side: to, serviceSaid: '' });
      }
    }
  }

  /* The review. */

  /** The review's header line: bare, each part saying in full what it is in its tooltip (spec §8). */
  function whoLine(kind: PresetId, kept: KeptProposal, isJustMade: boolean): (large: number, small: number) => HTMLElement {
    return (large, small) => {
      const said = words().review;
      const tier = tierOfModel(kept.model) ?? 'free';
      const explained = (className: string, tooltip: string, shown = ''): HTMLElement => {
        const part = el('span', className, shown);
        part.title = tooltip;
        return part;
      };
      const lektor = explained('lektor-review-who', said.tips.lektor(words().names[tier], kept.model));
      lektor.append(markOf(tier), el('span', '', words().names[tier]));
      const when = isJustMade || kept.madeAt === 0 ? describeWhen(Date.now(), parts.languageNow()) : describeWhen(kept.madeAt, parts.languageNow());
      const line = el('p', 'lektor-service-line');
      const lineParts = [
        explained('lektor-review-kind', said.tips.kind(words().presets[kind]), words().presets[kind]),
        lektor,
        ...(kept.madeAt === 0 && !isJustMade ? [] : [explained('', said.tips.when(when), when)]),
        ...(kept.cost === null ? [] : [explained('', said.tips.paid(words().dollars(kept.cost)), said.paid(words().dollars(kept.cost)))]),
        explained('', said.tips.counts(large, small), said.counts(large, small)),
      ];
      lineParts.forEach((part, at) => line.append(...(at > 0 ? [' · '] : []), part));
      const row = el('div', 'lektor-review-row');
      row.append(line);
      return row;
    };
  }

  function openReview(kind: PresetId, kept: KeptProposal, isJustMade: boolean): void {
    reviewing = { preset: kind, kept, isJustMade };
    preset = kind;
    log.info('Looked at the Lektor’s corrections', { preset: kind, model: kept.model });
    show('review');
  }

  /** What he took goes in with a version kept first; if that can't be done nothing changes, and the proposal is still there. */
  async function apply(result: string): Promise<void> {
    if (!(await parts.applyCorrections(result))) return;
    // Taken, so nothing is left to come back to; what each kind cost is kept for next time.
    text.keep({ proposals: [], proposalsFor: '', paidCosts: text.proposals().paidCosts });
    log.info('Corrections from the Lektor were put in the text');
    close();
    flashToast(parts.toast, words().applied, words().appliedHow);
  }

  function reviewPanelNow(): HTMLElement {
    if (reviewing === null) return choosingPanel();
    const { preset: kind, kept, isJustMade } = reviewing;
    const proposed = withEndingOf(text.text, kept.proposed);
    const made = createReviewPanel(
      parts.confirmPane,
      { title: text.title, current: text.text, proposed, whoLine: whoLine(kind, kept, isJustMade), showsOnlyNew: kind === 'rewrite', savedNote: parts.savedNoteFor(kept.model) },
      parts.languageNow(),
      {
        onApply: (result) => void apply(result),
        onBack: () => {
          reviewing = null;
          show('choosing');
        },
        onClose: close,
      },
    );
    leaveNow = made.leave;
    queueMicrotask(made.draw);
    return made.panel;
  }

  /* The window. */

  function header(): HTMLElement {
    const top = el('header');
    const heading = el('div', 'review-heading');
    heading.append(titleOf({ mark: 'lektor', label: words().window.title, name: text.title }), el('p', 'review-note', words().window.textStill));
    const dismiss = button('', leaveChoosing, 'close');
    dismiss.setAttribute('aria-label', words().close);
    dismiss.title = words().close;
    dismiss.append(icon('close'));
    top.append(heading, dismiss);
    return top;
  }

  function choosingPanel(): HTMLElement {
    leaveNow = leaveChoosing;
    const panes = el('div', 'review-panes');
    panes.append(choicesColumn(), detailColumn());
    const footer = el('footer');
    footer.append(button(words().close, leaveChoosing));
    const panel = el('div', 'panel review-panel lektor-panel lektor-window');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.append(header(), panes, footer);
    return panel;
  }

  function draw(): void {
    const panel = view === 'review' ? reviewPanelNow() : choosingPanel();
    if (shown === null) shown = showAsModal(parts.dialog, panel, () => leaveNow());
    else parts.dialog.replaceChildren(panel);
  }

  log.info('Opened the AI corrections window');
  // The balance is read again whenever the window opens (spec §9); the tick box follows it if it moves.
  void connection.rereadBalance().then(() => {
    if (shown !== null && view === 'choosing') draw();
  });
  draw();
}
