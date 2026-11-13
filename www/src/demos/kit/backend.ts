import {
  createTRPCClient,
  httpBatchStreamLink,
  localLink,
  type TRPCLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { observable } from '@trpc/server/observable';

import { formatCall, type Network, Unfilled } from './network.ts';

export interface Post {
  readonly authorId: number;
  readonly body: string;
  readonly id: number;
  readonly minutes: number;
  readonly title: string;
}

const authors = ['Ada', 'Grace', 'Linus', 'Margaret'] as const;

const bios = [
  'Writes about loaders and round trips.',
  'Writes about handles and types.',
  'Writes about URLs and waterfalls.',
  'Reads every post, and comments on most.',
] as const;

/** Ada, Grace and Linus write three posts each, three to a page of the list. */
const posts: ReadonlyArray<Post> = [
  {
    authorId: 1,
    body: 'Start every query in the loader, and the page loads in one round trip.',
    id: 1,
    minutes: 4,
    title: 'Render as you fetch',
  },
  {
    authorId: 2,
    body: 'A handle names a query; the component that reads it needs nothing else.',
    id: 2,
    minutes: 3,
    title: 'Handles, explained',
  },
  {
    authorId: 3,
    body: 'Filters, sort and page belong in the URL, where the loader can see them.',
    id: 3,
    minutes: 5,
    title: 'The URL is the input',
  },
  {
    authorId: 1,
    body: "A loader's job is to start every query. Await only what the page can't render without.",
    id: 4,
    minutes: 3,
    title: 'Loaders start, components wait',
  },
  {
    authorId: 2,
    body: 'Type a prop with inferQueryHandle, and the component can only read the query it was given.',
    id: 5,
    minutes: 2,
    title: 'Typing props with handles',
  },
  {
    authorId: 3,
    body: 'When the page needs one query to start the next, change the procedure instead of the page.',
    id: 6,
    minutes: 6,
    title: 'Reshape the procedure, not the page',
  },
  {
    authorId: 1,
    body: 'Give each handle its own Suspense boundary, so one slow query never holds back the rest.',
    id: 7,
    minutes: 3,
    title: 'One boundary per handle',
  },
  {
    authorId: 2,
    body: 'A test can start a handle against a test QueryClient, with no server and no mocks.',
    id: 8,
    minutes: 4,
    title: 'Testing components that take handles',
  },
  {
    authorId: 3,
    body: 'A loader runs before the page renders, so the waterfall has nowhere to hide.',
    id: 9,
    minutes: 5,
    title: 'Where waterfalls come from',
  },
];

const perPage = 3;
const pageCount = Math.ceil(posts.length / perPage);

const comments = [
  { body: 'Finally, no more spinners inside spinners.', postId: 1 },
  { body: 'The loader starts both? Neat.', postId: 1 },
  { body: 'So a handle is just a key and an input?', postId: 2 },
  { body: 'Yes. The data stays in the cache.', postId: 2 },
  { body: 'Shareable links for free.', postId: 3 },
  { body: 'Took our page from three spinners to one.', postId: 4 },
  { body: 'The type error caught a real bug for us.', postId: 5 },
  { body: 'We moved the slug lookup to the server. Much faster.', postId: 6 },
].map((comment, index) => ({
  ...comment,
  author: authors[(index + 1) % authors.length] ?? 'Ada',
  id: index + 1,
}));

/**
 * How long each procedure takes, in typical round trips. They differ, as
 * real queries do, so a waterfall's steps and a parallel load's slowest
 * request are easy to tell apart.
 */
export const procedureWeights: Readonly<Record<string, number>> = {
  'author.byId': 1,
  'post.byAuthor': 1.2,
  'post.byId': 1,
  'post.feed': 0.8,
  'post.comments': 1.5,
  'post.list': 0.8,
  'post.moreByAuthor': 1.2,
};

function authorOf(id: number) {
  return authors[id - 1] ?? 'Ada';
}

function pageOf(page: number) {
  return posts.slice((page - 1) * perPage, page * perPage);
}

function commentsOf(postId: number) {
  return comments.filter((comment) => comment.postId === postId);
}

function findPost(id: number) {
  return posts.find((candidate) => candidate.id === id);
}

function notFound(id: number): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: `No post ${id}` });
}

/** What a list shows for a post: enough to pick one. */
function summaryOf(post: Post) {
  return {
    author: authorOf(post.authorId),
    excerpt: post.body,
    id: post.id,
    minutes: post.minutes,
    title: post.title,
  };
}

/**
 * What the blog's procedures answer, but for `servedAt`, with `undefined`
 * for a post that doesn't exist. The data never changes, so a skeleton can
 * take the shape of what it stands in for.
 */
export const blogData = {
  /** An author, by the id a post has. */
  author: (id: number) => {
    const name = authors[id - 1];
    return name && { bio: bios[id - 1] ?? '', id, name };
  },
  /** Every post by an author. */
  byAuthor: (authorId: number) =>
    posts.filter((post) => post.authorId === authorId).map(summaryOf),
  comments: commentsOf,
  /**
   * One page of the list, with each post's author as an id: the name is
   * another query.
   */
  feed: (page: number) => ({
    pageCount,
    posts: pageOf(page).map((post) => ({
      authorId: post.authorId,
      excerpt: post.body,
      id: post.id,
      minutes: post.minutes,
      title: post.title,
    })),
  }),
  /** One page of the list, with what the page shows in one response. */
  list: (page: number) => ({
    pageCount,
    posts: pageOf(page).map((post) => ({
      ...summaryOf(post),
      commentCount: commentsOf(post.id).length,
    })),
  }),
  /** The other posts by a post's author. */
  moreByAuthor: (postId: number) => {
    const post = findPost(postId);
    return (
      post && {
        author: authorOf(post.authorId),
        posts: posts
          .filter(
            (other) => other.authorId === post.authorId && other.id !== post.id,
          )
          .map(summaryOf),
      }
    );
  },
  post: (id: number) => {
    const post = findPost(id);
    return post && { ...post, author: authorOf(post.authorId) };
  },
};

function numbersInput<TKey extends string>(...keys: ReadonlyArray<TKey>) {
  return (input: unknown) => {
    const record =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : {};
    const parsed = {} as Record<TKey, number>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'number') {
        throw new Error(`Expected { ${keys.join(', ')}: number }`);
      }
      parsed[key] = value;
    }
    return parsed;
  };
}

/**
 * An input with a `cursor`, so lists can be read as infinite queries. Every
 * list in the demo fits on one page, so the cursor is never used.
 */
function cursorInput<TKey extends string>(key: TKey) {
  const parse = numbersInput(key);
  return (input: unknown): Record<TKey, number> & { cursor?: number | null } =>
    parse(input);
}

const lastPage = { nextCursor: null as number | null };

/**
 * A call in an HTTP request to the demo's server, as the network panel shows
 * it. A call the server runs for every item of a list runs more than once.
 */
interface HttpCall {
  finished: number;
  /** Its first run, as code. */
  first: string | undefined;
  readonly id: number;
  runs: number;
}

interface ServerContext {
  /** The calls of the HTTP request, by index. `null` for a call with no request. */
  readonly calls: ReadonlyArray<HttpCall> | null;
  /** How long a result takes from the server to the browser, in ms. */
  readonly tripBack: number;
}

/**
 * A blog's tRPC router, run in the page. Each post response says when it
 * was served, in seconds since the demo started, so a demo can show which
 * copy of the data it renders.
 */
function createAppRouter(network: Network) {
  // The demo's server runs in the browser, on purpose.
  const t = initTRPC
    .context<ServerContext>()
    .create({ allowOutsideOfServer: true });
  const servedAt = () => Math.round(network.now() / 100) / 10;
  /**
   * In an HTTP request, each call takes the server a moment of its own,
   * however slow the connection is. Its row in the network panel gets the
   * input the server ran it with, and ends when its result is back in the
   * browser.
   */
  const procedure = t.procedure.use(async (opts) => {
    const call = opts.ctx.calls?.[opts.batchIndex];
    if (!call) {
      return opts.next();
    }
    const arrives = (status: 'done' | 'error') => {
      network.after(opts.ctx.tripBack, () => network.end(call.id, status));
    };
    // A call that reads a failed one has no input, and doesn't run
    const input = await opts.getRawInput().catch((cause: unknown) => {
      arrives('error');
      throw cause;
    });
    const label = formatCall(opts.path, input);
    call.first ??= label;
    call.runs++;
    network.served(call.id, 'start');
    network.relabel(
      call.id,
      call.runs === 1 ? label : `${call.first} + ${call.runs - 1} more`,
    );
    await new Promise<void>((resolve) => {
      network.after(network.work(), resolve);
    });
    const result = await opts.next();
    call.finished++;
    if (call.finished === call.runs) {
      network.served(call.id, 'end');
      arrives(result.ok ? 'done' : 'error');
    }
    return result;
  });
  return t.router({
    author: t.router({
      /** An author, by id. A post has the id, so a page needs the post first. */
      byId: procedure
        .input(numbersInput('id'))
        .query(({ input }) => blogData.author(input.id) ?? notFound(input.id)),
    }),
    post: t.router({
      /** Every post by an author, by the author's id. */
      byAuthor: procedure.input(cursorInput('authorId')).query(({ input }) => ({
        posts: blogData.byAuthor(input.authorId),
        ...lastPage,
      })),
      byId: procedure.input(numbersInput('id')).query(({ input }) => ({
        ...(blogData.post(input.id) ?? notFound(input.id)),
        servedAt: servedAt(),
      })),
      comments: procedure.input(cursorInput('postId')).query(({ input }) => ({
        items: blogData.comments(input.postId),
        ...lastPage,
      })),
      /** A page of the list, without the authors' names. */
      feed: procedure
        .input(numbersInput('page'))
        .query(({ input }) => blogData.feed(input.page)),
      list: procedure
        .input(numbersInput('page'))
        .query(({ input }) => blogData.list(input.page)),
      /**
       * The other posts by a post's author. It takes the post's id, which is
       * in the URL, so a loader can start it with the post.
       */
      moreByAuthor: procedure
        .input(cursorInput('postId'))
        .query(({ input }) => ({
          ...(blogData.moreByAuthor(input.postId) ?? notFound(input.postId)),
          ...lastPage,
        })),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

/**
 * Sends each call over the pretend network: it shows in the demo's network
 * panel, and reaches the router after the procedure's own delay.
 */
function networkLink(
  network: Network,
  origin: string | undefined,
): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) => {
        const request = network.start(op.path, op.input, origin);
        let unsubscribe: (() => void) | undefined;
        const cancel = network.after(
          network.delay(procedureWeights[op.path] ?? 1),
          () => {
            const subscription = next(op).subscribe({
              complete: () => observer.complete(),
              error: (error) => {
                network.end(request, 'error');
                observer.error(error);
              },
              next: (value) => {
                network.end(request, 'done');
                observer.next(value);
              },
            });
            unsubscribe = () => subscription.unsubscribe();
          },
        );
        return () => {
          cancel();
          unsubscribe?.();
          network.end(request, 'aborted');
        };
      });
}

/**
 * A tRPC client whose server lives in the page, behind `network`. `origin`
 * labels its requests, for a demo with a client per side.
 */
export function createDemoClient(network: Network, origin?: string) {
  const router = createAppRouter(network);
  return createTRPCClient<AppRouter>({
    links: [
      networkLink(network, origin),
      localLink({
        createContext: async () => ({ calls: null, tripBack: 0 }),
        router,
      }),
    ],
  });
}

interface PipeRead {
  readonly from: number;
  readonly path: ReadonlyArray<string | null>;
  readonly to: ReadonlyArray<string>;
}

/** `input` with `value` at `to`, on copies of what is on the way there. */
function withValueAt(
  input: unknown,
  to: ReadonlyArray<string>,
  value: unknown,
): unknown {
  const [key, ...rest] = to;
  if (key === undefined) {
    return value;
  }
  const record =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};
  return { ...record, [key]: withValueAt(record[key], rest, value) };
}

function parseParam(value: string | null): unknown {
  return value === null ? undefined : JSON.parse(value);
}

/**
 * The calls of a batch request's URL, as code. What the server fills in from
 * another call's data shows as where it comes from, such as
 * `‹post›.authorId`, until the server has run the call.
 */
function labelsOf(url: URL) {
  const paths = url.pathname.slice('/trpc/'.length).split(',');
  const inputs = (parseParam(url.searchParams.get('input')) ?? {}) as Record<
    number,
    unknown
  >;
  const pipe = (parseParam(url.searchParams.get('pipe')) ?? {}) as Record<
    number,
    ReadonlyArray<PipeRead> | undefined
  >;
  return paths.map((path, index) => {
    const input = (pipe[index] ?? []).reduce((filled, read) => {
      // The router the call is in names what it returns: `post`, `author`.
      const source = (paths[read.from] ?? '').split('.').slice(0, -1).join('.');
      const where = read.path
        .map((segment) => (segment === null ? '[]' : `.${segment}`))
        .join('');
      return withValueAt(filled, read.to, new Unfilled(`‹${source}›${where}`));
    }, inputs[index]);
    return formatCall(path, input);
  });
}

type FetchEsque = NonNullable<
  Parameters<typeof httpBatchStreamLink>[0]['fetch']
>;

/**
 * A tRPC client that talks HTTP to a server in the page, behind `network`,
 * with `httpBatchStreamLink`: calls made together share a request, and each
 * result comes back when it is ready. Both ends pipeline, so a request can
 * hold calls whose input the server reads from another call's data.
 *
 * A request takes a round trip of the network, half there and half back,
 * and each call takes the server a moment in between.
 */
export function createHttpDemoClient(
  network: Network,
  origin: string | undefined,
) {
  const router = createAppRouter(network);
  let sent = 0;
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      network.after(ms, resolve);
    });
  const fetch: FetchEsque = async (input, init) => {
    // Queries are GET requests: no body to carry over.
    const req = new Request(input, {
      ...(init?.headers ? { headers: init.headers } : {}),
      signal: init?.signal ?? null,
    });
    sent++;
    const http = sent;
    const trip = network.delay(1);
    const tripThere = Math.round(trip / 2);
    const tripBack = trip - tripThere;
    const calls = labelsOf(new URL(req.url)).map((label): HttpCall => ({
      finished: 0,
      first: undefined,
      id: network.request(label, origin, http),
      runs: 0,
    }));
    const endAll = (status: 'aborted' | 'done') => {
      for (const call of calls) {
        network.end(call.id, status);
      }
    };
    req.signal.addEventListener('abort', () => endAll('aborted'));
    await wait(tripThere);
    const response = await fetchRequestHandler({
      createContext: () => ({ calls, tripBack }),
      endpoint: '/trpc',
      experimental_allowPipelining: true,
      req,
      router,
    });
    if (!response.body) {
      await wait(tripBack);
      endAll('done');
      return response;
    }
    // Each part of the response is in the browser a trip back after the
    // server sent it, in the order it was sent
    let delivered = Promise.resolve();
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        // A call that ran for no item never finished: the response's end is its end.
        flush: () => {
          const arrived = wait(tripBack);
          return delivered.then(() => arrived).then(() => endAll('done'));
        },
        transform: (chunk, controller) => {
          const arrived = wait(tripBack);
          delivered = delivered
            .then(() => arrived)
            .then(() => {
              try {
                controller.enqueue(chunk);
              } catch {
                // The request was cancelled on the way
              }
            });
        },
      }),
    );
    return new Response(body, response);
  };
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        experimental_pipelining: true,
        fetch,
        url: 'https://blog.example/trpc',
      }),
    ],
  });
}
