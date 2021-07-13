/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from '../trpc';
import { EventEmitter } from 'events';
import { Subscription } from '@trpc/server';
const ee = new EventEmitter();
export const postsRouter = createRouter()
  // update
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        name: z.string().min(1).max(32).optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    auth: {
      input: z.uuid(),
      resolve({ ctx, input }) {
        // fetch post
        return true;
      },
    },
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const todo = await ctx.prisma.post.update({
        where: { id },
        data,
      });
      ee.emit('updated');
      return todo;
    },
  });
