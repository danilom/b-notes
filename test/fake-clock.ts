/*
  A clock for tests that need minutes to pass in no time. Timers run in the order they fall due,
  and between each, whatever promises they set going are let settle, so code awaiting across
  several timers moves on as it would in real time.
*/

interface Timer {
  at: number;
  order: number;
  then: () => void;
}

export interface FakeClock {
  now: () => number;
  after: (ms: number, then: () => void) => () => void;
  /** Moves time on by `ms`, running every timer that falls due on the way. */
  advance: (ms: number) => Promise<void>;
}

/** Lets pending promise callbacks run: a few turns, as chains of awaits need more than one. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

export function createFakeClock(): FakeClock {
  let now = 0;
  let order = 0;
  const timers = new Set<Timer>();
  return {
    now: () => now,
    after: (ms, then) => {
      const timer = { at: now + Math.max(0, ms), order: (order += 1), then };
      timers.add(timer);
      return () => timers.delete(timer);
    },
    advance: async (ms) => {
      const until = now + ms;
      await settle();
      for (;;) {
        const next = [...timers].filter((timer) => timer.at <= until).sort((one, other) => one.at - other.at || one.order - other.order)[0];
        if (next === undefined) break;
        timers.delete(next);
        now = next.at;
        next.then();
        await settle();
      }
      now = until;
      await settle();
    },
  };
}
