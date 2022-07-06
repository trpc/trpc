/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable no-native-reassign */
import { stripHeaders } from '../../client/src';

describe('stripHeaders works...', () => {
  test('...with an object parameter', () => {
    expect(stripHeaders({})).toBe({});
  });
  test('...with a function parameter', async () => {
    expect(await stripHeaders(() => ({}))).toBe({});
  });
  test('...with a clean input', async () => {
    expect(stripHeaders({ 'x-foo': 'bar', 'x-baz': 'foobar' })).toBe({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
    expect(
      await stripHeaders(() => ({ 'x-foo': 'bar', 'x-baz': 'foobar' })),
    ).toBe({ 'x-foo': 'bar', 'x-baz': 'foobar' });
  });
  test('...with a dirty input', async () => {
    expect(
      stripHeaders({
        connection: 'keep-alive',
        'x-foo': 'bar',
        'x-baz': 'foobar',
      }),
    ).toBe({
      'x-foo': 'bar',
      'x-baz': 'foobar',
    });
    expect(
      await stripHeaders(() => ({
        connection: 'keep-alive',
        'x-foo': 'bar',
        'x-baz': 'foobar',
      })),
    ).toBe({ 'x-foo': 'bar', 'x-baz': 'foobar' });
  });
});
