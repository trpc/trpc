import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { Operation, TRPCLink } from '@trpc/client';
import {
  experimental_pipelining,
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
  loggerLink,
} from '@trpc/client';
import type { experimental_PipeliningLinkOptions } from '@trpc/client';
import {
  createOperationPipeline,
  pipeCall,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { experimental_PipeliningOptions } from '@trpc/server/unstable-core-do-not-import';
import {
  isObject,
  pipelineLimitDefaults,
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
    pipelining: boolean | experimental_PipeliningLinkOptions;
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
        // Some calls here read a whole value, such as a list of tags
        experimental_allowPipelining: opts.allowPipelining && {
          allowWholeValues: true,
        },
        allowMethodOverride: opts.methodOverride === 'POST',
      },
      client: (clientOpts) => ({
        links: [
          recordLink,
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: clientOpts.transformer as any,
            experimental_pipelining: opts.pipelining
              ? experimental_pipelining(
                  opts.pipelining === true ? undefined : opts.pipelining,
                )
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
    // The calls are in the post's tree, not its path
    expect(url).toContain('/post?batch=tree');
    expect(url).toContain('tree=');
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
      // The server says so itself: the client doesn't work it out
      const reason = {
        message:
          'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
        data: { code: 'BAD_REQUEST' },
      };
      const results = await Promise.allSettled([postResult, author.result]);
      expect(results).toMatchObject([
        { status: 'rejected', reason },
        { status: 'rejected', reason },
      ]);
      expect(author.status).toBe('unresolved');
      // No call ran with a hole in its input
      expect(ctx.calls).not.toHaveBeenCalled();
    },
  );

  test.each([
    // Such as a proxy before the handler
    { name: 'for another path', data: { path: 'tenant' } },
    // Such as a proxy that answers in tRPC's shape, without a path
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
    // Two requests, which reach the server in either order. The author is in
    // the post's tree, not its path
    expect(
      ctx.onRequestSpy.mock.calls.map(([req]) => req.url?.split('?')[0]).sort(),
    ).toEqual(['/post', '/team']);
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
        reads: reads(pipelineLimitDefaults.maxReadsPerCall + 1),
      }),
    ).toBeNull();
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: reads(pipelineLimitDefaults.maxReadsPerCall),
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

  test('a call deeper in a chain than a server takes is not added, unless the link raises it', async () => {
    /** A chain of 4: post, author, team and team again. What the 4th is */
    async function chain(
      pipelining: true | experimental_PipeliningLinkOptions,
    ) {
      await using ctx = setup({ allowPipelining: true, pipelining });
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
      const fourth = pipeCall({
        path: 'team',
        input: undefined,
        reads: [{ to: [], from: team, path: ['id'], each: false }],
      });
      await postResult;
      expect(await team.result).toEqual({ data: { id: 'team-of-u1' } });
      return fourth && (await fourth.result.catch((error: Error) => error));
    }
    expect(await chain(true)).toBeNull();
    // The server's `maxDepth` is 3, so it refuses it
    expect(await chain({ maxDepth: 4 })).toMatchObject({
      message: 'This call is nested 4 deep, more than `maxDepth` (3) allows',
    });
  });

  test('a call whose reads a server would refuse is not added: the request of what it reads goes without it', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });
    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    // Every item of what is no list
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: true }],
      }),
    ).toBeNull();
    // The items of two lists
    expect(
      pipeCall({
        path: 'author',
        input: {},
        reads: [
          { to: ['a'], from: post, path: ['tags', null], each: true },
          { to: ['b'], from: post, path: ['related', null], each: true },
        ],
      }),
    ).toBeNull();
    // The server would have refused the whole request for either
    expect(await postResult).toMatchObject({ authorId: 'u1' });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onRequestSpy.mock.calls[0]?.[0].url).toContain('batch=1');
  });

  test.each([
    { name: 'no object', value: 'pipeline' },
    { name: 'an object that is no pipeline', value: { open: 'yes' } },
    { name: 'a pipeline without a list of calls', value: { open: true } },
    {
      name: 'a pipeline that can not be told what was sent',
      value: { open: false, calls: [], sent: Promise.resolve([]) },
    },
  ])(
    'a context whose `~pipeline` is $name is not a pipeline: its operation is an ordinary one',
    async (scenario) => {
      await using ctx = setup({ allowPipelining: true, pipelining: true });
      expect(
        await ctx.untyped.query(
          'post',
          { slug: 'hello' },
          { context: { '~pipeline': scenario.value } },
        ),
      ).toMatchObject({ authorId: 'u1' });
      expect(ctx.onRequestSpy.mock.calls[0]?.[0].url).toContain('batch=1');
    },
  );

  test.runIf(scenario.link === httpBatchLink)(
    'an answer with no result for a call fails that call',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        // Such as a proxy that drops what it doesn't expect
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const results: Record<string, unknown>[] = await res.json();
          return Response.json(
            results.map(({ children: _, ...result }) => result),
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
    // Two posts and the call fit in one request, as in two
    const one = pipeCall({
      path: 'team',
      input: undefined,
      reads: [{ to: [], from: first, path: ['authorId'], each: false }],
    });
    assert(one);
    await results;
    expect(await one.result).toEqual({ data: { id: 'u1' } });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call that reads two operations, neither under the other, is not added: it waits for their data', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

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
    // A follow-up sits under the one call it reads, with what is above it
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined, since: undefined },
        reads: [
          { to: ['id'], from: first, path: ['authorId'], each: false },
          { to: ['since'], from: second, path: ['slug'], each: false },
        ],
      }),
    ).toBeNull();
    await results;
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call can read the operation and every call it is under', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

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
    const both = pipeCall({
      path: 'author',
      input: { id: undefined, since: undefined },
      reads: [
        { to: ['id'], from: author, path: ['id'], each: false },
        { to: ['since'], from: post, path: ['slug'], each: false },
      ],
    });
    assert(both);
    await postResult;
    expect(await both.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    expect(ctx.calls.mock.calls).toContainEqual([
      'author',
      { id: 'u1', since: 'hello' },
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

describe('a server without `experimental_allowPipelining`, whose error formatter changes `data`', () => {
  test.each([
    { name: 'httpBatchLink', link: httpBatchLink },
    { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
  ])('$name still says what to set', async (scenario) => {
    const t = initTRPC.create({
      errorFormatter: (opts) => ({
        ...opts.shape,
        data: { code: opts.shape.data.code },
      }),
    });
    const appRouter = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1' })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => opts.input.id),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const post = createOperationPipeline();
    const postResult = getUntypedClient(ctx.client).query('post', undefined, {
      context: pipelineContext(post),
    });
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
    });
    assert(author);
    await expect(postResult).rejects.toThrow(
      'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true`',
    );
  });
});

describe('a server without `experimental_allowPipelining`', () => {
  test('answers an ordinary batch as it did before: `tree` means nothing. A pipelined batch is a bad request', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { allowMethodOverride: true },
    });
    const input = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u9' } }),
    );
    const tree = encodeURIComponent(
      JSON.stringify({
        0: {
          author: {
            path: 'author',
            input: {},
            reads: [{ to: ['id'], data: ['authorId'] }],
          },
        },
      }),
    );

    // An ordinary batch that happens to have a `tree`: it is not read
    const ordinary = await fetch(
      `${ctx.httpUrl}/post,author?batch=1&input=${input}&tree=${tree}`,
    );
    expect((await ordinary.json())[1]).toEqual({
      result: { data: { id: 'u9', teamId: 'team-of-u9' } },
    });
    const ordinaryPost = await fetch(`${ctx.httpUrl}/post,author?batch=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u9' }, tree: {} }),
    });
    expect((await ordinaryPost.json())[1].result.data.id).toBe('u9');

    // A pipelined batch: nothing of it runs, and the answer says why
    calls.mockClear();
    const pipelined = await fetch(
      `${ctx.httpUrl}/post,author?batch=tree&input=${input}&tree=${tree}`,
    );
    expect(pipelined.status).toBe(400);
    expect((await pipelined.json()).error.message).toBe(
      'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
    );
    const pipelinedPost = await fetch(`${ctx.httpUrl}/post,author?batch=tree`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { slug: 'hello' }, 1: {}, tree: {} }),
    });
    expect(pipelinedPost.status).toBe(400);
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
    expect(infos[0]).not.toContain('experimental_pipeline');
  });
});

describe('the `tree` search param', () => {
  async function get(opts: {
    path: string;
    input: Record<number, unknown>;
    tree: unknown;
    allowPipelining: true | experimental_PipeliningOptions;
    maxBatchSize: number | undefined;
  }) {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: {
        experimental_allowPipelining: opts.allowPipelining,
        maxBatchSize: opts.maxBatchSize,
      },
    });
    const tree =
      typeof opts.tree === 'string' ? opts.tree : JSON.stringify(opts.tree);
    const res = await fetch(
      `${ctx.httpUrl}/${opts.path}?batch=tree&input=${encodeURIComponent(
        JSON.stringify(opts.input),
      )}&tree=${encodeURIComponent(tree)}`,
    );
    return { status: res.status, json: await res.json(), calls };
  }
  const defaults = {
    input: { 0: { slug: 'hello' } },
    allowPipelining: true,
    maxBatchSize: undefined,
  } as const;
  /** A follow-up of `path`, with an empty input */
  const node = (path: string, reads: unknown[], more: object = {}) => ({
    path,
    input: {},
    reads,
    ...more,
  });
  const author = node('author', [{ to: ['id'], data: ['authorId'] }]);

  test('fills in the input of a follow-up', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      tree: { 0: { author } },
    });
    expect(res.json[0].children).toEqual({
      author: { result: { data: { id: 'u1', teamId: 'team-of-u1' } } },
    });
  });

  test('`null` in a path reads every item of an array', async () => {
    const tags = (path: unknown[]) => ({
      ...defaults,
      path: 'post',
      allowPipelining: { allowWholeValues: true },
      tree: { 0: { tags: node('tags', [{ to: ['ids'], data: path }]) } },
    });
    const res = await get(tags(['tags', null, 'id']));
    expect(res.json[0].children.tags).toEqual({
      result: { data: ['t1', 't2'] },
    });

    // Not an array: nothing to read
    const notAnArray = await get(tags(['slug', null, 'id']));
    expect(notAnArray.json[0].children.tags.error.data.code).toBe(
      'BAD_REQUEST',
    );
  });

  test('a list key runs a follow-up for every item, each with a result or an error of its own', async () => {
    const each = (item: unknown[], list = 'tags[]') =>
      get({
        ...defaults,
        path: 'post',
        allowPipelining: { allowWholeValues: true },
        tree: {
          0: {
            [list]: {
              tags: {
                path: 'tags',
                input: { ids: [null, 'extra'] },
                reads: [{ to: ['ids', '0'], item }],
              },
            },
          },
        },
      });

    const res = await each(['id']);
    expect(res.json[0].children['tags[]']).toEqual([
      { tags: { result: { data: ['t1', 'extra'] } } },
      { tags: { result: { data: ['t2', 'extra'] } } },
    ]);

    // Every run validates its own input
    const invalid = await each([]);
    expect(
      invalid.json[0].children['tags[]'].map(
        (item: any) => item.tags.error.data.code,
      ),
    ).toEqual(['BAD_REQUEST', 'BAD_REQUEST']);

    // What is no list has no items
    const noList = await each(['id'], 'slug[]');
    expect(noList.json[0].children['slug[]']).toEqual([]);
  });

  test('a run for an item that returns a stream fails by itself', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: {
          'tags[]': { ticks: node('ticks', [{ to: ['id'], item: ['id'] }]) },
        },
      },
    });
    // Not `{}`, which is what a stream inside a response that doesn't stream would be
    expect(
      res.json[0].children['tags[]'].map(
        (item: any) => item.ticks.error.data.code,
      ),
    ).toEqual(['UNSUPPORTED_MEDIA_TYPE', 'UNSUPPORTED_MEDIA_TYPE']);
  });

  test('a call whose data the response can not carry is not read: the follow-up under it does not run', async () => {
    const res = await get({
      ...defaults,
      input: {},
      path: 'feed',
      tree: { 0: { author } },
    });
    expect(res.json[0].error.data.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(res.json[0].children.author.error.data.code).toBe(
      'PRECONDITION_FAILED',
    );
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a place in an input that can not be written is an invalid `tree`, not a server error', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: {
          tags: {
            path: 'tags',
            input: { ids: ['a'] },
            reads: [{ to: ['ids', 'length'], data: ['authorId'] }],
          },
        },
      },
    });
    expect(res.json[0].children.tags.error).toMatchObject({
      message: 'Invalid "tree": the input has nothing at "ids.length"',
      data: { code: 'BAD_REQUEST' },
    });
  });

  /** An author that reads its id `count` times */
  const reading = (count: number) => ({
    0: {
      author: node(
        'author',
        Array.from({ length: count }, () => ({
          to: ['id'],
          data: ['authorId'],
        })),
      ),
    },
  });

  test('a follow-up can read so many values, and no more', async () => {
    const within = await get({
      ...defaults,
      path: 'post',
      tree: reading(pipelineLimitDefaults.maxReadsPerCall),
    });
    expect(within.json[0].children.author.result.data.id).toBe('u1');

    const over = await get({
      ...defaults,
      path: 'post',
      tree: reading(pipelineLimitDefaults.maxReadsPerCall + 1),
    });
    // The follow-up is refused, and the rest of the batch runs. The status is
    // the batch's calls'
    expect(over.status).toBe(200);
    expect(over.json[0].result.data.slug).toBe('hello');
    expect(over.json[0].children.author.error).toMatchObject({
      message: `This call reads ${pipelineLimitDefaults.maxReadsPerCall + 1} values, more than \`maxReadsPerCall\` (${pipelineLimitDefaults.maxReadsPerCall}) allows`,
      data: { code: 'BAD_REQUEST' },
    });
    expect(over.calls).not.toHaveBeenCalled();
  });

  test('`true` refuses a follow-up more than 3 calls deep, or that reads an object, and the rest of the batch runs', async () => {
    // post 1, author 2, team 3, author 4
    const res = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: {
          author: {
            ...author,
            children: {
              team: {
                path: 'team',
                reads: [{ to: [], data: ['teamId'] }],
                children: {
                  author: node('author', [{ to: ['id'], data: ['id'] }]),
                },
              },
            },
          },
          whole: node('author', [{ to: ['id'], data: ['tags'] }]),
        },
      },
    });
    const { team } = res.json[0].children.author.children;
    expect(team.result.data).toEqual({ id: 'team-of-u1' });
    expect(team.children.author.error).toMatchObject({
      message: 'This call is nested 4 deep, more than `maxDepth` (3) allows',
      data: { code: 'BAD_REQUEST' },
    });
    expect(res.json[0].children.whole.error).toMatchObject({
      message:
        'A value this call reads is an object or an array, and `allowWholeValues` is false',
      data: { code: 'BAD_REQUEST' },
    });
    expect(res.calls.mock.calls).toEqual([
      ['author', { id: 'u1' }],
      ['team', 'team-of-u1'],
    ]);
  });

  test('an object sets the limits it has, raised or lowered', async () => {
    const error = async (
      count: number,
      allowPipelining: experimental_PipeliningOptions,
    ) =>
      (
        await get({
          ...defaults,
          path: 'post',
          allowPipelining,
          tree: reading(count),
        })
      ).json[0].children.author;
    expect((await error(20, { maxReadsPerCall: 20 })).result.data.id).toBe(
      'u1',
    );
    expect((await error(2, { maxReadsPerCall: 1 })).error.message).toBe(
      'This call reads 2 values, more than `maxReadsPerCall` (1) allows',
    );
    // `"u1"` is 4 characters of JSON
    expect((await error(1, { maxValueLength: 3 })).error.message).toBe(
      'A value this call reads is longer than `maxValueLength` (3 characters of JSON) allows',
    );
    // Two of them are 8
    expect((await error(2, { maxFillSize: 6 })).error.message).toBe(
      'What this call fills in goes over `maxFillSize` (6 characters of JSON for the batch)',
    );
  });

  /** A tag for every tag of the post */
  const tagOfEach = {
    0: { 'tags[]': { tag: node('tag', [{ to: ['id'], item: ['id'] }]) } },
  };

  test('every run of a follow-up for every item counts towards `maxBatchSize`', async () => {
    // The post, and a run for each of its two tags: three runs
    const within = await get({
      ...defaults,
      path: 'post',
      maxBatchSize: 3,
      tree: tagOfEach,
    });
    expect(within.json[0].children['tags[]']).toHaveLength(2);
    expect(within.calls).toHaveBeenCalledTimes(2);

    const over = await get({
      ...defaults,
      path: 'post',
      maxBatchSize: 2,
      tree: tagOfEach,
    });
    expect(over.json[0].result.data.slug).toBe('hello');
    const refused = {
      message: 'A call for every item exceeds the maximum batch size',
      data: { code: 'BAD_REQUEST' },
    };
    expect(over.json[0].children['tags[]']).toMatchObject([
      { tag: { error: refused } },
      { tag: { error: refused } },
    ]);
    // It ran for no item
    expect(over.calls).not.toHaveBeenCalled();
  });

  test('a follow-up that is refused takes none of `maxBatchSize` from the next', async () => {
    const tag = { tag: node('tag', [{ to: ['id'], item: ['id'] }]) };
    const res = await get({
      ...defaults,
      input: {},
      path: 'lists',
      maxBatchSize: 4,
      tree: { 0: { 'long[]': tag, 'short[]': tag } },
    });
    // The lists and four runs are over the limit. The lists and two are not
    expect(res.json[0].children['long[]'][0].tag.error.message).toBe(
      'A call for every item exceeds the maximum batch size',
    );
    expect(res.json[0].children['short[]']).toHaveLength(2);
    expect(res.calls).toHaveBeenCalledTimes(2);
  });

  test('filling in an input does not change the data that another follow-up reads', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      allowPipelining: { allowWholeValues: true },
      tree: {
        0: {
          // The whole post as the input, and then its slug replaced
          first: {
            path: 'post',
            reads: [
              { to: [], data: [] },
              { to: ['slug'], data: ['authorId'] },
            ],
          },
          second: node('post', [
            { to: ['other'], data: ['authorId'] },
            { to: ['slug'], data: ['slug'] },
          ]),
        },
      },
    });
    expect(res.json[0].children.first.result.data.slug).toBe('u1');
    // Not `u1`: the post's data is as it was sent
    expect(res.json[0].children.second.result.data.slug).toBe('hello');
  });

  test('a follow-up that changes its input does not change what the follow-ups under it read', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      allowPipelining: { allowWholeValues: true },
      tree: {
        0: {
          stamp: node('stamp', [{ to: ['tags'], data: ['tags'] }], {
            children: {
              // Reads the tags once the stamp has run
              tags: node('tags', [
                { to: ['after'], data: [] },
                { to: ['ids'], data: ['tags', null, 'id'], up: 2 },
              ]),
            },
          }),
        },
      },
    });
    const { stamp } = res.json[0].children;
    expect(stamp.result.data).toBe(3);
    expect(stamp.children.tags.result.data).toEqual(['t1', 't2']);
  });

  test('a run for an item that changes its input does not change what other runs and calls read', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      allowPipelining: { allowWholeValues: true },
      tree: {
        0: {
          'tags[]': {
            // Every run gets the whole list too
            stamp: node(
              'stamp',
              [
                { to: ['id'], item: ['id'] },
                { to: ['tags'], data: ['tags'] },
              ],
              {
                children: {
                  tags: node('tags', [
                    { to: ['after'], data: [] },
                    { to: ['ids'], data: ['tags', null, 'id'], up: 2 },
                  ]),
                },
              },
            ),
          },
        },
      },
    });
    expect(res.json[0].children['tags[]']).toEqual(
      Array.from({ length: 2 }, () => ({
        stamp: {
          result: { data: 3 },
          children: { tags: { result: { data: ['t1', 't2'] } } },
        },
      })),
    );
  });

  test('a run for an item that changes the input the client sent does not change it for other runs', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: {
          'tags[]': {
            stamp: {
              path: 'stamp',
              input: { tags: [] },
              reads: [{ to: ['id'], item: ['id'] }],
            },
          },
        },
      },
    });
    // Every run adds a tag to its own list
    expect(res.json[0].children['tags[]']).toEqual([
      { stamp: { result: { data: 1 } } },
      { stamp: { result: { data: 1 } } },
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
      `${ctx.httpUrl}/start?batch=tree&tree=${encodeURIComponent(
        JSON.stringify({
          0: {
            span: {
              path: 'span',
              input: { from: null, to: 5 },
              reads: [{ to: ['from'], data: ['at'] }],
            },
          },
        }),
      )}`,
    );
    expect((await res.json())[0].children.span).toEqual({
      result: { data: [1, 5] },
    });
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

    // What the client would send by itself
    const alone = await fetch(
      `${ctx.httpUrl}/since?input=${encodeURIComponent(
        JSON.stringify({ since: '2026-01-01T00:00:00.000Z' }),
      )}`,
    );
    expect(await alone.json()).toEqual({ result: { data: 2026 } });

    const res = await fetch(
      `${ctx.httpUrl}/post?batch=tree&tree=${encodeURIComponent(
        JSON.stringify({
          0: {
            since: node('since', [{ to: ['since'], data: ['publishedAt'] }]),
          },
        }),
      )}`,
    );
    expect((await res.json())[0].children.since).toEqual({
      result: { data: 2026 },
    });
  });

  test('`batch=tree` without a `tree` is an ordinary batch', async () => {
    const { appRouter } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const res = await fetch(
      `${ctx.httpUrl}/post,author?batch=tree&input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u2' } }),
      )}`,
    );
    const json = await res.json();
    expect(json[0].result.data.slug).toBe('hello');
    expect(json[1].result.data.id).toBe('u2');
    expect(json[0]).not.toHaveProperty('children');
  });

  test('a list key under a failed call, or over what is no list, runs for none', async () => {
    const failed = await get({
      ...defaults,
      input: { 0: { slug: 'missing' } },
      path: 'post',
      tree: tagOfEach,
    });
    expect(failed.json[0].error.data.code).toBe('NOT_FOUND');
    expect(failed.json[0].children['tags[]'].error.data.code).toBe(
      'PRECONDITION_FAILED',
    );
    expect(failed.calls).not.toHaveBeenCalled();

    const noList = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: { 'slug[]': { tag: node('tag', [{ to: ['id'], item: ['id'] }]) } },
      },
    });
    expect(noList.json[0].children['slug[]']).toEqual([]);
    expect(noList.calls).not.toHaveBeenCalled();
  });

  test('a call whose data is `undefined` gives the follow-ups that read it nothing', async () => {
    const res = await get({
      ...defaults,
      input: {},
      path: 'nothing',
      tree: { 0: { author: node('author', [{ to: ['id'], data: [] }]) } },
    });
    // The author's input has no id, and fails to validate
    expect(res.json[0].children.author.error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a follow-up still validates its input', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      allowPipelining: { allowWholeValues: true },
      tree: { 0: { author: node('author', [{ to: ['id'], data: ['tags'] }]) } },
    });
    expect(res.json[0].children.author.error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('reads own properties only', async () => {
    const res = await get({
      ...defaults,
      path: 'post',
      tree: {
        0: {
          author: node('author', [
            { to: ['id'], data: ['authorId'] },
            { to: ['since'], data: ['secret', 'inherited'] },
            { to: ['__proto__'], data: ['constructor'] },
          ]),
        },
      },
    });
    expect(res.json[0].children.author.result.data).toEqual({
      id: 'u1',
      teamId: 'team-of-u1',
    });
    expect(res.calls.mock.calls[0]![1]).toEqual({ id: 'u1' });
  });

  test.each([
    [
      'a read of data above the top-level call',
      { 0: { author: node('author', [{ to: ['id'], data: [], up: 2 }]) } },
    ],
    [
      'a read of an item outside a list',
      { 0: { author: node('author', [{ to: ['id'], item: [] }]) } },
    ],
    ['a call that is not in the batch', { 2: { author } }],
    [
      'paths that are not strings',
      { 0: { author: node('author', [{ to: [1], data: [] }]) } },
    ],
    [
      'reads that are no list',
      { 0: { author: { path: 'author', reads: { to: [], data: [] } } } },
    ],
    ['a key that is no key', { 0: { 'a..b[]': {} } }],
    ['something that is not an object', 'nope'],
  ])('rejects %s', async (_name, tree) => {
    const res = await get({ ...defaults, path: 'post', tree });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/^Invalid "tree"/);
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('rejects a `tree` that is not JSON', async () => {
    const res = await get({ ...defaults, path: 'post', tree: '{nope' });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toBe('Invalid "tree": not JSON');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a POST has it in its body, beside the inputs', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true, allowMethodOverride: true },
    });
    const post = (body: unknown) =>
      fetch(`${ctx.httpUrl}/post?batch=tree`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const res = await post({ 0: { slug: 'hello' }, tree: { 0: { author } } });
    expect((await res.json())[0].children.author).toEqual({
      result: { data: { id: 'u1', teamId: 'team-of-u1' } },
    });

    calls.mockClear();
    const invalid = await post({ 0: { slug: 'hello' }, tree: { 1: {} } });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.message).toMatch(/^Invalid "tree"/);
    expect(calls).not.toHaveBeenCalled();
  });

  test('rejects a batch of mutations', async () => {
    const { appRouter } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
    });
    const res = await fetch(`${ctx.httpUrl}/rename,rename?batch=tree`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 0: { id: 'a' }, 1: { id: 'b' }, tree: {} }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(
      'Only a batch of queries can be pipelined',
    );
  });

  test('`responseMeta` gets the errors of follow-ups too', async () => {
    const { appRouter } = createRouter('none');
    const responseMeta = vi.fn(() => ({}));
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true, responseMeta },
    });
    await fetch(
      `${ctx.httpUrl}/post?batch=tree&input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' } }),
      )}&tree=${encodeURIComponent(
        JSON.stringify({
          0: { author: node('author', [{ to: ['id'], data: ['missing'] }]) },
        }),
      )}`,
    );
    expect(responseMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [expect.objectContaining({ code: 'BAD_REQUEST' })],
      }),
    );
  });

  test('a follow-up runs with the context of the top-level calls, and is no call in `info.calls`', async () => {
    const t = initTRPC.context<{ calls: string[] }>().create();
    const appRouter = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1' })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .use(async (opts) => {
          // What `getRawInput()` gives a follow-up: its filled-in input
          expect(await opts.getRawInput()).toEqual({ id: 'u1' });
          return opts.next();
        })
        .query((opts) => opts.ctx.calls),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: {
        experimental_allowPipelining: true,
        createContext: (opts) => ({
          calls: opts.info.calls.map((call) => call.path),
        }),
      },
    });
    const res = await fetch(
      `${ctx.httpUrl}/post?batch=tree&tree=${encodeURIComponent(
        JSON.stringify({ 0: { author } }),
      )}`,
    );
    expect((await res.json())[0].children.author).toEqual({
      result: { data: ['post'] },
    });
  });
});

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)('`loggerLink` before $name', (scenario) => {
  function setup(opts: { pipelining: boolean; maxItems: number }) {
    const { appRouter } = createRouter('none');
    /** The first line of every log */
    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
    };
    const ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          loggerLink({
            console: { log, error: log },
            colorMode: 'none',
            withContext: false,
          }),
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: opts.pipelining
              ? experimental_pipelining()
              : undefined,
            maxItems: opts.maxItems,
          }),
        ],
      }),
    });
    return Object.assign(ctx, { lines, untyped: getUntypedClient(ctx.client) });
  }

  /** A post, with its author and the author's team in its request */
  function postWithCalls(ctx: ReturnType<typeof setup>) {
    const post = createOperationPipeline();
    const result = ctx.untyped.query(
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
    assert(
      pipeCall({
        path: 'team',
        input: undefined,
        reads: [{ to: [], from: author, path: ['teamId'], each: false }],
      }),
    );
    return result;
  }

  test("names the calls that went in an operation's request, on both of its lines", async () => {
    await using ctx = setup({ pipelining: true, maxItems: Infinity });

    const result = postWithCalls(ctx);
    // They are known when the request goes, so the line waits for it
    expect(ctx.lines).toEqual([]);
    await result;

    expect(ctx.lines).toEqual([
      expect.stringMatching(/^>> query #\d+ post \(\+ author, team\)$/),
      expect.stringMatching(/^<< query #\d+ post \(\+ author, team\)$/),
    ]);
  });

  test('names no call that did not fit in the request', async () => {
    // The post and its author
    await using ctx = setup({ pipelining: true, maxItems: 2 });

    await postWithCalls(ctx);

    expect(ctx.lines).toEqual([
      expect.stringMatching(/^>> query #\d+ post \(\+ author\)$/),
      expect.stringMatching(/^<< query #\d+ post \(\+ author\)$/),
    ]);
  });

  test('logs an operation with a pipeline as it starts, if no link takes calls in its request', async () => {
    await using ctx = setup({ pipelining: false, maxItems: Infinity });

    const post = createOperationPipeline();
    const result = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    expect(ctx.lines).toEqual([expect.stringMatching(/^>> query #\d+ post$/)]);
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: [{ to: ['id'], from: post, path: ['authorId'], each: false }],
      }),
    ).toBeNull();
    await result;

    expect(ctx.lines).toEqual([
      expect.stringMatching(/^>> query #\d+ post$/),
      expect.stringMatching(/^<< query #\d+ post$/),
    ]);
  });
});
