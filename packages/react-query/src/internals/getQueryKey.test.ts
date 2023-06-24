import { getQueryKeyInternal } from './getQueryKey';

test('getArrayQueryKey', () => {
  // empty path should not nest an extra array
  expect(getQueryKeyInternal([], undefined, 'any')).toMatchInlineSnapshot(
    `Array []`,
  );

  // should not nest an empty object
  expect(getQueryKeyInternal(['foo'], undefined, 'any')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
    ]
  `);
  expect(getQueryKeyInternal(['foo'], undefined, 'query'))
    .toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(getQueryKeyInternal(['foo'], undefined, 'infinite'))
    .toMatchInlineSnapshot(`
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
  expect(getQueryKeyInternal(['foo', 'bar.baz'], 'bar', 'query'))
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

  expect(getQueryKeyInternal(['foo'], 'bar', 'query')).toMatchInlineSnapshot(`
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
  expect(getQueryKeyInternal([], 'bar', 'query')).toMatchInlineSnapshot(`
    Array [
      Array [],
      Object {
        "input": "bar",
        "type": "query",
      },
    ]
  `);
  expect(getQueryKeyInternal(['post', 'byId'], '1', 'query'))
    .toMatchInlineSnapshot(`
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
