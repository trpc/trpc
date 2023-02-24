import { initTRPC } from '@trpc/server';

// needs to be exported for the test to be valid
export const t = initTRPC.create();

const someMiddleware = t.middleware(({ next }) => {
  return next();
});

export function genericRouter<S extends (value: any) => unknown>(schema: S) {
  return t.router({
    foo: t.procedure.output(schema).query(() => 'bar'),
  });
}

const appRouter = t.router({
  foo: t.procedure.query(() => 'bar'),
  hello: t.procedure.use(someMiddleware).query(() => 'hello'),
  generic: genericRouter((value: string) => value.toUpperCase()),
})

export type AppRouter = typeof appRouter;
