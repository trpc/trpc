import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          opts.error.code === 'BAD_REQUEST'
            ? ((
                opts.error.cause as {
                  issues?: Array<{
                    message: string;
                    path: Array<string | number>;
                  }>;
                }
              )?.issues ?? null)
            : null,
      },
    };
  },
});

/**
 * Main router description
 */
export const descriptionsRouter = t.router({
  /**
   * Hello Procedure details
   */
  hello: t.procedure
    .input(
      z
        .object({
          /**
           * doc comment on name
           */
          name: z.string().describe('Name of the user'),
        })
        .describe('Input to the procedure'),
    )
    .query(({ input }) => `Hello ${input.name}`),

  /**
   * Subrouter descriptions
   */
  subrouter: {
    /**
     * Hello Procedure details
     */
    hello: t.procedure
      .input(
        z
          .object({
            /**
             * doc comment on name
             */
            name: z.string().describe('Name of the user'),
          })
          .describe('Input to the procedure'),
      )
      .query(({ input }) => `Hello ${input.name}`),
  },
});

export type DescriptionsRouter = typeof descriptionsRouter;
