import { describe, expect } from 'vitest';
import { getQueryKeyInternal, readQueryKey } from '../src/internals/utils';

describe(getQueryKeyInternal, () => {
  it('creates a query key', () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ['a', 'b'],
        input: 'input value',
        type: 'query',
      }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "a",
          "b",
        ],
        Object {
          "input": "input value",
          "type": "query",
        },
      ]
    `);
  });

  it('creates a query key with prefix', () => {
    expect(
      getQueryKeyInternal({
        path: ['a', 'b'],
        input: 'input value',
        type: 'query',
        prefix: 'prefix',
      }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "prefix",
        ],
        Array [
          "a",
          "b",
        ],
        Object {
          "input": "input value",
          "type": "query",
        },
      ]
    `);
  });

  it('creates a router key', () => {
    expect(
      getQueryKeyInternal({ prefix: undefined, path: ['a', 'b'], type: 'any' }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "a",
          "b",
        ],
      ]
    `);
  });

  it('creates a router key with prefix', () => {
    expect(
      getQueryKeyInternal({
        path: ['a', 'b'],
        type: 'any',
        prefix: 'prefix',
      }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "prefix",
        ],
        Array [
          "a",
          "b",
        ],
      ]
    `);
  });

  it('creates a infinite query key', () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ['a', 'b'],
        input: 1,
        type: 'infinite',
      }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "a",
          "b",
        ],
        Object {
          "input": 1,
          "type": "infinite",
        },
      ]
    `);
  });

  it('creates a infinite query key with prefix', () => {
    expect(
      getQueryKeyInternal({
        path: ['a', 'b'],
        input: 1,
        type: 'infinite',
        prefix: 'prefix',
      }),
    ).toMatchInlineSnapshot(`
      Array [
        Array [
          "prefix",
        ],
        Array [
          "a",
          "b",
        ],
        Object {
          "input": 1,
          "type": "infinite",
        },
      ]
    `);
  });
});

describe(readQueryKey, () => {
  type QueryKeyData = ReturnType<typeof readQueryKey>;

  it('reads a simple query key', () => {
    expect(
      readQueryKey([['a', 'b'], { input: 'input value', type: 'query' }]),
    ).toEqual<QueryKeyData>({
      type: 'unprefixed',
      prefix: undefined,
      path: ['a', 'b'],
      args: { input: 'input value', type: 'query' },
    });
  });

  it('reads a simple prefixed query key', () => {
    expect(
      readQueryKey([
        ['prefix'],
        ['a', 'b'],
        { input: 'input value', type: 'query' },
      ]),
    ).toEqual<QueryKeyData>({
      type: 'prefixed',
      prefix: ['prefix'],
      path: ['a', 'b'],
      args: { input: 'input value', type: 'query' },
    });
  });
});
