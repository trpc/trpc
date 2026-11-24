import { inspect } from 'node:util';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  createTRPCClient,
  experimental_dataOf as dataOf,
  experimental_infiniteQuery as infiniteQuery,
  experimental_load,
  experimental_perItem as perItem,
  experimental_pipelining,
  experimental_query as query,
  experimental_settle,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import type {
  experimental_PipeliningLinkOptions,
  experimental_QueryEntry,
  experimental_QueryProcedures,
  OperationContext,
  TRPCClient,
  TRPCLink,
} from '@trpc/client';
import { getUntypedClient } from '@trpc/client';
import type { OperationReads } from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  isPipelineTaken,
  pipelineContext,
  readsContext,
} from '@trpc/client/unstable-internals';
import type { AnyRouter, TRPCDefaultErrorShape } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { tap } from '@trpc/server/observable';
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
interface Author {
  id: string;
  teamId: string;
}
interface Team {
  id: string;
  name: string;
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
      // An infinite query: two posts a page
      feed: t.procedure
        .input(
          z.object({
            cursor: z.number().nullish(),
            direction: z.enum(['forward', 'backward']).optional(),
          }),
        )
        .query((opts) => {
          const start = opts.input.cursor ?? 0;
          return {
            items: posts.slice(start, start + 2),
            nextCursor: start + 2 < posts.length ? start + 2 : null,
            direction: opts.input.direction ?? null,
          };
        }),
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
    book: {
      /** The books of an author */
      byAuthor: t.procedure
        .input(z.object({ authorId: z.string() }))
        .query((opts) => ({
          books: [
            { id: `${opts.input.authorId}-1` },
            { id: `${opts.input.authorId}-2` },
          ],
        })),
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls('book', opts.input.id);
        return { id: opts.input.id, title: `Book ${opts.input.id}` };
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
    allowWholeValues?: boolean;
  }) {
    const { appRouter, gates, calls } = createRouter();
    /** The operations the client sends, as a link before the batch link sees them */
    const ops: string[] = [];
    const contexts: OperationContext[] = [];
    const recordLink: TRPCLink<AnyRouter> = () => (linkOpts) => {
      ops.push(linkOpts.op.path);
      contexts.push(linkOpts.op.context);
      return linkOpts.next(linkOpts.op);
    };
    const ctx = testServerAndClientResource(appRouter, {
      server: {
        experimental_allowPipelining: opts.allowWholeValues
          ? { allowWholeValues: true }
          : true,
      },
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
    return Object.assign(ctx, { gates, calls, ops, contexts });
  }

  /** The request URLs, with `input` and `pipe` decoded */
  function requestsOf(ctx: Pick<ReturnType<typeof setup>, 'onRequestSpy'>) {
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

  /** Quiets the warning of a link that doesn't stream */
  function quietWarnings() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    return makeResource({}, () => warn.mockRestore());
  }

  test('a chain goes in one request, and each entry has its own data', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const author = query(c.author.byId, { id: dataOf(post).authorId });
    const res = experimental_load(c, {
      post,
      author,
      team: query(c.team.byId, { id: dataOf(author).teamId }),
    });

    expect(await res.post).toEqual({ slug: 'a', authorId: 'ada' });
    expect(await res.author).toEqual({ id: 'ada', teamId: 'team-ada' });
    expect(await res.team).toEqual({ id: 'team-ada', name: 'Team team-ada' });
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

  test('an entry built with `experimental_dataOf(entry, (data) => entry)` sends what the form without a callback sends', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const author = query(c.author.byId, { id: dataOf(post).authorId });
    const plain = await experimental_settle(
      experimental_load(c, {
        post,
        author,
        team: query(c.team.byId, { id: dataOf(author).teamId }),
      }),
    );
    const fromData = dataOf(post, (it) =>
      query(c.author.byId, { id: it.authorId }),
    );
    const withCallback = experimental_load(c, {
      post,
      author: fromData,
      // An entry built from another's data can be read too
      team: dataOf(fromData, (it) => query(c.team.byId, { id: it.teamId })),
    });

    expect(await experimental_settle(withCallback)).toEqual(plain);
    expect(await withCallback.team).toEqual({
      id: 'team-ada',
      name: 'Team team-ada',
    });
    const [first, second] = requestsOf(ctx);
    expect(second).toEqual(first);
    expect(first!.path).toBe('/post.bySlug,author.byId,team.byId');
  });

  test('`experimental_perItem()` runs a query for every item, in one request', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const res = experimental_load(c, {
      list,
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, { id: it.authorId }),
      ),
    });

    expect((await res.list).items).toEqual(posts.slice(0, 2));
    expect(await Promise.all(await res.authors)).toEqual([
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
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const res = await experimental_settle(
      experimental_load(c, {
        teams: perItem(dataOf(list).items, (it) => {
          const author = query(c.author.byId, { id: it.authorId });
          return query(c.team.byId, { id: dataOf(author).teamId });
        }),
      }),
    );

    expect(res.teams.map((it) => it.id)).toEqual(['team-ada', 'team-bob']);
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

  test('two entries per item over the same list share its items: one can read the other', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const items = dataOf(query(c.post.list, { limit: 2 })).items;
    let author!: experimental_QueryEntry<unknown, Author>;
    const res = await experimental_settle(
      experimental_load(c, {
        authors: perItem(items, (it) => {
          author = query(c.author.byId, { id: it.authorId });
          return author;
        }),
        teams: perItem(items, () =>
          query(c.team.byId, { id: dataOf(author).teamId }),
        ),
      }),
    );

    expect(res.authors.map((it) => it.id)).toEqual(['ada', 'bob']);
    expect(res.teams.map((it) => it.id)).toEqual(['team-ada', 'team-bob']);
    // Each author ran once
    expect(ctx.calls.mock.calls.filter(([kind]) => kind === 'author')).toEqual([
      ['author', 'ada'],
      ['author', 'bob'],
    ]);
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('`experimental_perItem()` takes an object of entries for every item, which read each other, in one request', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const res = experimental_load(c, {
      rows: perItem(dataOf(list).items, (post) => {
        const author = query(c.author.byId, { id: post.authorId });
        return {
          author,
          team: query(c.team.byId, { id: dataOf(author).teamId }),
          skipped: null,
        };
      }),
    });

    const rows = await res.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.skipped).toBeNull();
    expect(await rows[1]!.team).toEqual({
      id: 'team-bob',
      name: 'Team team-bob',
    });
    expect(await experimental_settle(res)).toEqual({
      rows: [
        {
          author: { id: 'ada', teamId: 'team-ada' },
          team: { id: 'team-ada', name: 'Team team-ada' },
          skipped: null,
        },
        {
          author: { id: 'bob', teamId: 'team-bob' },
          team: { id: 'team-bob', name: 'Team team-bob' },
          skipped: null,
        },
      ],
    });
    // Each author runs once
    expect(ctx.calls.mock.calls.filter(([what]) => what === 'author')).toEqual([
      ['author', 'ada'],
      ['author', 'bob'],
    ]);
    expect(requestsOf(ctx)).toHaveLength(1);
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: {
        each: { from: 0, path: ['items'] },
        reads: [{ to: ['id'], path: ['authorId'] }],
      },
      2: { reads: [{ to: ['id'], from: 1, path: ['teamId'] }] },
    });
  });

  test('an entry per item nests: a list per item, of a list in an entry of the item or in the item', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const pages = query(c.post.pages);
    const res = await experimental_settle(
      experimental_load(c, {
        posts: perItem(dataOf(list).items, (post) => {
          const books = query(c.book.byAuthor, { authorId: post.authorId });
          return {
            books: perItem(dataOf(books).books, (book) =>
              query(c.book.byId, { id: book.id }),
            ),
          };
        }),
        pages: perItem(dataOf(pages).pages, (page) => ({
          authors: perItem(page.items, (post) =>
            query(c.author.byId, { id: post.authorId }),
          ),
        })),
      }),
    );

    expect(res.posts.map((post) => post.books.map((book) => book.id))).toEqual([
      ['ada-1', 'ada-2'],
      ['bob-1', 'bob-2'],
    ]);
    expect(
      res.pages.map((page) => page.authors.map((author) => author.id)),
    ).toEqual([['ada', 'bob'], ['bob']]);
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('an entry per item of a list in an entry that runs for every item is one flat list, in that order', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    let books!: ReturnType<typeof bookList>;
    const bookList = (authorId: string) => query(c.book.byAuthor, { authorId });
    const res = experimental_load(c, {
      lists: perItem(dataOf(list).items, (post) => {
        books = bookList(post.authorId);
        return books;
      }),
      titles: perItem(dataOf(books).books, (book) =>
        query(c.book.byId, { id: book.id }),
      ),
    });

    expect(
      (await experimental_settle(res.titles)).map((book) => book.id),
    ).toEqual(['ada-1', 'ada-2', 'bob-1', 'bob-2']);
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('`null` skips an entry', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    const isAdmin = false as boolean;

    const res = experimental_load(c, {
      post: query(c.post.bySlug, { slug: 'a' }),
      draft: isAdmin ? query(c.post.bySlug, { slug: 'b' }) : null,
      group: { nothing: null },
    });

    expect(res.draft).toBeNull();
    expect(res.group.nothing).toBeNull();
    expectTypeOf(res.draft).toEqualTypeOf<Promise<Post> | null>();
    expect(await experimental_settle(res)).toEqual({
      post: posts[0],
      draft: null,
      group: { nothing: null },
    });
  });

  test('`.flatMap()` runs a query for the items of every list in a list, as one flat list', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const pages = query(c.post.pages);
    const res = await experimental_settle(
      experimental_load(c, {
        authors: perItem(
          dataOf(pages).pages.flatMap((page) => page.items),
          (it) => query(c.author.byId, { id: it.authorId }),
        ),
      }),
    );

    expect(res.authors.map((it) => it.id)).toEqual(['ada', 'bob', 'bob']);
    expect(requestsOf(ctx)).toHaveLength(1);
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: {
        each: { from: 0, path: ['pages', null, 'items'] },
        reads: [{ to: ['id'], path: ['authorId'] }],
      },
    });
  });

  test('a query loads its data, and an entry per item whose query reads no item runs it once for all of them', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    expect(
      await experimental_load(c, { post: query(c.post.bySlug, { slug: 'b' }) })
        .post,
    ).toEqual(posts[1]);
    const list = query(c.post.list, { limit: 2 });
    const res = await experimental_settle(
      experimental_load(c, {
        same: perItem(dataOf(list).items, () =>
          query(c.post.bySlug, { slug: 'a' }),
        ),
      }),
    );
    expect(res.same).toEqual([posts[0], posts[0]]);
    expect(requestsOf(ctx).map((it) => it.path)).toEqual([
      '/post.bySlug',
      '/post.list,post.bySlug',
    ]);
  });

  test('the result has the groups of the entries', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(c, {
      post,
      people: {
        author: query(c.author.byId, { id: dataOf(post).authorId }),
        deeper: { team: query(c.team.byId, { id: 'team-x' }) },
      },
    });

    expect(Object.keys(res)).toEqual(['post', 'people']);
    expect(await res.people.author).toMatchObject({ id: 'ada' });
    expect(await experimental_settle(res)).toEqual({
      post: posts[0],
      people: {
        author: { id: 'ada', teamId: 'team-ada' },
        deeper: { team: { id: 'team-x', name: 'Team team-x' } },
      },
    });
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('an entry that another reads loads also when it is not in the entries, and an entry loads again in another load', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    expect(await experimental_load(c, { post }).post).toEqual(posts[0]);
    const res = experimental_load(c, {
      author: query(c.author.byId, { id: dataOf(post).authorId }),
    });

    expect(Object.keys(res)).toEqual(['author']);
    expect(await res.author).toMatchObject({ id: 'ada' });
    expect(requestsOf(ctx).map((it) => it.path)).toEqual([
      '/post.bySlug',
      '/post.bySlug,author.byId',
    ]);
  });

  test('an entry with a context of its own goes in a request of its own, with its context', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(
      c,
      {
        post,
        author: query(
          c.author.byId,
          { id: dataOf(post).authorId },
          { context: { route: 'elsewhere' } },
        ),
      },
      { context: { shared: true } },
    );

    expect(await res.author).toMatchObject({ id: 'ada' });
    expect(requestsOf(ctx).map((it) => it.path)).toEqual([
      '/post.bySlug',
      '/author.byId',
    ]);
    expect(ctx.contexts.at(-1)).toEqual({ shared: true, route: 'elsewhere' });
  });

  test('`.map()` of a list in an input is read by the server only with `allowWholeValues`, else asked for by itself', async () => {
    {
      await using ctx = setup({ pipelining: true });
      using _quiet = quietWarnings();
      const c = ctx.client;
      const list = query(c.post.list, { limit: 2 });
      const res = experimental_load(c, {
        ids: query(c.ids, {
          ids: dataOf(list).items.map((it) => it.authorId),
        }),
      });

      expect(await res.ids).toEqual(['ada', 'bob']);
      expect(requestsOf(ctx).map((it) => [it.path, it.batch])).toEqual([
        ['/post.list,ids', 'pipeline'],
        ['/ids', '1'],
      ]);
    }
    {
      await using ctx = setup({ pipelining: true, allowWholeValues: true });
      const c = ctx.client;
      const list = query(c.post.list, { limit: 2 });
      const res = experimental_load(c, {
        ids: query(c.ids, {
          ids: dataOf(list).items.map((it) => it.authorId),
        }),
      });

      expect(await res.ids).toEqual(['ada', 'bob']);
      expect(requestsOf(ctx)).toEqual([
        {
          path: '/post.list,ids',
          batch: 'pipeline',
          input: { 0: { limit: 2 }, 1: {} },
          pipe: {
            1: {
              reads: [
                { to: ['ids'], from: 0, path: ['items', null, 'authorId'] },
              ],
            },
          },
        },
      ]);
    }
  });

  describe('`experimental_infiniteQuery()`', () => {
    test('loads the first page, as `{ pages, pageParams }`', async () => {
      await using ctx = setup({ pipelining: true });
      const c = ctx.client;

      const res = experimental_load(c, {
        feed: infiniteQuery(c.post.feed, {}),
      });

      expect(await res.feed).toEqual({
        pages: [
          { items: posts.slice(0, 2), nextCursor: 2, direction: 'forward' },
        ],
        pageParams: [undefined],
      });
      expect(requestsOf(ctx)[0]!.input).toEqual({
        0: { direction: 'forward' },
      });
    });

    test('`initialCursor` takes the place of the input’s cursor', async () => {
      await using ctx = setup({ pipelining: true });
      const c = ctx.client;

      const res = experimental_load(c, {
        feed: infiniteQuery(c.post.feed, { cursor: 0 }, { initialCursor: 1 }),
      });

      expect(await res.feed).toEqual({
        pages: [
          { items: posts.slice(1, 3), nextCursor: null, direction: 'forward' },
        ],
        pageParams: [1],
      });
      expect(requestsOf(ctx)[0]!.input).toEqual({
        0: { cursor: 1, direction: 'forward' },
      });
    });

    test('an entry per item of every page runs in the first page’s request', async () => {
      await using ctx = setup({ pipelining: true });
      const c = ctx.client;

      const feed = infiniteQuery(c.post.feed, {});
      const res = await experimental_settle(
        experimental_load(c, {
          feed,
          authors: perItem(
            dataOf(feed).pages.flatMap((page) => page.items),
            (it) => query(c.author.byId, { id: it.authorId }),
          ),
          first: query(c.post.bySlug, {
            slug: dataOf(feed).pages[0]!.items[0]!.slug,
          }),
        }),
      );

      expect(res.authors.map((it) => it.id)).toEqual(['ada', 'bob']);
      expect(res.first).toEqual(posts[0]);
      expect(requestsOf(ctx)).toEqual([
        {
          path: '/post.feed,author.byId,post.bySlug',
          batch: 'pipeline',
          input: { 0: { direction: 'forward' }, 1: {}, 2: {} },
          pipe: {
            1: {
              each: { from: 0, path: ['items'] },
              reads: [{ to: ['id'], path: ['authorId'] }],
            },
            2: {
              reads: [{ to: ['slug'], from: 0, path: ['items', '0', 'slug'] }],
            },
          },
        },
      ]);
    });
  });

  test('a failed entry rejects by itself: the list and the other items have their data', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 3 });
    const res = experimental_load(c, {
      list,
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, { id: it.authorId }),
      ),
    });
    const authors = await res.authors;

    expect((await res.list).items[2]).toEqual(posts[2]);
    await expect(authors[2]).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    expect(await authors[0]).toMatchObject({ id: 'ada' });
    await expect(experimental_settle(res)).rejects.toMatchObject({
      message: 'no author',
    });
  });

  test('an entry that fails and that nobody reads raises no unhandled rejection', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    using _off = makeResource({}, () =>
      process.off('unhandledRejection', unhandled),
    );

    const list = query(c.post.list, { limit: 3 });
    const res = experimental_load(c, {
      missing: query(c.author.byId, { id: 'missing' }),
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, { id: it.authorId }),
      ),
    });
    // Without a handler of the test's own: `inspect()` adds none
    const unread = (await res.authors)[2]!;
    await vi.waitFor(() => expect(inspect(unread)).toContain('<rejected>'));
    await vi.waitFor(() =>
      expect(inspect(res.missing)).toContain('<rejected>'),
    );
    // The turn in which Node reports a rejection that has no handler
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();
  });

  test('without pipelining, each entry resolves from a request of its own', async () => {
    await using ctx = setup({ pipelining: false });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const items = dataOf(list).items;
    let author!: experimental_QueryEntry<unknown, Author>;
    const res = await experimental_settle(
      experimental_load(c, {
        authors: perItem(items, (it) => {
          author = query(c.author.byId, { id: it.authorId });
          return author;
        }),
        teams: perItem(items, () =>
          query(c.team.byId, { id: dataOf(author).teamId }),
        ),
      }),
    );

    expect(
      res.authors.map((it, index) => [it.id, res.teams[index]!.id]),
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
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const author = query(c.author.byId, { id: dataOf(post).authorId });
    const res = experimental_load(c, {
      team: query(c.team.byId, { id: dataOf(author).teamId }),
    });

    expect((await res.team).id).toBe('team-ada');
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
    using _quiet = quietWarnings();
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const res = experimental_load(c, {
      list,
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, { id: it.authorId }),
      ),
    });

    // The link counts the list and its call as two runs. The server counts
    // three once the list has arrived, and refuses the call before it runs
    // for any item: each item's query asks by itself
    expect((await res.list).items).toEqual(posts.slice(0, 2));
    expect(await Promise.all(await res.authors)).toEqual([
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

  test("an inner list whose runs would go over the server's `maxRuns` rejects its items with its error: they are not asked for by themselves", async () => {
    // The pages, and the runs for the two items of the first page
    await using ctx = setupMaxRuns(3);
    const c = ctx.client;

    const pages = query(c.post.pages);
    const res = experimental_load(c, {
      authors: perItem(
        dataOf(pages).pages.flatMap((page) => page.items),
        (it) => query(c.author.byId, { id: it.authorId }),
      ),
    });
    const authors = await res.authors;

    expect(await authors[1]).toEqual({ id: 'bob', teamId: 'team-bob' });
    await expect(authors[2]).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.calls).toHaveBeenCalledTimes(2);
  });

  test('the error of a run that ran rejects its item: its query is not asked for again', async () => {
    await using ctx = setupMaxRuns(4);
    const c = ctx.client;

    const list = query(c.post.list, { limit: 3 });
    const authors = await experimental_load(c, {
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, { id: it.authorId }),
      ),
    }).authors;

    expect(await authors[0]).toEqual({ id: 'ada', teamId: 'team-ada' });
    await expect(authors[2]).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.calls).toHaveBeenCalledTimes(3);
  });

  /** A client and server that pipeline, for a router of a test's own */
  function setupRouter<TRouter extends AnyRouter>(
    router: TRouter,
    opts: { transformer?: any } = {},
  ) {
    // Cast: the options of a server and client for any router
    return testServerAndClientResource(router, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts: { httpUrl: string }) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: opts.transformer,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    } as any);
  }

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
    await using ctx = setupRouter(appRouter);
    using _quiet = quietWarnings();
    const c = ctx.client;

    const page = query(c.page);
    const owner = query(c.owner, { note: dataOf(page).note });
    const res = experimental_load(c, {
      owner,
      pairs: perItem(dataOf(page).items, (item) =>
        query(c.pair, { owner: dataOf(owner).id, item: item.id }),
      ),
    });

    expect(await res.owner).toEqual({ id: 'ada' });
    expect(await Promise.all(await res.pairs)).toEqual(['ada/a', 'ada/b']);
    expect(pairs.mock.calls).toEqual([
      [{ owner: 'ada', item: 'a' }],
      [{ owner: 'ada', item: 'b' }],
    ]);
  });

  test("a call's own error with `pipeline: 'not-run'` in the `data` an `errorFormatter` made rejects its entry: it is not asked for again", async () => {
    const t = initTRPC.create({
      errorFormatter: ({ shape }) => ({
        ...shape,
        data: { ...shape.data, pipeline: 'not-run' },
      }),
    });
    const authors = vi.fn();
    const appRouter = t.router({
      post: t.procedure.query(() => ({ authorId: 'ada' })),
      author: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        authors(opts.input.id);
        throw new TRPCError({ code: 'NOT_FOUND', message: 'no author' });
      }),
    });
    await using ctx = setupRouter(appRouter);
    using _quiet = quietWarnings();
    const c = ctx.client;

    const post = query(c.post);
    const res = experimental_load(c, {
      author: query(c.author, { id: dataOf(post).authorId }),
    });

    await expect(res.author).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    expect(authors.mock.calls).toEqual([['ada']]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("a call that reads a call the server refused asks by itself, also when the `errorFormatter`'s shape writes JSON without its `data`", async () => {
    const t = initTRPC.create({
      errorFormatter: ({ shape }) => ({
        ...shape,
        toJSON: () => ({ message: shape.message, code: shape.code }),
      }),
    });
    const teams = vi.fn();
    const appRouter = t.router({
      // Longer than the server's `maxValueLength`: no call can read it
      page: t.procedure.query(() => ({ note: 'x'.repeat(1100) })),
      owner: t.procedure
        .input(z.object({ note: z.string() }))
        .query(() => ({ id: 'ada' })),
      team: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        teams(opts.input.id);
        return `team-${opts.input.id}`;
      }),
    });
    await using ctx = setupRouter(appRouter);
    using _quiet = quietWarnings();
    const c = ctx.client;

    const page = query(c.page);
    const owner = query(c.owner, { note: dataOf(page).note });
    const res = experimental_load(c, {
      owner,
      team: query(c.team, { id: dataOf(owner).id }),
    });

    expect(await res.owner).toEqual({ id: 'ada' });
    expect(await res.team).toBe('team-ada');
    expect(teams.mock.calls).toEqual([['ada']]);
    // The first request pipelined both: they asked by themselves after it
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: { reads: [{ to: ['note'], from: 0, path: ['note'] }] },
      2: { reads: [{ to: ['id'], from: 1, path: ['id'] }] },
    });
  });

  test("a run's error that the transformer writes as a falsy value is the run's error, not a run the server left out", async () => {
    /** What the transformer reads back from the `0` it writes for an error */
    const errorShape = {
      message: 'no author',
      code: -32004,
      data: { code: 'NOT_FOUND', httpStatus: 404 },
    };
    const isErrorShape = (value: unknown) =>
      isObject(value) &&
      typeof value['message'] === 'string' &&
      typeof value['code'] === 'number' &&
      isObject(value['data']);
    const transformer = {
      input: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      },
      output: {
        serialize: (value: unknown) => (isErrorShape(value) ? 0 : value),
        deserialize: (value: unknown) => (value === 0 ? errorShape : value),
      },
    };
    const t = initTRPC.create({ transformer });
    const authors = vi.fn();
    const appRouter = t.router({
      list: t.procedure.query(() => ({ items: [{ id: 'ada' }, { id: 'x' }] })),
      author: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        authors(opts.input.id);
        if (opts.input.id === 'x') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'no author' });
        }
        return { id: opts.input.id };
      }),
    });
    await using ctx = setupRouter(appRouter, { transformer });
    const c = ctx.client;

    const items = await experimental_load(c, {
      authors: perItem(dataOf(query(c.list)).items, (item) =>
        query(c.author, { id: item.id }),
      ),
    }).authors;

    expect(await items[0]).toEqual({ id: 'ada' });
    await expect(items[1]).rejects.toMatchObject({
      message: 'no author',
      data: { code: 'NOT_FOUND' },
    });
    // Each ran once, in the one request: none was asked for again
    expect(authors.mock.calls).toEqual([['ada'], ['x']]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('an entry per item of a list in the data of a call the server refused asks for each item by itself, once that call’s data is there', async () => {
    const t = initTRPC.create();
    const tags = vi.fn();
    const appRouter = t.router({
      // Longer than the server's `maxValueLength`: no call can read it
      page: t.procedure.query(() => ({ note: 'x'.repeat(1100) })),
      owner: t.procedure
        .input(z.object({ note: z.string() }))
        .query(() => ({ tags: ['a', 'b'] })),
      tag: t.procedure.input(z.object({ kind: z.string() })).query((opts) => {
        tags(opts.input.kind);
        return opts.input.kind;
      }),
    });
    await using ctx = setupRouter(appRouter);
    using _quiet = quietWarnings();
    const c = ctx.client;

    const owner = query(c.owner, { note: dataOf(query(c.page)).note });
    const res = experimental_load(c, {
      owner,
      tags: perItem(dataOf(owner).tags, (kind) => query(c.tag, { kind })),
    });

    expect(await res.owner).toEqual({ tags: ['a', 'b'] });
    expect(await Promise.all(await res.tags)).toEqual(['a', 'b']);
    expect(tags.mock.calls).toEqual([['a'], ['b']]);
    // The first request pipelined both: they asked by themselves after it
    expect(requestsOf(ctx)[0]!.pipe).toEqual({
      1: { reads: [{ to: ['note'], from: 0, path: ['note'] }] },
      2: {
        each: { from: 1, path: ['tags'] },
        reads: [{ to: ['kind'], path: [] }],
      },
    });
  });

  test('an input is read as it was when its entry was made, also by a query that asks by itself', async () => {
    await using ctx = setup({ pipelining: false });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const input: { id: unknown } = { id: dataOf(post).authorId };
    const author = query(c.author.byId, input as { id: string });
    input.id = 'bob';
    const res = experimental_load(c, { author });

    expect((await res.author).id).toBe('ada');
  });

  test('an input is read once, when its entry is made, also when the server fills it in', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    let reads = 0;

    const post = query(c.post.bySlug, { slug: 'a' });
    const author = query(c.author.byId, {
      get id() {
        reads++;
        return dataOf(post).authorId;
      },
    });
    expect(reads).toBe(1);
    const res = experimental_load(c, { author });

    expect((await res.author).id).toBe('ada');
    expect(reads).toBe(1);
    expect(requestsOf(ctx)).toHaveLength(1);
  });

  test('a sparse array in an input that reads another entry reaches the procedure, each hole in its place', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const ids = [dataOf(post).authorId, , 'x', ,] as (string | null)[];
    const res = experimental_load(c, { ids: query(c.ids, { ids }) });

    expect(await res.ids).toEqual(['ada', null, 'x', null]);
  });

  test('a query that asks by itself reads the data as it arrived, not as the caller changed it', async () => {
    await using ctx = setup({ pipelining: false });
    const c = ctx.client;
    const gate = createDeferred();
    ctx.gates.set('ada', gate.promise);

    const post = query(c.post.bySlug, { slug: 'a' });
    const author = query(c.author.byId, { id: dataOf(post).authorId });
    const res = experimental_load(c, {
      post,
      // `team` asks once its author has arrived, after the change below
      team: query(c.team.byId, {
        id: dataOf(post).authorId,
        after: dataOf(author).id,
      } as { id: string }),
    });
    (await res.post).authorId = 'bob';
    gate.resolve();

    expect(await res.team).toMatchObject({ id: 'ada' });
  });

  test('a query that asks by itself reads an item of a list as it arrived, not as the caller changed it', async () => {
    await using ctx = setup({ pipelining: false });
    const c = ctx.client;
    const gate = createDeferred();
    ctx.gates.set('ada', gate.promise);

    const list = query(c.post.list, { limit: 1 });
    const items = dataOf(list).items;
    let author!: experimental_QueryEntry<unknown, Author>;
    const res = experimental_load(c, {
      list,
      authors: perItem(items, (it) => {
        author = query(c.author.byId, { id: it.authorId });
        return author;
      }),
      // The post's query asks once the author has arrived, after the change
      posts: perItem(items, (it) =>
        query(c.post.bySlug, {
          slug: it.slug,
          after: dataOf(author).id,
        } as { slug: string }),
      ),
    });
    (await res.list).items[0]!.slug = 'b';
    gate.resolve();

    expect(await (await res.posts)[0]).toEqual(posts[0]);
  });

  test('a query that reads the whole data of a query whose data has a cycle gets it', async () => {
    const t = initTRPC.create({ transformer: superjson });
    const appRouter = t.router({
      data: t.procedure.query(() => {
        const data: { id: string; self?: unknown } = { id: 'ada' };
        data.self = data;
        return data;
      }),
      echo: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => opts.input.id),
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
    const c = ctx.client;

    const data = query(c.data);
    const res = experimental_load(c, {
      data,
      echo: query(c.echo, dataOf(data)),
    });

    expect((await res.data).id).toBe('ada');
    expect(await res.echo).toBe('ada');
  });

  test('an instance of a class without an `experimental_dataOf()` value in it is sent as it is', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    class AuthorInput {
      constructor(public id: string) {}
    }

    const res = experimental_load(c, {
      author: query(c.author.byId, new AuthorInput('ada')),
    });

    expect(await res.author).toEqual({ id: 'ada', teamId: 'team-ada' });
  });

  test('a description that can not load is refused before anything is sent', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const other = query(c.post.list, { limit: 1 });
    let item!: experimental_QueryEntry<unknown, Author>;
    let otherItem!: experimental_QueryEntry<unknown, Author>;
    const authors = perItem(dataOf(list).items, (it) => {
      item = query(c.author.byId, { id: it.authorId });
      return item;
    });
    const otherAuthors = perItem(dataOf(other).items, (it) => {
      otherItem = query(c.author.byId, { id: it.authorId });
      return otherItem;
    });

    // An item's entry, outside an entry per item
    expect(() => experimental_load(c, { item })).toThrow(
      'reads an item of a list',
    );
    // The items of two lists
    expect(() =>
      experimental_load(c, {
        authors,
        otherAuthors,
        pair: perItem(dataOf(list).items, () =>
          query(c.ids, { ids: [dataOf(item).id, dataOf(otherItem).id] }),
        ),
      }),
    ).toThrow('reads the items of two lists');
    // Not an entry
    expect(() =>
      experimental_load(c, { post: { slug: 'a' } } as never),
    ).toThrow('is no entry');
    expect(ctx.ops).toEqual([]);

    // The callback of an entry per item returns entries
    expect(() =>
      perItem(dataOf(list).items, () => ({ slug: 'a' }) as never),
    ).toThrow('must return an entry');
    // A `.flatMap()` value is only a list of an entry per item
    expect(() =>
      query(c.ids, {
        ids: dataOf(query(c.post.pages)).pages.flatMap(
          (page) => page.items,
        ) as never,
      }),
    ).toThrow('can only be the list of `experimental_perItem()`');
    // A value is passed on, not computed with
    expect(() =>
      query(c.author.byId, { id: dataOf(list).items[0]!.slug.toUpperCase() }),
    ).toThrow('has no data until the load runs');
    // A procedure of a client or an options proxy
    expect(() => query({} as never, {} as never)).toThrow(
      'expects a procedure',
    );
    expect(() => dataOf({} as never)).toThrow('expects an entry');
  });

  test('an entry named `__proto__` is an entry like any other', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(c, {
      ['__proto__']: query(c.author.byId, { id: dataOf(post).authorId }),
    });

    expect(Object.keys(res)).toEqual(['__proto__']);
    const settled = await experimental_settle(res);
    expect(Object.keys(settled)).toEqual(['__proto__']);
    expect(
      Object.getOwnPropertyDescriptor(settled, '__proto__')!.value,
    ).toEqual({ id: 'ada', teamId: 'team-ada' });
  });

  test.each([
    { name: 'with', any: true },
    { name: 'without', any: false },
  ])(
    "the caller's signal aborts a query that reads another, and keeps no listener once the load is done, $name `AbortSignal.any()`",
    async (opts) => {
      await using ctx = setup({ pipelining: true });
      const c = ctx.client;
      const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
      using _any = makeResource({}, () => {
        Object.defineProperty(AbortSignal, 'any', any);
      });
      if (!opts.any) {
        // As in a runtime without it
        Object.defineProperty(AbortSignal, 'any', { ...any, value: undefined });
      }
      const listening = new Set<unknown>();
      const watched = (signal: AbortSignal) => {
        const add = signal.addEventListener.bind(signal);
        const remove = signal.removeEventListener.bind(signal);
        signal.addEventListener = (type: string, listener: any, opts?: any) => {
          listening.add(listener);
          add(type, listener, opts);
        };
        signal.removeEventListener = (type: string, listener: any) => {
          listening.delete(listener);
          remove(type, listener);
        };
        return signal;
      };

      {
        const post = query(c.post.bySlug, { slug: 'a' });
        const list = query(c.post.list, { limit: 2 });
        const signal = watched(new AbortController().signal);
        await experimental_settle(
          experimental_load(
            c,
            {
              post,
              author: query(c.author.byId, { id: dataOf(post).authorId }),
              // A call for every item, whose runs arrive after its result
              authors: perItem(dataOf(list).items, (it) =>
                query(c.author.byId, { id: it.authorId }),
              ),
            },
            { signal },
          ),
        );
        await vi.waitFor(() => expect(listening.size).toBe(0));
      }
      {
        const gate = createDeferred();
        ctx.gates.set('ada', gate.promise);
        using _release = makeResource({}, () => gate.resolve());
        // Only this load's calls: the first one's author ran already
        ctx.calls.mockClear();
        const abort = new AbortController();
        const post = query(c.post.bySlug, { slug: 'a' });
        const res = experimental_load(
          c,
          { post, author: query(c.author.byId, { id: dataOf(post).authorId }) },
          { signal: abort.signal },
        );
        res.post.catch(() => null);
        // The author's query runs on the server, and waits for its gate
        await vi.waitFor(() =>
          expect(ctx.calls).toHaveBeenCalledWith('author', 'ada'),
        );
        abort.abort();

        await expect(res.author).rejects.toThrow();
      }
    },
  );

  test('an input with a cycle is refused as its entry is made, and one object in two places is not a cycle', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    const cyclic: { id: string; self?: unknown } = { id: 'ada' };
    cyclic.self = cyclic;

    expect(() => query(c.author.byId, cyclic)).toThrow('has a cycle');
    expect(() =>
      query(c.author.byId, { id: 'ada', list: [cyclic] } as { id: string }),
    ).toThrow('has a cycle');
    const shared = { at: 'x' };
    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(c, {
      author: query(c.author.byId, {
        id: dataOf(post).authorId,
        a: shared,
        b: shared,
      } as { id: string }),
    });
    expect(await res.author).toMatchObject({ id: 'ada' });
  });

  test("a query in the request of what it reads has that request's response in its result's context, as one by itself has its own", async () => {
    const { appRouter } = createRouter();
    const contexts = new Map<string, unknown>();
    await using ctx = testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          () => (linkOpts) =>
            linkOpts.next(linkOpts.op).pipe(
              tap({
                next: (envelope) =>
                  contexts.set(linkOpts.op.path, envelope.context),
              }),
            ),
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    await experimental_settle(
      experimental_load(c, {
        post,
        author: query(c.author.byId, { id: dataOf(post).authorId }),
      }),
    );

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(contexts.get('author.byId')).toEqual(contexts.get('post.bySlug'));
    expect(contexts.get('author.byId')).toHaveProperty('response');
  });

  test('a nested `.map()` is refused as the description is built', async () => {
    await using ctx = setup({ pipelining: true });
    const c = ctx.client;
    const pages = query(c.post.pages);

    expect(() =>
      dataOf(pages).pages.map((page) => page.items.map((it) => it.slug)),
    ).toThrow('must return the item or a part of it');
    expect(() =>
      dataOf(pages).pages.flatMap((page) => page.items.map((it) => it.slug)),
    ).toThrow('must return the item or a part of it');
  });

  test("`.map()` over an infinite query's `pages` reads a value for every loaded page", async () => {
    await using ctx = setup({ pipelining: true });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const feed = infiniteQuery(c.post.feed, {});
    const res = experimental_load(c, {
      ids: query(c.ids, {
        ids: dataOf(feed).pages.map((page) => page.items[0]!.slug),
      }),
    });

    expect(await res.ids).toEqual(['a']);
  });

  test.each([
    { name: '', allowWholeValues: false },
    {
      name: ', also where the server takes whole values',
      allowWholeValues: true,
    },
  ])(
    '`initialCursor` takes the place of the cursor of an input that is all read of another entry$name',
    async (opts) => {
      await using ctx = setup({
        pipelining: true,
        allowWholeValues: opts.allowWholeValues,
      });
      using _quiet = quietWarnings();
      const c = ctx.client;

      const first = infiniteQuery(c.post.feed, {});
      const res = experimental_load(c, {
        // `{ items, nextCursor, direction }`: its `cursor` is `undefined`
        feed: infiniteQuery(
          c.post.feed,
          dataOf(first).pages[0]! as { cursor?: number },
          { initialCursor: 1 },
        ),
      });

      expect(await res.feed).toMatchObject({
        pages: [{ items: posts.slice(1, 3) }],
        pageParams: [1],
      });
    },
  );

  test("an entry per item of an infinite query's `pages` has a row for the first page, and rejects if the query fails", async () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      feed: t.procedure
        .input(
          z.object({
            cursor: z.number().nullish(),
            fail: z.boolean().optional(),
          }),
        )
        .query((opts) => {
          if (opts.input.fail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'no feed' });
          }
          return { at: opts.input.cursor ?? 0 };
        }),
      other: t.procedure.query(() => 'other'),
    });
    await using ctx = setupRouter(appRouter);
    using _quiet = quietWarnings();
    const c = ctx.client;

    const ok = infiniteQuery(c.feed, { fail: false });
    const failing = infiniteQuery(c.feed, { fail: true });
    const res = experimental_load(c, {
      ok: perItem(dataOf(ok).pages, () => query(c.other)),
      failing: perItem(dataOf(failing).pages, () => query(c.other)),
    });

    expect(await experimental_settle(res.ok)).toEqual(['other']);
    await expect(res.failing).rejects.toThrow('no feed');
  });

  test("an infinite query's `pageParams` has the cursor read of another entry", async () => {
    await using ctx = setup({ pipelining: true });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const first = infiniteQuery(c.post.feed, {});
    const res = experimental_load(c, {
      next: infiniteQuery(c.post.feed, {
        cursor: dataOf(first).pages[0]!.nextCursor,
      }),
    });

    expect(await res.next).toMatchObject({
      pages: [{ items: posts.slice(2) }],
      pageParams: [2],
    });
  });

  test('an entry with a context of its own is batched as any query is: it is only not pipelined', async () => {
    await using ctx = setup({ pipelining: true });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const res = experimental_load(c, {
      post: query(c.post.bySlug, { slug: 'a' }),
      author: query(
        c.author.byId,
        { id: 'ada' },
        { context: { route: 'elsewhere' } },
      ),
    });

    await experimental_settle(res);
    expect(requestsOf(ctx).map((it) => [it.path, it.batch])).toEqual([
      ['/post.bySlug,author.byId', '1'],
    ]);
  });
});

describe('a `splitLink` that sends a query and one that reads it to different links', () => {
  function setupSplit(opts: { dependent: 'pipelining' | 'httpLink' }) {
    const { appRouter } = createRouter();
    return testServerAndClientResource(appRouter, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          splitLink({
            condition: (op) => op.path === 'author.byId',
            true:
              opts.dependent === 'httpLink'
                ? httpLink({ url: clientOpts.httpUrl })
                : httpBatchStreamLink({
                    url: clientOpts.httpUrl,
                    experimental_pipelining: experimental_pipelining(),
                  }),
            false: httpBatchStreamLink({
              url: clientOpts.httpUrl,
              experimental_pipelining: experimental_pipelining(),
            }),
          }),
        ],
      }),
    });
  }

  function pathsOf(ctx: ReturnType<typeof setupSplit>) {
    return ctx.onRequestSpy.mock.calls.map(
      ([req]) => new URL(req.url!, 'http://localhost').pathname,
    );
  }

  test('one that reads it goes by itself through its own link, when both pipeline', async () => {
    await using ctx = setupSplit({ dependent: 'pipelining' });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(c, {
      post,
      author: query(c.author.byId, { id: dataOf(post).authorId }),
    });

    expect(await res.author).toEqual({ id: 'ada', teamId: 'team-ada' });
    expect(pathsOf(ctx)).toEqual(['/post.bySlug', '/author.byId']);
  });

  test('a link that pipelines takes one that reads it, and puts it in the request of what it reads only if it has that request', async () => {
    await using ctx = setupSplit({ dependent: 'pipelining' });
    const untyped = getUntypedClient(ctx.client);
    // As `loadHandles()` sends them: the query, then one that reads it,
    // through the links, with what it reads in its context
    const post = createOperationPipeline();
    const sentPost = untyped.query(
      'post.bySlug',
      { slug: 'a' },
      { context: pipelineContext(post) },
    );
    const send = (path: string) => {
      const pipeline = createOperationPipeline();
      const reads: OperationReads = {
        reads: {
          each: null,
          reads: [
            { kind: 'whole', to: ['id'], from: post, path: ['authorId'] },
          ],
        },
        perItem: false,
        resolve: () => sentPost.then((it) => ({ id: it.authorId })),
        known: () => null,
      };
      const abort = new AbortController();
      const sent = untyped
        .query(
          path,
          { id: undefined },
          {
            signal: abort.signal,
            context: { ...pipelineContext(pipeline), ...readsContext(reads) },
          },
        )
        .catch((error: unknown) => error);
      return { pipeline, abort, sent };
    };

    // The `splitLink` sends `author.byId` to another link than the post's
    const author = send('author.byId');
    expect(isPipelineTaken(post)).toBe(true);
    expect(isPipelineTaken(author.pipeline)).toBe(true);
    expect(author.pipeline.attached).toBeNull();
    author.abort.abort();

    // And `team.byId` to the post's
    const team = send('team.byId');
    expect(isPipelineTaken(team.pipeline)).toBe(true);
    expect(team.pipeline.attached).not.toBeNull();

    await sentPost;
    expect(await team.sent).toEqual({ id: 'ada', name: 'Team ada' });
    expect(pathsOf(ctx)).toEqual(['/post.bySlug,team.byId']);
  });

  test("one that reads it gets its input filled in, through a link that doesn't pipeline", async () => {
    await using ctx = setupSplit({ dependent: 'httpLink' });
    const c = ctx.client;

    const post = query(c.post.bySlug, { slug: 'a' });
    const res = experimental_load(c, {
      post,
      author: query(c.author.byId, { id: dataOf(post).authorId }),
    });

    expect(await res.author).toEqual({ id: 'ada', teamId: 'team-ada' });
    expect(pathsOf(ctx)).toEqual(['/post.bySlug', '/author.byId']);
  });
});

test('a query that asks by itself reads a `Date` in two places of the data as one `Date`', async () => {
  const t = initTRPC.create({ transformer: superjson });
  const appRouter = t.router({
    source: t.procedure.query(() => {
      const key = new Date(1000);
      return { key, values: new Map([[key, 'ok']]) };
    }),
    lookup: t.procedure
      .input((value) => value as { key: Date; values: Map<Date, string> })
      .query((opts) => opts.input.values.get(opts.input.key) ?? 'missing'),
  });
  await using ctx = testServerAndClientResource(appRouter, {
    client: (clientOpts) => ({
      links: [httpLink({ url: clientOpts.httpUrl, transformer: superjson })],
    }),
  });
  const c = ctx.client;

  const source = query(c.source);
  const res = experimental_load(c, {
    lookup: query(c.lookup, dataOf(source)),
  });

  expect(await res.lookup).toBe('ok');
});

test('a query that asks by itself reads a `Date` as it arrived, not as the caller changed it', async () => {
  const t = initTRPC.create({ transformer: superjson });
  const gate = createDeferred();
  const appRouter = t.router({
    at: t.procedure.query(() => ({ at: new Date(1000) })),
    slow: t.procedure.query(async () => {
      await gate.promise;
      return 'slow';
    }),
    echo: t.procedure
      .input(z.object({ at: z.date(), after: z.string() }))
      .query((opts) => opts.input.at.getTime()),
  });
  await using ctx = testServerAndClientResource(appRouter, {
    client: (clientOpts) => ({
      links: [httpLink({ url: clientOpts.httpUrl, transformer: superjson })],
    }),
  });
  using _release = makeResource({}, () => gate.resolve());
  const c = ctx.client;

  const at = query(c.at);
  const res = experimental_load(c, {
    at,
    // Asks once `slow` has arrived, after the change below
    echo: query(c.echo, {
      at: dataOf(at).at,
      after: dataOf(query(c.slow)),
    }),
  });
  (await res.at).at.setTime(0);
  gate.resolve();

  expect(await res.echo).toBe(1000);
});

describe('httpBatchStreamLink', () => {
  /**
   * What a promise resolves to, bounded: if it waited for a query a test
   * holds back, this fails rather than hangs, and the test's disposers then
   * let that query end
   */
  async function bounded<TResult>(loaded: Promise<TResult>) {
    const settled = vi.fn();
    void loaded.then(settled, settled);
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    return loaded;
  }

  function setupStream<TRouter extends AnyRouter>(router: TRouter) {
    // Cast: the options of a server and client for any router
    return testServerAndClientResource(router, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts: { httpUrl: string }) => ({
        links: [
          httpBatchStreamLink({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    } as any);
  }

  test("each item settles by itself: a slow item doesn't hold back the others", async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('bob', gate.promise);
    await using ctx = setupStream(appRouter);
    // Also when the test fails: the server's run for Bob must end
    using _release = makeResource({}, () => gate.resolve());
    const c = ctx.client;

    const items = dataOf(query(c.post.list, { limit: 2 })).items;
    let author!: experimental_QueryEntry<unknown, Author>;
    const res = experimental_load(c, {
      authors: perItem(items, (it) => {
        author = query(c.author.byId, { id: it.authorId });
        return author;
      }),
      teams: perItem(items, () =>
        query(c.team.byId, { id: dataOf(author).teamId }),
      ),
    });
    // Bounded: the lists must not wait for Bob either
    const authors = await bounded(res.authors);
    const teams = await bounded(res.teams);
    const adaSettled = vi.fn();
    const bobSettled = vi.fn();
    // A rejection fails the test at its `await` below
    void authors[0]!.then(adaSettled, () => undefined);
    void authors[1]!.then(bobSettled, () => undefined);

    // Bounded: if Ada waited for Bob, this fails rather than hangs
    await vi.waitFor(() => expect(adaSettled).toHaveBeenCalled());
    const team = vi.fn();
    void teams[0]!.then(team, () => undefined);
    await vi.waitFor(() =>
      expect(team).toHaveBeenCalledWith({
        id: 'team-ada',
        name: 'Team team-ada',
      }),
    );
    expect(bobSettled).not.toHaveBeenCalled();

    gate.resolve();
    expect(await authors[1]).toMatchObject({ id: 'bob' });
    expect(await teams[1]).toMatchObject({ id: 'team-bob' });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("the error of an item's run settles it at once: it doesn't wait for another call it reads", async () => {
    const t = initTRPC.create();
    const gate = createDeferred<void>();
    const appRouter = t.router({
      list: t.procedure.query(() => [{ id: 'a' }]),
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
        .input(z.object({ item: z.string(), a: z.string(), b: z.string() }))
        .query((opts) => opts.input),
    });
    await using ctx = setupStream(appRouter);
    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const c = ctx.client;

    const withPromise = query(c.withPromise);
    const slow = query(c.slow);
    const pairs = await bounded(
      experimental_load(c, {
        pairs: perItem(dataOf(query(c.list)), (it) =>
          query(c.pair, {
            item: it.id,
            a: dataOf(withPromise).id,
            b: dataOf(slow).id,
          }),
        ),
      }).pairs,
    );
    const rejected = vi.fn();
    void pairs[0]!.then(undefined, rejected);

    // Bounded: if it waited for the slow call, this fails rather than hangs
    await vi.waitFor(() => expect(rejected).toHaveBeenCalled());
    expect(rejected.mock.calls[0]![0]).toMatchObject({
      data: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("the error of a call settles it at once: it doesn't wait for another call it reads", async () => {
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
    await using ctx = setupStream(appRouter);
    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const c = ctx.client;

    const slow = query(c.slow);
    const res = experimental_load(c, {
      pair: query(c.pair, {
        id: dataOf(query(c.withPromise)).id,
        other: dataOf(slow).id,
      }),
      slow,
    });
    const rejected = vi.fn();
    void res.pair.then(undefined, rejected);

    // Bounded: if it waited for the slow call, this fails rather than hangs
    await vi.waitFor(() => expect(rejected).toHaveBeenCalled());
    expect(rejected.mock.calls[0]![0]).toMatchObject({
      data: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('the items of a list keep the order they arrived in, also when the caller changes the list before a slow entry reads it', async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('slow', gate.promise);
    await using ctx = setupStream(appRouter);
    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const c = ctx.client;

    const list = query(c.post.list, { limit: 2 });
    const slow = query(c.author.byId, { id: 'slow' });
    const res = experimental_load(c, {
      list,
      authors: perItem(dataOf(list).items, (it) =>
        query(c.author.byId, {
          id: it.authorId,
          after: dataOf(slow).id,
        } as { id: string }),
      ),
    });
    (await bounded(res.list)).items.reverse();
    gate.resolve();

    const authors = await res.authors;
    expect((await Promise.all(authors)).map((it) => it.id)).toEqual([
      'ada',
      'bob',
    ]);
  });

  test('the items of a list are the ones that arrived, also when the caller replaces or removes the list before a slow entry reads it', async () => {
    const { appRouter, gates } = createRouter();
    const gate = createDeferred<void>();
    gates.set('slow', gate.promise);
    await using ctx = setupStream(appRouter);
    // Also when the test fails: the server's slow call must end
    using _release = makeResource({}, () => gate.resolve());
    const c = ctx.client;

    const pages = query(c.post.pages);
    const slow = query(c.author.byId, { id: 'slow' });
    const res = experimental_load(c, {
      pages,
      authors: perItem(
        dataOf(pages).pages.flatMap((page) => page.items),
        (it) =>
          query(c.author.byId, {
            id: it.authorId,
            after: dataOf(slow).id,
          } as { id: string }),
      ),
    });
    const node = await bounded(res.pages);
    const [first, second] = node.pages;
    node.pages = [second!, first!];
    first!.items = [];
    gate.resolve();

    const authors = await res.authors;
    expect((await Promise.all(authors)).map((it) => it.id)).toEqual([
      'ada',
      'bob',
      'bob',
    ]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });
});

describe('httpBatchLink, without streaming', () => {
  function setupBatch<TRouter extends AnyRouter>(
    router: TRouter,
    transformer?: unknown,
  ) {
    // Cast: the options of a server and client for any router
    return testServerAndClientResource(router, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts: { httpUrl: string }) => ({
        links: [
          httpBatchLink({
            url: clientOpts.httpUrl,
            transformer,
            experimental_pipelining: experimental_pipelining(),
          } as any),
        ],
      }),
    } as any);
  }

  function quietWarnings() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      // quiet
    });
    return Object.assign(
      makeResource({}, () => warn.mockRestore()),
      { warn },
    );
  }

  test('warns once per client in development', async () => {
    const { appRouter } = createRouter();
    await using ctx = setupBatch(appRouter);
    using quiet = quietWarnings();

    const load = (client: TRPCClient<typeof appRouter>) => {
      const post = query(client.post.bySlug, { slug: 'a' });
      return experimental_settle(
        experimental_load(client, {
          author: query(client.author.byId, { id: dataOf(post).authorId }),
        }),
      );
    };
    await load(ctx.client);
    await load(ctx.client);

    expect(quiet.warn).toHaveBeenCalledTimes(1);
    expect(quiet.warn.mock.calls[0]![0]).toContain("doesn't stream");

    // Once per client: another client warns once too
    const other = createTRPCClient<typeof appRouter>(ctx.trpcClientOptions);
    await load(other);
    await load(other);
    expect(quiet.warn).toHaveBeenCalledTimes(2);
  });

  test("a run whose data the link can't deserialize rejects its item by itself: the other runs keep their data", async () => {
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
    await using ctx = setupBatch(appRouter, {
      ...identity,
      deserialize: (value: unknown) => {
        if (isObject(value) && value['id'] === 'ada') {
          throw new Error('cannot read ada');
        }
        return value;
      },
    });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const authors = await experimental_load(c, {
      authors: perItem(dataOf(query(c.ids)), (id) => query(c.author, { id })),
    }).authors;

    expect(await authors[1]).toEqual({ id: 'bob' });
    await expect(authors[0]).rejects.toThrow('cannot read ada');
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test.each([
    { name: 'its own', code: 'NOT_FOUND' },
    // The code the server sends a run that reads a failed one
    {
      name: 'the code of a run that reads a failed one',
      code: 'PRECONDITION_FAILED',
    },
  ] as const)(
    "an item's run that read data the link can't deserialize ran on the server: it rejects with its error, with $name code",
    async ({ code }) => {
      const identity = {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      };
      const t = initTRPC.create({ transformer: identity });
      const teams = vi.fn();
      const appRouter = t.router({
        ids: t.procedure.query(() => ['ada']),
        author: t.procedure
          .input(z.object({ id: z.string() }))
          .query((opts) => ({ id: opts.input.id, teamId: 'team-ada' })),
        team: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
          teams(opts.input.id);
          throw new TRPCError({ code, message: 'no team' });
        }),
      });
      await using ctx = setupBatch(appRouter, {
        ...identity,
        deserialize: (value: unknown) => {
          if (isObject(value) && value['teamId'] === 'team-ada') {
            throw new Error('cannot read the author');
          }
          return value;
        },
      });
      using _quiet = quietWarnings();
      const c = ctx.client;

      const ids = dataOf(query(c.ids));
      let author!: experimental_QueryEntry<
        unknown,
        { id: string; teamId: string }
      >;
      const res = experimental_load(c, {
        authors: perItem(ids, (id) => {
          author = query(c.author, { id });
          return author;
        }),
        teams: perItem(ids, () => query(c.team, { id: dataOf(author).teamId })),
      });

      await expect((await res.authors)[0]).rejects.toThrow(
        'cannot read the author',
      );
      await expect((await res.teams)[0]).rejects.toMatchObject({
        message: 'no team',
        data: { code },
      });
      expect(teams.mock.calls).toEqual([['team-ada']]);
      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    },
  );

  test("a call that read data the link can't deserialize ran on the server: it rejects with its own error", async () => {
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
    await using ctx = setupBatch(appRouter, {
      ...identity,
      deserialize: (value: unknown) => {
        if (isObject(value) && value['teamId'] === 'team-ada') {
          throw new Error('cannot read the author');
        }
        return value;
      },
    });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const author = query(c.author, { id: dataOf(query(c.post)).authorId });
    const res = experimental_load(c, {
      author,
      team: query(c.team, { id: dataOf(author).teamId }),
    });

    await expect(res.author).rejects.toThrow(
      'Unable to transform response from server',
    );
    await expect(res.team).rejects.toThrow('no team');
    expect(teams.mock.calls).toEqual([['team-ada']]);
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test("an infinite query whose cursor read data the link can't deserialize rejects with that error, and one with a literal cursor keeps it", async () => {
    const identity = {
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    const t = initTRPC.create({ transformer: identity });
    const appRouter = t.router({
      first: t.procedure.query(() => ({ next: 2, unreadable: true })),
      feed: t.procedure
        .input(
          z.object({
            cursor: z.number().nullish(),
            direction: z.enum(['forward', 'backward']).optional(),
            filter: z.number().optional(),
          }),
        )
        .query((opts) => ({ at: opts.input.cursor ?? 0 })),
    });
    await using ctx = setupBatch(appRouter, {
      ...identity,
      deserialize: (value: unknown) => {
        if (isObject(value) && value['unreadable'] === true) {
          throw new Error('cannot read the first page');
        }
        return value;
      },
    });
    using _quiet = quietWarnings();
    const c = ctx.client;

    const first = query(c.first);
    const res = experimental_load(c, {
      read: infiniteQuery(c.feed, { cursor: dataOf(first).next }),
      literal: infiniteQuery(c.feed, { cursor: 1, filter: dataOf(first).next }),
    });

    // The server filled in the cursor, but the client never knew it
    await expect(res.read).rejects.toThrow(
      'Unable to transform response from server',
    );
    expect(await res.literal).toEqual({
      pages: [{ at: 1 }],
      pageParams: [1],
    });
    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  /** A procedure the server serializes once to fill in a read, then fails to serialize for the response */
  function serializedOnce<TValue>(value: TValue) {
    let serialized = 0;
    return {
      toJSON() {
        serialized++;
        if (serialized > 1) {
          throw new Error('serialized twice');
        }
        return value;
      },
    } as unknown as TValue;
  }

  test.each([
    { name: 'its own code', code: 'NOT_FOUND', formatter: false },
    {
      name: 'the code the server sends a call that reads a failed one',
      code: 'PRECONDITION_FAILED',
      formatter: false,
    },
    {
      name: "`pipeline: 'source-failed'` in the `data` an `errorFormatter` made",
      code: 'NOT_FOUND',
      formatter: true,
    },
  ] as const)(
    'a call that read a call whose response failed after the read ran on the server: it rejects with its own error, also with $name',
    async ({ code, formatter }) => {
      const t = initTRPC.create(
        formatter
          ? {
              errorFormatter: ({
                shape,
              }: {
                shape: TRPCDefaultErrorShape;
              }) => ({
                ...shape,
                data: { ...shape.data, pipeline: 'source-failed' },
              }),
            }
          : {},
      );
      const teams = vi.fn();
      const appRouter = t.router({
        post: t.procedure.query(() => ({ authorId: 'ada' })),
        author: t.procedure
          .input(z.object({ id: z.string() }))
          .query(() => serializedOnce({ teamId: 'team-ada' })),
        team: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
          teams(opts.input.id);
          throw new TRPCError({ code, message: 'no team' });
        }),
      });
      await using ctx = setupBatch(appRouter);
      using _quiet = quietWarnings();
      const c = ctx.client;

      const author = query(c.author, { id: dataOf(query(c.post)).authorId });
      const res = experimental_load(c, {
        author,
        team: query(c.team, { id: dataOf(author).teamId }),
      });

      await expect(res.author).rejects.toMatchObject({
        data: { code: 'INTERNAL_SERVER_ERROR' },
      });
      await expect(res.team).rejects.toMatchObject({
        message: 'no team',
        data: { code },
      });
      expect(teams.mock.calls).toEqual([['team-ada']]);
      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    {
      name: 'the code the server sends a run that reads a failed one',
      code: 'PRECONDITION_FAILED',
      formatter: false,
    },
    {
      name: "`pipeline: 'source-failed'` in the `data` an `errorFormatter` made",
      code: 'NOT_FOUND',
      formatter: true,
    },
  ] as const)(
    "an item's run that read a call whose response failed after the read ran on the server: it rejects with its own error, also with $name",
    async ({ code, formatter }) => {
      const t = initTRPC.create(
        formatter
          ? {
              errorFormatter: ({
                shape,
              }: {
                shape: TRPCDefaultErrorShape;
              }) => ({
                ...shape,
                data: { ...shape.data, pipeline: 'source-failed' },
              }),
            }
          : {},
      );
      const pairs = vi.fn();
      const appRouter = t.router({
        page: t.procedure.query(() => ({ items: [{ id: 'a' }, { id: 'b' }] })),
        owner: t.procedure.query(() => serializedOnce({ id: 'ada' })),
        pair: t.procedure
          .input(z.object({ owner: z.string(), item: z.string() }))
          .query((opts) => {
            pairs(opts.input);
            throw new TRPCError({
              code,
              message: `no pair ${opts.input.item}`,
            });
          }),
      });
      await using ctx = setupBatch(appRouter);
      using _quiet = quietWarnings();
      const c = ctx.client;

      const owner = query(c.owner);
      const res = experimental_load(c, {
        owner,
        pairs: perItem(dataOf(query(c.page)).items, (item) =>
          query(c.pair, { owner: dataOf(owner).id, item: item.id }),
        ),
      });

      await expect(res.owner).rejects.toMatchObject({
        data: { code: 'INTERNAL_SERVER_ERROR' },
      });
      const items = await res.pairs;
      for (const [index, id] of ['a', 'b'].entries()) {
        await expect(items[index]).rejects.toMatchObject({
          message: `no pair ${id}`,
          data: { code },
        });
      }
      expect(pairs.mock.calls).toEqual([
        [{ owner: 'ada', item: 'a' }],
        [{ owner: 'ada', item: 'b' }],
      ]);
      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    },
  );
});

describe('types', () => {
  const { appRouter } = createRouter();
  const client = {} as TRPCClient<typeof appRouter>;
  // Only types are checked: nothing is called
  const check = (fn: () => void) => fn;

  test('results', () => {
    check(() => {
      const list = query(client.post.list, { limit: 20 });
      const post = query(client.post.bySlug, { slug: 'a' });
      const author = query(client.author.byId, { id: dataOf(post).authorId });
      const res = experimental_load(client, {
        list,
        author,
        authors: perItem(dataOf(list).items, (it) =>
          query(client.author.byId, { id: it.authorId }),
        ),
        group: { team: query(client.team.byId, { id: dataOf(author).teamId }) },
        feed: infiniteQuery(client.post.feed, {}),
      });
      expectTypeOf(res.author).toEqualTypeOf<Promise<Author>>();
      expectTypeOf(
        experimental_load(client, {
          author: dataOf(post, (it) =>
            query(client.author.byId, { id: it.authorId }),
          ),
        }).author,
      ).toEqualTypeOf<Promise<Author>>();
      expectTypeOf(res.authors).resolves.toEqualTypeOf<Promise<Author>[]>();
      expectTypeOf(res.group.team).toEqualTypeOf<Promise<Team>>();
      expectTypeOf(res.list).resolves.toEqualTypeOf<{
        items: Post[];
        nextCursor: null;
      }>();
      expectTypeOf(res.feed).resolves.toHaveProperty('pages');
      expectTypeOf(res.feed)
        .resolves.toHaveProperty('pageParams')
        .toEqualTypeOf<(number | null | undefined)[]>();
      expectTypeOf(experimental_settle(res)).resolves.toMatchTypeOf<{
        author: Author;
        authors: Author[];
        group: { team: Team };
      }>();
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
      const names = query(tuples.names);
      const settled = experimental_settle(
        experimental_load(tuples, {
          pair: query(tuples.pair),
          names,
          pairs: perItem(dataOf(names), () => query(tuples.pair)),
        }),
      );
      expectTypeOf(settled).resolves.toEqualTypeOf<{
        pair: [string, number];
        names: readonly string[];
        pairs: [string, number][];
      }>();
    });
  });

  test('`experimental_settle()` leaves a promise in the data of a query as it is, as it does at runtime', () => {
    const t = initTRPC.create();
    const router = t.router({
      deferred: t.procedure.query(() => ({ later: Promise.resolve('ada') })),
    });
    const deferred = {} as TRPCClient<typeof router>;
    check(() => {
      const settled = experimental_settle(
        experimental_load(deferred, { it: query(deferred.deferred) }),
      );
      expectTypeOf(settled).resolves.toEqualTypeOf<{
        it: { later: Promise<string> };
      }>();
    });
  });

  test('errors', () => {
    check(() => {
      // @ts-expect-error - a mutation is no query
      query(client.rename, 'x');
      const list = query(client.post.list, { limit: 1 });
      // @ts-expect-error - a list of posts is no number
      query(client.post.list, { limit: dataOf(list).items });
      const post = query(client.post.bySlug, { slug: 'a' });
      // @ts-expect-error - a string is no number
      query(client.post.list, { limit: dataOf(post).slug });
      // @ts-expect-error - an input is required
      query(client.post.bySlug);
      // @ts-expect-error - its input has no cursor
      infiniteQuery(client.post.bySlug, { slug: 'a' });
      perItem(dataOf(list).items, (it) =>
        // @ts-expect-error - an item is a post
        query(client.author.byId, { id: it.missing }),
      );
      dataOf(post, (it) =>
        // @ts-expect-error - the callback returns a query's entry
        dataOf(post, () => query(client.author.byId, { id: it.authorId })),
      );
    });
  });

  test('a client is the procedures a description takes', () => {
    function postQueries(
      trpc: experimental_QueryProcedures<typeof appRouter>,
      slug: string,
    ) {
      const post = query(trpc.post.bySlug, { slug });
      return {
        post,
        author: query(trpc.author.byId, { id: dataOf(post).authorId }),
      };
    }
    check(() => {
      const res = experimental_load(client, postQueries(client, 'a'));
      expectTypeOf(res.post).toEqualTypeOf<Promise<Post>>();
      expectTypeOf(res.author).toEqualTypeOf<Promise<Author>>();
    });
  });
});
