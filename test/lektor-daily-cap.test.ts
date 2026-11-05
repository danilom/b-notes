import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dailyCapSentence } from '../design/lektor-daily-cap.ts';

const refusal = (wait: string): string =>
  `429: Rate limit exceeded for model gemini-3.6-flash (limit: 20 requests per day on Free Tier). Please retry in ${wait} or upgrade your tier at https://ai.dev/rate-limit.`;

const CAPPED = 'Današnjih 20 besplatnih pokušaja kod Gugla (model Gemini 3.6 Flash) je potrošeno.';

describe('dailyCapSentence', () => {
  it('gives the clock time on this computer when the wait ends later today', () => {
    const morning = new Date(2026, 10, 5, 8, 18, 35);
    assert.equal(dailyCapSentence(refusal('41m25s'), morning), `${CAPPED} Probaj ponovo posle 09:00.`);
  });

  it('says tomorrow when the wait runs past midnight here', () => {
    const lateEvening = new Date(2026, 10, 5, 23, 18, 35);
    assert.equal(dailyCapSentence(refusal('15h41m25s'), lateEvening), `${CAPPED} Probaj ponovo sutra posle 15:00.`);
  });

  it('settles on the round time when the wait lands just past it', () => {
    const now = new Date(2026, 10, 5, 8, 18, 35);
    assert.equal(dailyCapSentence(refusal('41m28.5s'), now), `${CAPPED} Probaj ponovo posle 09:00.`);
  });

  it('reads a wait of hours alone', () => {
    const now = new Date(2026, 10, 5, 1, 0, 0);
    assert.equal(dailyCapSentence(refusal('2h'), now), `${CAPPED} Probaj ponovo posle 03:00.`);
  });

  it('falls back to tomorrow when the refusal gives no wait', () => {
    const detail = '429: Rate limit exceeded for model gemini-3.6-flash (limit: 20 requests per day on Free Tier).';
    assert.equal(dailyCapSentence(detail, new Date(2026, 10, 5, 12, 0, 0)), `${CAPPED} Probaj ponovo sutra.`);
  });

  it('leaves out the model when the refusal names none', () => {
    const detail = '429: limit: 50 requests per day. Please retry in 1h.';
    assert.equal(
      dailyCapSentence(detail, new Date(2026, 10, 5, 12, 0, 0)),
      'Današnjih 50 besplatnih pokušaja kod Gugla je potrošeno. Probaj ponovo posle 13:00.',
    );
  });

  it('writes a longer model name out in full', () => {
    const detail = '429: Rate limit exceeded for model gemini-3.1-flash-lite (limit: 500 requests per day). Please retry in 1h.';
    assert.match(dailyCapSentence(detail, new Date(2026, 10, 5, 12, 0, 0)) ?? '', /\(model Gemini 3\.1 Flash Lite\)/);
  });

  it('returns null for a limit that is not the daily one', () => {
    const perMinute = '429: Rate limit exceeded for model gemini-3.6-flash (limit: 10 requests per minute). Please retry in 30s.';
    assert.equal(dailyCapSentence(perMinute, new Date()), null);
  });
});
