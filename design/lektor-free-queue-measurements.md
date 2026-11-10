# Google's free tier: how long the Lektor waits

Measured for the Lektor redesign (OpenRouter, free Gemini first). Only timings here. The texts sent
were made up (testdata/lektor-comparison/probni-tekst-made-up.txt), and the raw logs stay in
testdata/, which git ignores. Probe: `scripts/probe-lektor-queue.mts` on branch lektor-model-comparison.

The free door is `/interactions` with `stream: true`. While a request waits its turn it sends
`: keep-alive` every 15 s; when the work starts it sends `interaction.created`, then the words. So the
app can tell waiting in the queue from working.

## The runs

Times are UTC, with his time (UTC+7) in brackets, from Google's own Date header.

| When | gemini-3.8-flash | gemini-3.6-flash |
|---|---|---|
| 2026-11-09 ~14:20 (21:20) | queued 190 s, then 3.4 s of work | — |
| 2026-11-09 ~17:55 (00:55) | queued 318 s, then 2 s of work | queued 41 s, then refused "high demand" mid-stream |
| 2026-11-10 07:37 (14:37) | refused "high demand" after 7 s, no queue | queued 15 s, then ~1 s of work |
| 2026-11-10 11:47–11:53 (18:47–18:53) | queued 315 s, then ~2 s of work | refused "high demand" after 12 s |

On 2026-11-05 to 11-08, 3.6 had no real queue. A whole utisak on free 3.8 (2026-11-09, five real
essays, the older non-streaming door) took 173–324 s. Paid Flash through OpenRouter started within
3 s; paid Opus answered a utisak in about 18 s.

## What follows from it

- **3.8 queues about five minutes whenever it isn't refused outright.** Its work is a few seconds;
  the wait is all queue.
- **3.6 is erratic**: a short queue one time, refused the next. It is a fallback that sometimes
  works, not a dependable one.
- **"Busy" comes two ways**: at once (a 503 within seconds), or after some queuing (an error event
  mid-stream). The fallback chain must treat both as "busy, try the next".
- **For the corrections**, the chain 3.8 → 3.6 → paid Flash (if ticked), a minute each, stands. With
  the box ticked, Slova i zarezi and Pravopis will often end on paid Flash, for about 10 cents.
- **For the free utisak**, which has no paid step: expect about five minutes on 3.8, a quick 3.6 when
  it isn't busy, or a failure as busy. The failure is a regular case, not an edge, and the wait's
  "može da potraje nekoliko minuta" is honest.
- **Not yet measured**: morning UTC (his night) and a weekend. Before release, whole essays on free
  3.8 across a day.
