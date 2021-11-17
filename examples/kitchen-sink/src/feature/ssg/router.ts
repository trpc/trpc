import * as trpc from '@trpc/server';
import { z } from 'zod';

const posts = [
  {
    id: '1',
    title: 'This data comes from the backend',
  },
];

export const router = trpc.router().query('ssg.byId', {
  input: z.object({
    id: z.string(),
  }),
  async resolve({ input }) {
    const post = posts.find((post) => post.id === input.id);
    return post ?? null;
  },
});
