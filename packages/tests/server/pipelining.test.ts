import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { Operation, TRPCLink } from '@trpc/client';
import {
  experimental_dataOf,
  experimental_load,
  experimental_pipelining,
  experimental_query,
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
  retryLink,
} from '@trpc/client';
import type { PipelineSource } from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  pipeCall,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import type {
  AnyRouter,
  experimental_PipelineEvent,
  experimental_PipelinePolicy,
} from '@trpc/server';
import {
  experimental_pipelineBudget,
  experimental_TRPCPipelineRefusal,
  initTRPC,
  TRPCError,
} from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { observable } from '@trpc/server/observable';
import type {
  PipelineCallReads,
  PipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  isObject,
  makeResource,
  pipelineBudgetDefaults,
  readPipelinedItem,
} from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';

/** What a call reads of the data of others */
function whole(
  ...reads: { to: string[]; from: PipelineSource; path: PipelinePath }[]
): PipelineCallReads<PipelineSource> {
  return {
    each: null,
    reads: reads.map((read) => ({ kind: 'whole', ...read })),
  };
}

/** What a call for every item of a list reads of each item */
function eachItem(
  list: { from: PipelineSource; path: PipelinePath },
  ...reads: { to: string[]; path: PipelinePath }[]
): PipelineCallReads<PipelineSource> {
  return {
    each: list,
    reads: reads.map((read) => ({ kind: 'item', ...read })),
  };
}

const createRouter = (transformer: 'none' | 'superjson') => {
  const t =
    transformer === 'superjson'
      ? initTRPC.create({ transformer: superjson })
      : initTRPC.create();
  const calls = vi.fn();
  /** The runs of `post`, which most requests start with */
  const posts = vi.fn();
  const appRouter = t.router({
    post: t.procedure.input(z.object({ slug: z.string() })).query((opts) => {
      posts(opts.input);
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
    // No input parser: nothing reads its input but the pipeline
    unread: t.procedure.query(() => {
      calls('unread', undefined);
      return 3;
    }),
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
  return { appRouter, calls, posts };
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
    const { appRouter, calls, posts } = createRouter(scenario.transformer);
    /** What the links before the batch link see */
    const ops: Pick<Operation, 'path' | 'input'>[] = [];
    const recordLink: TRPCLink<AnyRouter> = () => (linkOpts) => {
      ops.push({ path: linkOpts.op.path, input: linkOpts.op.input });
      return linkOpts.next(linkOpts.op);
    };
    const ctx = testServerAndClientResource(appRouter, {
      server: {
        // Some calls here read a whole value, such as a list of tags
        experimental_allowPipelining:
          opts.allowPipelining &&
          experimental_pipelineBudget({ allowWholeValues: true }),
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
      posts,
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
      reads: whole(
        { to: ['id'], from: post, path: ['authorId'] },
        { to: ['since'], from: post, path: ['publishedAt'] },
      ),
    });
    assert(author);
    // A call reads another call
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: author, path: ['teamId'] }),
    });
    const tags = pipeCall({
      path: 'tags',
      input: { ids: [undefined, 'extra'] },
      reads: whole({
        to: ['ids', '0'],
        from: post,
        path: ['tags', '1', 'id'],
      }),
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
      reads: whole({ to: ['ids'], from: post, path: ['tags', null, 'id'] }),
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
      reads: eachItem(
        { from: post, path: ['tags'] },
        { to: ['id'], path: ['id'] },
      ),
    });
    assert(tag);
    await postResult;

    const at =
      scenario.transformer === 'superjson'
        ? new Date('2026-02-02T00:00:00Z')
        : '2026-02-02T00:00:00.000Z';
    const { data } = await tag.result;
    expect(await readPipelinedItem(data, [0])).toEqual({
      kind: 'data',
      data: { id: 't1', at },
    });
    expect(await readPipelinedItem(data, [1])).toMatchObject({
      kind: 'error',
      error: { data: { code: 'FORBIDDEN' } },
    });
    expect(await readPipelinedItem(data, [2])).toEqual({ kind: 'missing' });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a call that reads a call for every item runs for every item too, and each run has its own outcome', async () => {
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
      reads: eachItem(
        { from: post, path: ['tags'] },
        { to: ['id'], path: ['id'] },
      ),
    });
    assert(tag);
    // In the frame of `tag`: once for each of its runs
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: tag, path: ['id'] }),
    });
    assert(team);
    await postResult;

    const { data } = await team.result;
    expect(await readPipelinedItem(data, [0])).toEqual({
      kind: 'data',
      data: { id: 't1' },
    });
    // The run of `tag` it reads failed
    expect(await readPipelinedItem(data, [1])).toMatchObject({
      kind: 'error',
      error: { data: { code: 'PRECONDITION_FAILED' } },
    });
    expect(ctx.calls.mock.calls.filter(([path]) => path === 'team')).toEqual([
      ['team', 't1'],
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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
      // Nothing ran: not the post, and no call with a hole in its input
      expect(ctx.posts).not.toHaveBeenCalled();
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: author, path: ['teamId'] }),
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: author, path: ['teamId'] }),
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

  test("a call that would make the request go over the link's `maxItems` is not made: the server would refuse the whole request", async () => {
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);
    const team = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: author, path: ['teamId'] }),
    });
    assert(team);

    await postResult;
    expect(await author.result).toEqual({
      data: { id: 'u1', teamId: 'team-of-u1' },
    });
    await expect(team.result).rejects.toThrow(
      'The call did not fit in the request of what it reads',
    );
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a link that pipelines sends at most 100 calls in a request without `maxItems`, as many as a server takes without `maxBatchSize`', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const results = await Promise.all(
      Array.from({ length: 101 }, () =>
        ctx.untyped.query('post', { slug: 'hello' }),
      ),
    );

    expect(results).toHaveLength(101);
    expect(
      ctx.onRequestSpy.mock.calls.map(
        ([req]) => req.url?.split('?')[0]?.split(',').length,
      ),
      // The requests reach the server in either order
    ).toEqual(expect.arrayContaining([100, 1]));
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(2);
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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
    const reads = (count: number): PipelineCallReads<PipelineSource> => ({
      each: null,
      // Not spread into `whole`: that many arguments overflow the stack
      reads: Array.from({ length: count }, () => ({
        kind: 'whole' as const,
        to: ['id'],
        from: post,
        path: ['authorId'],
      })),
    });
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: reads(pipelineBudgetDefaults.maxReadsPerCall + 1),
      }),
    ).toBeNull();
    // So many that counting how deep the call is could overflow the stack
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: reads(200_000),
      }),
    ).toBeNull();
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: reads(pipelineBudgetDefaults.maxReadsPerCall),
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

  test('a call deeper in a chain than the default policy takes is not added', async () => {
    /** A chain of 4: post, author, team and team again. What the 4th is */
    async function chain() {
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      const team = pipeCall({
        path: 'team',
        input: undefined,
        reads: whole({ to: [], from: author, path: ['teamId'] }),
      });
      assert(team);
      const fourth = pipeCall({
        path: 'team',
        input: undefined,
        reads: whole({ to: [], from: team, path: ['id'] }),
      });
      await postResult;
      expect(await team.result).toEqual({ data: { id: 'team-of-u1' } });
      return fourth && (await fourth.result.catch((error: Error) => error));
    }
    expect(await chain()).toBeNull();
  });

  test('a call whose reads a server would refuse is not added: the request of what it reads goes without it', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });
    const post = createOperationPipeline();
    const postResult = ctx.untyped.query(
      'post',
      { slug: 'hello' },
      { context: pipelineContext(post) },
    );
    // An item, without a list to have it
    expect(
      pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: { each: null, reads: [{ kind: 'item', to: ['id'], path: [] }] },
      }),
    ).toBeNull();
    // The runs for the items of two lists
    const tags = pipeCall({
      path: 'tag',
      input: { id: undefined },
      reads: eachItem({ from: post, path: ['tags'] }, { to: ['id'], path: [] }),
    });
    const related = pipeCall({
      path: 'tag',
      input: { id: undefined },
      reads: eachItem(
        { from: post, path: ['related'] },
        { to: ['id'], path: [] },
      ),
    });
    assert(tags && related);
    expect(
      pipeCall({
        path: 'author',
        input: {},
        reads: whole(
          { to: ['a'], from: tags, path: [] },
          { to: ['b'], from: related, path: [] },
        ),
      }),
    ).toBeNull();
    // The server would have refused either. The request goes with the calls
    // for every item, and without the call that reads both
    expect(await postResult).toMatchObject({ authorId: 'u1' });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.onRequestSpy.mock.calls[0]?.[0].url).toContain(
      '/post,tag,tag?batch=pipeline',
    );
  });

  test.each([
    { name: 'no object', value: 'pipeline' },
    { name: 'an object that is no pipeline', value: { open: 'yes' } },
    { name: 'a pipeline without a list of calls', value: { open: true } },
    {
      name: 'a pipeline that can not be told what was sent',
      value: { open: false, calls: [], sent: Promise.resolve([]) },
    },
    {
      name: 'a pipeline without what runs as it opens',
      value: {
        open: false,
        calls: [],
        sent: Promise.resolve([]),
        settleSent: () => undefined,
      },
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
    'an answer with no result for a call leaves that call `unresolved`, as one that breaks off does: the client never had its result',
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      expect(await postResult).toMatchObject({ slug: 'hello' });
      await expect(author.result).rejects.toThrow(
        'The server sent no result for a pipelined call',
      );
      expect(author.status).toBe('unresolved');
    },
  );

  test.runIf(scenario.link === httpBatchLink).each([
    { answer: null, name: '`null`' },
    { answer: {}, name: 'an object with neither a result nor an error' },
  ])(
    'an answer with $name for an operation says nothing of whether it failed: a call that reads it keeps the error the server sent it',
    async ({ answer }) => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const results: unknown[] = await res.json();
          return Response.json([answer, ...results.slice(1)], res);
        },
      });
      const post = createOperationPipeline();
      const postResult = ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      // `t2` is forbidden
      const tag = pipeCall({
        path: 'tag',
        input: { id: undefined },
        reads: whole({ to: ['id'], from: post, path: ['tags', '1', 'id'] }),
      });
      assert(tag);
      await expect(postResult).rejects.toThrow();
      await expect(tag.result).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      expect(tag.status).toBe('sent');
    },
  );

  test.runIf(scenario.link === httpBatchLink)(
    'an answer with `null` for a call fails that call: it is no envelope, and the client had it',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const results: unknown[] = await res.json();
          return Response.json([results[0], null], res);
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      expect(await postResult).toMatchObject({ slug: 'hello' });
      await expect(author.result).rejects.toThrow(
        'The server sent no result for a pipelined call',
      );
      expect(author.status).toBe('sent');
    },
  );

  test.runIf(scenario.link === httpBatchStreamLink)(
    'a streamed answer with `null` for a call fails that call, as `httpBatchLink` does: it is no envelope, and the client had it',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        // The head of the stream with `null` for the second call
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const [head = '', ...rest] = (await res.text()).split('\n');
          const line = JSON.parse(head) as Record<string, unknown>;
          // superjson writes it under `json`
          const values = (
            scenario.transformer === 'superjson' ? line['json'] : line
          ) as Record<string, unknown>;
          values['1'] = [[null]];
          return new Response([JSON.stringify(line), ...rest].join('\n'), {
            status: res.status,
            headers: res.headers,
          });
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      expect(await postResult).toMatchObject({ slug: 'hello' });
      await expect(author.result).rejects.toThrow(
        'The server sent no result for a pipelined call',
      );
      expect(author.status).toBe('sent');
    },
  );

  test.runIf(scenario.link === httpBatchLink)(
    'an answer with `null` for an operation fails that operation alone: its calls keep their results, and nothing rejects unhandled',
    async () => {
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const results: unknown[] = await res.json();
          return Response.json([null, ...results.slice(1)], res);
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      await expect(postResult).rejects.toThrow();
      expect(await author.result).toEqual({
        data: { id: 'u1', teamId: 'team-of-u1' },
      });
    },
  );

  test.runIf(scenario.link === httpBatchStreamLink)(
    'a response that breaks off fails what it had no result for: such calls are `unresolved`, as the client never had their results',
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      await expect(postResult).rejects.toThrow('The connection broke');
      await expect(author.result).rejects.toThrow('The connection broke');
      expect(author.status).toBe('unresolved');
      // The server ran it: this `fetch` read the whole response before it
      // broke it off. `unresolved` is about what the client was sent, so a
      // call that wants it asks for it again
      expect(ctx.calls).toHaveBeenCalledWith('author', { id: 'u1' });
    },
  );

  test.runIf(scenario.link === httpBatchStreamLink)(
    'a response that breaks off after the operation it reads arrived leaves a call `unresolved` too: the client never had its result',
    async () => {
      /** Once the operation has its result: then the response breaks off */
      const delivered = createDeferred<void>();
      await using ctx = setup({
        allowPipelining: true,
        pipelining: true,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const lines = (await res.text()).split('\n');
          // Everything up to the author's data, which never comes
          const until = lines.findIndex((line) => line.includes('team-of-u1'));
          expect(until).toBeGreaterThan(0);
          const sent = new TextEncoder().encode(
            lines.slice(0, until).join('\n') + '\n',
          );
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(sent);
              },
              async pull(controller) {
                await delivered.promise;
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);
      // Also when the test fails: the response must end
      using _break = makeResource({}, () => delivered.resolve());
      // Bounded: if the operation waited for the author, this fails rather
      // than hangs, and the response then breaks off
      const settled = vi.fn();
      void postResult.then(settled, settled);
      await vi.waitFor(() => expect(settled).toHaveBeenCalled());
      expect(await postResult).toMatchObject({ authorId: 'u1' });
      delivered.resolve();
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

  test('an answer that is no error and not by index is no result of a call the server makes', async () => {
    const fetch = async () =>
      Response.json(
        {
          result: {
            data:
              scenario.transformer === 'superjson'
                ? superjson.serialize('maintenance')
                : 'maintenance',
          },
        },
        { status: 503 },
      );
    await using ctx = setup({ allowPipelining: true, pipelining: true, fetch });
    await using without = setup({
      allowPipelining: true,
      pipelining: false,
      fetch,
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);

    // The operation gets the answer as it would without pipelining
    const expected = await without.untyped.query('post', { slug: 'hello' });
    expect(expected).toBeTruthy();
    expect(await postResult).toEqual(expected);
    await expect(author.result).rejects.toThrow(
      'The server sent no result for a pipelined call',
    );
  });

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
      reads: whole(
        { to: ['id'], from: first, path: ['authorId'] },
        { to: ['since'], from: second, path: ['slug'] },
      ),
    });
    // Reads the first post. Two requests would have room for it, and none
    // for the call above: one call either way
    const one = pipeCall({
      path: 'team',
      input: undefined,
      reads: whole({ to: [], from: first, path: ['authorId'] }),
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
      reads: whole(
        { to: ['id'], from: first, path: ['authorId'] },
        { to: ['since'], from: second, path: ['slug'] },
      ),
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
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

describe.each([
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: Infinity,
    refuses: 'throws',
  },
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: 2000,
    refuses: 'throws',
  },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    maxURLLength: Infinity,
    refuses: 'throws',
  },
  // What it makes of the input is something JSON can't carry
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: Infinity,
    refuses: 'cyclic',
  },
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: 2000,
    refuses: 'cyclic',
  },
  // JSON can carry it by itself, but not inside the request's batch
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: Infinity,
    refuses: 'keyed',
  },
  {
    name: 'httpBatchLink',
    link: httpBatchLink,
    maxURLLength: 2000,
    refuses: 'keyed',
  },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    maxURLLength: Infinity,
    refuses: 'keyed',
  },
] as const)(
  '$name, with a `maxURLLength` of $maxURLLength, and a transformer that refuses an input still missing a value ($refuses)',
  (scenario) => {
    test('the call that reads it is not added: the request of what it reads goes without it', async () => {
      /** Refuses an input with an `id` that is `undefined` */
      const strict = {
        serialize: (value: unknown) => {
          if (isObject(value) && 'id' in value && value['id'] === undefined) {
            if (scenario.refuses === 'throws') {
              throw new Error('An id is missing');
            }
            if (scenario.refuses === 'keyed') {
              return {
                toJSON: (key: string) => (key === '' ? { id: null } : 1n),
              };
            }
            const cyclic: Record<string, unknown> = {};
            cyclic['self'] = cyclic;
            return cyclic;
          }
          return value;
        },
        deserialize: (value: unknown) => value,
      };
      const t = initTRPC.create({ transformer: strict });
      const appRouter = t.router({
        post: t.procedure
          .input(z.object({ slug: z.string() }))
          .query((opts) => ({ slug: opts.input.slug, authorId: 'u1' })),
        author: t.procedure
          .input(z.object({ id: z.string() }))
          .query((opts) => ({ id: opts.input.id })),
      });
      await using ctx = testServerAndClientResource(appRouter, {
        server: { experimental_allowPipelining: true },
        client: (clientOpts) => ({
          links: [
            scenario.link({
              url: clientOpts.httpUrl,
              transformer: strict,
              maxURLLength: scenario.maxURLLength,
              experimental_pipelining: experimental_pipelining(),
            }),
          ],
        }),
      });
      const untyped = getUntypedClient(ctx.client);

      const post = createOperationPipeline();
      const postResult = untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      );
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);

      // The post still loads, with the id the author can then be fetched by
      expect(await postResult).toEqual({ slug: 'hello', authorId: 'u1' });
      await expect(author.result).rejects.toThrow(
        'The call did not fit in the request of what it reads',
      );
      expect(
        ctx.onRequestSpy.mock.calls.map(([req]) => req.url?.split('?')[0]),
      ).toEqual(['/post']);
    });
  },
);

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)('$name, when an operation is sent again', (scenario) => {
  test("a call added for the new attempt goes in its request: the old attempt doesn't end it", async () => {
    const t = initTRPC.create();
    let postRuns = 0;
    const appRouter = t.router({
      post: t.procedure.query(() => {
        postRuns += 1;
        if (postRuns === 1) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        return { authorId: 'u1' };
      }),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    const post = createOperationPipeline();
    let attempts = 0;
    // Set in a callback, so TypeScript can't narrow it from its first value
    let author = null as ReturnType<typeof pipeCall>;
    /** Adds the call once the operation is sent again, as it is sent */
    const addOnRetry: TRPCLink<AnyRouter> = () => (linkOpts) =>
      observable((observer) => {
        const subscription = linkOpts.next(linkOpts.op).subscribe(observer);
        attempts += 1;
        if (attempts === 2) {
          author = pipeCall({
            path: 'author',
            input: { id: undefined },
            reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
          });
        }
        return subscription;
      });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          // Sent again at once, while the first attempt ends
          retryLink({ retry: (opts) => opts.attempts <= 1 }),
          addOnRetry,
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });

    const postResult = await getUntypedClient(ctx.client).query(
      'post',
      undefined,
      { context: pipelineContext(post) },
    );

    expect(postResult).toEqual({ authorId: 'u1' });
    assert(author);
    expect(await author.result).toEqual({
      data: { id: 'u1' },
    });
  });
});

describe('httpBatchStreamLink, when an operation fails', () => {
  test('the response is read on for the calls that read it: each gets its own error, not the end of the response', async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.procedure.query((): { authorId: string } => {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    /** Lets the line with the author's error through */
    const release = createDeferred<void>();
    // Set in a callback, so TypeScript can't narrow it from its first value
    let signal = null as AbortSignal | null;
    /** The server's response, held back from the author's error on */
    const heldBack: typeof fetch = async (url, init) => {
      const res = await fetch(url, init);
      const lines = (await res.text()).split('\n');
      const encoder = new TextEncoder();
      signal = init?.signal ?? null;
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const [index, line] of lines.entries()) {
            if (line.includes('PRECONDITION_FAILED')) {
              await release.promise;
            }
            controller.enqueue(
              encoder.encode(index < lines.length - 1 ? `${line}\n` : line),
            );
          }
          controller.close();
        },
      });
      return new Response(body, { status: res.status, headers: res.headers });
    };
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchStreamLink({
            url: clientOpts.httpUrl,
            fetch: heldBack,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    // Let through before the server goes, also when an assertion fails
    using _released = makeResource({}, () => release.resolve());
    const post = createOperationPipeline();
    const postResult = getUntypedClient(ctx.client).query('post', undefined, {
      context: pipelineContext(post),
    });
    const author = pipeCall({
      path: 'author',
      input: { id: undefined },
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);

    await expect(postResult).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
    assert(signal);
    // The post's error didn't end the response
    expect(signal.aborted).toBe(false);
    release.resolve();
    await expect(author.result).rejects.toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    });
  });
});

describe('httpBatchStreamLink, a call that has all of its result', () => {
  test('lets go of the request: a streamed query cancelled in the same batch stops on the server', async () => {
    const t = initTRPC.create();
    // Set in a callback, so TypeScript can't narrow it from its first value
    let tickSignal = null as AbortSignal | null;
    const appRouter = t.router({
      post: t.procedure.query(() => ({ authorId: 'ada' })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
      ticks: t.procedure.query(async function* (opts) {
        tickSignal = opts.signal ?? null;
        for (let i = 0; ; i++) {
          yield i;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchStreamLink({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const c = ctx.client;
    const streamed = new AbortController();
    const post = experimental_query(c.post);
    const res = experimental_load(c, {
      post,
      author: experimental_query(c.author, {
        id: experimental_dataOf(post).authorId,
      }),
    });
    const ticks = c.ticks.query(undefined, { signal: streamed.signal });

    expect(await res.author).toEqual({ id: 'ada' });
    const seen: number[] = [];
    await expect(async () => {
      for await (const tick of await ticks) {
        seen.push(tick);
        if (tick === 2) streamed.abort();
        if (tick === 10) break;
      }
    }).rejects.toThrow();
    expect(seen).toEqual([0, 1, 2]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    // The server must see the cancellation and stop the procedure
    await vi.waitFor(() => expect(tickSignal?.aborted).toBe(true));
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
      reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
    });
    assert(author);
    await expect(postResult).rejects.toThrow(
      'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true`',
    );
  });
});

describe('a server without `experimental_allowPipelining`', () => {
  test('answers an ordinary batch as it did before: `pipe` means nothing. A pipelined batch is a bad request', async () => {
    const { appRouter, calls, posts } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { allowMethodOverride: true },
    });
    const input = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { id: 'u9' } }),
    );
    const pipe = encodeURIComponent(
      JSON.stringify({
        1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
      }),
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

    // A pipelined batch: nothing of it runs, and the answer says why
    calls.mockClear();
    posts.mockClear();
    const pipelined = await fetch(
      `${ctx.httpUrl}/post,author?batch=pipeline&input=${input}&pipe=${pipe}`,
    );
    expect(pipelined.status).toBe(400);
    expect((await pipelined.json()).error.message).toBe(
      'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
    );
    const pipelinedPost = await fetch(
      `${ctx.httpUrl}/post,author?batch=pipeline`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 0: { slug: 'hello' }, 1: {}, pipe: {} }),
      },
    );
    expect(pipelinedPost.status).toBe(400);
    expect(posts).not.toHaveBeenCalled();
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

describe('the `pipe` search param', () => {
  async function get(
    search: string,
    opts: {
      path: string;
      allowPipelining: true | experimental_PipelinePolicy;
    },
  ) {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: opts.allowPipelining },
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
      pipe({ 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } }),
      { path: 'post,author', allowPipelining: true },
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
          1: { reads: [{ to: ['ids'], from: 0, path: ['tags', null, 'id'] }] },
        }),
      )}`,
      {
        path: 'post,tags',
        allowPipelining: experimental_pipelineBudget({
          allowWholeValues: true,
        }),
      },
    );
    expect(res.json[1]).toEqual({ result: { data: ['t1', 't2'] } });

    // Not an array: nothing to read
    const notAnArray = await get(
      `input=${tagsInput}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: { reads: [{ to: ['ids'], from: 0, path: ['slug', null, 'id'] }] },
        }),
      )}`,
      {
        path: 'post,tags',
        allowPipelining: experimental_pipelineBudget({
          allowWholeValues: true,
        }),
      },
    );
    expect(notAnArray.json[1].error.data.code).toBe('BAD_REQUEST');
  });

  test('`each` runs a call for every item of a list', async () => {
    const eachInput = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: { ids: [null, 'extra'] } }),
    );
    const each = (call: unknown) =>
      get(
        `input=${eachInput}&pipe=${encodeURIComponent(JSON.stringify({ 1: call }))}`,
        {
          path: 'post,tags',
          allowPipelining: experimental_pipelineBudget({
            allowWholeValues: true,
          }),
        },
      );

    const res = await each({
      each: { from: 0, path: ['tags'] },
      reads: [{ to: ['ids', '0'], path: ['id'] }],
    });
    expect(res.json[1]).toEqual({
      items: {
        0: { result: { data: ['t1', 'extra'] } },
        1: { result: { data: ['t2', 'extra'] } },
      },
    });

    // Every run validates its own input
    const invalid = await each({
      each: { from: 0, path: ['tags'] },
      reads: [{ to: ['ids', '0'], path: [] }],
    });
    expect(
      Object.values(invalid.json[1].items).map(
        (item: any) => item.error.data.code,
      ),
    ).toEqual(['BAD_REQUEST', 'BAD_REQUEST']);

    // What isn't a list has no items
    const noList = await each({
      each: { from: 0, path: ['slug'] },
      reads: [{ to: ['ids', '0'], path: [] }],
    });
    expect(noList.json[1]).toEqual({ items: {} });

    // An item, without a list to have it
    const noEach = await each({ reads: [{ to: ['ids', '0'], path: [] }] });
    expect(noEach.json.error.message).toBe(
      'Invalid "pipe": call 1 reads an item without "each", or has no "from"',
    );
  });

  test('a run of a call for every item that returns a stream fails by itself', async () => {
    const eachInput = encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {} }),
    );
    const res = await get(
      `input=${eachInput}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        }),
      )}`,
      { path: 'post,ticks', allowPipelining: true },
    );
    // Not `{}`, which is what a stream inside a list would be sent as
    expect(
      Object.values(res.json[1].items).map((item: any) => item.error.data.code),
    ).toEqual(['UNSUPPORTED_MEDIA_TYPE', 'UNSUPPORTED_MEDIA_TYPE']);
  });

  test('a call whose data the response can not carry is not read: the call that reads it does not run', async () => {
    const search = `input=${encodeURIComponent(
      JSON.stringify({ 1: {} }),
    )}&pipe=${encodeURIComponent(
      JSON.stringify({
        1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
      }),
    )}`;
    const res = await get(search, {
      path: 'feed,author',
      allowPipelining: true,
    });
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
          1: {
            reads: [{ to: ['ids', 'length'], from: 0, path: ['authorId'] }],
          },
        }),
      )}`,
      { path: 'post,tags', allowPipelining: true },
    );
    expect(res.json[1].error).toMatchObject({
      message: 'Invalid "pipe": the input has nothing at "ids.length"',
      data: { code: 'BAD_REQUEST' },
    });
  });

  test('a call can read so many values, and no more', async () => {
    const reads = (count: number) =>
      pipe({
        1: {
          reads: Array.from({ length: count }, () => ({
            to: ['id'],
            from: 0,
            path: ['authorId'],
          })),
        },
      });
    const within = await get(reads(pipelineBudgetDefaults.maxReadsPerCall), {
      path: 'post,author',
      allowPipelining: true,
    });
    expect(within.json[1].result.data.id).toBe('u1');

    const over = await get(reads(pipelineBudgetDefaults.maxReadsPerCall + 1), {
      path: 'post,author',
      allowPipelining: true,
    });
    // The call is refused, and the rest of the batch runs
    expect(over.status).toBe(207);
    expect(over.json[0].result.data.slug).toBe('hello');
    expect(over.json[1].error).toMatchObject({
      message: `This call reads ${pipelineBudgetDefaults.maxReadsPerCall + 1} values, more than \`maxReadsPerCall\` (${pipelineBudgetDefaults.maxReadsPerCall}) allows`,
      data: { code: 'BAD_REQUEST' },
    });
    expect(over.calls).not.toHaveBeenCalled();
  });

  test('a call to a procedure without an input parser is refused, or does not run, as any other', async () => {
    const over = await get(
      pipe({
        1: {
          reads: [
            { to: ['a'], from: 0, path: ['authorId'] },
            { to: ['b'], from: 0, path: ['authorId'] },
          ],
        },
      }),
      {
        path: 'post,unread',
        allowPipelining: experimental_pipelineBudget({ maxReadsPerCall: 1 }),
      },
    );
    expect(over.json[1].error).toMatchObject({
      message:
        'This call reads 2 values, more than `maxReadsPerCall` (1) allows',
      data: { code: 'BAD_REQUEST' },
    });
    expect(over.calls).not.toHaveBeenCalled();

    const afterFailed = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'missing' }, 1: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
        }),
      )}`,
      { path: 'post,unread', allowPipelining: true },
    );
    expect(afterFailed.json[1].error).toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    });
    expect(afterFailed.calls).not.toHaveBeenCalled();
  });

  test('`true` refuses a call more than 3 calls deep, or that reads an object, and the rest of the batch runs', async () => {
    // post 1, author 2, team 3, author 4
    const search = `input=${encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {}, 4: {} }),
    )}&pipe=${encodeURIComponent(
      JSON.stringify({
        1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
        2: { reads: [{ to: [], from: 1, path: ['teamId'] }] },
        3: { reads: [{ to: ['id'], from: 2, path: ['id'] }] },
        4: { reads: [{ to: ['id'], from: 0, path: ['tags'] }] },
      }),
    )}`;
    const res = await get(search, {
      path: 'post,author,team,author,author',
      allowPipelining: true,
    });
    expect(res.json[2].result.data).toEqual({ id: 'team-of-u1' });
    expect(res.json[3].error).toMatchObject({
      message:
        'This call is 4 calls deep in a chain, more than `maxDepth` (3) allows',
      data: { code: 'BAD_REQUEST' },
    });
    expect(res.json[4].error).toMatchObject({
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
    const reads = (count: number) =>
      pipe({
        1: {
          reads: Array.from({ length: count }, () => ({
            to: ['id'],
            from: 0,
            path: ['authorId'],
          })),
        },
      });
    const raised = await get(reads(20), {
      path: 'post,author',
      allowPipelining: experimental_pipelineBudget({ maxReadsPerCall: 20 }),
    });
    expect(raised.json[1].result.data.id).toBe('u1');

    const lowered = await get(reads(2), {
      path: 'post,author',
      allowPipelining: experimental_pipelineBudget({
        maxReadsPerCall: 1,
        maxValueLength: 2,
      }),
    });
    expect(lowered.json[1].error.message).toBe(
      'This call reads 2 values, more than `maxReadsPerCall` (1) allows',
    );
    // `"u1"` is 4 characters of JSON
    const short = await get(reads(1), {
      path: 'post,author',
      allowPipelining: experimental_pipelineBudget({ maxValueLength: 3 }),
    });
    expect(short.json[1].error.message).toBe(
      'A value this call reads is longer than `maxValueLength` (3 characters of JSON) allows',
    );
    // Two of them are 8
    const small = await get(reads(2), {
      path: 'post,author',
      allowPipelining: experimental_pipelineBudget({ maxFillSize: 6 }),
    });
    expect(small.json[1].error.message).toBe(
      'What this call fills in goes over `maxFillSize` (6 characters of JSON for the batch)',
    );
  });

  test('a pipelined batch with more calls than 100 is a bad request without `maxBatchSize`, and none of it runs', async () => {
    const batch = async (count: number) =>
      await get(
        `input=${encodeURIComponent('{}')}&pipe=${encodeURIComponent('{}')}`,
        {
          path: Array.from({ length: count }, () => 'unread').join(','),
          allowPipelining: true,
        },
      );
    const within = await batch(100);
    expect(within.status).toBe(200);
    expect(within.calls).toHaveBeenCalledTimes(100);
    expect(within.json).toHaveLength(100);

    const over = await batch(101);
    expect(over.status).toBe(400);
    expect(over.json).toMatchObject({
      error: { message: 'Batch call exceeds maximum size' },
    });
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
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        }),
      )}`;
      const res = await fetch(
        `${ctx.httpUrl}/post,tag?batch=pipeline&${search}`,
      );
      return { json: await res.json(), calls };
    }

    // Two calls, of which one runs for two items: three runs
    const within = await each(3);
    expect(Object.keys(within.json[1].items)).toHaveLength(2);

    const over = await each(2);
    expect(over.json[0].result.data.slug).toBe('hello');
    expect(over.json[1].error).toMatchObject({
      message:
        'This call would make the batch run 3 times, more than `maxBatchSize` (2) allows',
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
    const each = (list: string) => ({
      each: { from: 0, path: [list] },
      reads: [{ to: ['id'], path: ['id'] }],
    });
    const res = await fetch(
      `${ctx.httpUrl}/lists,tag,tag?batch=pipeline&input=${encodeURIComponent(
        JSON.stringify({ 1: {}, 2: {} }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({ 1: each('long'), 2: each('short') }),
      )}`,
    );
    const json = await res.json();
    // The list and four items are over the limit. The list and two are not
    expect(json[1].error.message).toBe(
      'This call would make the batch run 5 times, more than `maxBatchSize` (4) allows',
    );
    expect(Object.keys(json[2].items)).toHaveLength(2);
    expect(calls).toHaveBeenCalledTimes(2);
  });

  test('filling in an input does not change the data that another call reads', async () => {
    const search = `input=${encodeURIComponent(
      JSON.stringify({ 0: { slug: 'hello' }, 1: {}, 2: {} }),
    )}&pipe=${encodeURIComponent(
      JSON.stringify({
        // The whole post as the input, and then its slug replaced
        1: {
          reads: [
            { to: [], from: 0, path: [] },
            { to: ['slug'], from: 0, path: ['authorId'] },
          ],
        },
        // Reads the slug after the call above has replaced its own
        2: {
          reads: [
            { to: ['other'], from: 0, path: ['authorId'] },
            { to: ['slug'], from: 0, path: ['slug'] },
          ],
        },
      }),
    )}`;
    const res = await get(search, {
      path: 'post,post,post',
      allowPipelining: experimental_pipelineBudget({ allowWholeValues: true }),
    });
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
          1: { reads: [{ to: ['tags'], from: 0, path: ['tags'] }] },
          // Reads the tags once the call above has run
          2: {
            reads: [
              { to: ['after'], from: 1, path: [] },
              { to: ['ids'], from: 0, path: ['tags', null, 'id'] },
            ],
          },
        }),
      )}`,
      {
        path: 'post,stamp,tags',
        allowPipelining: experimental_pipelineBudget({
          allowWholeValues: true,
        }),
      },
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
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [
              { to: ['id'], path: ['id'] },
              { to: ['tags'], from: 0, path: ['tags'] },
            ],
          },
          // Runs once for every run above, after it
          2: {
            reads: [
              { to: ['after'], from: 1, path: [] },
              { to: ['ids'], from: 0, path: ['tags', null, 'id'] },
            ],
          },
        }),
      )}`,
      {
        path: 'post,stamp,tags',
        allowPipelining: experimental_pipelineBudget({
          allowWholeValues: true,
        }),
      },
    );
    expect(res.json[1]).toEqual({
      items: { 0: { result: { data: 3 } }, 1: { result: { data: 3 } } },
    });
    expect(res.json[2]).toEqual({
      items: {
        0: { result: { data: ['t1', 't2'] } },
        1: { result: { data: ['t1', 't2'] } },
      },
    });
  });

  test('a run for an item that changes the input the client sent does not change it for other runs', async () => {
    const res = await get(
      `input=${encodeURIComponent(
        JSON.stringify({ 0: { slug: 'hello' }, 1: { tags: [] } }),
      )}&pipe=${encodeURIComponent(
        JSON.stringify({
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        }),
      )}`,
      { path: 'post,stamp', allowPipelining: true },
    );
    // Every run adds a tag to its own list
    expect(res.json[1]).toEqual({
      items: { 0: { result: { data: 1 } }, 1: { result: { data: 1 } } },
    });
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
        JSON.stringify({
          1: { reads: [{ to: ['from'], from: 0, path: ['at'] }] },
        }),
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
            1: { reads: [{ to: ['since'], from: 0, path: ['publishedAt'] }] },
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
      { path: 'post,author', allowPipelining: true },
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
            1: {
              each: { from: 0, path: [list] },
              reads: [{ to: ['id'], path: ['id'] }],
            },
          }),
        )}`,
        { path, allowPipelining: true },
      );
    const failed = await eachOf('post,tag', { slug: 'missing' }, 'tags');
    expect(failed.json[0].error.data.code).toBe('NOT_FOUND');
    expect(failed.json[1].error.data.code).toBe('PRECONDITION_FAILED');
    expect(failed.calls).not.toHaveBeenCalled();

    const noList = await eachOf('post,tag', { slug: 'hello' }, 'slug');
    expect(noList.json[1]).toEqual({ items: {} });
    expect(noList.calls).not.toHaveBeenCalled();
  });

  test('a call whose data is `undefined` gives the calls that read it nothing', async () => {
    const res = await get(
      `input=${encodeURIComponent(JSON.stringify({ 1: {} }))}&pipe=${encodeURIComponent(
        JSON.stringify({ 1: { reads: [{ to: ['id'], from: 0, path: [] }] } }),
      )}`,
      { path: 'nothing,author', allowPipelining: true },
    );
    // The author's input has no id, and fails to validate
    expect(res.json[1].error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a call still validates its input', async () => {
    const res = await get(
      pipe({ 1: { reads: [{ to: ['id'], from: 0, path: ['tags'] }] } }),
      {
        path: 'post,author',
        allowPipelining: experimental_pipelineBudget({
          allowWholeValues: true,
        }),
      },
    );
    expect(res.json[1].error.data.code).toBe('BAD_REQUEST');
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('reads own properties only', async () => {
    // What the pipeline reads is the data decoded from its JSON: this
    // transformer gives `secret` an inherited property there
    const t = initTRPC.create({
      transformer: {
        input: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) =>
            isObject(value) && isObject(value['secret'])
              ? {
                  ...value,
                  secret: Object.create({ inherited: 'no' }),
                }
              : value,
        },
      },
    });
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request(
        `http://localhost/trpc/post,author?batch=pipeline&${pipe({
          1: {
            reads: [
              { to: ['id'], from: 0, path: ['authorId'] },
              { to: ['since'], from: 0, path: ['secret', 'inherited'] },
              { to: ['__proto__'], from: 0, path: ['constructor'] },
            ],
          },
        })}`,
      ),
      router: t.router({
        post: t.procedure
          .input(z.unknown())
          .query(() => ({ authorId: 'u1', secret: {} })),
        author: t.procedure
          .input(z.object({ id: z.string(), since: z.unknown().optional() }))
          .query((opts) => {
            author(opts.input);
            return opts.input;
          }),
      }),
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[1].result.data).toEqual({ id: 'u1' });
    expect(author).toHaveBeenCalledWith({ id: 'u1' });
  });

  test.each([
    [
      'a call that reads from itself',
      { 1: { reads: [{ to: [], from: 1, path: [] }] } },
    ],
    [
      'a call that reads from a later one',
      { 0: { reads: [{ to: [], from: 1, path: [] }] } },
    ],
    [
      'a call that is not in the batch',
      { 2: { reads: [{ to: [], from: 0, path: [] }] } },
    ],
    [
      'paths that are not strings',
      { 1: { reads: [{ to: [1], from: 0, path: [] }] } },
    ],
    ['reads that are no list', { 1: { to: [], from: 0, path: [] } }],
    [
      'a list that is in no call',
      { 1: { each: { path: ['tags'] }, reads: [] } },
    ],
    [
      'a read of an item without a list',
      { 1: { reads: [{ to: ['id'], path: [] }] } },
    ],
    ['something that is not an object', 'nope'],
  ])('rejects %s', async (_name, value) => {
    const res = await get(pipe(value), {
      path: 'post,author',
      allowPipelining: true,
    });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/^Invalid "pipe"/);
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('rejects a `pipe` that is not JSON', async () => {
    const res = await get(`input=${input}&pipe=%7Bnope`, {
      path: 'post,author',
      allowPipelining: true,
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
      pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
    });
    expect((await res.json())[1]).toEqual({
      result: { data: { id: 'u1', teamId: 'team-of-u1' } },
    });

    calls.mockClear();
    const invalid = await post({
      0: { slug: 'hello' },
      1: {},
      pipe: { 1: { reads: [{ to: ['id'], from: 1, path: [] }] } },
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

describe('a call of a pipelined batch, on its own', () => {
  /** A pipelined batch of `post` and calls that read it, as a request */
  function pipelined(opts: {
    paths: string;
    pipe: unknown;
    signal: AbortSignal | null;
    /** Whether the response streams, as `httpBatchStreamLink` asks */
    streams: boolean;
  }) {
    return new Request(
      `http://localhost/trpc/${opts.paths}?batch=pipeline&input=${encodeURIComponent(
        // An input for each call that reads, to write what it reads into
        JSON.stringify({ 1: {}, 2: {} }),
      )}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`,
      {
        ...(opts.signal ? { signal: opts.signal } : {}),
        headers: opts.streams ? { 'trpc-accept': 'application/jsonl' } : {},
      },
    );
  }

  /** `post`, a call that reads its author, and a call for each of its tags */
  const postAndTags = {
    paths: 'post,author,author',
    pipe: {
      1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
      2: {
        each: { from: 0, path: ['tags'] },
        reads: [{ to: ['id'], path: ['id'] }],
      },
    },
  };

  test('a call that reads another does not start once the request is aborted', async () => {
    const t = initTRPC.create();
    const controller = new AbortController();
    const postRan = vi.fn();
    const ran = vi.fn();
    const router = t.router({
      // The client goes away while it runs
      post: t.procedure.query(() => {
        postRan();
        controller.abort();
        return { authorId: 'u1', tags: [{ id: 't1' }] };
      }),
      author: t.procedure.input(z.object({ id: z.string() })).query(() => {
        ran();
        return { name: 'Ada' };
      }),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({
        paths: 'post,author,author',
        pipe: {
          1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
          // A run for every item does not start either
          2: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
        signal: controller.signal,
        streams: false,
      }),
      router,
      experimental_allowPipelining: true,
    });
    await res.text().catch(() => undefined);

    // The request reached the calls, and was aborted while `post` ran
    expect(postRan).toHaveBeenCalledTimes(1);
    expect(controller.signal.aborted).toBe(true);
    expect(ran).not.toHaveBeenCalled();
  });

  test('without the abort, the same request runs both calls that read `post`', async () => {
    const t = initTRPC.create();
    const ran = vi.fn();
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1', tags: [{ id: 't1' }] })),
      author: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        ran(opts.input.id);
        return { name: 'Ada' };
      }),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({ ...postAndTags, signal: null, streams: false }),
      router,
      experimental_allowPipelining: true,
    });
    await res.text();

    expect(ran.mock.calls).toEqual([['u1'], ['t1']]);
  });

  test('a call whose data JSON can not carry fails by itself: the rest of the batch has its results', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({
        authorId: 'u1',
        tags: [{ id: 't1' }, { id: 'big' }],
      })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => (opts.input.id === 't1' ? { id: 't1' } : { n: 1n })),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({
        paths: 'post,author,author',
        pipe: {
          1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
          2: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
        signal: null,
        streams: false,
      }),
      router,
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0].result.data).toMatchObject({ authorId: 'u1' });
    expect(json[1].error).toMatchObject({
      data: { code: 'INTERNAL_SERVER_ERROR' },
    });
    // One run fails by itself, and the other has its result
    expect(json[2].items[0]).toEqual({ result: { data: { id: 't1' } } });
    expect(json[2].items[1].error).toMatchObject({
      data: { code: 'INTERNAL_SERVER_ERROR' },
    });
  });
  test('a run whose data JSON can not carry fails by itself in a stream too: the runs after it still arrive', async () => {
    const t = initTRPC.create();
    const released = createDeferred<void>();
    // `t1` ends even if the test failed first
    using _released = makeResource({}, () => released.resolve());
    const router = t.router({
      post: t.procedure.query(() => ({
        authorId: 'u1',
        tags: [{ id: 'big' }, { id: 't1' }],
      })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query(async (opts) => {
          if (opts.input.id === 'big') {
            return { n: 1n };
          }
          // Held until the client has the error of the run that fails
          await released.promise;
          return { id: opts.input.id };
        }),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({ ...postAndTags, signal: null, streams: true }),
      router,
      experimental_allowPipelining: true,
    });
    assert(res.body);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    // Handled from the start: a read that fails while the wait below polls
    // fails the wait, rather than rejecting unhandled
    const read: { failure: { cause: unknown } | null } = { failure: null };
    const throwIfReadFailed = () => {
      if (read.failure) {
        throw read.failure.cause;
      }
    };
    const readToEnd = (async () => {
      for (let chunk = await reader.read(); !chunk.done;) {
        text += chunk.value;
        chunk = await reader.read();
      }
    })().catch((cause: unknown) => {
      read.failure = { cause };
    });
    // Bounded: if the stream held the error back until `t1` ends, this fails
    // rather than hangs, and `t1` is then released on the way out
    await vi.waitFor(() => {
      throwIfReadFailed();
      expect(text).toContain('INTERNAL_SERVER_ERROR');
    });
    // The first run's error arrived while the second run was still running
    expect(text).not.toContain('"data":{"id":"t1"}');

    released.resolve();
    await readToEnd;
    throwIfReadFailed();
    expect(text).toContain('"data":{"id":"t1"}');
  });

  test('a call for every item is not refused for a transformer that can not take `undefined`', async () => {
    const t = initTRPC.create({
      transformer: {
        serialize: (value: unknown) => {
          if (value === undefined) {
            throw new Error('Nothing to serialize');
          }
          return value;
        },
        deserialize: (value: unknown) => value,
      },
    });
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1', tags: [{ id: 't1' }] })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({ ...postAndTags, signal: null, streams: false }),
      router,
      experimental_allowPipelining: true,
    });

    expect((await res.json())[2]).toEqual({
      items: { 0: { result: { data: { id: 't1' } } } },
    });
  });

  test("an input the transformer can't read fails its call, as in any batch, not the request: the pipe in a body is read without it", async () => {
    const t = initTRPC.create({
      transformer: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => {
          if (value === 'unreadable') {
            throw new Error('Can not read it');
          }
          return value;
        },
      },
    });
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1' })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request('http://localhost/trpc/post,author?batch=pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          0: 'unreadable',
          1: {},
          pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
        }),
      }),
      router,
      experimental_allowPipelining: true,
      // Queries as POST, as `methodOverride: 'POST'` sends them
      allowMethodOverride: true,
    });
    const json = await res.json();

    // `post` reads no input, so it runs. `author` reads the inputs, which
    // the transformer reads all at once, as in an ordinary batch
    expect(json).toMatchObject([
      { result: { data: { authorId: 'u1' } } },
      { error: { message: 'Can not read it', data: { code: 'BAD_REQUEST' } } },
    ]);
  });

  test('`responseMeta` gets a result for a call for every item, with its runs as the data', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1', tags: [{ id: 't1' }] })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    const seen: unknown[] = [];
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelined({ ...postAndTags, signal: null, streams: false }),
      router,
      experimental_allowPipelining: true,
      responseMeta: (opts) => {
        for (const response of opts.data) {
          if (!('error' in response)) {
            seen.push(response.result.data);
          }
        }
        return {};
      },
    });

    expect(res.status).toBe(200);
    expect(seen[2]).toEqual({
      items: { 0: { result: { data: { id: 't1' } } } },
    });
    expect((await res.json())[2]).toEqual({
      items: { 0: { result: { data: { id: 't1' } } } },
    });
  });

  test('a call for every item none of whose runs the server lets fill in is an error for the status and `responseMeta`', async () => {
    const t = initTRPC.create();
    const authors = vi.fn();
    const router = t.router({
      post: t.procedure.query(() => ({
        tags: [{ id: 't1' }, { id: 't2' }],
      })),
      author: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        authors(opts.input.id);
        return { id: opts.input.id };
      }),
    });
    const meta: { data: unknown[]; errors: TRPCError[] }[] = [];
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,author',
        pipe: {
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
      }),
      router,
      // `{"id":"t1"}` is 11 characters of JSON: no run fits
      experimental_allowPipelining: experimental_pipelineBudget({
        maxFillSize: 5,
      }),
      responseMeta: (opts) => {
        meta.push({ data: opts.data, errors: opts.errors });
        return {};
      },
    });

    const message =
      'What this call fills in goes over `maxFillSize` (5 characters of JSON for the batch)';
    // One call ran, and the server refused the other as a whole
    expect(res.status).toBe(207);
    expect(meta).toHaveLength(1);
    expect(meta[0]!.errors).toHaveLength(1);
    expect(meta[0]!.errors[0]).toBeInstanceOf(TRPCError);
    expect(meta[0]!.errors[0]).toMatchObject({ code: 'BAD_REQUEST', message });
    // `responseMeta` gets the error's shape, without the server's mark
    expect(meta[0]!.data[1]).toEqual({
      error: expect.objectContaining({
        message,
        data: expect.objectContaining({ code: 'BAD_REQUEST' }),
      }),
    });
    expect((await res.json())[1]).toEqual({
      error: expect.objectContaining({ message }),
      pipeline: 'not-run',
    });
    expect(authors).not.toHaveBeenCalled();
  });
});

/** A pipelined batch as a GET request, with an input for calls 1 and 2 */
function pipelinedGet(opts: { paths: string; pipe: unknown }) {
  return new Request(
    `http://localhost/trpc/${opts.paths}?batch=pipeline&input=${encodeURIComponent(
      JSON.stringify({ 1: {}, 2: {} }),
    )}&pipe=${encodeURIComponent(JSON.stringify(opts.pipe))}`,
  );
}

describe('a call that reads more than one call', () => {
  test('a call that reads a failed call and a pending one fails without waiting for the pending one', async () => {
    const t = initTRPC.create();
    const released = new AbortController();
    const pending = new Promise<void>((resolve) => {
      released.signal.addEventListener('abort', () => resolve());
    });
    const router = t.router({
      slow: t.procedure.query(async () => {
        await pending;
        return { id: 'slow' };
      }),
      failing: t.procedure.query(() => {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }),
      edge: t.procedure
        .input(z.object({ a: z.string(), b: z.string() }))
        .query((opts) => opts.input),
    });
    await using ctx = testServerAndClientResource(router, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchStreamLink({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    // Disposed before the server: `slow` ends even if the test failed first
    using _released = makeResource({}, () => released.abort());
    const untyped = getUntypedClient(ctx.client);

    const slow = createOperationPipeline();
    const failing = createOperationPipeline();
    const slowResult = untyped.query('slow', undefined, {
      context: pipelineContext(slow),
    });
    const failingResult = untyped.query('failing', undefined, {
      context: pipelineContext(failing),
    });
    failingResult.catch(() => undefined);
    const edge = pipeCall({
      path: 'edge',
      input: { a: undefined, b: undefined },
      reads: {
        each: null,
        reads: [
          { kind: 'whole', to: ['a'], from: slow, path: ['id'] },
          { kind: 'whole', to: ['b'], from: failing, path: ['id'] },
        ],
      },
    });
    assert(edge);
    let settled = false;
    edge.result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await expect(failingResult).rejects.toThrow();
    // `slow` is still running
    await vi.waitFor(() => expect(settled).toBe(true));
    // The server's refusal, not one the link made up
    await expect(edge.result).rejects.toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    });

    released.abort();
    expect(await slowResult).toEqual({ id: 'slow' });
  });
});

describe('a pipelined batch that does not stream', () => {
  test('a call whose data JSON cannot carry is reported to `onError`, in a pipelined batch that does not stream', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1' })),
      big: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => BigInt(1)),
    });
    const onError = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,big',
        pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
      }),
      router,
      experimental_allowPipelining: true,
      onError,
    });
    const json = await res.json();

    expect(json[0]).toEqual({ result: { data: { authorId: 'u1' } } });
    expect(json[1]).toHaveProperty('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({
      path: 'big',
      input: { id: 'u1' },
      type: 'query',
    });
  });

  test('a call whose data has a getter that throws fails by itself, not the response', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({ authorId: 'u1' })),
      broken: t.procedure.input(z.object({ id: z.string() })).query(() => ({
        get id(): string {
          throw new Error('Cannot read');
        },
      })),
    });
    const onError = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,broken',
        pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] } },
      }),
      router,
      experimental_allowPipelining: true,
      onError,
    });
    const json = await res.json();

    expect(json[0]).toEqual({ result: { data: { authorId: 'u1' } } });
    expect(json[1]).toMatchObject({
      error: { data: { code: 'INTERNAL_SERVER_ERROR', path: 'broken' } },
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({
      path: 'broken',
      input: { id: 'u1' },
    });
  });
});

describe('a call for every item', () => {
  test('a run of a call for every item that returns an Observable is an error for that item', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({ tags: [{ id: 't1' }] })),
      tag: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => observable<number>((emit) => emit.next(1))),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,tag',
        pipe: {
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
      }),
      router,
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[1]).toMatchObject({
      items: {
        0: { error: { data: { code: 'UNSUPPORTED_MEDIA_TYPE' } } },
      },
    });
  });

  test('a run whose data has a `subscribe` that is no function returns that data', async () => {
    const t = initTRPC.create();
    const router = t.router({
      post: t.procedure.query(() => ({ tags: [{ id: 't1' }] })),
      tag: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id, subscribe: false })),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,tag',
        pipe: {
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
      }),
      router,
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[1]).toEqual({
      items: { 0: { result: { data: { id: 't1', subscribe: false } } } },
    });
  });

  test('a run whose error JSON cannot carry fails as `INTERNAL_SERVER_ERROR`, not the response', async () => {
    const t = initTRPC.create({
      errorFormatter: ({ shape, error }) =>
        error.code === 'NOT_FOUND'
          ? { ...shape, data: { ...shape.data, big: BigInt(1) } }
          : shape,
    });
    const router = t.router({
      post: t.procedure.query(() => ({ tags: [{ id: 't1' }, { id: 't2' }] })),
      tag: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        if (opts.input.id === 't2') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { id: opts.input.id };
      }),
    });
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,tag',
        pipe: {
          1: {
            each: { from: 0, path: ['tags'] },
            reads: [{ to: ['id'], path: ['id'] }],
          },
        },
      }),
      router,
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0]).toMatchObject({ result: { data: { tags: [{}, {}] } } });
    expect(json[1]).toMatchObject({
      items: {
        0: { result: { data: { id: 't1' } } },
        1: { error: { data: { code: 'INTERNAL_SERVER_ERROR' } } },
      },
    });
  });
});

describe('a call the server refuses before any of its runs ran', () => {
  const t = initTRPC.create({
    // A formatter that makes its own `data` doesn't drop the mark
    errorFormatter: ({ shape }) => ({
      message: shape.message,
      code: shape.code,
      data: { custom: true },
    }),
  });
  const router = t.router({
    list: t.procedure.query(() => ({
      items: [{ id: 'ada' }, { id: 'missing' }],
    })),
    author: t.procedure.input(z.unknown()).query((opts) => {
      if (isObject(opts.input) && opts.input['id'] === 'missing') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return opts.input;
    }),
  });
  async function send(opts: {
    pipe: unknown;
    allowPipelining: true | experimental_PipelinePolicy;
    maxBatchSize?: number;
  }) {
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({ paths: 'list,author', pipe: opts.pipe }),
      router,
      experimental_allowPipelining: opts.allowPipelining,
      maxBatchSize: opts.maxBatchSize,
    });
    return (await res.json()) as unknown[];
  }
  const eachAuthor = {
    1: {
      each: { from: 0, path: ['items'] },
      reads: [{ to: ['id'], path: ['id'] }],
    },
  };

  test("is marked `pipeline: 'not-run'` beside its error, not in the formatter's `data`, for a limit: a list with more runs than `maxBatchSize`", async () => {
    const json = await send({
      pipe: eachAuthor,
      allowPipelining: true,
      maxBatchSize: 2,
    });

    expect(json[1]).toEqual({
      error: {
        message:
          'This call would make the batch run 3 times, more than `maxBatchSize` (2) allows',
        code: -32600,
        data: { custom: true },
      },
      pipeline: 'not-run',
    });
  });

  test('is marked for a value it reads that a limit refuses', async () => {
    const json = await send({
      pipe: { 1: { reads: [{ to: [], from: 0, path: ['items'] }] } },
      allowPipelining: experimental_pipelineBudget({ allowWholeValues: false }),
    });

    expect(json[1]).toMatchObject({
      error: { data: { custom: true } },
      pipeline: 'not-run',
    });
  });

  test('is marked for more reads than `maxReadsPerCall`, in a call for every item too', async () => {
    const json = await send({
      pipe: {
        1: {
          each: { from: 0, path: ['items'] },
          reads: [
            { to: ['a'], path: ['id'] },
            { to: ['b'], path: ['id'] },
          ],
        },
      },
      allowPipelining: experimental_pipelineBudget({ maxReadsPerCall: 1 }),
    });

    expect(json[1]).toMatchObject({
      error: { data: { custom: true } },
      pipeline: 'not-run',
    });
  });

  test('the error of a run that ran, or of a list inside the call, has no mark', async () => {
    const json = await send({
      pipe: eachAuthor,
      allowPipelining: true,
      maxBatchSize: 4,
    });

    expect(json[1]).toEqual({
      items: {
        0: { result: { data: { id: 'ada' } } },
        1: {
          error: {
            message: 'NOT_FOUND',
            code: -32004,
            data: { custom: true },
          },
        },
      },
    });
  });

  test('a list of lists whose inner list goes over `maxBatchSize` has no mark: other lists of the call can run', async () => {
    const lists = initTRPC.create();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'pages,author',
        pipe: {
          1: {
            each: { from: 0, path: ['pages', null, 'items'] },
            reads: [{ to: [], path: [] }],
          },
        },
      }),
      router: lists.router({
        pages: lists.procedure.query(() => ({
          pages: [{ items: ['a'] }, { items: ['b', 'c'] }],
        })),
        author: lists.procedure.input(z.unknown()).query((opts) => opts.input),
      }),
      experimental_allowPipelining: true,
      maxBatchSize: 3,
    });
    const json = (await res.json()) as unknown[];

    expect(json[1]).toMatchObject({
      items: {
        0: { items: { 0: { result: { data: 'a' } } } },
        1: { error: { data: { code: 'BAD_REQUEST' } } },
      },
    });
    expect(JSON.stringify(json[1])).not.toContain('not-run');
  });

  test('a call whose `pipe` writes where its input has nothing has no mark: asking by itself would not help', async () => {
    const json = await send({
      pipe: {
        1: { reads: [{ to: ['a', 'b'], from: 0, path: ['items'] }] },
      },
      allowPipelining: experimental_pipelineBudget({ allowWholeValues: true }),
    });

    expect(json[1]).toEqual({
      error: {
        message: 'Invalid "pipe": the input has nothing at "a.b"',
        code: -32600,
        data: { custom: true },
      },
    });
  });

  test('is marked when the input transformer decodes its input in place: the server checks what the client sent, not what was decoded from it', async () => {
    const decodesInPlace = initTRPC.create({
      transformer: {
        serialize: (value: unknown) => value,
        // Makes a number of `big`, in the input the request has: JSON can
        // carry it, so only a snapshot taken before this tells it apart
        deserialize: (value: unknown) => {
          if (isObject(value) && typeof value['big'] === 'string') {
            value['big'] = Number(value['big']);
          }
          return value;
        },
      },
    });
    const ran = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request(
        `http://localhost/trpc/list,author?batch=pipeline&input=${encodeURIComponent(
          JSON.stringify({ 1: { big: '1' } }),
        )}&pipe=${encodeURIComponent(
          JSON.stringify({
            1: { reads: [{ to: ['id'], from: 0, path: ['items', '0', 'id'] }] },
          }),
        )}`,
      ),
      router: decodesInPlace.router({
        list: decodesInPlace.procedure.query(() => ({
          items: [{ id: 'ada' }],
        })),
        author: decodesInPlace.procedure
          .input((value) => value)
          .query((opts) => {
            ran(opts.input);
            return 'ran';
          }),
      }),
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[0]).toEqual({
      result: { data: { items: [{ id: 'ada' }] } },
    });
    expect(json[1]).toMatchObject({
      error: { data: { code: 'BAD_REQUEST' } },
      pipeline: 'not-run',
    });
    expect(ran).not.toHaveBeenCalled();
  });

  test('is marked for an inner list a limit refuses, when none of its runs started', async () => {
    const lists = initTRPC.create();
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'pages,author',
        pipe: {
          1: {
            each: { from: 0, path: ['pages', null, 'items'] },
            reads: [{ to: [], path: [] }],
          },
        },
      }),
      router: lists.router({
        pages: lists.procedure.query(() => ({
          pages: [{ items: ['a', 'b', 'c'] }],
        })),
        author: lists.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return opts.input;
        }),
      }),
      experimental_allowPipelining: true,
      maxBatchSize: 3,
    });
    const json = (await res.json()) as unknown[];

    expect(json[1]).toEqual({
      error: {
        message:
          'This call would make the batch run 4 times, more than `maxBatchSize` (3) allows',
        code: -32600,
        data: expect.objectContaining({
          code: 'BAD_REQUEST',
        }),
      },
      pipeline: 'not-run',
    });
    expect(author).not.toHaveBeenCalled();
  });

  test('is marked when a limit refuses the input of every run, as none of them ran', async () => {
    const lists = initTRPC.create();
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'list,author',
        pipe: {
          1: {
            each: { from: 0, path: [] },
            reads: [{ to: ['longField'], path: [] }],
          },
        },
      }),
      router: lists.router({
        list: lists.procedure.query(() => ['x', 'y']),
        author: lists.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return opts.input;
        }),
      }),
      // `{"longField":"x"}` is 17 characters of JSON
      experimental_allowPipelining: experimental_pipelineBudget({
        maxFillSize: 16,
      }),
    });
    const json = (await res.json()) as unknown[];

    expect(json[1]).toEqual({
      error: {
        message:
          'What this call fills in goes over `maxFillSize` (16 characters of JSON for the batch)',
        code: -32600,
        data: expect.objectContaining({
          code: 'BAD_REQUEST',
        }),
      },
      pipeline: 'not-run',
    });
    expect(author).not.toHaveBeenCalled();
  });

  test('is not marked when a limit refuses the input of a run after another ran', async () => {
    const lists = initTRPC.create();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'list,author',
        pipe: {
          1: {
            each: { from: 0, path: [] },
            reads: [{ to: ['longField'], path: [] }],
          },
        },
      }),
      router: lists.router({
        list: lists.procedure.query(() => ['x', 'y']),
        author: lists.procedure.input(z.unknown()).query((opts) => opts.input),
      }),
      // Room for one run's input, not two
      experimental_allowPipelining: experimental_pipelineBudget({
        maxFillSize: 20,
      }),
    });
    const json = (await res.json()) as unknown[];

    expect(json[1]).toMatchObject({
      items: {
        0: { result: { data: { longField: 'x' } } },
        1: { error: { data: { code: 'BAD_REQUEST' } } },
      },
    });
    expect(JSON.stringify(json[1])).not.toContain('not-run');
  });

  test('is not marked when a run fails for what is not a limit, and a limit refuses the others', async () => {
    const lists = initTRPC.create();
    const copy = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request(
        `http://localhost/trpc/list,author,copy?batch=pipeline&input=${encodeURIComponent(
          JSON.stringify({ 1: null, 2: {} }),
        )}&pipe=${encodeURIComponent(
          JSON.stringify({
            1: { each: { from: 0, path: [] }, reads: [{ to: [], path: [] }] },
            // Reads the run of `author` for the same item
            2: {
              each: { from: 0, path: [] },
              reads: [{ to: ['longField'], from: 1, path: [] }],
            },
          }),
        )}`,
      ),
      router: lists.router({
        list: lists.procedure.query(() => ['x', 'y']),
        author: lists.procedure.input(z.string()).query((opts) => {
          if (opts.input === 'x') {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return opts.input;
        }),
        copy: lists.procedure.input(z.unknown()).query((opts) => {
          copy(opts.input);
          return opts.input;
        }),
      }),
      // Room for the runs of `author`, not for a run of `copy`
      experimental_allowPipelining: experimental_pipelineBudget({
        maxFillSize: 16,
      }),
    });
    const json = (await res.json()) as unknown[];

    expect(json[2]).toMatchObject({
      items: {
        // It reads a run that failed
        0: { error: { data: { code: 'PRECONDITION_FAILED' } } },
        1: { error: { data: { code: 'BAD_REQUEST' } } },
      },
    });
    expect(JSON.stringify(json[2])).not.toContain('not-run');
    expect(copy).not.toHaveBeenCalled();
  });
});

describe('a value a call reads, with a getter that gives something else each time', () => {
  test('is written into the input as it was measured', async () => {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({
      transformer: {
        input: identity,
        output: {
          serialize: (value: unknown) => value,
          // Gives `v` an `id` that is short the first time it is read, and
          // longer than `maxValueLength` allows after
          deserialize: (value: unknown) => {
            if (!isObject(value) || !isObject(value['v'])) {
              return value;
            }
            let reads = 0;
            return {
              v: {
                get id() {
                  reads += 1;
                  return reads === 1 ? 'short' : 'x'.repeat(2000);
                },
              },
            };
          },
        },
      },
    });
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,author',
        pipe: { 1: { reads: [{ to: ['v'], from: 0, path: ['v'] }] } },
      }),
      router: t.router({
        post: t.procedure.query(() => ({ v: { id: 'ada' } })),
        author: t.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return 'ran';
        }),
      }),
      experimental_allowPipelining: experimental_pipelineBudget({
        allowWholeValues: true,
      }),
    });
    const json = (await res.json()) as unknown[];

    expect(json[1]).toEqual({ result: { data: 'ran' } });
    expect(author).toHaveBeenCalledExactlyOnceWith({ v: { id: 'short' } });
  });
});

describe('a value a call reads, with a `toJSON` of its own', () => {
  /** Sends a batch whose second call reads `v`, which has `toJSON` */
  async function readV(toJSON: () => unknown) {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({
      transformer: {
        input: identity,
        output: {
          serialize: (value: unknown) => value,
          // Reads the data of `post` back with `toJSON` on its `v`
          deserialize: (value: unknown) =>
            isObject(value) && isObject(value['v']) ? { v: { toJSON } } : value,
        },
      },
    });
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,author',
        pipe: { 1: { reads: [{ to: ['v'], from: 0, path: ['v'] }] } },
      }),
      router: t.router({
        post: t.procedure.query(() => ({ v: {} })),
        author: t.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return 'ran';
        }),
      }),
      experimental_allowPipelining: experimental_pipelineBudget({
        allowWholeValues: true,
      }),
    });
    return { json: (await res.json()) as unknown[], author };
  }

  test('that gives something else each time is called once: the input has what was measured', async () => {
    let calls = 0;
    const { json, author } = await readV(() => {
      calls += 1;
      return calls <= 2 ? 'x' : 'x'.repeat(2048);
    });

    expect(json[1]).toEqual({ result: { data: 'ran' } });
    expect(author).toHaveBeenCalledExactlyOnceWith({ v: 'x' });
    expect(calls).toBe(1);
  });

  test('that gives more parts than `maxValueLength` allows is refused, and the call can be sent by itself', async () => {
    const { json, author } = await readV(() => Array.from({ length: 2000 }));

    expect(json[1]).toMatchObject({
      error: {
        message:
          'A value this call reads is longer than `maxValueLength` (1024 characters of JSON) allows',
        data: { code: 'BAD_REQUEST' },
      },
      pipeline: 'not-run',
    });
    expect(author).not.toHaveBeenCalled();
  });
});

describe('a value a call reads, made of code that runs when it is read', () => {
  /**
   * Sends a batch whose second call reads `v` of the first one's data, which
   * the server reads back with `v` as `make` makes it
   */
  async function insert(make: () => unknown) {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({
      transformer: {
        input: identity,
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) =>
            isObject(value) && isObject(value['v']) ? { v: make() } : value,
        },
      },
    });
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,author',
        pipe: { 1: { reads: [{ to: ['v'], from: 0, path: ['v'] }] } },
      }),
      router: t.router({
        post: t.procedure.query(() => ({ v: {} })),
        author: t.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return 'ran';
        }),
      }),
      experimental_allowPipelining: experimental_pipelineBudget({
        allowWholeValues: true,
      }),
    });
    return { json: (await res.json()) as unknown[], author };
  }

  test('with an inherited `toJSON` getter that is a method only after its first lookup, has the input as it was measured', async () => {
    let lookups = 0;
    let calls = 0;
    const { json, author } = await insert(() =>
      Object.create({
        get toJSON() {
          lookups += 1;
          if (lookups === 1) {
            return undefined;
          }
          return () => {
            calls += 1;
            return calls <= 2 ? 'x' : 'x'.repeat(2048);
          };
        },
      }),
    );

    expect(json[1]).toEqual({ result: { data: 'ran' } });
    // An object without properties, as JSON wrote it the one time
    expect(author).toHaveBeenCalledExactlyOnceWith({ v: {} });
    expect(lookups).toBe(1);
    expect(calls).toBe(0);
  });

  test("whose input transformer reads it back by itself as an object with a stateful `toJSON` is refused before it runs, and that object's `toJSON` runs once", async () => {
    let calls = 0;
    const t = initTRPC.create({
      transformer: {
        input: {
          serialize: (value: unknown) => value,
          // Reads `{ stateful: true }` as an object whose `toJSON` gives
          // something short twice, and something long after
          deserialize: (value: unknown) =>
            isObject(value) && value['stateful'] === true
              ? {
                  toJSON: () => {
                    calls += 1;
                    return calls <= 2 ? 'x' : 'x'.repeat(2048);
                  },
                }
              : value,
        },
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => value,
        },
      },
    });
    const author = vi.fn();
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,author',
        pipe: { 1: { reads: [{ to: ['v'], from: 0, path: ['v'] }] } },
      }),
      router: t.router({
        post: t.procedure.query(() => ({ v: { stateful: true } })),
        author: t.procedure.input(z.unknown()).query((opts) => {
          author(opts.input);
          return 'ran';
        }),
      }),
      experimental_allowPipelining: experimental_pipelineBudget({
        allowWholeValues: true,
      }),
    });
    const json = (await res.json()) as unknown[];

    // Inside a client's input `{ v: { stateful: true } }` it stays as it is,
    // so the server can't fill it in as the client would send it
    expect(json[1]).toMatchObject({
      error: { data: { code: 'BAD_REQUEST' } },
      pipeline: 'not-run',
    });
    expect(author).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  test('is read once in the whole request: each of its properties, and its `toJSON`', async () => {
    const accesses = new Map<string, number>();
    const count = (what: string) =>
      accesses.set(what, (accesses.get(what) ?? 0) + 1);
    const { json, author } = await insert(
      () =>
        new Proxy(
          { id: 'ada', tags: ['t1'] },
          {
            get: (target, key, receiver) => {
              count(`get ${String(key)}`);
              return Reflect.get(target, key, receiver);
            },
            getOwnPropertyDescriptor: (target, key) => {
              count(`describe ${String(key)}`);
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
            ownKeys: (target) => {
              count('keys');
              return Reflect.ownKeys(target);
            },
            has: (target, key) => {
              count(`has ${String(key)}`);
              return Reflect.has(target, key);
            },
          },
        ),
    );

    expect(json[1]).toEqual({ result: { data: 'ran' } });
    expect(author).toHaveBeenCalledExactlyOnceWith({
      v: { id: 'ada', tags: ['t1'] },
    });
    expect(accesses.size).toBeGreaterThan(0);
    expect(Object.fromEntries(accesses)).toEqual(
      Object.fromEntries([...accesses.keys()].map((what) => [what, 1])),
    );
  });
});

describe('the calls that read the same failed call or refused value', () => {
  const t = initTRPC.create();
  const router = t.router({
    list: t.procedure.query(() => ({ items: [{ id: 'ada' }] })),
    failing: t.procedure.query(() => {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
    echo: t.procedure.input(z.unknown()).query((opts) => opts.input),
  });

  test.each([
    {
      name: 'a failed call',
      paths: 'failing,echo,echo',
      path: ['id'],
      code: 'PRECONDITION_FAILED',
    },
    {
      name: 'a value `allowWholeValues` refuses',
      paths: 'list,echo,echo',
      path: ['items', null, 'id'],
      code: 'BAD_REQUEST',
    },
  ])(
    'each fail with an error of their own, for $name',
    async ({ paths, path, code }) => {
      const errors: unknown[] = [];
      const read = { reads: [{ to: ['id'], from: 0, path }] };
      const res = await fetchRequestHandler({
        endpoint: '/trpc',
        req: pipelinedGet({ paths, pipe: { 1: read, 2: read } }),
        router,
        experimental_allowPipelining: true,
        onError: (opts) => {
          if (opts.path === 'echo') {
            errors.push(opts.error);
          }
        },
      });
      const json = await res.json();

      expect(json[1]).toMatchObject({ error: { data: { code } } });
      expect(json[2]).toMatchObject({ error: { data: { code } } });
      expect(errors).toHaveLength(2);
      // One call's error is not the other's, for what `onError` does with it
      expect(errors[0]).not.toBe(errors[1]);
    },
  );

  test("a call refused before it ran is marked so beside its error, also when the formatter's shape has a `toJSON` of its own", async () => {
    const formatted = initTRPC.create({
      // A shape whose JSON is the shape as the formatter made it
      errorFormatter: ({ shape }) => ({ ...shape, toJSON: () => shape }),
    });
    const withToJSON = formatted.router({
      list: formatted.procedure.query(() => ({ items: [{ id: 'ada' }] })),
      echo: formatted.procedure.input(z.unknown()).query((opts) => opts.input),
    });
    const read = {
      reads: [{ to: ['id'], from: 0, path: ['items', null, 'id'] }],
    };
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({ paths: 'list,echo', pipe: { 1: read } }),
      router: withToJSON,
      experimental_allowPipelining: true,
    });
    const json = await res.json();

    expect(json[1]).toMatchObject({
      error: { data: { code: 'BAD_REQUEST' } },
      pipeline: 'not-run',
    });
  });

  test('each fail with an error of their own, for a value whose getter throws a `TRPCError`', async () => {
    const identity = {
      serialize: (it: unknown) => it,
      deserialize: (it: unknown) => it,
    };
    // Reads `post`'s data back with an `id` getter that throws
    const getters = initTRPC.create({
      transformer: {
        input: identity,
        output: {
          serialize: (it: unknown) => it,
          deserialize: (it: unknown) =>
            isObject(it) && 'id' in it
              ? Object.defineProperty({}, 'id', {
                  enumerable: true,
                  get: () => {
                    throw new TRPCError({ code: 'FORBIDDEN', message: 'no' });
                  },
                })
              : it,
        },
      },
    });
    const withGetters = getters.router({
      post: getters.procedure.query(() => ({ id: 'ada' })),
      echo: getters.procedure.input(z.unknown()).query((opts) => opts.input),
    });
    const errors: TRPCError[] = [];
    const read = { reads: [{ to: ['id'], from: 0, path: ['id'] }] };
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({
        paths: 'post,echo,echo',
        pipe: { 1: read, 2: read },
      }),
      router: withGetters,
      experimental_allowPipelining: true,
      onError: (opts) => {
        if (opts.path === 'echo') {
          errors.push(opts.error);
        }
      },
    });
    const json = await res.json();

    expect(json[1]).toMatchObject({ error: { data: { code: 'FORBIDDEN' } } });
    expect(json[2]).toMatchObject({ error: { data: { code: 'FORBIDDEN' } } });
    expect(errors).toHaveLength(2);
    expect(errors[0]).not.toBe(errors[1]);
    for (const error of errors) {
      expect(error).toMatchObject({ code: 'FORBIDDEN', message: 'no' });
    }
  });
});

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)(
  '$name, for a call the server refuses before it runs',
  (scenario) => {
    function setup() {
      const t = initTRPC.create();
      const router = t.router({
        post: t.procedure.query(() => ({ authorId: 'missing', tags: ['t1'] })),
        author: t.procedure
          .input(z.object({ id: z.unknown() }))
          .query((opts) => {
            if (opts.input.id === 'missing') {
              throw new TRPCError({ code: 'NOT_FOUND' });
            }
            return opts.input;
          }),
      });
      const ctx = testServerAndClientResource(router, {
        server: {
          experimental_allowPipelining: experimental_pipelineBudget({
            allowWholeValues: false,
          }),
        },
        client: (clientOpts) => ({
          links: [
            scenario.link({
              url: clientOpts.httpUrl,
              experimental_pipelining: experimental_pipelining(),
            }),
          ],
        }),
      });
      return Object.assign(ctx, { untyped: getUntypedClient(ctx.client) });
    }

    test('the call is unresolved, so what wants it asks for it by itself', async () => {
      await using ctx = setup();

      const post = createOperationPipeline();
      const postResult = ctx.untyped.query('post', undefined, {
        context: pipelineContext(post),
      });
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: whole({ to: ['id'], from: post, path: ['tags'] }),
      });
      assert(author);

      await postResult;
      await expect(author.result).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
      });
      expect(author.status).toBe('unresolved');
    });

    test('a call whose run failed stays sent: its error is its result', async () => {
      await using ctx = setup();

      const post = createOperationPipeline();
      const postResult = ctx.untyped.query('post', undefined, {
        context: pipelineContext(post),
      });
      const author = pipeCall({
        path: 'author',
        input: { id: undefined },
        reads: whole({ to: ['id'], from: post, path: ['authorId'] }),
      });
      assert(author);

      await postResult;
      const error = await author.result.catch((cause: unknown) => cause);
      expect(error).toMatchObject({ data: { code: 'NOT_FOUND' } });
      expect((error as { data: object }).data).not.toHaveProperty('pipeline');
      expect(author.status).toBe('sent');
    });
  },
);

describe('a policy of `experimental_allowPipelining`', () => {
  const t = initTRPC.context<{ user: string }>().create();
  const router = t.router({
    list: t.procedure.query(() => ({ items: [{ id: 'ada' }, { id: 'bob' }] })),
    echo: t.procedure.input(z.unknown()).query((opts) => opts.input),
    secret: t.procedure.input(z.unknown()).query((opts) => opts.input),
  });
  const eachItem = {
    each: { from: 0, path: ['items'] },
    reads: [{ to: ['id'], path: ['id'] }],
  };
  async function send(opts: {
    paths: string;
    pipe: unknown;
    policy: experimental_PipelinePolicy<{ user: string }>;
  }) {
    const errors: { path: string | undefined; error: unknown }[] = [];
    const res = await fetchRequestHandler({
      endpoint: '/trpc',
      req: pipelinedGet({ paths: opts.paths, pipe: opts.pipe }),
      router,
      createContext: () => ({ user: 'ada' }),
      experimental_allowPipelining: opts.policy,
      onError: ({ path, error }) => {
        errors.push({ path, error });
      },
    });
    return { json: (await res.json()) as any[], errors };
  }

  test('is called once for each batch, with its context, and hears of each event before its work', async () => {
    const batches: { user: string | undefined; calls: number }[] = [];
    const events: experimental_PipelineEvent[] = [];
    const policy: experimental_PipelinePolicy<{ user: string }> = (opts) => {
      batches.push({ user: opts.ctx?.user, calls: opts.info.calls.length });
      return (event) => {
        // `length` is measured as it is read
        events.push(
          event.kind === 'value'
            ? { kind: 'value', whole: event.whole, length: event.length }
            : event,
        );
        return true;
      };
    };

    const { json } = await send({
      paths: 'list,echo',
      pipe: { 1: eachItem },
      policy,
    });

    expect(json[1].items).toEqual({
      0: { result: { data: { id: 'ada' } } },
      1: { result: { data: { id: 'bob' } } },
    });
    expect(batches).toEqual([{ user: 'ada', calls: 2 }]);
    expect(events.slice(0, 2)).toEqual([
      { kind: 'call', path: 'echo', depth: 2, reads: 1 },
      { kind: 'list', length: 2 },
    ]);
    // For each item: the value it reads, and its run with it filled in
    const value = { kind: 'value', whole: false, length: 5 };
    const run = { kind: 'run', path: 'echo', filled: 12 };
    expect(events.slice(2)).toEqual(
      expect.arrayContaining([value, value, run, run]),
    );
    expect(events).toHaveLength(6);
  });

  test('refuses a call with its reason: `onError` gets an `experimental_TRPCPipelineRefusal`, and a client can ask for the call by itself', async () => {
    const { json, errors } = await send({
      paths: 'list,secret',
      pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['items'] }] } },
      policy: () => (event) =>
        event.kind === 'call' && event.path === 'secret'
          ? { reason: 'secret', message: 'Not in a pipelined batch' }
          : true,
    });

    expect(json[1]).toMatchObject({
      error: {
        message: 'Not in a pipelined batch',
        data: { code: 'BAD_REQUEST' },
      },
      pipeline: 'not-run',
    });
    expect(errors).toHaveLength(1);
    const [refused] = errors;
    expect(refused?.path).toBe('secret');
    expect(refused?.error).toBeInstanceOf(experimental_TRPCPipelineRefusal);
    expect(refused?.error).toBeInstanceOf(TRPCError);
    expect(refused?.error).toMatchObject({ reason: 'secret' });
  });

  test('a refusal without a message says the reason', async () => {
    const { json } = await send({
      paths: 'list,echo',
      pipe: { 1: eachItem },
      policy: () => (event) =>
        event.kind === 'list' ? { reason: 'noLists' } : true,
    });

    expect(json[1]).toMatchObject({
      error: {
        message: 'Refused by `experimental_allowPipelining`: noLists',
      },
      pipeline: 'not-run',
    });
  });

  test('refuses a run by itself: the runs before it ran', async () => {
    let runs = 0;
    const { json, errors } = await send({
      paths: 'list,echo',
      pipe: { 1: eachItem },
      policy: () => (event) =>
        event.kind === 'run' && ++runs > 1 ? { reason: 'oneRun' } : true,
    });

    expect(json[1].items[0]).toEqual({ result: { data: { id: 'ada' } } });
    expect(json[1].items[1]).toMatchObject({
      error: { data: { code: 'BAD_REQUEST' } },
    });
    expect(errors.map(({ error }) => error)).toEqual([
      expect.objectContaining({ reason: 'oneRun' }),
    ]);
  });

  test('what it throws fails the call with that error, which a client does not ask for again', async () => {
    const { json } = await send({
      paths: 'list,echo',
      pipe: { 1: eachItem },
      policy: () => (event) => {
        if (event.kind === 'call') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'no' });
        }
        return true;
      },
    });

    expect(json[1]).toEqual({
      error: expect.objectContaining({
        message: 'no',
        data: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
    });
  });

  test('`experimental_pipelineBudget()` can be wrapped', async () => {
    const { json } = await send({
      paths: 'list,echo',
      pipe: { 1: { reads: [{ to: ['id'], from: 0, path: ['items'] }] } },
      policy: (opts) => {
        const budget = experimental_pipelineBudget({ allowWholeValues: true })(
          opts,
        );
        return (event) =>
          event.kind === 'value' && event.length > 20
            ? { reason: 'long' }
            : budget(event);
      },
    });

    expect(json[1]).toMatchObject({
      error: { message: 'Refused by `experimental_allowPipelining`: long' },
      pipeline: 'not-run',
    });
  });
});

test('an `onError` that throws for a run of a response that does not stream leaves no rejection unhandled, while an earlier run is pending', async () => {
  const t = initTRPC.create();
  const slow = createDeferred<void>();
  const router = t.router({
    list: t.procedure.query(() => ({ items: ['slow', 'bad'] })),
    echo: t.procedure.input(z.string()).query(async (opts) => {
      if (opts.input === 'slow') {
        await slow.promise;
        return opts.input;
      }
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
  });
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  using _off = makeResource({}, () => {
    slow.resolve();
    process.off('unhandledRejection', unhandled);
  });
  const reported = vi.fn(() => {
    throw new Error('onError failed');
  });

  const response = fetchRequestHandler({
    endpoint: '/trpc',
    req: pipelinedGet({
      paths: 'list,echo',
      pipe: {
        1: {
          each: { from: 0, path: ['items'] },
          reads: [{ to: [], path: [] }],
        },
      },
    }),
    router,
    experimental_allowPipelining: true,
    onError: reported,
  });
  // The run of `bad` has failed, and `slow` is still pending
  await vi.waitFor(() => expect(reported).toHaveBeenCalled());
  // A turn of the event loop, for Node to report a rejection nothing handles
  await new Promise<void>((resolve) => setImmediate(resolve));
  slow.resolve();
  const json = (await (await response).json()) as any[];

  expect(unhandled).not.toHaveBeenCalled();
  expect(json[1].items[0]).toEqual({ result: { data: 'slow' } });
  expect(json[1].items[1]).toMatchObject({
    error: { data: { code: 'NOT_FOUND' } },
  });
});
