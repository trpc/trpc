import { z } from 'zod';
import { createRouter } from '../createRouter';

let idx = 0;
const posts = [
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
      posts.push(post);
      return post;
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return posts;
    },
  })
  .query('byId', {
    input: z.object({
      id: z.number(),
    }),
    async resolve({ ctx, input }) {
      const { id } = input;
      return posts.find((post) => post.id === id);
    },
  })
  .mutation('delete', {
    input: z.object({
      id: z.number(),
    }),
    async resolve({ input, ctx }) {
      const { id } = input;
      const index = posts.findIndex((post) => post.id === id);
      if (index > -1) {
        posts.slice(index);
      }
      return {
        id,
      };
    },
  });
