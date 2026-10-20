/**
 * `vp`'s arguments without pnpm's `--` separator. pnpm passes the `--` of
 * `pnpm test -- <file>` through, and Vitest drops everything after one, so
 * the filter would be lost and the whole suite would run.
 */
export const vpArgs = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  args.filter((arg) => arg !== '--');
