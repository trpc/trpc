import { z } from 'zod';
import { createRouter } from '../createRouter';

export const apiRouter = createRouter()
  .query('version', {
    resolve() {
      return { version: '0.42.0' };
    },
  })
  .query('hello', {
    input: z
      .object({
        username: z.string().nullish(),
      })
      .nullish(),
    resolve({ input, ctx }) {
      return {
        text: `hello ${input?.username ?? ctx.user?.name ?? 'world'}`,
      };
    },
  });
