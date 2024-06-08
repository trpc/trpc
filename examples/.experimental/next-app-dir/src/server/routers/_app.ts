import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

let latestPost = {
  id: 0,
  title: 'latest post',
  content: 'hello world',
  createdAt: new Date(),
};

export const createPost = publicProcedure
  .input(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  )
  .mutation(async (opts) => {
    latestPost = {
      id: latestPost.id + 1,
      createdAt: new Date(),
      ...opts.input,
    };

    return latestPost;
  });

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async (opts) => {
      console.log('request from', opts.ctx.headers?.['x-trpc-source']);
      return `hello ${opts.input.text} - ${Math.random()}`;
    }),

  secret: publicProcedure.query(async (opts) => {
    if (!opts.ctx.session) {
      return 'You are not authenticated';
    }
    return "Cool, you're authenticated!";
  }),

  me: publicProcedure.query((opts) => {
    return opts.ctx.session;
  }),

  createPost,

  getLatestPost: publicProcedure.query(async () => {
    return latestPost;
  }),

  getPokemon: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async (opts) => {
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${opts.input.id}`,
      );

      return response.json();
    }),
});

export type AppRouter = typeof appRouter;
