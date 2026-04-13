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

test('createRecursiveProxy() - handles React 19 proxy coercion keys', () => {
  // React 19 can call valueOf / toString / toJSON on a proxy when coercing
  // it to a primitive. These calls must return a plain function (not another
  // proxy) so downstream code can obtain a string representation without
  // crashing or infinite-recursing.
  const proxy: any = createRecursiveProxy((opts) => opts);

  expect(typeof proxy.foo.bar.valueOf).toBe('function');
  expect(typeof proxy.foo.bar.toString).toBe('function');
  expect(typeof proxy.foo.bar.toJSON).toBe('function');

  // The returned function must yield a debug string, not another proxy
  expect(proxy.foo.valueOf()).toBe('tRPC.proxy(foo)');
  expect(proxy.foo.bar.toString()).toBe('tRPC.proxy(foo.bar)');
  expect(proxy.foo.bar.baz.toJSON()).toBe('tRPC.proxy(foo.bar.baz)');

  // Normal proxy chaining still works after these keys
  expect(proxy.foo.bar.query()).toEqual({
    path: ['foo', 'bar', 'query'],
    args: [],
  });
});
