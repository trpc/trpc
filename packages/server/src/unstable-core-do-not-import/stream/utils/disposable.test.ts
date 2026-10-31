import { makeAsyncResource, makeResource } from './disposable';

test('makeAsyncResource preserves `this` when chaining to a pre-existing Symbol.asyncDispose', async () => {
  // Simulates a value that already implements AsyncDisposable via a method
  // that relies on `this` (as native AsyncGenerator/AsyncIterator objects do
  // under the Explicit Resource Management proposal, supported natively by
  // Bun and Node 24+).
  let disposedWith: unknown;
  const thing = {
    // eslint-disable-next-line no-restricted-syntax
    [Symbol.asyncDispose]: async function () {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      disposedWith = this;
    },
  };

  const calls: string[] = [];
  const wrapped = makeAsyncResource(thing, async () => {
    calls.push('outer');
  });

  // eslint-disable-next-line no-restricted-syntax
  await wrapped[Symbol.asyncDispose]();

  expect(calls).toEqual(['outer']);
  expect(disposedWith).toBe(thing);
});

test('makeResource preserves `this` when chaining to a pre-existing Symbol.dispose', () => {
  let disposedWith: unknown;
  const thing = {
    // eslint-disable-next-line no-restricted-syntax
    [Symbol.dispose]: function () {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      disposedWith = this;
    },
  };

  const calls: string[] = [];
  const wrapped = makeResource(thing, () => {
    calls.push('outer');
  });

  // eslint-disable-next-line no-restricted-syntax
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

  // eslint-disable-next-line no-restricted-syntax
  await expect(wrapped[Symbol.asyncDispose]()).resolves.toBeUndefined();
  expect(finallyRan.value).toBe(true);
});
