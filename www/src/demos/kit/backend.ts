import { createTRPCClient, localLink, type TRPCLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';

import type { Network } from './network.ts';

export interface Post {
  readonly authorId: number;
  readonly body: string;
  readonly id: number;
  readonly minutes: number;
  readonly title: string;
}

const authors = ['Ada', 'Grace', 'Linus', 'Margaret'] as const;

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
    body: 'Type a prop with unstable_inferQueryHandle, and the component can only read the query it was given.',
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

/** How many pages the list has. */
export const pageCount = Math.ceil(posts.length / perPage);

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
  'post.byId': 1,
  'post.commentCounts': 1.1,
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

function postOf(id: number) {
  const post = posts.find((candidate) => candidate.id === id);
  if (!post) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No post ${id}` });
  }
  return post;
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
 * A blog's tRPC router, run in the page. Each post response says when it
 * was served, in seconds since the demo started, so a demo can show which
 * copy of the data it renders.
 */
function createAppRouter(startedAt: number) {
  // The demo's server runs in the browser, on purpose.
  const t = initTRPC.create({ allowOutsideOfServer: true });
  const servedAt = () => Math.round((performance.now() - startedAt) / 100) / 10;
  return t.router({
    post: t.router({
      byId: t.procedure.input(numbersInput('id')).query(({ input }) => {
        const post = postOf(input.id);
        return {
          ...post,
          author: authorOf(post.authorId),
          servedAt: servedAt(),
        };
      }),
      /** Each post's comment count, by post id, for one page of the list. */
      commentCounts: t.procedure
        .input(numbersInput('page'))
        .query(({ input }) =>
          Object.fromEntries(
            pageOf(input.page).map((post) => [
              post.id,
              commentsOf(post.id).length,
            ]),
          ),
        ),
      comments: t.procedure
        .input(numbersInput('postId'))
        .query(({ input }) => commentsOf(input.postId)),
      list: t.procedure
        .input(numbersInput('page'))
        .query(({ input }) => pageOf(input.page).map(summaryOf)),
      /**
       * The other posts by a post's author. It takes the post's id, which is
       * in the URL, so a loader can start it with the post.
       */
      moreByAuthor: t.procedure
        .input(numbersInput('postId'))
        .query(({ input }) => {
          const post = postOf(input.postId);
          return {
            author: authorOf(post.authorId),
            posts: posts
              .filter(
                (other) =>
                  other.authorId === post.authorId && other.id !== post.id,
              )
              .map(summaryOf),
          };
        }),
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
        const timer = setTimeout(
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
          network.delay(procedureWeights[op.path] ?? 1),
        );
        return () => {
          clearTimeout(timer);
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
  const router = createAppRouter(network.startedAt);
  return createTRPCClient<AppRouter>({
    links: [
      networkLink(network, origin),
      localLink({ createContext: async () => ({}), router }),
    ],
  });
}
