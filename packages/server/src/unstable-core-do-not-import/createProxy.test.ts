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
  // it to a primitive. The apply trap intercepts these calls and returns a
  // debug string instead of forwarding to the callback, while still allowing
  // further proxy chaining (e.g. proxy.toString.query()) for routes that
  // happen to share a name with a coercion method.
  const proxy: any = createRecursiveProxy((opts) => opts);

  // Root path coercion — calling valueOf/toString/toJSON directly returns
  // a debug string instead of triggering the callback
  expect(proxy.valueOf()).toBe('tRPC.proxy()');
  expect(proxy.toString()).toBe('tRPC.proxy()');
  expect(proxy.toJSON()).toBe('tRPC.proxy()');

  // Nested path coercion
  expect(proxy.foo.valueOf()).toBe('tRPC.proxy(foo)');
  expect(proxy.foo.bar.toString()).toBe('tRPC.proxy(foo.bar)');
  expect(proxy.foo.bar.baz.toJSON()).toBe('tRPC.proxy(foo.bar.baz)');

  // Coercion keys are still chainable — proxy.toString.query() should
  // continue through the proxy as a normal path, not short-circuit
  expect(proxy.toString.query()).toEqual({
    path: ['toString', 'query'],
    args: [],
  });

  // Normal proxy chaining is unaffected
  expect(proxy.foo.bar.query()).toEqual({
    path: ['foo', 'bar', 'query'],
    args: [],
  });
});
