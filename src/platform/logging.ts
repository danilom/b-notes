/** The logging surface the preload script exposes to the renderer. */
export interface Log {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

/**
 * An error as something that survives the trip to the log.
 *
 * Errors do not come through structured cloning intact: an `Error` handed to
 * the preload bridge arrives as an empty object, so the one detail worth having
 * — what went wrong — is exactly what is lost on the way. Flattened to plain
 * fields here, once, for everything that reports a failure.
 *
 * Anything that is not an `Error` is passed straight through. A rejection can
 * carry any value at all, and a string that says what happened is worth more
 * than the same string wrapped in a shape it does not have.
 */
export function describeError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return { name: value.name, message: value.message, stack: value.stack };
}
