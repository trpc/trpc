/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable no-native-reassign */
import { stripHeaders } from '../../client/src';

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
