/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

describe('without transformer', () => {
  test('return string', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpBatchStreamLink({ url: httpUrl })],
        };
      },
    });

    expect(await ctx.client.returnString.query()).toBe('hello');
  });

  test('return null', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpBatchStreamLink({ url: httpUrl })],
        };
      },
    });

    expect(await ctx.client.returnNull.query()).toBe(null);
  });

  test('return undefined', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpBatchStreamLink({ url: httpUrl })],
        };
      },
    });

    expect(await ctx.client.returnUndefined.query()).toBe(undefined);
  });
});

describe('with transformer', () => {
  test('return string', async () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [
            httpBatchStreamLink({
              url: httpUrl,
              transformer: superjson,
            }),
          ],
        };
      },
    });

    expect(await ctx.client.returnString.query()).toBe('hello');
  });

  test('return null', async () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [
            httpBatchStreamLink({
              url: httpUrl,
              transformer: superjson,
            }),
          ],
        };
      },
    });

    expect(await ctx.client.returnNull.query()).toBe(null);
  });

  test('return undefined', async () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      returnNull: t.procedure.query(() => null),
      returnUndefined: t.procedure.query(() => undefined),
      returnString: t.procedure.query(() => 'hello'),
    });

    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [
            httpBatchStreamLink({
              url: httpUrl,
              transformer: superjson,
            }),
          ],
        };
      },
    });

    expect(await ctx.client.returnUndefined.query()).toBe(undefined);
  });
});
