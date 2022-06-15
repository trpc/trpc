import './__packages';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src/core';
import { CombinedDataTransformer } from '../src/transformer';

describe('setup - inference', () => {
  test('transformer', () => {
    const t = initTRPC()();
    const router = t.router({});
    expectTypeOf(router.transformer).toMatchTypeOf<CombinedDataTransformer>();
  });

  test('merging routers', () => {
    const t = initTRPC()();
    const foo = t.procedure.resolve(() => 'foo' as const);
    const bar = t.procedure.resolve(() => 'bar' as const);
    const fooRouter = t.router({
      queries: {
        foo,
      },
    });
    const barRouter = t.router({
      queries: {
        bar,
      },
    });
    const router1 = t.mergeRouters(fooRouter, barRouter);
    const router2 = t.router({
      queries: {
        foo,
        bar,
      },
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore FIXME we probably want to have these equal
    expectTypeOf(router1).toMatchTypeOf(router2);
  });
  // FIXME:
  // test('meta', async () => {
  //   const t = initTRPC<{
  //     meta: {
  //       foo: 'bar';
  //     };
  //   }>()();
  //   const router = t.router({});
  //   expectTypeOf(router._def._meta).toMatchTypeOf<{
  //     foo: 'bar';
  //   }>();
  // });
});
