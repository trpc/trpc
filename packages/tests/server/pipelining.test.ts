import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
  TRPCClientError,
} from '@trpc/client';
import {
  createOperationPipeline,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import { initTRPC, TRPCError } from '@trpc/server';
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
    rename: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((opts) => opts.input.id),
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
  }) {
    const { appRouter, calls } = createRouter(scenario.transformer);
    const ctx = testServerAndClientResource(appRouter, {
      server: {
        experimental_allowPipelining: opts.allowPipelining,
        allowMethodOverride: opts.methodOverride === 'POST',
      },
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: clientOpts.transformer as any,
            experimental_pipelining: opts.pipelining,
            methodOverride: opts.methodOverride,
          }),
        ],
      }),
    });
    return Object.assign(ctx, { calls, untyped: getUntypedClient(ctx.client) });
  }

  test('a query reads its input from an earlier query in one request', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline([]);
    const author = createOperationPipeline([
      { to: ['id'], from: post, path: ['authorId'] },
      { to: ['since'], from: post, path: ['publishedAt'] },
    ]);
    const team = createOperationPipeline([
      { to: [], from: author, path: ['teamId'] },
    ]);
    const tags = createOperationPipeline([
      { to: ['ids', '0'], from: post, path: ['tags', '1', 'id'] },
    ]);

    const results = await Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query(
        'author',
        { id: undefined, since: undefined },
        { context: pipelineContext(author) },
      ),
      ctx.untyped.query('team', undefined, { context: pipelineContext(team) }),
      ctx.untyped.query(
        'tags',
        { ids: [undefined, 'extra'] },
        { context: pipelineContext(tags) },
      ),
    ]);

    expect(post.accepted).toBe(true);
    expect(results.slice(1)).toEqual([
      { id: 'u1', teamId: 'team-of-u1' },
      { id: 'team-of-u1' },
      ['t2', 'extra'],
    ]);
    // The server reads the data as the client gets it
    expect(ctx.calls.mock.calls[0]).toEqual([
      'author',
      {
        id: 'u1',
        since:
          scenario.transformer === 'superjson'
            ? new Date('2026-01-01T00:00:00Z')
            : '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    // A pipelined batch is a request of its own kind
    expect(ctx.onRequestSpy.mock.calls[0]![0].url).toContain('batch=2');
    expect(ctx.onRequestSpy.mock.calls[0]![0].url).toContain('pipe=');
  });

  test('works for queries sent as POST', async () => {
    await using ctx = setup({
      allowPipelining: true,
      pipelining: true,
      methodOverride: 'POST',
    });

    const post = createOperationPipeline([]);
    const tags = createOperationPipeline([
      { to: ['ids'], from: post, path: ['tags', null, 'id'] },
    ]);
    const results = await Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query(
        'tags',
        { ids: undefined },
        { context: pipelineContext(tags) },
      ),
    ]);
    expect(results[1]).toEqual(['t1', 't2']);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    const req = ctx.onRequestSpy.mock.calls[0]![0];
    expect(req.method).toBe('POST');
    // The inputs and what to fill in are both in the body
    expect(req.url).not.toContain('pipe=');
    expect(req.url).not.toContain('input=');
  });

  test.each([undefined, 'POST'] as const)(
    'a server without `experimental_allowPipelining` runs nothing of a pipelined batch (methodOverride: %s)',
    async (methodOverride) => {
      await using ctx = setup({
        allowPipelining: false,
        pipelining: true,
        methodOverride,
      });

      const post = createOperationPipeline([]);
      const author = createOperationPipeline([
        { to: ['id'], from: post, path: ['authorId'] },
      ]);
      const results = await Promise.allSettled([
        ctx.untyped.query(
          'post',
          { slug: 'hello' },
          { context: pipelineContext(post) },
        ),
        ctx.untyped.query(
          'author',
          { id: undefined },
          { context: pipelineContext(author) },
        ),
      ]);
      const reason = {
        message:
          'The server did not accept a pipelined batch. Set `experimental_allowPipelining: true` on its handler, or turn off `experimental_pipelining` on the link',
      };
      expect(results).toMatchObject([
        { status: 'rejected', reason },
        { status: 'rejected', reason },
      ]);
      // No call ran with a hole in its input
      expect(ctx.calls).not.toHaveBeenCalled();
    },
  );

  test('a query whose source failed did not run, and is marked unresolved', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const post = createOperationPipeline([]);
    const author = createOperationPipeline([
      { to: ['id'], from: post, path: ['authorId'] },
    ]);
    const results = await Promise.allSettled([
      ctx.untyped.query(
        'post',
        { slug: 'missing' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query(
        'author',
        { id: undefined },
        { context: pipelineContext(author) },
      ),
    ]);

    expect(results).toMatchObject([
      { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
      { status: 'rejected', reason: { data: { code: 'PRECONDITION_FAILED' } } },
    ]);
    expect(post.unresolved).toBe(false);
    expect(author.unresolved).toBe(true);
    expect(ctx.calls).not.toHaveBeenCalled();
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('a query whose source is not in its batch is not sent', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: true });

    const author = createOperationPipeline([
      { to: ['id'], from: createOperationPipeline([]), path: ['authorId'] },
    ]);
    const results = await Promise.allSettled([
      ctx.untyped.query(
        'author',
        { id: undefined },
        { context: pipelineContext(author) },
      ),
      ctx.untyped.query('team', 'team1'),
    ]);
    expect(results).toMatchObject([
      { status: 'rejected', reason: expect.any(TRPCClientError) },
      { status: 'fulfilled', value: { id: 'team1' } },
    ]);
    expect(author.unresolved).toBe(true);
    expect(ctx.calls.mock.calls).toEqual([['team', 'team1']]);
  });

  test('without `experimental_pipelining`, the link sends every operation as it is', async () => {
    await using ctx = setup({ allowPipelining: true, pipelining: false });
    const post = createOperationPipeline([]);
    const author = createOperationPipeline([
      { to: ['id'], from: post, path: ['authorId'] },
    ]);
    const results = await Promise.allSettled([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query(
        'author',
        { id: 'u9' },
        { context: pipelineContext(author) },
      ),
    ]);
    expect(post.accepted).toBe(false);
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { id: 'u9' },
    });
    const { url } = ctx.onRequestSpy.mock.calls[0]![0];
    expect(url).toContain('batch=1');
    expect(url).not.toContain('pipe=');
  });

  test('with `experimental_pipelining`, a batch where nothing reads anything is an ordinary batch', async () => {
    await using ctx = setup({ allowPipelining: false, pipelining: true });
    const post = createOperationPipeline([]);
    const results = await Promise.all([
      ctx.untyped.query(
        'post',
        { slug: 'hello' },
        { context: pipelineContext(post) },
      ),
      ctx.untyped.query('team', 'team1'),
    ]);
    // Another operation could have read from it
    expect(post.accepted).toBe(true);
    expect(results[1]).toEqual({ id: 'team1' });
    const { url } = ctx.onRequestSpy.mock.calls[0]![0];
    expect(url).toContain('batch=1');
    expect(url).not.toContain('pipe=');
  });
});

describe('a server without `experimental_allowPipelining`', () => {
  test('answers as it did before: `pipe` means nothing, and `batch=2` is no batch', async () => {
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
      `${ctx.httpUrl}/post,author?batch=2&input=${input}&pipe=${pipe}`,
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
    const res = await fetch(`${ctx.httpUrl}/${opts.path}?batch=2&${search}`);
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
    ['something that is not an object', 'nope'],
  ])('rejects %s', async (_name, value) => {
    const res = await get(pipe(value), { path: 'post,author' });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/^Invalid "pipe"/);
    expect(res.calls).not.toHaveBeenCalled();
  });

  test('a POST has it in its body, beside the inputs', async () => {
    const { appRouter, calls } = createRouter('none');
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true, allowMethodOverride: true },
    });
    const post = (body: unknown) =>
      fetch(`${ctx.httpUrl}/post,author?batch=2`, {
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
    const res = await fetch(`${ctx.httpUrl}/rename,rename?batch=2`, {
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
