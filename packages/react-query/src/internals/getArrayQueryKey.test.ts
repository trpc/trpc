import { getArrayQueryKey } from './getArrayQueryKey';

test('getArrayQueryKey', () => {
  expect(getArrayQueryKey('foo', 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(getArrayQueryKey(['foo'], 'query')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(getArrayQueryKey('foo', 'infinite')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "infinite",
      },
    ]
  `);
  expect(getArrayQueryKey(['foo'], 'infinite')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      Object {
        "type": "infinite",
      },
    ]
  `);
  expect(getArrayQueryKey(['foo', 'bar'], 'query')).toMatchInlineSnapshot(`
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
  expect(getArrayQueryKey([undefined, 'bar'], 'query')).toMatchInlineSnapshot(`
    Array [
      Array [],
      Object {
        "input": "bar",
        "type": "query",
      },
    ]
  `);
  expect(getArrayQueryKey(['post.byId', '1'], 'query')).toMatchInlineSnapshot(`
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
