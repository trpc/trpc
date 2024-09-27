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

test('createRecursiveProxy() - prevent mutation of args', () => {
  const mutateArgs: any = createRecursiveProxy((opts) => {
    // @ts-expect-error - mutate args
    opts.args.push('mutated');
    return opts;
  });

  expect(() => mutateArgs.foo.bar.query()).toThrowErrorMatchingInlineSnapshot(
    `[TypeError: Cannot add property 0, object is not extensible]`,
  );

  const mutatePath: any = createRecursiveProxy((opts) => {
    // @ts-expect-error - mutate args
    opts.path.push('mutated');
    return opts;
  });

  expect(() => mutatePath.foo.bar.query()).toThrowErrorMatchingInlineSnapshot(
    `[TypeError: Cannot add property 3, object is not extensible]`,
  );
});
