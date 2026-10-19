'use server';

import { createAction, publicProcedure } from '~/server/trpc';
import { z } from 'zod';
import { rhfActionSchema } from './ReactHookFormExample.schema';

/**
 * Either inline procedures using trpc's flexible
 * builder api, with input parsers and middleware
 * Wrap the procedure in a `createAction` call to
 * make it server-action friendly
 */
export const rhfAction = createAction(
  publicProcedure.input(rhfActionSchema).mutation(async (opts) => {
    console.log('testMutation called', opts);
    return {
      text: `Hello ${opts.input.text}`,
      date: new Date(),
    };
  }),
);
