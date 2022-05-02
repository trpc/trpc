import { z } from 'zod';
import { isAuthed, procedure, trpc } from '../context';

// Router with some mixed procedures
export const mixedRouter = trpc.router({
  queries: {
    // procedure with input validation called `greeting`
    greeting: procedure
      .input(
        z.object({
          hello: z.string(),
          lengthOf: z
            .string()
            .transform((s) => s.length)
            .optional()
            .default(''),
        }),
      )
      .resolve((params) => {
        return {
          greeting: 'hello ' + params.ctx.user?.id ?? params.input.hello,
        };
      }),
    // procedure with auth
    viewerWhoAmi: procedure.use(isAuthed).resolve(({ ctx }) => {
      // `isAuthed()` will propagate new `ctx`
      // `ctx.user` is now `NonNullable`
      return `your id is ${ctx.user.id}`;
    }),
  },

  mutations: {
    fireAndForget: procedure.input(z.string()).resolve(() => {
      // no return
    }),

    updateTokenHappy: procedure
      .input(z.string())
      .output(z.literal('ok'))
      .resolve(() => {
        return 'ok';
      }),
    updateToken: procedure
      .input(z.string())
      .output(z.literal('ok'))
      // @ts-expect-error output validation
      .resolve(({ input }) => {
        return input;
      }),

    voidResponse: procedure
      .output(z.void())
      // @ts-expect-error output validation
      .resolve(({ input }) => {
        return input;
      }),
  },
});
