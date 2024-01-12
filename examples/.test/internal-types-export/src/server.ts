import { initTRPC } from '@trpc/server';
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext(opts: CreateNextContextOptions) {
  return {
    ...opts
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// needs to be exported for the test to be valid
export const t = initTRPC.context<Context>().create();

const someMiddleware = t.middleware(({ next }) => {
  return next();
});

// Note, this is not valid in v11: https://github.com/trpc/trpc/pull/3831#discussion_r1450437174
// export function genericRouter<TSchema extends (value: any) => unknown>(schema: TSchema) {
//   return t.router({
//     foo: t.procedure.output(schema).query(() => 'bar'),
//   });
// }

export type Foo = { x: Foo | number };

const routerA = t.router({
  a: t.procedure.query(() => 'a'),
});
const routerB = t.router({
  b: t.procedure.query(() => 'b'),
});

const appRouter = t.router({
  foo: t.procedure.query(() => 'bar'),
  hello: t.procedure.use(someMiddleware).query(() => 'hello'),
  // generic: genericRouter((value: string) => value.toUpperCase()),
  merged: t.mergeRouters(routerA, routerB),
  recursive: t.procedure.query(() => {
    return {
        x: 1,
    } as Foo;
  }),
});

export type AppRouter = typeof appRouter;
