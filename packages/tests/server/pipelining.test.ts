import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { Operation, TRPCLink } from '@trpc/client';
import {
  experimental_pipelining,
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import {
  createOperationPipeline,
  pipeCall,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import {
  isObject,
  pipelineReadsLimit,
} from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';

const createRouter = (transformer: 'none' | 'superjson') => {
  const t =
    transformer === 'superjson'
      ? initTRPC.create({ transformer: superjson })
      : initTRPC.create();
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.procedure.input(z.object({ slug: z.string() })).query((opts) => {
      if (opts.input.slug === 'missing') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return {
        slug: opts.input.slug,
        authorId: 'u1',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        tags: [{ id: 't1' }, { id: 't2' }],
        secret: Object.assign(Object.create({ inherited: 'no' }), {}),
      };
    }),
    author: t.procedure
      .input(z.object({ id: z.string(), since: z.unknown().optional() }))
      .query((opts) => {
        calls('author', opts.input);
        return { id: opts.input.id, teamId: `team-of-${opts.input.id}` };
      }),
    team: t.procedure.input(z.string()).query((opts) => {
      calls('team', opts.input);
      return { id: opts.input };
    }),
    tags: t.procedure
      .input(z.object({ ids: z.array(z.string()) }))
      .query((opts) => opts.input.ids),
    tag: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      calls('tag', opts.input);
      if (opts.input.id === 't2') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return { id: opts.input.id, at: new Date('2026-02-02T00:00:00Z') };
    }),
    ticks: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async function* () {
        yield 1;
      }),
    // Data that only a streaming response can carry, beside a plain value
    feed: t.procedure.query(() => ({
      authorId: 'u1',
      items: (async function* () {
        yield 1;
      })(),
    })),
    // Data that JSON has no word for
    nothing: t.procedure.query(() => undefined),
    // Two lists in one call's data
    lists: t.procedure.query(() => ({
      long: [{ id: 't1' }, { id: 't1' }, { id: 't1' }, { id: 't1' }],
      short: [{ id: 't1' }, { id: 't1' }],
    })),
    rename: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((opts) => opts.input.id),
    // Its middleware changes the input it is given, in place
    stamp: t.procedure
      .use(async (opts) => {
        const raw = await opts.getRawInput();
        if (isObject(raw) && Array.isArray(raw['tags'])) {
          raw['tags'].push({ id: 'stamp' });
        }
        return opts.next();
      })
      .input(z.object({ tags: z.array(z.unknown()) }))
      .query((opts) => opts.input.tags.length),
  });
  return { appRouter, calls };
};

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink, transformer: 'none' },
  { name: 'httpBatchLink', link: httpBatchLink, transformer: 'superjson' },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    transformer: 'none',
  },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    transformer: 'superjson',
  },
] as const)('$name with $transformer transformer', (scenario) => {
  function setup(opts: {
    allowPipelining: boolean;
    pipelining: boolean;
    methodOverride?: 'POST';
    maxItems?: number;
    maxURLLength?: number;
    fetch?: typeof fetch;
  }) {
    const { appRouter, calls } = createRouter(scenario.transformer);
    /** What the links before the batch link see */
    const ops: Pick<Operation, 'path' | 'input'>[] = [];
    const recordLink: TRPCLink<AnyRouter> = () => (linkOpts) => {
      ops.push({ path: linkOpts.op.path, input: linkOpts.op.input });
      return linkOpts.next(linkOpts.op);
    };
    const ctx = testServerAndClientResource(appRouter, {
      server: {
        experimental_allowPipelining: opts.allowPipelining,
        allowMethodOverride: opts.methodOverride === 'POST',
      },
      client: (clientOpts) => ({
        links: [
          recordLink,
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: clientOpts.transformer as any,
            experimental_pipelining: opts.pipelining
              ? experimental_pipelining()
              : undefined,
            methodOverride: opts.methodOverride,
            maxItems: opts.maxItems,
            maxURLLength: opts.maxURLLength,
            fetch: opts.fetch,
            headers: () => ({ 'x-sent-by': 'test' }),
          }),
        ],
      }),
    });
    return Object.assign(ctx, {
      calls,
      ops,
      untyped: getUntypedClient(ctx.client),
    });
  }
  const publishedAt =
    scenario.transformer === 'superjson'
      ? new Date('2026-01-01T00:00:00Z')
      : '2026-01-01T00:00:00.000Z';

  test("the server makes calls in an operation's request, and each has its own result", async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    expect(post.open).toBe(true);
    const author = pipeCall({
      path: 'author',
      input: { id: undefined, since: undefined },
      reads: [
        { to: ['id'], from: post, path: ['authorId'], each: false },
        { to: ['since'], from: post, path: ['publishedAt'], each: false },
      ],
    });
    assert(author);
    // A call reads another call
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: [{ to: [], from: author, path: ['teamId'], each: false }],
    });
    const tags = pipeCall({
      path: 'tags',
      input: { ids: [undefined, 'extra'] },
      reads: [
        {
          to: ['ids', '0'],
          from: post,
          path: ['tags', '1', 'id'],
          each: false,
        },
      ],
    });
    assert(team);
    assert(tags);

    await postResult;
    expect(post.open).toBe(false);
    expect(
      await Promise.all([author.result, team.result, tags.result]),
    ).toEqual([
      { data: { id: 'u1', teamId: 'team-of-u1' } },
      { data: { id: 'team-of-u1' } },
      { data: ['t2', 'extra'] },
    ]);
    // The server reads the data as the client gets it
    expect(ctx.calls.mock.calls[0]).toEqual([
      'author',
      { id: 'u1', since: publishedAt },
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    // A pipelined batch is a request of its own kind
    const { url } = ctx.onRequestSpy.mock.calls[0]![0];
    expect(url).toContain('/post,author,team,tags?batch=pipeline');
    expect(url).toContain('pipe=');
    // A call is no operation: the links before saw one, with its whole input
    expect(ctx.ops).toEqual([{ path: 'post', input: { slug: 'hello' } }]);
    // A link can serialize the context, which says what went with the request
    expect(JSON.parse(JSON.stringify(pipelineContext(post)))).toEqual({
      '~pipeline': {
        calls: [
          { path: 'author', status: 'sent' },
          { path: 'team', status: 'sent' },
          { path: 'tags', status: 'sent' },
        ],
      },
    });
  });

  test('works for queries sent as POST', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      methodOverride: 'POST',
    });

    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    const tags = pipeCall({
      path: 'tags',
      input: { ids: undefined },
      reads: [
        { to: ['ids'], from: post, path: ['tags', null, 'id'], each: false },
      ],
    });
    assert(tags);
    await postResult;
    expect((await tags.result).data).toEqual(['t1', 't2']);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    const req = ctx.onRequestSpy.mock.calls[0]![0];
    expect(req.method).toBe('POST');
    // The inputs and what to fill in are both in the body
    expect(req.url).not.toContain('pipe=');
    expect(req.url).not.toContain('input=');
  });

  test('a call for every item of a list has a result or an error for each', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    const tag = pipeCall({
      path: 'tag',
      input: { id: undefined },
      reads: [
        { to: ['id'], from: post, path: ['tags', null, 'id'], each: true },
      ],
    });
    assert(tag);
    await postResult;

    const at =
      scenario.transformer === 'superjson'
        ? new Date('2026-02-02T00:00:00Z')
        : '2026-02-02T00:00:00.000Z';
    expect((await tag.result).data).toMatchObject([
      { result: { data: { id: 't1', at } } },
      { error: { data: { code: 'FORBIDDEN' } } },
    ]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, 'POST'] as const)(
    'a server without `experimental_allowPipelining` runs nothing of a pipelined batch (methodOverride: %s)',
    async (methodOverride) => {
      await using ctx = setup({
        allowPipelining: false,
        pipelining: true,
        methodOverride,
      });

      const post = createOperationPipeline();
      const postResult = ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      });
      assert(author);
      const reason = {
        message:
          'The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
      };
      const results = await Promise.allSettled([postResult, author.result]);
      expect(results).toMatchObject([
        { status: 'rejected', reason },
        { status: 'rejected', reason },
      ]);
      // What the server answered is its cause
      assert(results[1].status === 'rejected');
      expect((results[1].reason as Error).cause).toMatchObject(
        scenario.link === httpBatchLink
          ? { data: { code: 'NOT_FOUND', path: 'post,author' } }
          : { data: { code: 'BAD_REQUEST' } },
      );
      // No call ran with a hole in its input
      expect(ctx.calls).not.toHaveBeenCalled();
    },
  );

  test.each([
    // Such as a proxy before the handler
    { name: 'for another path', data: { path: 'tenant' } },
    // Such as a `createContext` that finds no tenant
    { name: 'for no path', data: {} },
  ])(
    'a "not found" $name is not about pipelining, and stays the error it is',
    async (notFound) => {
      const shape = {
        message: 'No such tenant',
        code: -32004,
        data: { code: 'NOT_FOUND', httpStatus: 404, ...notFound.data },
      };
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        // It answers for the whole request
        fetch: async () =>
          Response.json(
            {
              error:
                scenario.transformer === 'superjson'
                  ? superjson.serialize(shape)
                  : shape,
            },
            { status: 404 },
          ),
      });
      const post = createOperationPipeline();
      const postResult = ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      });
      assert(author);
      await expect(postResult).rejects.toMatchObject({
        message: 'No such tenant',
        data: { code: 'NOT_FOUND', ...notFound.data },
      });
      await expect(author.result).rejects.toMatchObject({
        message: 'No such tenant',
      });
    },
  );

  test('a call that reads a failed one did not run, and is marked unresolved', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'missing' },
      { context: pipelineContext(post) },
    );
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
    });
    assert(author);
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: [{ to: [], from: author, path: ['teamId'], each: false }],
    });
    assert(team);

    expect(
      await Promise.allSettled([postResult, author.result, team.result]),
    ).toMatchObject([
      { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
      { status: 'rejected', reason: { data: { code: 'PRECONDITION_FAILED' } } },
      { status: 'rejected', reason: { data: { code: 'PRECONDITION_FAILED' } } },
    ]);
    expect(author.status).toBe('unresolved');
    expect(team.status).toBe('unresolved');
    expect(ctx.calls).not.toHaveBeenCalled();
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call that does not fit in the request is not made', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      maxItems: 2,
    });

    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
    });
    assert(author);
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: [{ to: [], from: author, path: ['teamId'], each: false }],
    });
    assert(team);
    // Sent in the same tick: it waits for the next request
    const other = ctx.untyped.query('team', 'team1');

    await Promise.all([postResult, other]);
    expect(await author.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    await expect(team.result).rejects.toThrow(
      'The call did not fit in the request of what it reads',
    );
    expect(team.status).toBe('unresolved');
    // Two requests, which reach the server in either order
    expect(
      ctx.onRequestSpy.mock.calls.map(([req]) => req.url?.split('?')[0]).sort(),
    ).toEqual(['/post,author', '/team']);
  });

  test('a call that fits in no request does not split the batch', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      maxURLLength: 300,
    });
    const post = createOperationPipeline();
    const results = Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query('team', 'team1'),
    ]);
    const author = pipeCall({
      path: 'author',
      // Too long for a URL, also with the post alone
      input: { id: undefined, since: 'x'.repeat(500) },
      reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
    });
    assert(author);
    await results;
    await expect(author.result).rejects.toThrow(
      'The call did not fit in the request of what it reads',
    );
    expect(author.status).toBe('unresolved');
    // The team is in the post's request: leaving it out would fit no more
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an operation that is never sent leaves its call unresolved', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      // No request fits
      maxURLLength: 10,
    });
    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
    });
    assert(author);
    await expect(postResult).rejects.toThrow(
      'Input is too big for a single dispatch',
    );
    await expect(author.result).rejects.toThrow(
      'The operation this call reads was not sent',
    );
    expect(author.status).toBe('unresolved');
    expect(post.open).toBe(false);
    expect(ctx.onRequestSpy).not.toHaveBeenCalled();
  });

  test('a call that reads more values than a server takes is not added', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });
    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    const reads = (count: number) =>
      Array.from({ length: count }, () => ({
        to: ['id'],
        from: post,
        path: ['authorId'],
        each: false,
      }));
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: reads(pipelineReadsLimit + 1),
      }),
    ).toBeNull();
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: reads(pipelineReadsLimit),
    });
    assert(author);
    await postResult;
    expect(await author.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    // What a link that logs an operation's context gets of it
    expect(JSON.parse(JSON.stringify(pipelineContext(post)))).toEqual({
      '~pipeline': { calls: [{ path: 'author', status: 'sent' }] },
    });
  });

  test.runIf(scenario.link === httpBatchLink)(
    'an answer with no result for a call fails that call',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        // Such as a proxy that drops what it doesn't expect
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const results: unknown[] = await res.json();
          return Response.json(results.slice(0, 1), res);
        },
      });
      const post = createOperationPipeline();
      const postResult = ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      });
      assert(author);
      expect(await postResult).toMatchObject({ slug: 'hello' });
      await expect(author.result).rejects.toThrow(
        'The server sent no result for a pipelined call',
      );
    },
  );

  test.runIf(scenario.link === httpBatchStreamLink)(
    'a response that breaks off fails what it had no result for, and such calls did not run for sure',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const text = await res.text();
          // Its first line says what is to come. Nothing comes
          const head = new TextEncoder().encode(
            text.slice(0, text.indexOf('\n') + 1),
          );
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(head);
              },
              pull(controller) {
                controller.error(new Error('The connection broke'));
              },
            }),
            res,
          );
        },
      });
      const post = createOperationPipeline();
      const postResult = ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      });
      assert(author);
      await expect(postResult).rejects.toThrow('The connection broke');
      await expect(author.result).rejects.toThrow('The connection broke');
      expect(author.status).toBe('unresolved');
    },
  );

  test.runIf(scenario.link === httpBatchStreamLink)(
    'a not-OK answer that is no error is the result of every operation, as without pipelining',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async () =>
          Response.json({ result: { data: 'maintenance' } }, { status: 503 }),
      });
      expect(
        await Promise.all([
          ctx.untyped.query('post', { slug: 'hello' }),
          ctx.untyped.query('team', 'team1'),
        ]),
      ).toEqual(['maintenance', 'maintenance']);
    },
  );

  test('a batch is not split when that lets no more calls go', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      maxItems: 3,
    });
    const first = createOperationPipeline();
    const second = createOperationPipeline();
    const results = Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(first) },
      ),
      ctx.untyped.query(
        'post',
        { slug: 'other' },
        { context: pipelineContext(second) },
      ),
    ]);
    // Reads both posts: it can only go in a request with both
    const both = pipeCall({
      path: 'author',
      input: { id: undefined, since: undefined },
      reads: [
        { to: ['id'], from: first, path: ['authorId'], each: false },
        { to: ['since'], from: second, path: ['slug'], each: false },
      ],
    });
    // Reads the first post. Two requests would have room for it, and none
    // for the call above: one call either way
    const one = pipeCall({
      path: 'team',
      input: undefined,
      reads: [{ to: [], from: first, path: ['authorId'], each: false }],
    });
    assert(both);
    assert(one);
    await results;
    expect(await both.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    await expect(one.result).rejects.toThrow(
      'The call did not fit in the request of what it reads',
    );
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call that reads two operations goes in the request of both', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const first = createOperationPipeline();
    const second = createOperationPipeline();
    const results = Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(first) },
      ),
      // Between the two: the call's other operation comes after it
      ctx.untyped.query('team', 'team1'),
      ctx.untyped.query(
        'post',
        { slug: 'other' },
        { context: pipelineContext(second) },
      ),
    ]);
    const author = pipeCall({
      path: 'author',
      input: { id: undefined, since: undefined },
      reads: [
        { to: ['id'], from: first, path: ['authorId'], each: false },
        { to: ['since'], from: second, path: ['slug'], each: false },
      ],
    });
    assert(author);
    await results;
    expect(await author.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    expect(ctx.calls.mock.calls).toContainEqual([
      'author',
      { id: 'u1', since: 'other' },
    ]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call can not be added once the request has gone', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline();
    await ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    expect(post.open).toBe(false);
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      }),
    ).toBeNull();
  });

  test('without `experimental_pipelining`, the link takes no calls', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: false });
    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    expect(post.open).toBe(false);
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      }),
    ).toBeNull();
    await postResult;
    const { url } = ctx.onRequestSpy.mock.calls[0]![0];
    expect(url).toContain('batch=1');
    expect(url).not.toContain('pipe=');
  });

  test('with `experimental_pipelining`, a batch without calls is an ordinary batch', async () => {
    await using ctx = setup({ allowPipelining: false, pipelining: true });
    const post = createOperationPipeline();
    const results = await Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query('team', 'team1'),
    ]);
    expect(results[1]).toEqual({ id: 'team1' });
    const { url } = ctx.onRequestSpy.mock.calls[0]![0];
    expect(url).toContain('batch=1');
    expect(url).not.toContain('pipe=');
  });
});

describe('a server without `experimental_allowPipelining`', () => {
  test('answers as it did before: `pipe` means nothing, and `batch=pipeline` is no batch', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { allowMethodOverride: true },
    });
    const input = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u9' } }),
    );
    const pipe = encodeURIComponent(
      JSON.stringify({ 1: [{ to: ['id'], from: 0, path: ['authorId'] }] }),
    );

    // An ordinary batch that happens to have a `pipe`: it is not read
    const ordinary = await fetch(
      `${ctx.httpUrl}/post,author?batch=1&input=${input}&pipe=${pipe}`,
    );
    expect((await ordinary.json())[1]).toEqual({
      result: { data: { id: 'u9', teamId: 'team-of-u9' } },
    });
    const ordinaryPost = await fetch(`${ctx.httpUrl}/post,author?batch=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u9' }, pipe: {} }),
    });
    expect((await ordinaryPost.json())[1].result.data.id).toBe('u9');

    // A pipelined batch: one call to a procedure that doesn't exist
    calls.mockClear();
    const pipelined = await fetch(
      `${ctx.httpUrl}/post,author?batch=pipeline&input=${input}&pipe=${pipe}`,
    );
    expect(pipelined.status).toBe(404);
    expect((await pipelined.json()).error.message).toBe(
      'No procedure found on path "post,author"',
    );
    expect(calls).not.toHaveBeenCalled();
  });

  test('gives `createContext` the same request info', async () => {
    const { appRouter } = createRouter('none');
    const infos: unknown[] = [];
    const serve = async (experimental_allowPipelining: boolean) => {
      await using ctx = testServerAndClientResource(appRouter, {
        server: {
          experimental_allowPipelining,
          createContext: (opts) => {
            infos.push(Object.keys(opts.info).sort());
            return {};
          },
        },
      });
      await ctx.client.team.query('team1');
    };
    await serve(false);
    await serve(true);
    // An ordinary request is the same request either way
    expect(infos[1]).toEqual(infos[0]);
    expect(infos[0]).not.toContain('experimental_getPipe');
  });
});

describe('the `pipe` search param', () => {
  async function get(search: string, opts: { path: string }) {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const res = await fetch(
      `${ctx.httpUrl}/${opts.path}?batch=pipeline&${search}`,
    );
    return { status: res.status, json: await res.json(), calls };
  }
  const input = encodeURIComponent(
    JSON.stringify({ 0: { slug: 'hello' }, 1: {} }),
  );
  const pipe = (value: unknown) =>
    `input=${input}&pipe=${encodeURIComponent(JSON.stringify(value))}`;

  test('fills in the input of a later call', async () => {
    const res = await get(
      pipe({ 1: [{ to: ['id'], from: 0, path: ['authorId'] }] }),
      { path: 'post,author' },
    );
    expect(res.json[1]).toEqual({
      result: { data: { id: 'u1', teamId: 'team-of-u1' } },
    });
  });

  test('`null` in a path reads every item of an array', async () => {
    const tagsInput = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {} }),
    );
    const res = await get(
      `input=${tagsInput}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['ids'], from: 0, path: ['tags', null, 'id'] }],
        }),
      )}`,
      { path: 'post,tags' },
    );
    expect(res.json[1]).toEqual({ result: { data: ['t1', 't2'] } });

    // Not an array: nothing to read
    const notAnArray = await get(
      `input=${tagsInput}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['ids'], from: 0, path: ['slug', null, 'id'] }],
        }),
      )}`,
      { path: 'post,tags' },
    );
    expect(notAnArray.json[1].error.data.code).toBe('BAD_REQUEST');
  });

  test('`each` runs a call for every item of a list', async () => {
    const eachInput = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { ids: [null, 'extra'] } }),
    );
    const each = (reads: unknown) =>
      get(
        `input=${eachInput}&pipe=${encodeURIComponent(JSON.stringify({ 1: reads }))}`,
        { path: 'post,tags' },
      );

    const res = await each([
      { to: ['ids', '0'], from: 0, path: ['tags', null, 'id'], each: true },
    ]);
    expect(res.json[1]).toEqual({
      result: {
        data: [
          { result: { data: ['t1', 'extra'] } },
          { result: { data: ['t2', 'extra'] } },
        ],
      },
    });

    // Every run validates its own input
    const invalid = await each([
      { to: ['ids', '0'], from: 0, path: ['tags', null], each: true },
    ]);
    expect(
      invalid.json[1].result.data.map((item: any) => item.error.data.code),
    ).toEqual(['BAD_REQUEST', 'BAD_REQUEST']);

    const noList = await each([
      { to: ['ids', '0'], from: 0, path: ['slug'], each: true },
    ]);
    expect(noList.json.error.message).toBe(
      'Invalid "pipe": "each" at 1 needs a list in its path',
    );
  });

  test('a run of a call for every item that returns a stream fails by itself', async () => {
    const eachInput = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {} }),
    );
    const res = await get(
      `input=${eachInput}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['id'], from: 0, path: ['tags', null, 'id'], each: true }],
        }),
      )}`,
      { path: 'post,ticks' },
    );
    // Not `{}`, which is what a stream inside a list would be sent as
    expect(
      res.json[1].result.data.map((item: any) => item.error.data.code),
    ).toEqual(['UNSUPPORTED_MEDIA_TYPE', 'UNSUPPORTED_MEDIA_TYPE']);
  });

  test('a call whose data the response can not carry is not read: the call that reads it does not run', async () => {
    const search = `input=${encodeURIComponent(
      JSON.stringify({ 1: {} }),
    )}&pipe=${encodeURIComponent(
      JSON.stringify({ 1: [{ to: ['id'], from: 0, path: ['authorId'] }] }),
    )}`;
    const res = await get(search, { path: 'feed,author' });
    expect(res.json[0].error.data.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(res.json[1].error.data.code).toBe('PRECONDITION_FAILED');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a place in an input that can not be written is an invalid `pipe`, not a server error', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: { ids: ['a'] } }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['ids', 'length'], from: 0, path: ['authorId'] }],
        }),
      )}`,
      { path: 'post,tags' },
    );
    expect(res.json[1].error).toMatchObject({
      message: 'Invalid "pipe": the input has nothing at "ids.length"',
      data: { code: 'BAD_REQUEST' },
    });
  });

  test('a call can read so many values, and no more', async () => {
    const reads = (count: number) =>
      pipe({
        1: Array.from({ length: count }, () => ({
          to: ['id'],
          from: 0,
          path: ['authorId'],
        })),
      });
    const within = await get(reads(pipelineReadsLimit), {
      path: 'post,author',
    });
    expect(within.json[1].result.data.id).toBe('u1');

    const over = await get(reads(pipelineReadsLimit + 1), {
      path: 'post,author',
    });
    expect(over.status).toBe(400);
    expect(over.json.error.message).toBe(
      `Invalid "pipe": call 1 reads more than ${pipelineReadsLimit} values`,
    );
    expect(over.calls).not.toHaveBeenCalled();
  });

  test('a call for every item counts each item towards `maxBatchSize`', async () => {
    async function each(maxBatchSize: number) {
      const { appRouter, calls } = createRouter('none');
      await using ctx = testServerAndClientResource(appRouter, {
        server: { experimental_allowPipelining: true, maxBatchSize },
      });
      const search = `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['id'], from: 0, path: ['tags', null, 'id'], each: true }],
        }),
      )}`;
      const res = await fetch(
        `${ctx.httpUrl}/post,tag?batch=pipeline&${search}`,
      );
      return { json: await res.json(), calls };
    }

    // Two calls, of which one runs for two items: three runs
    const within = await each(3);
    expect(within.json[1].result.data).toHaveLength(2);

    const over = await each(2);
    expect(over.json[0].result.data.slug).toBe('hello');
    expect(over.json[1].error).toMatchObject({
      message: 'A call for every item exceeds the maximum batch size',
      data: { code: 'BAD_REQUEST' },
    });
    // It ran for no item
    expect(over.calls).not.toHaveBeenCalled();
  });

  test('a call for every item that is refused takes none of `maxBatchSize` from the next', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true, maxBatchSize: 4 },
    });
    const each = (list: string) => [
      { to: ['id'], from: 0, path: [list, null, 'id'], each: true },
    ];
    const res = await fetch(
      `${ctx.httpUrl}/lists,tag,tag?batch=pipeline&input=${encodeURIComponent(
        JSON.stringify({ 1: {}, 2: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({ 1: each('long'), 2: each('short') }),
      )}`,
    );
    const json = await res.json();
    // Three calls and four items are over the limit. Three calls and two are not
    expect(json[1].error.message).toBe(
      'A call for every item exceeds the maximum batch size',
    );
    expect(json[2].result.data).toHaveLength(2);
    expect(calls).toHaveBeenCalledTimes(2);
  });

  test('filling in an input does not change the data that another call reads', async () => {
    const search = `input=${encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {}, 2: {} }),
    )}&pipe=${encodeURIComponent(
      JSON.stringify({
        // The whole post as the input, and then its slug replaced
        1: [
          { to: [], from: 0, path: [] },
          { to: ['slug'], from: 0, path: ['authorId'] },
        ],
        // Reads the slug after the call above has replaced its own
        2: [
          { to: ['other'], from: 0, path: ['authorId'] },
          { to: ['slug'], from: 0, path: ['slug'] },
        ],
      }),
    )}`;
    const res = await get(search, { path: 'post,post,post' });
    expect(res.json[1].result.data.slug).toBe('u1');
    // Not `u1`: the first call's data is as it was sent
    expect(res.json[2].result.data.slug).toBe('hello');
  });

  test('a call that changes its input does not change what a later call reads', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: {}, 2: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['tags'], from: 0, path: ['tags'] }],
          // Reads the tags once the call above has run
          2: [
            { to: ['after'], from: 1, path: [] },
            { to: ['ids'], from: 0, path: ['tags', null, 'id'] },
          ],
        }),
      )}`,
      { path: 'post,stamp,tags' },
    );
    expect(res.json[1].result.data).toBe(3);
    expect(res.json[2].result.data).toEqual(['t1', 't2']);
  });

  test('a run for an item that changes its input does not change what other runs and calls read', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: {}, 2: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          // Every run gets the whole list too
          1: [
            { to: ['id'], from: 0, path: ['tags', null, 'id'], each: true },
            { to: ['tags'], from: 0, path: ['tags'] },
          ],
          2: [
            { to: ['after'], from: 1, path: [] },
            { to: ['ids'], from: 0, path: ['tags', null, 'id'] },
          ],
        }),
      )}`,
      { path: 'post,stamp,tags' },
    );
    expect(res.json[1].result.data).toEqual([
      { result: { data: 3 } },
      { result: { data: 3 } },
    ]);
    expect(res.json[2].result.data).toEqual(['t1', 't2']);
  });

  test('a run for an item that changes the input the client sent does not change it for other runs', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: { tags: [] } }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: [{ to: ['id'], from: 0, path: ['tags', null, 'id'], each: true }],
        }),
      )}`,
      { path: 'post,stamp' },
    );
    // Every run adds a tag to its own list
    expect(res.json[1].result.data).toEqual([
      { result: { data: 1 } },
      { result: { data: 1 } },
    ]);
  });

  test('filling in an input keeps what the transformer made of it', async () => {
    class Range {
      constructor(
        public from: unknown,
        public to: number,
      ) {}
    }
    const t = initTRPC.create({
      transformer: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) =>
          isObject(value) && typeof value['to'] === 'number'
            ? new Range(value['from'], value['to'])
            : value,
      },
    });
    const appRouter = t.router({
      start: t.procedure.query(() => ({ at: 1 })),
      span: t.procedure
        .input((value) => {
          if (!(value instanceof Range)) {
            throw new Error('Not a range');
          }
          return value;
        })
        .query((opts) => [opts.input.from, opts.input.to]),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const res = await fetch(
      `${ctx.httpUrl}/start,span?batch=pipeline&input=${encodeURIComponent(
        JSON.stringify({ 1: { from: null, to: 5 } }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({ 1: [{ to: ['from'], from: 0, path: ['at'] }] }),
      )}`,
    );
    expect((await res.json())[1]).toEqual({ result: { data: [1, 5] } });
  });

  test("a value goes through the input's transformer, as if the client had sent it", async () => {
    /** Makes dates of the date strings in an input */
    const revive = (value: unknown): unknown =>
      typeof value === 'string' && !isNaN(Date.parse(value))
        ? new Date(value)
        : isObject(value)
          ? Object.fromEntries(
              Object.entries(value).map(([key, item]) => [key, revive(item)]),
            )
          : value;
    const t = initTRPC.create({
      transformer: {
        // The server gets dates, and the client gets strings
        input: { serialize: (value: unknown) => value, deserialize: revive },
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => value,
        },
      },
    });
    const appRouter = t.router({
      post: t.procedure.query(() => ({
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      })),
      since: t.procedure
        .input(z.object({ since: z.date() }))
        .query((opts) => opts.input.since.getUTCFullYear()),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const url = (search: string) => `${ctx.httpUrl}/${search}`;

    // What the client would send by itself
    const alone = await fetch(
      url(
        `since?input=${encodeURIComponent(
          JSON.stringify({ since: '2026-01-01T00:00:00.000Z' }),
        )}`,
      ),
    );
    expect(await alone.json()).toEqual({ result: { data: 2026 } });

    const res = await fetch(
      url(
        `post,since?batch=pipeline&input=${encodeURIComponent(
          JSON.stringify({ 1: {} }),
        )}&pipe=${encodeURIComponent(
          JSON.stringify({
            1: [{ to: ['since'], from: 0, path: ['publishedAt'] }],
          }),
        )}`,
      ),
    );
    expect((await res.json())[1]).toEqual({ result: { data: 2026 } });
  });

  test('`batch=pipeline` without a `pipe` is an ordinary batch', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u2' } }),
      )}`,
      { path: 'post,author' },
    );
    expect(res.json[0].result.data.slug).toBe('hello');
    expect(res.json[1].result.data.id).toBe('u2');
  });

  test('a call for every item of a failed call, or of what is no list, runs for none', async () => {
    const eachOf = (path: string, source: object, list: string) =>
      get(
        `input=${encodeURIComponent(
          JSON.stringify({ 0: source, 1: {} }),
        )}&pipe=${encodeURIComponent(
          JSON.stringify({
            1: [{ to: ['id'], from: 0, path: [list, null, 'id'], each: true }],
          }),
        )}`,
        { path },
      );
    const failed = await eachOf('post,tag', { slug: 'missing' }, 'tags');
    expect(failed.json[0].error.data.code).toBe('NOT_FOUND');
    expect(failed.json[1].error.data.code).toBe('PRECONDITION_FAILED');
    expect(failed.calls).not.toHaveBeenCalled();

    const noList = await eachOf('post,tag', { slug: 'hello' }, 'slug');
    expect(noList.json[1]).toEqual({ result: { data: [] } });
    expect(noList.calls).not.toHaveBeenCalled();
  });

  test('a call whose data is `undefined` gives the calls that read it nothing', async () => {
    const res = await get(
      `input=${encodeURIComponent(JSON.stringify({ 1: {} }))}&pipe=${encodeURIComponent(
        JSON.stringify({ 1: [{ to: ['id'], from: 0, path: [] }] }),
      )}`,
      { path: 'nothing,author' },
    );
    // The author's input has no id, and fails to validate
    expect(res.json[1].error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a call still validates its input', async () => {
    const res = await get(
      pipe({ 1: [{ to: ['id'], from: 0, path: ['tags'] }] }),
      { path: 'post,author' },
    );
    expect(res.json[1].error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('reads own properties only', async () => {
    const res = await get(
      pipe({
        1: [
          { to: ['id'], from: 0, path: ['authorId'] },
          { to: ['since'], from: 0, path: ['secret', 'inherited'] },
          { to: ['__proto__'], from: 0, path: ['constructor'] },
        ],
      }),
      { path: 'post,author' },
    );
    expect(res.json[1].result.data).toEqual({ id: 'u1', teamId: 'team-of-u1' });
    expect(res.calls.mock.calls[0]![1]).toEqual({ id: 'u1' });
  });

  test.each([
    ['a call that reads from itself', { 1: [{ to: [], from: 1, path: [] }] }],
    [
      'a call that reads from a later one',
      { 0: [{ to: [], from: 1, path: [] }] },
    ],
    ['a call that is not in the batch', { 2: [{ to: [], from: 0, path: [] }] }],
    ['paths that are not strings', { 1: [{ to: [1], from: 0, path: [] }] }],
    ['reads that are no list', { 1: { to: [], from: 0, path: [] } }],
    [
      'a call for every item of two lists',
      {
        1: [
          { to: ['id'], from: 0, path: ['tags', null, 'id'], each: true },
          { to: ['since'], from: 0, path: ['others', null], each: true },
        ],
      },
    ],
    ['something that is not an object', 'nope'],
  ])('rejects %s', async (_name, value) => {
    const res = await get(pipe(value), { path: 'post,author' });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/^Invalid "pipe"/);
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('rejects a `pipe` that is not JSON', async () => {
    const res = await get(`input=${input}&pipe=%7Bnope`, {
      path: 'post,author',
    });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toBe('Invalid "pipe": not JSON');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a POST has it in its body, beside the inputs', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true, allowMethodOverride: true },
    });
    const post = (body: unknown) =>
      fetch(`${ctx.httpUrl}/post,author?batch=pipeline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const res = await post({
      0: { slug: 'hello' },
      1: {},
      pipe: { 1: [{ to: ['id'], from: 0, path: ['authorId'] }] },
    });
    expect((await res.json())[1]).toEqual({
      result: { data: { id: 'u1', teamId: 'team-of-u1' } },
    });

    calls.mockClear();
    const invalid = await post({
      0: { slug: 'hello' },
      1: {},
      pipe: { 1: [{ to: ['id'], from: 1, path: [] }] },
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.message).toMatch(/^Invalid "pipe"/);
    expect(calls).not.toHaveBeenCalled();
  });

  test('rejects a batch of mutations', async () => {
    const { appRouter } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const res = await fetch(`${ctx.httpUrl}/rename,rename?batch=pipeline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { id: 'a' }, 1: { id: 'b' }, pipe: {} }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(
      'Only a batch of queries can be pipelined',
    );
  });
});
