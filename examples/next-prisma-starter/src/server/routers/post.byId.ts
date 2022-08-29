import { createRouter } from '../createRouter';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const postById = createRouter().query('post.byId', {
  input: z.object({
    id: z.string(),
  }),
  async resolve({ input }) {
    const { id } = input;
    const post = await prisma.post.findUnique({
      where: { id },
    });
    if (!post) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No post with id '${id}'`,
      });
    }
    return post;
  },
});
