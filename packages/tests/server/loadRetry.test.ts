import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  experimental_dataOf as dataOf,
  experimental_load,
  experimental_perItem as perItem,
  experimental_pipelining,
  experimental_query as query,
  experimental_settle,
  experimental_inputOf,
  experimental_isPipelineFallback,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  retryLink,
} from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * A router whose `flaky` query fails as many times as its input says, for
 * each key, or only for `failKey` if it has one, before it answers
 */
function createRouter() {
  const t = initTRPC.create();
  const runs = new Map<string, number>();
  const flaky = t.procedure
    .input(
      z.object({
        key: z.string(),
        failTimes: z.number().optional(),
        failKey: z.string().optional(),
        value: z.string().optional(),
      }),
    )
    .query((opts) => {
      const run = (runs.get(opts.input.key) ?? 0) + 1;
      runs.set(opts.input.key, run);
      const fails =
        opts.input.failKey === undefined ||
        opts.input.failKey === opts.input.key;
      if (fails && run <= (opts.input.failTimes ?? 0)) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `${opts.input.key} failed on run ${run}`,
        });
      }
      return {
        key: opts.input.key,
        run,
        next: `${opts.input.key}+`,
        value: opts.input.value ?? null,
        items: ['x', 'y', 'z'],
      };
    });
  const appRouter = t.router({ a: flaky, b: flaky, c: flaky });
  return { appRouter, runs };
}

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)('$name', (scenario) => {
  function setup(opts: {
    /** How many attempts `retryLink` makes, `null` for no `retryLink` */
    attempts: number | null;
    retryDelayMs: number;
    /** Whether the first request fails before it reaches the server */
    failFirstFetch: boolean;
  }) {
    const { appRouter, runs } = createRouter();
    /** What each attempt of an operation is, as the links after `retryLink` see it */
    const ops: string[] = [];
    /** The input of each attempt, as the links after `retryLink` see it */
    const inputs: unknown[] = [];
    const record: TRPCLink<AnyRouter> = () => (linkOpts) => {
      ops.push(linkOpts.op.path);
      inputs.push(linkOpts.op.input);
      return linkOpts.next(linkOpts.op);
    };
    const retried = vi.fn();
    let fetches = 0;
    const ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: { allowWholeValues: true } },
      client: (clientOpts) => ({
        links: [
          ...(opts.attempts === null
            ? []
            : [
                retryLink({
                  retry: (retryOpts) => {
                    retried(retryOpts.op.path, retryOpts.attempts);
                    // As the docs say: a query that never ran because one it
                    // reads failed for good isn't retried
                    return (
                      !experimental_isPipelineFallback(retryOpts.error) &&
                      retryOpts.attempts < (opts.attempts ?? 0)
                    );
                  },
                  retryDelayMs: () => opts.retryDelayMs,
                }),
              ]),
          record,
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
            fetch: async (input, init) => {
              fetches++;
              if (opts.failFirstFetch && fetches === 1) {
                throw new TypeError('fetch failed');
              }
              return fetch(input, init);
            },
          }),
        ],
      }),
    });
    /** The paths of each request that reached the server */
    const requests = () =>
      ctx.onRequestSpy.mock.calls.map(
        ([req]) => new URL(req.url!, 'http://localhost').pathname,
      );
    return Object.assign(ctx, { runs, ops, inputs, retried, requests });
  }

  /** a → b → c, where b fails `failTimes` times */
  function chain(
    client: ReturnType<typeof setup>['client'],
    failTimes: { a?: number; b?: number; c?: number },
  ) {
    const a = query(client.a, { key: 'a', failTimes: failTimes.a });
    const b = query(client.b, {
      key: dataOf(a).next,
      failTimes: failTimes.b,
    });
    const c = query(client.c, {
      key: dataOf(b).next,
      failTimes: failTimes.c,
    });
    return { a, b, c };
  }

  test('the links see an operation for every query, and the queries go in one request', async () => {
    await using ctx = setup({
      attempts: 3,
      retryDelayMs: 0,
      failFirstFetch: false,
    });

    const res = await experimental_settle(
      experimental_load(ctx.client, chain(ctx.client, {})),
    );

    expect(res.c).toMatchObject({ key: 'a++', run: 1 });
    expect(ctx.ops).toEqual(['a', 'b', 'c']);
    expect(ctx.requests()).toEqual(['/a,b,c']);
  });

  test('a query that fails is retried with the queries that read it, and nothing before it', async () => {
    await using ctx = setup({
      attempts: 3,
      retryDelayMs: 0,
      failFirstFetch: false,
    });

    const res = await experimental_settle(
      experimental_load(ctx.client, chain(ctx.client, { b: 1 })),
    );

    expect(res).toMatchObject({
      a: { key: 'a', run: 1 },
      b: { key: 'a+', run: 2 },
      c: { key: 'a++', run: 1 },
    });
    expect(ctx.retried.mock.calls).toEqual([['b', 1]]);
    // The retry is one request: b goes by itself, and c in its request
    expect(ctx.requests()).toEqual(['/a,b,c', '/b,c']);
    expect(ctx.runs).toEqual(
      new Map([
        ['a', 1],
        ['a+', 2],
        ['a++', 1],
      ]),
    );
  });

  test('a retry of a query the server filled in goes with that input, as an operation like any other', async () => {
    await using ctx = setup({
      attempts: 3,
      retryDelayMs: 0,
      failFirstFetch: false,
    });

    await experimental_settle(
      experimental_load(ctx.client, chain(ctx.client, { b: 1 })),
    );

    expect(ctx.ops).toEqual(['a', 'b', 'c', 'b']);
    // The first attempt went with a blank the server filled in; the retry
    // has the input that attempt ran with
    expect(ctx.inputs).toEqual([
      { key: 'a' },
      { key: undefined, failTimes: 1 },
      { key: undefined },
      { key: 'a+', failTimes: 1 },
    ]);
    expect(ctx.requests()).toEqual(['/a,b,c', '/b,c']);
  });

  test('with a delay between attempts, the queries that read a retried query wait for it, and go in its request', async () => {
    await using ctx = setup({
      attempts: 3,
      retryDelayMs: 20,
      failFirstFetch: false,
    });

    const res = await experimental_settle(
      experimental_load(ctx.client, chain(ctx.client, { b: 2 })),
    );

    expect(res.b).toMatchObject({ run: 3 });
    expect(res.c).toMatchObject({ run: 1 });
    expect(ctx.requests()).toEqual(['/a,b,c', '/b,c', '/b,c']);
  });

  test('a request that fails as a whole is retried as one request', async () => {
    await using ctx = setup({
      attempts: 3,
      retryDelayMs: 0,
      failFirstFetch: true,
    });

    const res = await experimental_settle(
      experimental_load(ctx.client, chain(ctx.client, {})),
    );

    expect(res.c).toMatchObject({ key: 'a++', run: 1 });
    expect(ctx.requests()).toEqual(['/a,b,c']);
    // Only a is sent again: b and c didn't fail for themselves, and go in
    // a's next request
    expect(ctx.ops).toEqual(['a', 'b', 'c', 'a']);
    expect(ctx.retried.mock.calls).toEqual([['a', 1]]);
  });

  test('once the retries give up, the query and those that read it reject with its error', async () => {
    await using ctx = setup({
      attempts: 2,
      retryDelayMs: 0,
      failFirstFetch: false,
    });

    const res = experimental_load(ctx.client, chain(ctx.client, { b: 5 }));

    expect(await res.a).toMatchObject({ run: 1 });
    await expect(res.b).rejects.toMatchObject({
      message: 'a+ failed on run 2',
    });
    await expect(res.c).rejects.toMatchObject({
      message: 'a+ failed on run 2',
    });
    // c never ran: the server sent its error in its place
    expect(ctx.runs.has('a++')).toBe(false);
    // c's error says it never ran, so `retry` skips it, and it isn't sent
    // again, nor does it wait for a delay
    expect(ctx.retried.mock.calls).toEqual([
      ['b', 1],
      ['b', 2],
      ['c', 1],
    ]);
    expect(ctx.ops).toEqual(['a', 'b', 'c', 'b']);
  });

  test('without a link that retries, a failure is final, and nothing is sent again', async () => {
    await using ctx = setup({
      attempts: null,
      retryDelayMs: 0,
      failFirstFetch: false,
    });

    const res = experimental_load(ctx.client, chain(ctx.client, { b: 1 }));

    await expect(res.b).rejects.toMatchObject({
      message: 'a+ failed on run 1',
    });
    await expect(res.c).rejects.toMatchObject({
      message: 'a+ failed on run 1',
    });
    expect(ctx.requests()).toEqual(['/a,b,c']);
  });

  describe('for every item', () => {
    /** a list, then b and c for each of its items, where b fails for `y` */
    function perItemChain(
      client: ReturnType<typeof setup>['client'],
      failTimes: number,
    ) {
      const list = query(client.a, { key: 'list' });
      return {
        list,
        rows: perItem(dataOf(list).items, (item) => {
          const b = query(client.b, {
            key: item,
            failTimes: failTimes,
            failKey: 'y',
            value: item,
          });
          return {
            b,
            c: query(client.c, { key: dataOf(b).next }),
          };
        }),
      };
    }

    test("an item's query that fails is retried by itself, with the item's queries that read it", async () => {
      await using ctx = setup({
        attempts: 3,
        retryDelayMs: 0,
        failFirstFetch: false,
      });
      const list = query(ctx.client.a, { key: 'list' });

      const res = await experimental_settle(
        experimental_load(ctx.client, {
          list,
          rows: perItem(dataOf(list).items, (item) => {
            const b = query(ctx.client.b, {
              key: item,
              // Each item's `b` fails once: its key is the item
              failTimes: 1,
            });
            return { b, c: query(ctx.client.c, { key: dataOf(b).next }) };
          }),
        }),
      );

      expect(res.rows.map((row) => [row.b.run, row.c.key])).toEqual([
        [2, 'x+'],
        [2, 'y+'],
        [2, 'z+'],
      ]);
      // The first failure of each item counts as its first attempt
      expect(ctx.retried.mock.calls).toEqual([
        ['b', 1],
        ['b', 1],
        ['b', 1],
      ]);
      // The items' retries, and the queries that read them, in one request
      expect(ctx.requests()).toEqual(['/a,b,c', '/b,b,b,c,c,c']);
    });

    test("an item's retry that gives up rejects that item only, and the item's queries that read it", async () => {
      await using ctx = setup({
        attempts: 1,
        retryDelayMs: 0,
        failFirstFetch: false,
      });

      const res = experimental_load(ctx.client, perItemChain(ctx.client, 5));
      const rows = await res.rows;

      expect(rows).toHaveLength(3);
      await expect(rows[1]!.b).rejects.toMatchObject({
        message: 'y failed on run 1',
      });
      await expect(rows[1]!.c).rejects.toMatchObject({
        message: 'y failed on run 1',
      });
      // The other items have their data
      for (const row of [rows[0]!, rows[2]!]) {
        expect(await row.b).toMatchObject({ run: 1 });
        expect(await row.c).toMatchObject({ run: 1 });
      }
      // `retry` said no: nothing is sent again
      expect(ctx.requests()).toEqual(['/a,b,c']);
    });

    test('without a link that retries, an item fails by itself, and nothing is sent again', async () => {
      await using ctx = setup({
        attempts: null,
        retryDelayMs: 0,
        failFirstFetch: false,
      });

      const res = experimental_load(ctx.client, perItemChain(ctx.client, 1));
      const rows = await res.rows;

      await expect(rows[1]!.b).rejects.toMatchObject({
        message: 'y failed on run 1',
      });
      expect(await rows[0]!.b).toMatchObject({ run: 1 });
      expect(ctx.requests()).toEqual(['/a,b,c']);
    });
  });
});

describe('a link that does not pipeline', () => {
  test('gets the input of a query that reads another once that has data, and sends each by itself', async () => {
    const { appRouter } = createRouter();
    await using ctx = testServerAndClientResource(appRouter, {
      client: (clientOpts) => ({
        links: [httpLink({ url: clientOpts.httpUrl })],
      }),
    });
    const a = query(ctx.client.a, { key: 'a' });

    const res = await experimental_settle(
      experimental_load(ctx.client, {
        a,
        b: query(ctx.client.b, { key: dataOf(a).next }),
      }),
    );

    expect(res.b).toMatchObject({ key: 'a+' });
    expect(
      ctx.onRequestSpy.mock.calls.map(
        ([req]) => new URL(req.url!, 'http://localhost').pathname,
      ),
    ).toEqual(['/a', '/b']);
  });

  test('`experimental_inputOf()` is the input with what it reads filled in', async () => {
    const { appRouter } = createRouter();
    const inputs: unknown[] = [];
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          () => (linkOpts) => {
            void experimental_inputOf(linkOpts.op).then((input) =>
              inputs.push(input),
            );
            return linkOpts.next(linkOpts.op);
          },
          httpBatchStreamLink({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const a = query(ctx.client.a, { key: 'a' });

    await experimental_settle(
      experimental_load(ctx.client, {
        a,
        b: query(ctx.client.b, { key: dataOf(a).next }),
      }),
    );

    expect(inputs).toEqual([{ key: 'a' }, { key: 'a+' }]);
  });
});
