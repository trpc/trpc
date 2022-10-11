import { getArrayQueryKey } from './getArrayQueryKey';

test('getArrayQueryKey', () => {
  expect(getArrayQueryKey('foo')).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
    ]
  `);
  expect(getArrayQueryKey(['foo'])).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
    ]
  `);
  expect(getArrayQueryKey(['foo', 'bar'])).toMatchInlineSnapshot(`
    Array [
      Array [
        "foo",
      ],
      "bar",
    ]
  `);
  expect(getArrayQueryKey([undefined, 'bar'])).toMatchInlineSnapshot(`
    Array [
      Array [],
      "bar",
    ]
  `);
  expect(getArrayQueryKey(['post.byId', '1'])).toMatchInlineSnapshot(`
    Array [
      Array [
        "post",
        "byId",
      ],
      "1",
    ]
  `);
});
