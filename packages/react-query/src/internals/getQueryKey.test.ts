import { getQueryKey } from './getQueryKey';

test('getArrayQueryKey', () => {
  // empty path should not nest an extra array
  expect(getQueryKey([], undefined, 'any')).toMatchInlineSnapshot(`Array []`);

  // should not nest an empty object
  expect(getQueryKey(['foo'], undefined, 'any')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
    ]
  `);
  expect(getQueryKey(['foo'], undefined, 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(getQueryKey(['foo'], undefined, 'infinite')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "infinite",
      },
    ]
  `);

  // some proc may have dot separated parts
  expect(getQueryKey(['foo', 'bar.baz'], 'bar', 'query'))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
        "bar",
        "baz",
      ],
      Object {
        "input": "bar",
        "type": "query",
      },
    ]
  `);

  expect(getQueryKey(['foo'], 'bar', 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "input": "bar",
        "type": "query",
      },
    ]
  `);
  expect(getQueryKey([], 'bar', 'query')).toMatchInlineSnapshot(`
    Array [
      Array [],
      Object {
        "input": "bar",
        "type": "query",
      },
    ]
  `);
  expect(getQueryKey(['post', 'byId'], '1', 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "post",
        "byId",
      ],
      Object {
        "input": "1",
        "type": "query",
      },
    ]
  `);
});
