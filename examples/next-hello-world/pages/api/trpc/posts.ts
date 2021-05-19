/**
 * Example of a sub router
 */

import { z } from 'zod';
import { createRouter } from './[trpc]';
const randomId = () => Math.random().toString(36).substr(2, 9);
// example db
const db = [
  {
    id: 'ot4ysggjl',
    title: 'Hello tRPC',
    text: 'An example entry',
  },
];

export const postsRouter = createRouter()
  .query('list', {
    async resolve() {
      return db;
    },
  })
  .mutation('add', {
    input: z.object({
      title: z.string().min(2),
      text: z.string().min(4),
    }),
    async resolve({ input, ctx }) {
      // in a real app, you'd probably grab the user from `ctx` here
      const post = {
        id: randomId(),
        ...input,
      };
      db.push(post);

      return post;
    },
  });
