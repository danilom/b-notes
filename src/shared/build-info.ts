// Both are replaced with string literals by scripts/build.mjs at build time.
declare const __BUILD_STAMP__: string | undefined;
declare const __APP_VERSION__: string | undefined;

/**
 * The `package.json` version, e.g. `0.1.1`. This is what the updater compares,
 * so it's the number that decides whether a machine sees an update at all.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'development' : __APP_VERSION__;

/**
 * Identifies the running build, e.g. `2026-09-18 17:31 0ab32cd`.
 *
 * Reported by him over the phone, so it has to be short enough to read aloud.
 */
export const BUILD_STAMP = typeof __BUILD_STAMP__ === 'undefined' ? 'development' : __BUILD_STAMP__;
