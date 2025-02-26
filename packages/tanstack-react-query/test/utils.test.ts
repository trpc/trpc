import { describe, expect } from 'vitest';
import { getQueryKeyInternal } from '../src/internals/utils';

describe(getQueryKeyInternal, () => {
  it('creates a query key', () => {
    expect(getQueryKeyInternal(['a', 'b'], 'input value', 'query'))
      .toMatchInlineSnapshot(`
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

  it('creates a infinite query key', () => {
    expect(getQueryKeyInternal(['a', 'b'], 1, 'infinite'))
      .toMatchInlineSnapshot(`
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
});
