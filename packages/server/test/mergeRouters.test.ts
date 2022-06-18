import './___packages';
import { routerToServerAndClientNew } from './___testHelpers';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src';

test('with error formatter', () => {
  const t = initTRPC()({
    errorFormatter({ shape }) {
      return shape;
    },
  });
  const foo = t.router({
    queries: {
      foo: t.procedure.resolve(() => 'foo' as const),
    },
  });
  const bar = t.router({
    queries: {
      bar: t.procedure.resolve(() => 'foo' as const),
    },
  });

  t.mergeRouters(foo, bar);
});

test('duplicates', () => {
  const t = initTRPC()({
    errorFormatter({ shape }) {
      return shape;
    },
  });
  const foo = t.router({
    queries: {
      q1: t.procedure.resolve(() => 'foo' as const),
    },
  });
  const bar = t.router({
    queries: {
      q1: t.procedure.resolve(() => 'bar' as const),
    },
  });
  expect(() => t.mergeRouters(foo, bar)).toThrowErrorMatchingInlineSnapshot(
    `"Duplicate key q1"`,
  );
});

test('inference', async () => {
  const t = initTRPC()({
    errorFormatter({ shape }) {
      return shape;
    },
  });
  const r1 = t.router({
    queries: {
      r1q1: t.procedure.resolve(() => 'r1q1' as const),
    },
  });
  const r2 = t.router({
    queries: {
      r2q1: t.procedure.resolve(() => 'r2q1' as const),
    },
  });
  const r3 = t.router({
    queries: {
      r3q1: t.procedure.resolve(() => 'r3q1' as const),
    },
  });

  const appRouter = t.mergeRouters(r1, r2, r3);
  const opts = routerToServerAndClientNew(appRouter, {});

  expectTypeOf(appRouter.queries.r1q1).toMatchTypeOf(r1.queries.r1q1);
  expectTypeOf(appRouter.queries.r2q1).toMatchTypeOf(r2.queries.r2q1);
  expectTypeOf(appRouter.queries.r3q1).toMatchTypeOf(r3.queries.r3q1);

  opts.close();
});

test('stupidly simple', async () => {
  const t = initTRPC()({
    errorFormatter({ shape }) {
      return shape;
    },
  });
  const r1 = t.router({
    queries: {
      r1q1: t.procedure.resolve(() => 'r1q1' as const),
    },
  });
  const r2 = t.router({
    queries: {
      r2q1: t.procedure.resolve(() => 'r2q1' as const),
    },
  });
  const r3 = t.router({
    queries: {
      r3q1: t.procedure.resolve(() => 'r3q1' as const),
    },
  });

  const appRouter = t.router({
    queries: {
      ...r1.queries,
      ...r2.queries,
      ...r3.queries,
    },
    mutations: {
      ...r1.mutations,
      ...r2.mutations,
      ...r3.mutations,
    },
    subscriptions: {
      ...r1.subscriptions,
      ...r2.subscriptions,
      ...r3.subscriptions,
    },
  });
  const opts = routerToServerAndClientNew(appRouter, {});

  expectTypeOf(appRouter.queries.r1q1).toMatchTypeOf(r1.queries.r1q1);
  expectTypeOf(appRouter.queries.r2q1).toMatchTypeOf(r2.queries.r2q1);
  expectTypeOf(appRouter.queries.r3q1).toMatchTypeOf(r3.queries.r3q1);

  opts.close();
});
