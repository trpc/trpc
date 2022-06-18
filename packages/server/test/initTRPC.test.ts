import './___packages';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src/core';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '../src/transformer';

describe('setup - inference', () => {
  test('default transformer', () => {
    const t = initTRPC()();
    const router = t.router({});
    expectTypeOf(router.transformer).toMatchTypeOf<DefaultDataTransformer>();
  });
  test('custom transformer', () => {
    const transformer: DataTransformerOptions = {
      deserialize: (v) => v,
      serialize: (v) => v,
    };
    const t = initTRPC()({
      transformer,
    });
    const router = t.router({});
    expectTypeOf(router.transformer).toMatchTypeOf<CombinedDataTransformer>();
    expectTypeOf(
      router.transformer,
    ).not.toMatchTypeOf<DefaultDataTransformer>();
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
    expectTypeOf(router1.queries.foo).toMatchTypeOf(router2.queries.foo);
    expectTypeOf(router1.queries.bar).toMatchTypeOf(router2.queries.bar);
  });

  test('meta', async () => {
    const t = initTRPC<{
      meta: {
        foo: string;
      };
    }>()();

    const router = t.router({
      queries: {
        good: t.procedure.meta({ foo: 'bar' }).resolve(() => 'good'),
        // @ts-expect-error this doesn't match the meta defined
        bad: t.procedure.meta({ bar: 'z' }).resolve(() => 'bad'),
      },
    });

    expectTypeOf(router._def._meta).toMatchTypeOf<{
      foo: string;
    }>();

    type ProcMeta =
      | undefined
      | {
          foo: string;
        };
    expectTypeOf(router.queries.good.meta).toMatchTypeOf<ProcMeta>();
    expectTypeOf(router.queries.good.meta).toMatchTypeOf<ProcMeta>();
  });
});
