import { describe, expect } from 'vitest';
import { getQueryKeyInternal } from '../src/internals/utils';

describe(getQueryKeyInternal, () => {
  it('creates a query key', () => {
    expect(
      getQueryKeyInternal(['a', 'b'], {
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
      getQueryKeyInternal(['a', 'b'], {
        input: 'input value',
        type: 'query',
        prefix: ['prefix'],
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
    expect(getQueryKeyInternal(['a', 'b'])).toMatchInlineSnapshot(`
      Array [
        Array [
          "a",
          "b",
        ],
      ]
    `);
  });

  it('creates a router key with prefix', () => {
    expect(getQueryKeyInternal(['a', 'b'], { prefix: ['prefix'] }))
      .toMatchInlineSnapshot(`
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
      getQueryKeyInternal(['a', 'b'], {
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
      getQueryKeyInternal(['a', 'b'], {
        input: 1,
        type: 'infinite',
        prefix: ['prefix'],
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
