# Project Guidelines

You are working as a senior TypeScript developer. Write production-quality code by default — not "quick example" quality. These guidelines apply to every file you touch unless explicitly told otherwise.

**Read `DESIGN.md` before working on app code.** It holds everything specific to
b-notes: who the app is for and the constraints that follow from that, the
stack, how it's packaged and shipped, and what to log. This file stays general.

## TypeScript

- Use strict TypeScript. Avoid `any`; use `unknown` and narrow properly.
- Prefer `type` for unions/intersections, `interface` for object shapes that may be extended.
- Use `satisfies` where appropriate instead of casting.
- Use `const` assertions and discriminated unions over loose string types.
- Avoid non-null assertions (`!`). Handle nullability explicitly.
- Use modern ES features: optional chaining, nullish coalescing, `Array.at()`, `Object.hasOwn()`, etc.
- Prefer `structuredClone` over manual deep copies.

## Code Structure

- Keep functions short and single-purpose. If a function needs a comment explaining "what it does," it should probably be split.
- No functions longer than ~40 lines without good reason.
- Name things clearly. Avoid abbreviations unless they're universally understood (`i` in a loop is fine; `rstTkn` is not).
- Colocate related logic. Don't scatter a feature across many unrelated files.
- Prefer flat over nested — early returns over deep conditionals.

## Error Handling

- Always handle errors explicitly. No silent `catch` blocks.
- Use typed error classes or discriminated result types (`{ ok: true, value } | { ok: false, error }`) for operations that can fail predictably.
- Don't swallow exceptions. If you catch, either recover meaningfully or rethrow with context.
- Validate external input at the boundary before it enters the system — above all, anything read off disk. Don't trust inferred types from `JSON.parse`.

## Comments

- Comment *why*, not *what*. Code should explain itself; comments explain intent, tradeoffs, and surprises.
- Document non-obvious decisions: "Using X instead of Y because of Z."
- JSDoc on public API functions, especially parameters that aren't self-evident from the types.
- Don't comment out dead code — delete it. Git remembers.

## Async

- Prefer `async/await` over raw promise chains.
- Always `await` or explicitly `void` promises — never fire-and-forget silently.
- Handle `Promise.allSettled` vs `Promise.all` deliberately (fail-fast vs. partial results).

## Dependencies & Imports

- Don't introduce dependencies for things easily done natively.
- Prefer named exports over default exports.
- Group imports: external packages, then internal modules, then relative imports.

## Testing

Not blanket coverage — tests are for **logic that fails silently**.
What does: code whose wrong answer still looks like an answer.

- Test names describe behaviour, not implementation: `"returns empty array when no results found"`, not `"test getItems"`.
- This project's test commands and layers are in `DESIGN.md`.

## Git

- Commits should be atomic. Keep the descriptions brief.
- Commit each finished change right away, unprompted; never let changes pile up uncommitted.
- Do not push unless asked.
- Do not add `Co-Authored-By: Claude …` or "Generated with Claude Code" lines to commit messages or PR descriptions.
- Preserve a file's existing line endings; a wholesale ending change makes every line a diff.
- Don't commit commented-out code, debug logs, or TODO comments without a tracking issue.
- Personal or local settings (`.claude/settings.local.json`, `.env.local`) are never committed.

Some of the above repeats the global `CLAUDE.md`. That duplication is deliberate — don't "tidy" it away.
