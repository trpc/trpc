import { createTRPCClient, localLink, type TRPCLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';

import type { Network } from './network.ts';

export interface Post {
  readonly authorId: number;
  readonly body: string;
  readonly id: number;
  readonly title: string;
}

const authors = ['Ada', 'Grace', 'Linus', 'Margaret'] as const;

const posts: ReadonlyArray<Post> = [
  {
    authorId: 1,
    body: 'Start every query in the loader, and the page loads in one round trip.',
    id: 1,
    title: 'Render as you fetch',
  },
  {
    authorId: 2,
    body: 'A handle names a query; the component that reads it needs nothing else.',
    id: 2,
    title: 'Handles, explained',
  },
  {
    authorId: 3,
    body: 'Filters, sort and page belong in the URL, where the loader can see them.',
    id: 3,
    title: 'The URL is the input',
  },
];

const comments = [
  { body: 'Finally, no more spinners inside spinners.', postId: 1 },
  { body: 'The loader starts both? Neat.', postId: 1 },
  { body: 'So a handle is just a key and an input?', postId: 2 },
  { body: 'Plus the data, from $ensure.', postId: 2 },
  { body: 'Shareable links for free.', postId: 3 },
].map((comment, index) => ({
  ...comment,
  author: authors[(index + 1) % authors.length] ?? 'Ada',
  id: index + 1,
}));

function authorOf(id: number) {
  return authors[id - 1] ?? 'Ada';
}

function postOf(id: number) {
  const post = posts.find((candidate) => candidate.id === id);
  if (!post) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No post ${id}` });
  }
  return post;
}

function idInput<TKey extends string>(key: TKey) {
  return (input: unknown) => {
    const value =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)[key]
        : undefined;
    if (typeof value !== 'number') {
      throw new Error(`Expected { ${key}: number }`);
    }
    return { [key]: value } as Record<TKey, number>;
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
      author: t.procedure.input(idInput('postId')).query(({ input }) => ({
        name: authorOf(postOf(input.postId).authorId),
      })),
      byId: t.procedure
        .input(idInput('id'))
        .query(({ input }) => ({ ...postOf(input.id), servedAt: servedAt() })),
      comments: t.procedure
        .input(idInput('postId'))
        .query(({ input }) =>
          comments.filter((comment) => comment.postId === input.postId),
        ),
      list: t.procedure.query(() =>
        posts.map((post) => ({ id: post.id, title: post.title })),
      ),
    }),
    user: t.router({
      byId: t.procedure
        .input(idInput('id'))
        .query(({ input }) => ({ name: authorOf(input.id) })),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

/**
 * Sends each call over the pretend network: it shows in the demo's network
 * panel, and reaches the router after the network's latency.
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
        const timer = setTimeout(() => {
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
        }, network.latency);
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
