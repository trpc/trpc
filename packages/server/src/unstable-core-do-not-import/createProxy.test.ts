import { createRecursiveProxy } from './createProxy';

test('createRecursiveProxy()', () => {
  const basic: any = createRecursiveProxy((opts) => {
    return opts;
  });

  expect(basic.foo.bar.query()).toEqual({
    path: ['foo', 'bar', 'query'],
    args: [],
  });
  expect(basic.foo.bar.query({ id: 1 })).toEqual({
    path: ['foo', 'bar', 'query'],
    args: [{ id: 1 }],
  });

  expect(basic.foo.bar.mutate()).toEqual({
    path: ['foo', 'bar', 'mutate'],
    args: [],
  });
});
