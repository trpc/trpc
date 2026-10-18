import { expect, test } from 'vite-plus/test';
import { strictestCacheControl } from './cache-control.ts';

test('a batch is cacheable only when every call allows it', () => {
  expect(strictestCacheControl([])).toBeUndefined();
  expect(strictestCacheControl(['max-age=60', undefined])).toBeUndefined();
  expect(strictestCacheControl(['max-age=60', null])).toBeUndefined();
  expect(strictestCacheControl(['max-age=60', ' '])).toBeUndefined();
  expect(strictestCacheControl(['max-age=60', 'no-store'])).toBe('no-store');
  expect(strictestCacheControl(['no-cache', 'max-age=60'])).toBe('no-cache');
  expect(strictestCacheControl(['NO-STORE', 'no-cache'])).toBe('no-store');
});

test('the policy is the strictest common one', () => {
  expect(strictestCacheControl(['max-age=60'])).toBe('max-age=60');
  expect(
    strictestCacheControl(['public, max-age=60', 'public, max-age=10']),
  ).toBe('public, max-age=10');
  expect(strictestCacheControl(['public, max-age=60', 'max-age=10'])).toBe(
    'max-age=10',
  );
  expect(
    strictestCacheControl(['public, max-age=60', 'private, max-age=600']),
  ).toBe('private, max-age=60');
  expect(
    strictestCacheControl(['max-age=60', 'public, max-age=10, s-maxage=300']),
  ).toBe('max-age=10, s-maxage=60');
  expect(
    strictestCacheControl(['private, max-age=60', 'max-age=10, s-maxage=300']),
  ).toBe('private, max-age=10');
  expect(
    strictestCacheControl([
      'max-age=60, stale-while-revalidate=30, immutable',
      'max-age=60, stale-while-revalidate="5", must-revalidate, immutable',
    ]),
  ).toBe('max-age=60, stale-while-revalidate=5, must-revalidate, immutable');
  expect(
    strictestCacheControl([
      'max-age=60, stale-if-error=30, immutable',
      'max-age=60, no-transform, x-custom',
    ]),
  ).toBe('max-age=60, no-transform');
});

test('a call that bounds nothing leaves the others in charge; a bad lifetime is 0, unknown directives drop', () => {
  expect(strictestCacheControl(['public', 'public, max-age=30'])).toBe(
    'public, max-age=30',
  );
  expect(strictestCacheControl(['max-age=soon', 'max-age=30'])).toBe(
    'max-age=0',
  );
  expect(strictestCacheControl(['max-age', 'max-age=30'])).toBe('max-age=0');
  expect(strictestCacheControl(['x-custom', 'x-other=1'])).toBeUndefined();
});
