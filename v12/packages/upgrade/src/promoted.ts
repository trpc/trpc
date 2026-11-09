/**
 * Exports promoted out of experimental, old name to new: `experimental_x` to
 * `x`. Promoting an export keeps the old name as a `@deprecated` alias until
 * the next major and adds it here, so the codemod rewrites imports of it.
 * Chains resolve to their end: `experimental_x` → `experimental_y` → `y`
 * rewrites `experimental_x` to `y`.
 * @since 0.1.0
 * @stability stable
 */
export const PROMOTED: Readonly<Record<string, string>> = {};

/**
 * A promoted `@trpc12/experimental-*` package: the package it's published as
 * now, and its exports that were renamed on the way (`atom` to
 * `experimental_atom`, when the rest of the package is promoted without it).
 * @since 0.1.0
 * @stability stable
 */
export interface PromotedPackage {
  readonly to: string;
  readonly names?: Readonly<Record<string, string>> | undefined;
}

/**
 * `@trpc12/experimental-*` packages promoted, by old package name. The last
 * `experimental-` release re-exports the new package, deprecated on npm, so
 * the codemod rewrites imports of it.
 * @since 0.1.0
 * @stability stable
 */
export const PROMOTED_PACKAGES: Readonly<Record<string, PromotedPackage>> = {};
