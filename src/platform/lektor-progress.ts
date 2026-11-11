/*
  What a request running at an AI service reports while it runs, for the wait to draw and for
  the model chain to decide on: still queued, work begun, thinking, writing. Sent across the
  process boundary as plain data, so nothing here may be more than that.
*/

export type LektorProgress =
  /** The service took the request: work has begun, by this model. From then on it is never handed elsewhere. */
  | { kind: 'started'; model: string }
  | { kind: 'thinking' }
  /** How much it has written so far, in characters, to measure against his text. */
  | { kind: 'writing'; characters: number };

/** A progress report as it arrives across a process boundary, checked before it is believed. */
export function lektorProgressFrom(value: unknown): LektorProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, model, characters } = value as Record<string, unknown>;
  if (kind === 'started' && typeof model === 'string') return { kind, model };
  if (kind === 'thinking') return { kind };
  if (kind === 'writing' && typeof characters === 'number') return { kind, characters };
  return null;
}
