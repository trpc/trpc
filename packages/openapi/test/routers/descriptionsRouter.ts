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

/** Hello greeting response */
type HelloInlineGreeting = string;

/** element of inputs strings */
type InputString = string;

/** Array of inputs strings */
type InputStrings = InputString[];

/** Array of output strings */
type DirectArrayInlineOutputStrings = string[];

function asType<T>() {
  return (value: unknown): T => value as T;
}

/**
 * Main router description
 */
export const descriptionsRouter = t.router({
  /**
   * Hello zod Procedure details
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
   * Subrouter zod descriptions
   */
  subrouter: {
    /**
     * Hello zod Procedure details
     */
    hello: t.procedure
      .input(
        z
          .object({
            /**
             * doc comment on name
             */
            name: z.string().describe('Name of the user'),
            /**
             * children list
             */
            children: z
              .array(
                z.object({
                  child: z.string().describe('Child name'),
                  gender: z
                    .enum(['male', 'female', 'other'])
                    .describe('Child gender'),
                }),
              )
              .describe('An array of children'),
          })
          .describe('Input to the procedure'),
      )
      .query(({ input }) => `Hello ${input.name}`),
  },

  /**
   * direct array zod procedure
   */
  directArray: t.procedure
    .input(
      z
        .array(z.string().describe('element of inputs strings'))
        .describe('Array of inputs strings'),
    )
    .output(
      z
        .array(z.string().describe('element of output strings'))
        .describe('Array of output strings'),
    )
    .mutation((opts) => opts.input),

  /**
   * Hello Procedure details
   */
  helloInline: t.procedure
    .input(
      asType<{
        /**
         * doc comment on name
         */
        name: string;
      }>(),
    )
    .query((): HelloInlineGreeting => `Greetings`),

  /**
   * Subrouter descriptions
   */
  subrouterInline: {
    /**
     * Hello Procedure details
     */
    hello: t.procedure
      .input(
        asType<{
          /**
           * doc comment on name
           */
          name: string;
          /**
           * children list
           */
          children: {
            /** Child name */
            child: string;
            /** Child gender */
            gender: 'male' | 'female' | 'other';
          }[];
        }>(),
      )
      .query(() => {
        /**
         * Response type for the hello procedure
         */
        type HelloInlineResponse = {
          /**
           * Name of the user
           */
          name: string;
          /**
           * Date of the greeting
           */
          date: Date;
        };

        return {
          name: 'hello',
          date: new Date(),
        } as HelloInlineResponse;
      }),
  },

  /**
   * directArrayInline procedure
   */
  directArrayInline: t.procedure
    .input(asType<InputStrings>())
    .mutation((opts): DirectArrayInlineOutputStrings => opts.input),
});

export type DescriptionsRouter = typeof descriptionsRouter;
