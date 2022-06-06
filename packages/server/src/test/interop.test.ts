import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { router } from '../';

const appRouter = router<{
  user?: {
    id: string;
  };
}>()
  .query('foo', {
    resolve() {
      return 'bar' as const;
    },
  })
  .mutation('doSomething', {
    input: z.string(),
    resolve({ input }) {
      return input;
    },
  });

export async function main() {
  const newRouter = appRouter.interop();
  const caller = newRouter.createCaller({});
  {
    const res = await newRouter.queries.foo();
    expectTypeOf(res).toMatchTypeOf<'bar'>();
  }
  {
    // @ts-expect-error does not exist
    await caller.query('nope');
  }
  {
    const res = await caller.query('foo');
    expectTypeOf(res).toMatchTypeOf<'bar'>();
  }
  {
    const res = await caller.mutation('doSomething', 'asd');
    expectTypeOf(res).toMatchTypeOf<string>();
  }
}
