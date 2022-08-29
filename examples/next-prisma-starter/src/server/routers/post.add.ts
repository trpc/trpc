import { z } from 'zod';
import { createRouter } from '~/server/createRouter';
import { prisma } from '~/server/prisma';

export const postAdd = createRouter()
  // create
  .mutation('post.add', {
    input: z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ input }) {
      const post = await prisma.post.create({
        data: input,
      });
      return post;
    },
  });
