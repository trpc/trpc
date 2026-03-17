import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  hello: t.procedure
    .input(z.string().optional())
    .query((opts) => `Hello ${opts.input ?? 'world'}` as const),
});

describe.each(['httpBatchLink', 'httpBatchStreamLink'] as const)(
  'server support for %s',
  (clientLink) => {
    test('batching enabled', async () => {
      await using ctx = testServerAndClientResource(router, {
        server: {},
        clientLink,
      });

      const results = await Promise.all([
        ctx.client.hello.query('1'),
        ctx.client.hello.query('2'),
      ]);

      expect(results).toEqual(['Hello 1', 'Hello 2']);

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    });

    test('batching disabled', async () => {
      await using ctx = testServerAndClientResource(router, {
        server: {
          allowBatching: false,
        },
        clientLink,
      });

      const err = await waitError(
        Promise.all([ctx.client.hello.query('1'), ctx.client.hello.query('2')]),
        TRPCClientError<typeof router>,
      );

      expect(err).toBeInstanceOf(TRPCClientError);
      expect(err.data?.code).toBe('BAD_REQUEST');
      expect(err.data?.httpStatus).toBe(400);
      expect(err.message).toBe('Batching is not enabled on the server');

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    });

    test('error on 2nd call returns correct error path', async () => {
      const failingRouter = t.router({
        ok: t.procedure
          .input(z.string())
          .query((opts) => `Hello ${opts.input}`),
        failing: t.procedure.input(z.string()).query(() => {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This procedure fails',
          });
        }),
      });

      await using ctx = testServerAndClientResource(failingRouter, {
        server: {},
        clientLink,
      });

      const results = await Promise.allSettled([
        ctx.client.ok.query('first'),
        ctx.client.failing.query('second'),
      ]);

      // First call should succeed
      expect(results[0]).toMatchObject({
        status: 'fulfilled',
        value: 'Hello first',
      });

      // Second call should fail with the correct procedure path
      expect(results[1].status).toBe('rejected');
      const error = (results[1] as PromiseRejectedResult)
        .reason as TRPCClientError<typeof failingRouter>;
      expect(error).toBeInstanceOf(TRPCClientError);
      expect(error.data?.path).toBe('failing');
    });

    describe('batchIndex', () => {
      test('batchIndex is passed correctly in batched requests', async () => {
        const callIndices: (number | undefined)[] = [];

        const tWithCallIndex = initTRPC.create();
        const routerWithCallIndex = tWithCallIndex.router({
          getCallIndex: tWithCallIndex.procedure
            .input(z.string())
            .query((opts) => {
              callIndices.push(opts.batchIndex);
              return { input: opts.input, batchIndex: opts.batchIndex };
            }),
        });

        await using ctx = testServerAndClientResource(routerWithCallIndex, {
          server: {},
          clientLink,
        });

        const results = await Promise.all([
          ctx.client.getCallIndex.query('first'),
          ctx.client.getCallIndex.query('second'),
          ctx.client.getCallIndex.query('third'),
        ]);

        expect(results).toEqual([
          { input: 'first', batchIndex: 0 },
          { input: 'second', batchIndex: 1 },
          { input: 'third', batchIndex: 2 },
        ]);

        expect(callIndices).toEqual([0, 1, 2]);

        expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      });

      test('batchIndex is provided for single-call batch requests', async () => {
        const callIndices: (number | undefined)[] = [];

        const tWithCallIndex = initTRPC.create();
        const routerWithCallIndex = tWithCallIndex.router({
          getCallIndex: tWithCallIndex.procedure
            .input(z.string())
            .query((opts) => {
              callIndices.push(opts.batchIndex);
              return { input: opts.input, batchIndex: opts.batchIndex };
            }),
        });

        await using ctx = testServerAndClientResource(routerWithCallIndex, {
          server: {},
          clientLink,
        });

        const result = await Promise.all([
          ctx.client.getCallIndex.query('single'),
        ]);

        expect(result).toEqual([{ input: 'single', batchIndex: 0 }]);
        expect(callIndices).toEqual([0]);
      });

      test('batchIndex is available in middleware', async () => {
        const middlewareCallIndices: (number | undefined)[] = [];

        const tWithMiddleware = initTRPC.create();

        const procedureWithMiddleware = tWithMiddleware.procedure.use(
          (opts) => {
            middlewareCallIndices.push(opts.batchIndex);
            return opts.next();
          },
        );

        const routerWithMiddleware = tWithMiddleware.router({
          testProc: procedureWithMiddleware
            .input(z.string())
            .query((opts) => opts.input),
        });

        await using ctx = testServerAndClientResource(routerWithMiddleware, {
          server: {},
          clientLink,
        });

        await Promise.all([
          ctx.client.testProc.query('a'),
          ctx.client.testProc.query('b'),
        ]);

        expect(middlewareCallIndices).toEqual([0, 1]);
      });
    });
  },
);

describe('batchIndex', () => {
  test('batchIndex is provided for non-batched requests', async () => {
    const callIndices: (number | undefined)[] = [];

    const tWithCallIndex = initTRPC.create();
    const routerWithCallIndex = tWithCallIndex.router({
      getCallIndex: tWithCallIndex.procedure.input(z.string()).query((opts) => {
        callIndices.push(opts.batchIndex);
        return { input: opts.input, batchIndex: opts.batchIndex };
      }),
    });

    await using ctx = testServerAndClientResource(routerWithCallIndex, {
      server: {},
      clientLink: 'httpLink',
    });

    const result = await ctx.client.getCallIndex.query('single');

    expect(result).toEqual({ input: 'single', batchIndex: 0 });
  });
});
