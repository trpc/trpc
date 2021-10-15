import { z } from 'zod';
import { createRouter } from '../createRouter';

let idx = 0;
const postsDb = [
  {
    id: ++idx,
    title: 'Hello',
    text: 'Nuxt + tRPC',
  },
];
export const postRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const post = {
        id: ++idx,
        ...input,
      };
      postsDb.push(post);
      return post;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      return postsDb;
    },
  })
  .query('byId', {
    input: z.object({
      id: z.number(),
    }),
    async resolve({ ctx, input }) {
      const { id } = input;
      return postsDb.find((post) => post.id === id);
    },
  })
  .mutation('delete', {
    input: z.object({
      id: z.number(),
    }),
    async resolve({ input, ctx }) {
      const { id } = input;
      const index = postsDb.findIndex((post) => post.id === id);
      if (index > -1) {
        postsDb.slice(index);
      }
      return {
        id,
      };
    },
  });
