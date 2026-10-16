/**
 * `experimental_*` exports promoted to stable, old name to new. Promoting an
 * export keeps the old name as a `@deprecated` alias until the next major
 * and adds it here, so the codemod rewrites imports of it.
 * @since 0.1.0
 * @stability stable
 */
export const PROMOTED: Readonly<Record<string, string>> = {};
