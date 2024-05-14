import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const appRouter = t.router({
  outputWithIndexSignature: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
      [c: string]: number;
    };
  }),

  outputWithRecord: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
    } & Record<string, number>;
  }),

  outputWithRecordAndIndexSignature: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
      [c: string]: number;
    } & Record<string, number>;
  }),

  outputWithUndefinedAndUndefinedIndexSignature: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number | undefined;
      [c: string]: number | undefined;
    };
  }),

  outputWithUndefinedAndUndefinedRecord: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number | undefined;
    } & Record<string, number | undefined>;
  }),

  outputWithUndefinedAndUndefinedRecordAndUndefinedIndexSignature:
    t.procedure.query(() => {
      return {} as {
        a: number;
        b: number | undefined;
        [c: string]: number | undefined;
      } & Record<string, number | undefined>;
    }),

  outputWithUndefinedIndexSignature: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
      [c: string]: number | undefined;
    };
  }),

  outputWithUndefinedRecord: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
    } & Record<string, number | undefined>;
  }),

  outputWithUndefinedRecordAndUndefinedIndexSignature: t.procedure.query(() => {
    return {} as {
      a: number;
      b: number;
      [c: string]: number | undefined;
    } & Record<string, number | undefined>;
  }),
});

type AppRouter = typeof appRouter;

describe('inferRouterOutputs', () => {
  type AppRouterOutputs = inferRouterOutputs<AppRouter>;

  test('outputWithIndexSignature', () => {
    type Output = AppRouterOutputs['outputWithIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithRecord', () => {
    type Output = AppRouterOutputs['outputWithRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithRecordAndIndexSignature', () => {
    type Output = AppRouterOutputs['outputWithRecordAndIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedAndUndefinedIndexSignature', () => {
    type Output =
      AppRouterOutputs['outputWithUndefinedAndUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedAndRecord', () => {
    type Output = AppRouterOutputs['outputWithUndefinedAndUndefinedRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedAndRecordAndIndexSignature', () => {
    type Output =
      AppRouterOutputs['outputWithUndefinedAndUndefinedRecordAndUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedIndexSignature', () => {
    type Output = AppRouterOutputs['outputWithUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecord', () => {
    type Output = AppRouterOutputs['outputWithUndefinedRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecordAndUndefinedIndexSignature', () => {
    type Output =
      AppRouterOutputs['outputWithUndefinedRecordAndUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });
});
