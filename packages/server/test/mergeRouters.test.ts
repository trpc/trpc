import './__packages';
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
