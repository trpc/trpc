import { publicProcedure, router } from '../trpc.js';

console.log('loading a slow router...');

await new Promise((resolve) => setTimeout(resolve, 3000));

export const slowRouter = router({
  hello: publicProcedure.query(() => 'world'),
});
