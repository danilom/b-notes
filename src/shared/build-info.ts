// Replaced with a string literal by scripts/build.mjs at build time.
declare const __BUILD_STAMP__: string | undefined;

/**
 * Identifies the running build, e.g. `2026-09-18 17:31 0ab32cd`. A trailing `+`
 * means the working tree had uncommitted changes, so the hash alone won't
 * reproduce it.
 *
 * Reported by him over the phone, so it has to be short enough to read aloud.
 */
export const BUILD_STAMP = typeof __BUILD_STAMP__ === 'undefined' ? 'development' : __BUILD_STAMP__;
