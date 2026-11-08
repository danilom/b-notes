/** The looks a review's text is drawn in, each of which the legend can explain. */
export type LegendSample = 'old' | 'proposed' | 'own' | 'goes-in' | 'small';

/** One look, and what it means where the legend is shown. */
export interface LegendEntry {
  sample: LegendSample;
  said: string;
}

/** The box or colour each look is drawn with, the same classes the text itself uses. */
const MARK_OF: Record<Exclude<LegendSample, 'small'>, string> = {
  old: 'diff-gone diff-struck',
  proposed: 'diff-new',
  own: 'diff-own',
  'goes-in': 'diff-resolved',
};

/**
 * The sample word drawn as the text draws it. For small corrections, both marks they
 * leave: the caret where something went that left nothing to show, here before the word,
 * and its last letter put right.
 */
function sampleOf(sample: LegendSample, word: string): HTMLElement {
  const shown = document.createElement('span');
  const mark = document.createElement('span');
  if (sample !== 'small') {
    mark.className = MARK_OF[sample];
    mark.textContent = word;
    shown.append(mark);
    return shown;
  }
  const caret = document.createElement('span');
  caret.className = 'diff-correction-mark';
  caret.textContent = '‸';
  const letters = [...word];
  mark.className = 'diff-tidied';
  mark.textContent = letters.at(-1) ?? '';
  shown.append(caret, letters.slice(0, -1).join(''), mark);
  return shown;
}

/**
 * What each mark in the text below means, each beside a sample word drawn exactly as it
 * is there, so that he matches them by their look rather than by the name of a colour,
 * which a warm screen takes first. One line, parted by middle dots.
 *
 * @param word The sample word, in the reader's language.
 */
export function createDiffLegend(entries: readonly LegendEntry[], word: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'review-note-aside diff-legend';
  entries.forEach(({ sample, said }, at) => {
    if (at > 0) {
      const dot = document.createElement('span');
      dot.className = 'diff-legend-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '·';
      line.append(dot);
    }
    const item = document.createElement('span');
    item.className = 'diff-legend-item';
    item.append(sampleOf(sample, word), said);
    line.append(item);
  });
  return line;
}
