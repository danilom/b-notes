/** The logging surface the preload script exposes to the renderer. */
export interface Log {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}
