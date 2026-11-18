/**
 * The showcase's API: a few posts and their comments, kept in memory. It
 * never changes, so every request and server instance sees the same data.
 */
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.create();

interface Post {
  readonly body: string;
  readonly id: string;
  readonly title: string;
}

interface Comment {
  readonly author: string;
  readonly id: string;
  readonly text: string;
}

const posts: ReadonlyArray<Post> = [
  {
    body: 'The loader starts every query the page needs, then hands each component a handle to its query.',
    id: '1',
    title: 'Load once, read anywhere',
  },
  {
    body: 'A handle is a query key and its input. It holds no data, so it is cheap to pass around as a prop.',
    id: '2',
    title: 'Handles hold no data',
  },
  {
    body: 'The data the server loaded reaches the browser with the page, so the browser does not ask for it again.',
    id: '3',
    title: 'No second fetch',
  },
];

const comments: Readonly<Record<string, ReadonlyArray<Comment>>> = {
  '1': [
    { author: 'Ada', id: 'c1', text: 'One loader, no waterfall.' },
    { author: 'Linus', id: 'c2', text: 'And the input is typed.' },
  ],
  '2': [{ author: 'Grace', id: 'c3', text: 'Small props are nice props.' }],
  '3': [],
};

/** Reads `{ [key]: string }`; a tiny parser, so the showcase needs no zod. */
const stringField =
  <TKey extends string>(key: TKey) =>
  (input: unknown): Record<TKey, string> => {
    const value: unknown =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)[key]
        : undefined;
    if (typeof value !== 'string') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${key} must be a string`,
      });
    }
    return { [key]: value } as Record<TKey, string>;
  };

const findPost = (id: string) => {
  const post = posts.find((candidate) => candidate.id === id);
  if (post === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `No post ${id}` });
  }
  return post;
};

export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(stringField('id'))
      .query(({ input }) => findPost(input.id)),
    comments: t.procedure
      .input(stringField('postId'))
      .query(({ input }) => comments[findPost(input.postId).id] ?? []),
  }),
});

export type AppRouter = typeof appRouter;
