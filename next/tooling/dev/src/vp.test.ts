import { expect, test } from 'vite-plus/test';

import { vpArgs } from './vp.ts';

test('drops the -- that pnpm passes through', () => {
  expect(
    vpArgs(['test', 'run', '--', '--watch', 'false', 'src/a.test.ts']),
  ).toEqual(['test', 'run', '--watch', 'false', 'src/a.test.ts']);
});

test('keeps the arguments without one', () => {
  expect(vpArgs(['test', 'run', 'src/a.test.ts'])).toEqual([
    'test',
    'run',
    'src/a.test.ts',
  ]);
});
