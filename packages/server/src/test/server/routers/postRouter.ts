import { z } from 'zod';
import { isAuthed, procedure, trpc } from '../context';

// mock db
export const postsDb = [
  {
    id: '1',
    title: 'hello tRPC',
    body: 'this is a preview of v10',
    userId: 'KATT',
  },
];

// Router regarding posts

export const postRouter = trpc.router({
  queries: {
    // simple procedure without args avialable at postAll`
    postList: procedure.resolve(() => postsDb),
    // get post by id or 404 if it's not found
    postById: procedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .resolve(({ input }) => {
        const post = postsDb.find((post) => post.id === input.id);
        if (!post) {
          throw new Error('NOT_FOUND');
        }
        return post;
      }),
  },
  mutations: {
    // mutation with auth + input
    postAdd: procedure
      .input(
        z.object({
          title: z.string(),
          body: z.string(),
        }),
      )
      .use(isAuthed)
      .resolve(({ ctx, input }) => {
        const post: typeof postsDb[number] = {
          ...input,
          id: `${Math.random()}`,
          userId: ctx.user.id,
        };
        postsDb.push(post);
        return post;
      }),
  },
});
