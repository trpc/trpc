import { expect, test } from 'vitest';
import { tscErrors } from '../scripts/tscErrors';

const run = (status: number | null, stdout: string, error?: Error) => ({
  error,
  status,
  stdout,
  stderr: '',
});

test('returns the error lines of a failed run', () => {
  expect(
    tscErrors('ex', run(2, 'a.ts(1,1): error TS2322: Nope.\nFound 1 error.\n')),
  ).toEqual(['a.ts(1,1): error TS2322: Nope.']);
});

test('a clean run has no errors', () => {
  expect(tscErrors('ex', run(0, ''))).toEqual([]);
});

// Regression: a tsc that failed to start counted as zero type errors
test('throws when tsc fails without diagnostics', () => {
  expect(() =>
    tscErrors('ex', run(1, 'ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL tsc not found')),
  ).toThrow(/tsc failed in ex/);
});

test('throws when tsc cannot be spawned', () => {
  expect(() => tscErrors('ex', run(null, '', new Error('ENOENT')))).toThrow(
    'ENOENT',
  );
});
