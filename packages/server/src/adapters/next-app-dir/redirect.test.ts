import { expect, test } from 'vitest';
import { redirect, TRPCRedirectError } from './redirect';

function argsOf(value: unknown) {
  if (!(value instanceof TRPCRedirectError)) {
    throw new Error('Expected a TRPCRedirectError');
  }
  return value.args;
}

test('redirectType is forwarded to Next.js as given', () => {
  expect(argsOf(redirect('/a'))).toStrictEqual(['/a', undefined]);
  expect(argsOf(redirect(new URL('https://example.com/b')))).toStrictEqual([
    'https://example.com/b',
    undefined,
  ]);
  // @ts-expect-error - JS callers can pass null
  expect(argsOf(redirect('/c', null))).toStrictEqual(['/c', null]);
});
