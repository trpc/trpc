import { makeAsyncResource, makeResource } from './disposable';

test('makeAsyncResource preserves `this` when chaining to a pre-existing Symbol.asyncDispose', async () => {
  // Simulates a value that already implements AsyncDisposable via a method
  // that relies on `this` (as native AsyncGenerator/AsyncIterator objects do
  // under the Explicit Resource Management proposal, supported natively by
  // Bun and Node 24+).
  let disposedWith: unknown;
  const thing = {
    // oxlint-disable-next-line trpc/no-symbol-dispose
    [Symbol.asyncDispose]: async function () {
      // oxlint-disable-next-line typescript/no-this-alias
      disposedWith = this;
    },
  };

  const calls: string[] = [];
  const wrapped = makeAsyncResource(thing, async () => {
    calls.push('outer');
  });

  // oxlint-disable-next-line trpc/no-symbol-dispose
  await wrapped[Symbol.asyncDispose]();

  expect(calls).toEqual(['outer']);
  expect(disposedWith).toBe(thing);
});

test('makeResource preserves `this` when chaining to a pre-existing Symbol.dispose', () => {
  let disposedWith: unknown;
  const thing = {
    // oxlint-disable-next-line trpc/no-symbol-dispose
    [Symbol.dispose]: function () {
      // oxlint-disable-next-line typescript/no-this-alias
      disposedWith = this;
    },
  };

  const calls: string[] = [];
  const wrapped = makeResource(thing, () => {
    calls.push('outer');
  });

  // oxlint-disable-next-line trpc/no-symbol-dispose
  wrapped[Symbol.dispose]();

  expect(calls).toEqual(['outer']);
  expect(disposedWith).toBe(thing);
});

test('makeAsyncResource disposal does not throw for an async generator with a native Symbol.asyncDispose', async () => {
  const finallyRan = { value: false };

  async function* gen() {
    try {
      yield 1;
    } finally {
      finallyRan.value = true;
    }
  }

  const generator = gen();
  await generator.next();

  const wrapped = makeAsyncResource(generator, async () => {
    // outer cleanup, e.g. aborting an AbortController
  });

  // oxlint-disable-next-line trpc/no-symbol-dispose
  await expect(wrapped[Symbol.asyncDispose]()).resolves.toBeUndefined();
  expect(finallyRan.value).toBe(true);
});
