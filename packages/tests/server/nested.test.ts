import { inspect } from 'node:util';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  createTRPCClient,
  experimental_nested,
  experimental_pipelining,
  experimental_settle,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import type {
  experimental_NestedQueries,
  experimental_Node,
  experimental_PipeliningLinkOptions,
  experimental_StandIn,
  TRPCClient,
  TRPCLink,
} from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import {
  createDeferred,
  isObject,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';

interface Post {
  slug: string;
  authorId: string;
}

const posts: Post[] = [
  { slug: 'a', authorId: 'ada' },
  { slug: 'b', authorId: 'bob' },
  { slug: 'c', authorId: 'missing' },
];

function createRouter() {
  const t = initTRPC.create();
  /** Each author's query waits for its gate, if it has one */
  const gates = new Map<string, Promise<void>>();
  const calls = vi.fn();
  const appRouter = t.router({
    post: {
      list: t.procedure
        .input(z.object({ limit: z.number() }))
        .query((opts) => ({
          items: posts.slice(0, opts.input.limit),
          nextCursor: null,
        })),
      bySlug: t.procedure
        .input(z.object({ slug: z.string() }))
        .query((opts) => {
          const post = posts.find((it) => it.slug === opts.input.slug);
          if (!post) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return post;
        }),
      // Lists of lists
      pages: t.procedure.query(() => ({
        pages: [{ items: posts.slice(0, 2) }, { items: posts.slice(1, 2) }],
      })),
    },
    author: {
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(async (opts) => {
          calls('author', opts.input.id);
          await gates.get(opts.input.id);
          if (opts.input.id === 'missing') {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'no author' });
          }
          return { id: opts.input.id, teamId: `team-${opts.input.id}` };
        }),
    },
    team: {
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('team', opts.input.id);
        return { id: opts.input.id, name: `Team ${opts.input.id}` };
      }),
    },
    // Without a transformer, a `Date` goes as a string
    since: t.procedure
      .input(z.object({ at: z.coerce.date() }))
      .query((opts) => opts.input.at.toISOString()),
    // A hole in an array goes as `null`, as JSON writes it
    ids: t.procedure
      .input(z.object({ ids: z.array(z.string().nullable()) }))
      .query((opts) => opts.input.ids),
    rename: t.procedure.input(z.string()).mutation((opts) => opts.input),
  });
  return { appRouter, gates, calls };
}

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)('$name', (scenario) => {
  function setup(opts: {
    pipelining: boolean | experimental_PipeliningLinkOptions;
  }) {
    const { appRouter, gates, calls } = createRouter();
    /** The operations the client sends, as a link before the batch link sees them */
    const ops: string[] = [];
    const recordLink: TRPCLink<AnyRouter> = () => (linkOpts) => {
      ops.push(linkOpts.op.path);
      return linkOpts.next(linkOpts.op);
    };
    const ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          recordLink,
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: opts.pipelining
              ? experimental_pipelining(
                  opts.pipelining === true ? undefined : opts.pipelining,
                )
              : undefined,
          }),
        ],
      }),
    });
    return Object.assign(ctx, { gates, calls, ops });
  }

  /** The request URLs, with `input` and `pipe` decoded */
  function requestsOf(ctx: ReturnType<typeof setup>) {
    return ctx.onRequestSpy.mock.calls.map(([req]) => {
      const url = new URL(req.url!, 'http://localhost');
      const param = (name: string) => {
        const value = url.searchParams.get(name);
        return value === null ? undefined : JSON.parse(value);
      };
      return {
        path: url.pathname,
        batch: url.searchParams.get('batch'),
        input: param('input'),
        pipe: param('pipe'),
      };
    });
  }

  test('a chain goes in one request, and each edge has its own data', async () => {
    await using ctx = setup({ pipelining: true });

    const post = await experimental_nested(ctx.client, (q) =>
      q.post.bySlug.query({ slug: 'a' }).with((it) => {
        const author = q.author.byId.query({ id: it.authorId });
        return {
          author: author.with((a) => ({
            team: q.team.byId.query({ id: a.teamId }),
          })),
        };
      }),
    );

    expect(post.node).toEqual({ slug: 'a', authorId: 'ada' });
    const author = await post.edges.author;
    expect(author.node).toEqual({ id: 'ada', teamId: 'team-ada' });
    expect(await author.edges.team).toEqual({
      id: 'team-ada',
      name: 'Team team-ada',
    });
    expect(requestsOf(ctx)).toEqual([
      {
        path: '/post.bySlug,author.byId,team.byId',
        batch: 'pipeline',
        input: { 0: { slug: 'a' }, 1: {}, 2: {} },
        pipe: {
          1: { reads: [{ to: ['id'], from: 0, path: ['authorId'] }] },
          2: { reads: [{ to: ['id'], from: 1, path: ['teamId'] }] },
        },
      },
    ]);
  });

  test('`.map()` runs a query for every item, in one request', async () => {
    await using ctx = setup({ pipelining: true });

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 2 }).items.map((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      })),
    );

    expect(list.map((it) => it.node)).toEqual(posts.slice(0, 2));
    expect(await Promise.all(list.map((it) => it.edges.author))).toEqual([
      { id: 'ada', teamId: 'team-ada' },
      { id: 'bob', teamId: 'team-bob' },
    ]);
    expect(requestsOf(ctx)).toEqual([
      {
        path: '/post.list,author.byId',
        batch: 'pipeline',
        input: { 0: { limit: 2 }, 1: {} },
        pipe: {
          1: {
            each: { from: 0, path: ['items'] },
            reads: [{ to: ['id'], path: ['authorId'] }],
          },
        },
      },
    ]);
  });

  test("a follow-up of a query for every item runs in that item's frame", async () => {
    await using ctx = setup({ pipelining: true });

    const list = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.list.query({ limit: 2 }).items.map((it) => ({
          author: q.author.byId
            .query({ id: it.authorId })
            .with((a) => ({ team: q.team.byId.query({ id: a.teamId }) })),
        })),
      ),
    );

    expect(list.map((it) => it.edges.author.edges.team.id)).toEqual([
      'team-ada',
      'team-bob',
    ]);
    expect(requestsOf(ctx)).toHaveLength(1);
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: {
        each: { from: 0, path: ['items'] },
        reads: [{ to: ['id'], path: ['authorId'] }],
      },
      // No `each`: it runs once for every run of the call it reads
      2: { reads: [{ to: ['id'], from: 1, path: ['teamId'] }] },
    });
  });

  test('a `.map()` in a `.map()` adds a level of lists', async () => {
    await using ctx = setup({ pipelining: true });

    const pages = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.pages.query().pages.map((page) =>
          page.items.map((it) => ({
            author: q.author.byId.query({ id: it.authorId }),
          })),
        ),
      ),
    );

    expect(
      pages.map((page) => page.map((it) => [it.node.slug, it.edges.author.id])),
    ).toEqual([
      [
        ['a', 'ada'],
        ['b', 'bob'],
      ],
      [['b', 'bob']],
    ]);
    expect(requestsOf(ctx)).toHaveLength(1);
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: {
        each: { from: 0, path: ['pages', null, 'items'] },
        reads: [{ to: ['id'], path: ['authorId'] }],
      },
    });
  });

  test('a `.map()` without edges gives the items, and a query without `.with()` its data', async () => {
    await using ctx = setup({ pipelining: true });

    expect(
      await experimental_nested(ctx.client, (q) =>
        q.post.list.query({ limit: 2 }).items.map(() => ({})),
      ),
    ).toEqual(posts.slice(0, 2));
    expect(
      await experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'b' }),
      ),
    ).toEqual(posts[1]);
  });

  test('a failed edge rejects by itself: the node and the other edges have their data', async () => {
    await using ctx = setup({ pipelining: true });

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 3 }).items.map((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      })),
    );

    expect(list[2]!.node).toEqual(posts[2]);
    await expect(list[2]!.edges.author).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    expect(await list[0]!.edges.author).toMatchObject({ id: 'ada' });
    await expect(experimental_settle(list)).rejects.toMatchObject({
      message: 'no author',
    });
  });

  test('an edge that fails and that nobody reads raises no unhandled rejection', async () => {
    await using ctx = setup({ pipelining: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    using _off = makeResource({}, () =>
      process.off('unhandledRejection', unhandled),
    );

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 3 }).items.map((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      })),
    );
    // Without a handler of the test's own: `inspect()` adds none
    const unread = list[2]!.edges.author;
    await vi.waitFor(() => expect(inspect(unread)).toContain('<rejected>'));
    // The turn in which Node reports a rejection that has no handler
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();
  });

  test('without pipelining, each edge resolves from a request of its own', async () => {
    await using ctx = setup({ pipelining: false });

    const list = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.list.query({ limit: 2 }).items.map((it) => ({
          author: q.author.byId
            .query({ id: it.authorId })
            .with((a) => ({ team: q.team.byId.query({ id: a.teamId }) })),
        })),
      ),
    );

    expect(
      list.map((it) => [
        it.edges.author.node.id,
        it.edges.author.edges.team.id,
      ]),
    ).toEqual([
      ['ada', 'team-ada'],
      ['bob', 'team-bob'],
    ]);
    // The list, then its authors in a batch, then their teams
    const requests = requestsOf(ctx).map((it) => [it.path, it.batch]);
    expect(requests.slice(0, 2)).toEqual([
      ['/post.list', '1'],
      ['/author.byId,author.byId', '1'],
    ]);
    if (scenario.link === httpBatchLink) {
      // The authors arrive together, so their teams go in one batch
      expect(requests.slice(2)).toEqual([['/team.byId,team.byId', '1']]);
    } else {
      // Each team asks once its author has arrived: in one batch or two
      expect(
        requests.slice(2).flatMap(([path]) => path!.slice(1).split(',')),
      ).toEqual(['team.byId', 'team.byId']);
    }
  });

  test('a call over a limit of the link resolves from a request of its own', async () => {
    await using ctx = setup({ pipelining: { maxDepth: 2 } });

    const post = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => ({
          author: q.author.byId
            .query({ id: it.authorId })
            .with((a) => ({ team: q.team.byId.query({ id: a.teamId }) })),
        })),
      ),
    );

    expect(post.edges.author.edges.team.id).toBe('team-ada');
    expect(requestsOf(ctx).map((it) => it.path)).toEqual([
      '/post.bySlug,author.byId',
      '/team.byId',
    ]);
  });

  /** A client and server whose `maxRuns` is `maxRuns` */
  function setupMaxRuns(maxRuns: number) {
    const { appRouter, calls } = createRouter();
    const ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: { maxRuns } },
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining({ maxRuns }),
          }),
        ],
      }),
    });
    return Object.assign(ctx, { calls });
  }

  test("a list whose runs would go over the server's `maxRuns` loads, and its items' queries are asked for by themselves", async () => {
    await using ctx = setupMaxRuns(2);

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 2 }).items.map((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      })),
    );

    // The link counts the list and its call as two runs. The server counts
    // three once the list has arrived, and refuses the call before it runs
    // for any item: each item's query asks by itself
    expect(list.map((it) => it.node)).toEqual(posts.slice(0, 2));
    expect(await Promise.all(list.map((it) => it.edges.author))).toEqual([
      { id: 'ada', teamId: 'team-ada' },
      { id: 'bob', teamId: 'team-bob' },
    ]);
    expect(
      ctx.onRequestSpy.mock.calls.map(([req]) => req.url?.split('?')[0]),
    ).toEqual(['/post.list,author.byId', '/author.byId,author.byId']);
    expect(ctx.calls.mock.calls).toEqual([
      ['author', 'ada'],
      ['author', 'bob'],
    ]);
  });

  test("an inner list whose runs would go over the server's `maxRuns` rejects its items' edges with its error: they are not asked for by themselves", async () => {
    // The pages, and the runs for the two items of the first page
    await using ctx = setupMaxRuns(3);

    const pages = await experimental_nested(ctx.client, (q) =>
      q.post.pages.query().pages.map((page) =>
        page.items.map((it) => ({
          author: q.author.byId.query({ id: it.authorId }),
        })),
      ),
    );

    expect(await pages[0]![1]!.edges.author).toEqual({
      id: 'bob',
      teamId: 'team-bob',
    });
    await expect(pages[1]![0]!.edges.author).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.calls).toHaveBeenCalledTimes(2);
  });

  test('the error of a run that ran rejects its edge: its query is not asked for again', async () => {
    await using ctx = setupMaxRuns(4);

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 3 }).items.map((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      })),
    );

    expect(await list[0]!.edges.author).toEqual({
      id: 'ada',
      teamId: 'team-ada',
    });
    await expect(list[2]!.edges.author).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.calls).toHaveBeenCalledTimes(3);
  });

  test("an item's query that reads a call the server refused asks by itself, once that call's data is there", async () => {
    const t = initTRPC.create();
    const pairs = vi.fn();
    const appRouter = t.router({
      // Longer than the server's `maxValueLength`: no call can read it
      page: t.procedure.query(() => ({
        note: 'x'.repeat(1100),
        items: [{ id: 'a' }, { id: 'b' }],
      })),
      owner: t.procedure
        .input(z.object({ note: z.string() }))
        .query(() => ({ id: 'ada' })),
      pair: t.procedure
        .input(z.object({ owner: z.string(), item: z.string() }))
        .query((opts) => {
          pairs(opts.input);
          return `${opts.input.owner}/${opts.input.item}`;
        }),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    using _restore = makeResource({}, () => warn.mockRestore());

    const page = await experimental_nested(ctx.client, (q) =>
      q.page.query().with((it) => {
        const owner = q.owner.query({ note: it.note });
        return {
          owner,
          pairs: it.items.map((item) => ({
            pair: q.pair.query({ owner: owner.id, item: item.id }),
          })),
        };
      }),
    );

    expect(await page.edges.owner).toEqual({ id: 'ada' });
    const items = await page.edges.pairs;
    expect(await Promise.all(items.map((it) => it.edges.pair))).toEqual([
      'ada/a',
      'ada/b',
    ]);
    expect(pairs.mock.calls).toEqual([
      [{ owner: 'ada', item: 'a' }],
      [{ owner: 'ada', item: 'b' }],
    ]);
  });

  test('an input is read as it was when the query was made, also by a query that asks by itself', async () => {
    await using ctx = setup({ pipelining: false });

    const post = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => {
          const input: { id: unknown } = { id: it.authorId };
          const author = q.author.byId.query(input as { id: string });
          input.id = 'bob';
          return { author };
        }),
      ),
    );

    expect(post.edges.author.id).toBe('ada');
  });

  test('an input is read once, also when the server fills it in', async () => {
    await using ctx = setup({ pipelining: true });
    let reads = 0;

    const post = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => ({
          author: q.author.byId.query({
            get id() {
              reads++;
              return it.authorId;
            },
          }),
        })),
      ),
    );

    expect(post.edges.author.id).toBe('ada');
    expect(reads).toBe(1);
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('a `Date` in an input is read as it was when the query was made', async () => {
    await using ctx = setup({ pipelining: false });

    const since = await experimental_nested(ctx.client, (q) => {
      const at = new Date(0);
      // The copy reads the date's own time, not an override
      at.getTime = () => 2000;
      const call = q.since.query({ at });
      at.setTime(1000);
      return call;
    });

    expect(since).toBe('1970-01-01T00:00:00.000Z');
  });

  test('a sparse array in an input that reads a stand-in reaches the procedure, each hole in its place', async () => {
    await using ctx = setup({ pipelining: true });

    const post = await experimental_settle(
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => {
          const ids = [it.authorId, , 'x', ,] as (string | null)[];
          return { ids: q.ids.query({ ids }) };
        }),
      ),
    );

    expect(post.edges.ids).toEqual(['ada', null, 'x', null]);
  });

  test('a query that asks by itself reads the data as it arrived, not as the caller changed it', async () => {
    await using ctx = setup({ pipelining: false });
    const gate = createDeferred();
    ctx.gates.set('ada', gate.promise);

    const post = await experimental_nested(ctx.client, (q) =>
      q.post.bySlug.query({ slug: 'a' }).with((it) => ({
        // `team` asks once its author has arrived, after the change below
        author: q.author.byId
          .query({ id: it.authorId })
          .with(() => ({ team: q.team.byId.query({ id: it.authorId }) })),
      })),
    );
    post.node.authorId = 'bob';
    gate.resolve();

    const author = await post.edges.author;
    expect(await author.edges.team).toMatchObject({ id: 'ada' });
  });

  test('a query that asks by itself reads an item of a list as it arrived, not as the caller changed it', async () => {
    await using ctx = setup({ pipelining: false });
    const gate = createDeferred();
    ctx.gates.set('ada', gate.promise);

    const list = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 1 }).items.map((it) => ({
        // The post's query asks once the author has arrived, after the change
        author: q.author.byId.query({ id: it.authorId }).with(() => ({
          post: q.post.bySlug.query({ slug: it.slug }),
        })),
      })),
    );
    list[0]!.node.slug = 'b';
    gate.resolve();

    const author = await list[0]!.edges.author;
    expect(await author.edges.post).toEqual(posts[0]);
  });

  test('a query that asks by itself reads a `Map` or a `Set` as it arrived, not as the caller changed it', async () => {
    const t = initTRPC.create({ transformer: superjson });
    const gate = createDeferred<void>();
    const appRouter = t.router({
      data: t.procedure.query(() => ({
        id: 'ada',
        map: new Map([['id', { name: 'ada' }]]),
        set: new Set(['ada']),
      })),
      slow: t.procedure.input(z.string()).query(async () => {
        await gate.promise;
        return 'slow';
      }),
      echo: t.procedure
        .input(
          z.object({
            map: z.map(z.string(), z.object({ name: z.string() })),
            set: z.set(z.string()),
          }),
        )
        .query((opts) => ({
          map: [...opts.input.map.entries()],
          set: [...opts.input.set],
        })),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: superjson,
          }),
        ],
      }),
    });
    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());

    const data = await experimental_nested(ctx.client, (q) =>
      q.data.query().with((it) => ({
        // `slow` asks once the data has arrived, and `echo` once `slow` has,
        // after the change below
        slow: q.slow.query(it.id).with(() => ({
          echo: q.echo.query({ map: it.map, set: it.set }),
        })),
      })),
    );
    data.node.map.get('id')!.name = 'bob';
    data.node.map.set('other', { name: 'eve' });
    data.node.set.add('bob');
    gate.resolve();

    const slow = await data.edges.slow;
    expect(await slow.edges.echo).toEqual({
      map: [['id', { name: 'ada' }]],
      set: ['ada'],
    });
  });

  test('a stand-in in an instance of a class in an input is refused before anything is sent', async () => {
    await using ctx = setup({ pipelining: true });
    class AuthorInput {
      constructor(public id: string | experimental_StandIn<string>) {}
    }

    expect(() =>
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => ({
          author: q.author.byId.query(new AuthorInput(it.authorId)),
        })),
      ),
    ).toThrow('stand-ins in plain objects, arrays and Dates');
    expect(ctx.ops).toEqual([]);
  });

  test('an instance of a class without a stand-in in it is sent as it is', async () => {
    await using ctx = setup({ pipelining: true });
    class AuthorInput {
      constructor(public id: string) {}
    }

    const author = await experimental_nested(ctx.client, (q) =>
      q.author.byId.query(new AuthorInput('ada')),
    );

    expect(author).toEqual({ id: 'ada', teamId: 'team-ada' });
  });

  test('a stand-in of another `experimental_nested()` call can not be read', async () => {
    await using ctx = setup({ pipelining: true });
    let authorId: unknown = null;
    let earlier: unknown = null;
    await experimental_nested(ctx.client, (q) => {
      const post = q.post.bySlug.query({ slug: 'a' });
      authorId = post.authorId;
      earlier = post;
      return post;
    });
    const sent = ctx.ops.length;

    expect(() =>
      experimental_nested(ctx.client, (q) =>
        q.author.byId.query({ id: authorId as string }),
      ),
    ).toThrow('another `experimental_nested()` call');
    expect(() =>
      experimental_nested(
        ctx.client,
        (q) => earlier as ReturnType<typeof q.post.bySlug.query>,
      ),
    ).toThrow('another `experimental_nested()` call');
    expect(ctx.ops).toHaveLength(sent);
  });

  test('a query after a `.map()` callback that threw is not in its list', async () => {
    await using ctx = setup({ pipelining: true });

    const post = await experimental_nested(ctx.client, (q) => {
      const list = q.post.list.query({ limit: 2 });
      expect(() =>
        list.items.map(() => {
          throw new Error('in the callback');
        }),
      ).toThrow('in the callback');
      return q.post.bySlug.query({ slug: 'a' });
    });

    expect(post).toEqual(posts[0]);
    expect(requestsOf(ctx)).toEqual([
      {
        path: '/post.list,post.bySlug',
        batch: '1',
        input: { 0: { limit: 2 }, 1: { slug: 'a' } },
        pipe: undefined,
      },
    ]);
  });

  test('an item can not be the result outside its `.map()`', async () => {
    await using ctx = setup({ pipelining: true });

    expect(() =>
      experimental_nested(ctx.client, (q) => {
        let leaked: unknown = null;
        q.post.list.query({ limit: 1 }).items.map((it) => {
          leaked = it;
          return {};
        });
        return leaked as ReturnType<typeof q.post.bySlug.query>;
      }),
    ).toThrow('outside the `.map()` callback');
    expect(ctx.ops).toEqual([]);
  });

  test('an edge can not read an item outside its `.map()`', async () => {
    await using ctx = setup({ pipelining: true });

    expect(() =>
      experimental_nested(ctx.client, (q) => {
        const post = q.post.bySlug.query({ slug: 'a' });
        let leaked: unknown = null;
        q.post.list.query({ limit: 1 }).items.map((it) => {
          leaked = post.with(() => ({ authorId: it.authorId }));
          return {};
        });
        return leaked as ReturnType<typeof post.with>;
      }),
    ).toThrow('outside the `.map()` callback');
    expect(ctx.ops).toEqual([]);
  });

  test('an edge with a symbol for its key is refused before anything is sent', async () => {
    await using ctx = setup({ pipelining: true });
    const key = Symbol('author');

    expect(() =>
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => ({
          [key]: q.author.byId.query({ id: it.authorId }),
        })),
      ),
    ).toThrow('the key of an edge is a string');
    expect(ctx.ops).toEqual([]);
  });

  test('an edge named `__proto__` is an edge like any other', async () => {
    await using ctx = setup({ pipelining: true });

    const post = await experimental_nested(ctx.client, (q) =>
      q.post.bySlug.query({ slug: 'a' }).with((it) => ({
        ['__proto__']: q.author.byId.query({ id: it.authorId }),
      })),
    );

    expect(Object.keys(post.edges)).toEqual(['__proto__']);
    const settled = await experimental_settle(post);
    expect(Object.keys(settled.edges)).toEqual(['__proto__']);
  });

  test('`q` has no mutations, and a stand-in has no methods', async () => {
    await using ctx = setup({ pipelining: true });

    expect(() =>
      experimental_nested(ctx.client, (q) =>
        // @ts-expect-error - no mutations
        q.rename.mutate('x'),
      ),
    ).toThrow('`q` has queries only');
    expect(() =>
      experimental_nested(ctx.client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((it) => ({
          author: q.author.byId.query({
            // @ts-expect-error - no methods
            id: it.authorId.toUpperCase(),
          }),
        })),
      ),
    ).toThrow('`toUpperCase()` was called on a stand-in');
    expect(ctx.ops).toEqual([]);
  });
});

describe('httpBatchStreamLink', () => {
  test("each item's edge settles by itself: a slow item doesn't hold back the others", async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('bob', gate.promise);
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

    // Also when the test fails: the server's run for Bob must end
    using _release = makeResource({}, () => gate.resolve());
    const loaded = experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 2 }).items.map((it) => ({
        author: q.author.byId
          .query({ id: it.authorId })
          .with((a) => ({ team: q.team.byId.query({ id: a.teamId }) })),
      })),
    );
    // Bounded: the root must not wait for Bob either
    const root = vi.fn();
    void loaded.then(root, () => undefined);
    await vi.waitFor(() => expect(root).toHaveBeenCalled());
    const list = await loaded;
    const adaSettled = vi.fn();
    const bobSettled = vi.fn();
    const ada = list[0]!.edges.author;
    // A rejection fails the test at its `await` below
    void ada.then(adaSettled, () => undefined);
    void list[1]!.edges.author.then(bobSettled, () => undefined);

    // Bounded: if Ada waited for Bob, this fails rather than hangs
    await vi.waitFor(() => expect(adaSettled).toHaveBeenCalled());
    const author = await ada;
    const team = vi.fn();
    void author.edges.team.then(team, () => undefined);
    await vi.waitFor(() =>
      expect(team).toHaveBeenCalledWith({
        id: 'team-ada',
        name: 'Team team-ada',
      }),
    );
    expect(bobSettled).not.toHaveBeenCalled();

    gate.resolve();
    const bob = await list[1]!.edges.author;
    expect(bob.node).toMatchObject({ id: 'bob' });
    expect(await bob.edges.team).toMatchObject({ id: 'team-bob' });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("the error of a call settles its edge at once: it doesn't wait for another call it reads", async () => {
    const t = initTRPC.create();
    const gate = createDeferred<void>();
    const appRouter = t.router({
      // Its data holds a promise, so no call can read it
      withPromise: t.procedure.query(() => ({
        id: 'ada',
        later: Promise.resolve('later'),
      })),
      slow: t.procedure.query(async () => {
        await gate.promise;
        return { id: 'bob' };
      }),
      pair: t.procedure
        .input(z.object({ id: z.string(), other: z.string() }))
        .query((opts) => opts.input),
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

    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const root = await experimental_nested(ctx.client, (q) => {
      const slow = q.slow.query();
      return q.withPromise.query().with((it) => ({
        pair: q.pair.query({ id: it.id, other: slow.id }),
        slow,
      }));
    });
    const rejected = vi.fn();
    void root.edges.pair.then(undefined, rejected);

    // Bounded: if it waited for the slow call, this fails rather than hangs
    await vi.waitFor(() => expect(rejected).toHaveBeenCalled());
    expect(rejected.mock.calls[0]![0]).toMatchObject({
      data: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('the items of a list keep the order they arrived in, also when the caller changes the list before a slow edge maps it', async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('slow', gate.promise);
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

    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const root = await experimental_nested(ctx.client, (q) =>
      q.post.list.query({ limit: 2 }).with((list) => ({
        slow: q.author.byId.query({ id: 'slow' }).with(() => ({
          posts: list.items.map((it) => ({
            author: q.author.byId.query({ id: it.authorId }),
          })),
        })),
      })),
    );
    root.node.items.reverse();
    gate.resolve();

    const slow = await root.edges.slow;
    const items = await slow.edges.posts;
    expect(
      await Promise.all(
        items.map(async (it) => [it.node.authorId, (await it.edges.author).id]),
      ),
    ).toEqual([
      ['ada', 'ada'],
      ['bob', 'bob'],
    ]);
    // The caller's items are the ones it gets
    expect(items[0]!.node).toBe(root.node.items[1]);
  });

  test('the items of a list are the ones that arrived, also when the caller replaces or removes the list before a slow edge maps it', async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('slow', gate.promise);
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

    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const root = await experimental_nested(ctx.client, (q) =>
      q.post.pages.query().with((data) => ({
        slow: q.author.byId.query({ id: 'slow' }).with(() => ({
          pages: data.pages.map((page) =>
            page.items.map((it) => ({
              author: q.author.byId.query({ id: it.authorId }),
            })),
          ),
        })),
      })),
    );
    const [first, second] = root.node.pages;
    root.node.pages = [second!, first!];
    first!.items = [];
    gate.resolve();

    const slow = await root.edges.slow;
    const pages = await slow.edges.pages;
    expect(
      await Promise.all(
        pages.map((page) =>
          Promise.all(
            page.map(async (it) => [
              it.node.authorId,
              (await it.edges.author).id,
            ]),
          ),
        ),
      ),
    ).toEqual([
      [
        ['ada', 'ada'],
        ['bob', 'bob'],
      ],
      [['bob', 'bob']],
    ]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });
});

describe('httpBatchLink, without streaming', () => {
  test('warns once per client in development', async () => {
    const { appRouter } = createRouter();
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchLink({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    using _restore = makeResource({}, () => warn.mockRestore());

    const build = (q: experimental_NestedQueries<typeof appRouter>) =>
      q.post.bySlug.query({ slug: 'a' }).with((it) => ({
        author: q.author.byId.query({ id: it.authorId }),
      }));
    await experimental_settle(experimental_nested(ctx.client, build));
    await experimental_settle(experimental_nested(ctx.client, build));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("doesn't stream");

    // Once per client: another client warns once too
    const other = createTRPCClient<typeof appRouter>(ctx.trpcClientOptions);
    await experimental_settle(experimental_nested(other, build));
    await experimental_settle(experimental_nested(other, build));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("a run whose data the link can't deserialize rejects its edge by itself: the other runs keep their data", async () => {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({ transformer: identity });
    const appRouter = t.router({
      ids: t.procedure.query(() => ['ada', 'bob']),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchLink({
            url: clientOpts.httpUrl,
            transformer: {
              ...identity,
              deserialize: (value: unknown) => {
                if (isObject(value) && value['id'] === 'ada') {
                  throw new Error('cannot read ada');
                }
                return value;
              },
            },
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    using _restore = makeResource({}, () => warn.mockRestore());

    const list = await experimental_nested(ctx.client, (q) =>
      q.ids.query().map((id) => ({ author: q.author.query({ id }) })),
    );

    expect(await list[1]!.edges.author).toEqual({ id: 'bob' });
    await expect(list[0]!.edges.author).rejects.toThrow('cannot read ada');
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("a call that read data the link can't deserialize ran on the server: its edge rejects with its own error", async () => {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({ transformer: identity });
    const teams = vi.fn();
    const appRouter = t.router({
      post: t.procedure.query(() => ({ authorId: 'ada' })),
      author: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id, teamId: 'team-ada' })),
      team: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        teams(opts.input.id);
        throw new TRPCError({ code: 'NOT_FOUND', message: 'no team' });
      }),
    });
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          httpBatchLink({
            url: clientOpts.httpUrl,
            transformer: {
              ...identity,
              deserialize: (value: unknown) => {
                if (isObject(value) && value['teamId'] === 'team-ada') {
                  throw new Error('cannot read the author');
                }
                return value;
              },
            },
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    using _restore = makeResource({}, () => warn.mockRestore());

    const post = await experimental_nested(ctx.client, (q) =>
      q.post.query().with((it) => {
        const author = q.author.query({ id: it.authorId });
        return { author, team: q.team.query({ id: author.teamId }) };
      }),
    );

    await expect(post.edges.author).rejects.toThrow(
      'Unable to transform response from server',
    );
    await expect(post.edges.team).rejects.toThrow('no team');
    expect(teams.mock.calls).toEqual([['team-ada']]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });
});

describe('types', () => {
  const { appRouter } = createRouter();
  const client = {} as TRPCClient<typeof appRouter>;
  type Author = { id: string; teamId: string };
  type Team = { id: string; name: string };
  // Only types are checked: nothing is called
  const check = (fn: () => void) => fn;

  test('shapes', () => {
    check(() => {
      expectTypeOf(
        experimental_nested(client, (q) =>
          q.post.list.query({ limit: 20 }).items.map((post) => ({
            author: q.author.byId.query({ id: post.authorId }),
          })),
        ),
      ).resolves.toEqualTypeOf<
        experimental_Node<Post, { author: Promise<Author> }>[]
      >();

      expectTypeOf(
        experimental_nested(client, (q) =>
          q.post.bySlug.query({ slug: 'a' }).with((post) => {
            const author = q.author.byId.query({ id: post.authorId });
            return {
              author: author.with((a) => ({
                team: q.team.byId.query({ id: a.teamId }),
              })),
            };
          }),
        ),
      ).resolves.toEqualTypeOf<
        experimental_Node<
          Post,
          {
            author: Promise<experimental_Node<Author, { team: Promise<Team> }>>;
          }
        >
      >();

      expectTypeOf(
        experimental_nested(client, (q) => q.post.bySlug.query({ slug: 'a' })),
      ).resolves.toEqualTypeOf<Post>();
      expectTypeOf(
        experimental_nested(client, (q) =>
          q.post.list.query({ limit: 1 }).items.map(() => ({})),
        ),
      ).resolves.toEqualTypeOf<Post[]>();
      expectTypeOf(
        experimental_nested(client, (q) =>
          q.post.pages.query().pages.map((page) =>
            page.items.map((post) => ({
              author: q.author.byId.query({ id: post.authorId }),
            })),
          ),
        ),
      ).resolves.toEqualTypeOf<
        experimental_Node<Post, { author: Promise<Author> }>[][]
      >();
    });
  });

  test('`experimental_settle()` awaits every edge', () => {
    check(() => {
      expectTypeOf(
        experimental_settle(
          experimental_nested(client, (q) =>
            q.post.list.query({ limit: 20 }).items.map((post) => ({
              author: q.author.byId
                .query({ id: post.authorId })
                .with((a) => ({ team: q.team.byId.query({ id: a.teamId }) })),
            })),
          ),
        ),
      ).resolves.toEqualTypeOf<
        experimental_Node<
          Post,
          { author: experimental_Node<Author, { team: Team }> }
        >[]
      >();
    });
  });

  test('`experimental_settle()` keeps a tuple and a readonly array in data as they are', () => {
    const t = initTRPC.create();
    const router = t.router({
      pair: t.procedure.query((): [string, number] => ['ada', 1]),
      names: t.procedure.query((): readonly string[] => ['ada']),
    });
    const tuples = {} as TRPCClient<typeof router>;
    check(() => {
      expectTypeOf(
        experimental_settle(experimental_nested(tuples, (q) => q.pair.query())),
      ).resolves.toEqualTypeOf<[string, number]>();
      expectTypeOf(
        experimental_settle(
          experimental_nested(tuples, (q) => q.names.query()),
        ),
      ).resolves.toEqualTypeOf<readonly string[]>();
      expectTypeOf(
        experimental_settle(
          experimental_nested(tuples, (q) =>
            q.names.query().map(() => ({ pair: q.pair.query() })),
          ),
        ),
      ).resolves.toEqualTypeOf<
        experimental_Node<string, { pair: [string, number] }>[]
      >();
    });
  });

  test('errors', () => {
    check(() => {
      void experimental_nested(client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((post) => ({
          // @ts-expect-error - a stand-in has no methods
          author: q.author.byId.query({ id: post.authorId.toUpperCase() }),
        })),
      );
      void experimental_nested(client, (q) =>
        // @ts-expect-error - `q` has queries only
        q.rename.mutate('x'),
      );
      void experimental_nested(client, (q) =>
        q.post.list.query({ limit: 1 }).with((list) => ({
          // @ts-expect-error - a stand-in of a string is no number
          more: q.post.list.query({ limit: list.items }),
        })),
      );
      void experimental_nested(client, (q) =>
        q.post.bySlug.query({ slug: 'a' }).with((post) => ({
          // @ts-expect-error - a stand-in of a string is no number
          more: q.post.list.query({ limit: post.slug }),
        })),
      );
    });
  });

  test('promises and streams in data get no stand-in', () => {
    type Data = {
      id: string;
      later: Promise<string>;
      feed: AsyncIterable<number>;
      maybe: { id: string } | null;
    };
    expectTypeOf<experimental_StandIn<Data>>().toHaveProperty('id');
    expectTypeOf<experimental_StandIn<Data>>().not.toHaveProperty('later');
    // The proxy is no promise: it has no `then` to read
    expectTypeOf<experimental_StandIn<{ then: string }>>().not.toHaveProperty(
      'then',
    );
    expectTypeOf<experimental_StandIn<Data>>().not.toHaveProperty('feed');
    // It can be `null`: it has no keys to read
    expectTypeOf<experimental_StandIn<Data>['maybe']>().not.toHaveProperty(
      'id',
    );
  });
});
