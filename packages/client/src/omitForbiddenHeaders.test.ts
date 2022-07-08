/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable no-native-reassign */
import { omitForbiddenHeaders } from './omitForbiddenHeaders';

describe('omitForbiddenHeaders', () => {
  test('works', () => {
    expect(omitForbiddenHeaders({})).toStrictEqual({});
  });
  test('processes clean input correctly', () => {
    expect(
      omitForbiddenHeaders({ 'x-foo': 'bar', 'x-baz': 'foobar' }),
    ).toStrictEqual({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
  });
  test('processes dirty input correctly', () => {
    expect(
      omitForbiddenHeaders({
        connection: 'keep-alive',
        'x-foo': 'bar',
        'x-baz': 'foobar',
      }),
    ).toStrictEqual({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
  });
});

test('omits proxy- headers', () => {
  expect(
    omitForbiddenHeaders({
      'proxy-xxxx': 'keep-alive',
      'x-foo': 'bar',
    }),
  ).toStrictEqual({
    'x-foo': 'bar',
  });
});

test('omits sec- headers', () => {
  expect(
    omitForbiddenHeaders({
      'sec-xxxx': 'keep-alive',
      'x-foo': 'bar',
    }),
  ).toStrictEqual({
    'x-foo': 'bar',
  });
});
