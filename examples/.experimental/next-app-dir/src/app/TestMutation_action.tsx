'use server';

import { z } from 'zod';
import { createAction, publicProcedure } from '~/server/trpc';

export const testMutation = createAction(
  publicProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .mutation(async (opts) => {
      console.log('testMutation', opts);
      return '...... we did stuff!';
    }),
);
