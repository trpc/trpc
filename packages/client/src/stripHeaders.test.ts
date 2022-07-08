/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable no-native-reassign */
import { stripHeaders } from './stripHeaders';

describe('stripHeaders', () => {
  test('works', () => {
    expect(stripHeaders({})).toStrictEqual({});
  });
  test('processes clean input correctly', () => {
    expect(stripHeaders({ 'x-foo': 'bar', 'x-baz': 'foobar' })).toStrictEqual({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
  });
  test('processes dirty input correctly', () => {
    expect(
      stripHeaders({
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
    stripHeaders({
      'proxy-xxxx': 'keep-alive',
      'x-foo': 'bar',
    }),
  ).toStrictEqual({
    'x-foo': 'bar',
  });
});

test('omits sec- headers', () => {
  expect(
    stripHeaders({
      'sec-xxxx': 'keep-alive',
      'x-foo': 'bar',
    }),
  ).toStrictEqual({
    'x-foo': 'bar',
  });
});
