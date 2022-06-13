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
    const router = t.mergeRouters(fooRouter, barRouter);
    expectTypeOf(router).toMatchTypeOf(
      t.router({
        queries: {
          foo,
          bar,
        },
      }),
    );
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
