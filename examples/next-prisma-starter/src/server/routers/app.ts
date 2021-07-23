/**
 * This file contains the root router of your tRPC-backend
 */
import superjson from 'superjson';
import { createRouter } from '../trpc';
import { postsRouter } from './posts';
import zodToJsonSchema from 'zod-to-json-schema';
import { ZodType } from 'zod';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
const rootRouter = createRouter()
  /**
   * Add data transformers
   * @link https://trpc.io/docs/data-transformers
   */
  .transformer(superjson)
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ shape, error }) => { })
  .merge('posts.', postsRouter);

export const appRouter = createRouter()
  .merge(rootRouter)
  .merge(
    'schemas.',
    createRouter()
      //
      .query('mutations', {
        resolve() {
          const mutations = Object.entries(rootRouter._def.mutations);
          const schemas = mutations.flatMap(([path, procedure]) => {
            if (procedure.inputParser instanceof ZodType) {
              return {
                path,
                schema: zodToJsonSchema(procedure.inputParser),
              };
            }

            return [];
          });
          return schemas;
        },
      }),
  );

export type AppRouter = typeof appRouter;
