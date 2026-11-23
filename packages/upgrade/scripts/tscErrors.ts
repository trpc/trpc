import type { SpawnSyncReturns } from 'node:child_process';

/** The `error TS…` lines of a `tsc` run; throws when `tsc` didn't run. */
export function tscErrors(
  dir: string,
  result: Pick<
    SpawnSyncReturns<string>,
    'error' | 'status' | 'stdout' | 'stderr'
  >,
): string[] {
  if (result.error) {
    throw result.error;
  }
  const output = `${result.stdout}${result.stderr}`;
  const errors = output.split('\n').filter((line) => /error TS\d+/.test(line));
  // tsc fails with diagnostics; failing without any means it didn't run
  if (result.status !== 0 && errors.length === 0) {
    throw new Error(`tsc failed in ${dir}:\n${output}`);
  }
  return errors;
}
