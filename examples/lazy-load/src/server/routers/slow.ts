import { publicProcedure, router } from '../trpc.ts';

console.log('💤 Lazy loading slow router...');

await new Promise((resolve) => setTimeout(resolve, 3000));

export const slowRouter = router({
  hello: publicProcedure.query(() => 'world'),
});
