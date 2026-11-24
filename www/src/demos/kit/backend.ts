import { createTRPCClient, localLink, type TRPCLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';

import { authors, comments, type Post, posts } from './data.ts';
import type { Network } from './network.ts';

const perPage = 3;
const pageCount = Math.ceil(posts.length / perPage);

/**
 * How long each procedure takes, in typical round trips. They differ, as
 * real queries do, so a waterfall's steps and a parallel load's slowest
 * request are easy to tell apart.
 */
export const procedureWeights: Readonly<Record<string, number>> = {
  'post.byId': 1,
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
  comments: commentsOf,
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
 * A blog's tRPC router, run in the page. Each post response says when it
 * was served, in seconds since the demo started, so a demo can show which
 * copy of the data it renders.
 */
function createAppRouter(network: Network) {
  // The demo's server runs in the browser, on purpose.
  const t = initTRPC.create({ allowOutsideOfServer: true });
  const servedAt = () => Math.round(network.now() / 100) / 10;
  return t.router({
    post: t.router({
      byId: t.procedure.input(numbersInput('id')).query(({ input }) => ({
        ...(blogData.post(input.id) ?? notFound(input.id)),
        servedAt: servedAt(),
      })),
      comments: t.procedure.input(cursorInput('postId')).query(({ input }) => ({
        items: blogData.comments(input.postId),
        ...lastPage,
      })),
      list: t.procedure
        .input(numbersInput('page'))
        .query(({ input }) => blogData.list(input.page)),
      /**
       * The other posts by a post's author. It takes the post's id, which is
       * in the URL, so a loader can start it with the post.
       */
      moreByAuthor: t.procedure
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
      localLink({ createContext: async () => ({}), router }),
    ],
  });
}
