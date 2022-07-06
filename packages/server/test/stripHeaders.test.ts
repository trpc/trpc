/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable no-native-reassign */
import { stripHeaders } from '../../client/src';

describe('stripHeaders works...', () => {
  test('...with an object parameter', async () => {
    expect(await stripHeaders({})).toStrictEqual({});
  });
  test('...with a function parameter', async () => {
    expect(await stripHeaders(() => ({}))).toStrictEqual({});
  });
  test('...with a clean input', async () => {
    expect(
      await stripHeaders({ 'x-foo': 'bar', 'x-baz': 'foobar' }),
    ).toStrictEqual({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
    expect(
      await stripHeaders(() => ({ 'x-foo': 'bar', 'x-baz': 'foobar' })),
    ).toStrictEqual({ 'x-foo': 'bar', 'x-baz': 'foobar' });
  });
  test('...with a dirty input', async () => {
    expect(
      await stripHeaders({
        connection: 'keep-alive',
        'x-foo': 'bar',
        'x-baz': 'foobar',
      }),
    ).toStrictEqual({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
    expect(
      await stripHeaders(() => ({
        connection: 'keep-alive',
        'x-foo': 'bar',
        'x-baz': 'foobar',
      })),
    ).toStrictEqual({ 'x-foo': 'bar', 'x-baz': 'foobar' });
  });
});
