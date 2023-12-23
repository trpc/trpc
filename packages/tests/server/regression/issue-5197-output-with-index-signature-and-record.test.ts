import { inferRouterOutputs, initTRPC } from '@trpc/server';

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

  test('outputWithIndexSignature', async () => {
    type Output = AppRouterOutputs['outputWithIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithRecord', async () => {
    type Output = AppRouterOutputs['outputWithRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithRecordAndIndexSignature', async () => {
    type Output = AppRouterOutputs['outputWithRecordAndIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  /*
  With exactOptionalPropertyTypes: false (Default), following tests fail
  
  ```ts
  type output =  {
      [x: string]: number;
      a: number;
      b?: number | undefined;
    }
  ```
  
  `b?: number | undefined` isn't assignable to `[x: string]: number`

  test('outputWithUndefinedAndUndefinedIndexSignature', async () => {
    type Output =
      AppRouterOutputs['outputWithUndefinedAndUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b?: number;
    }>();
  });

  test('outputWithUndefinedAndRecord', async () => {
    type Output = AppRouterOutputs['outputWithUndefinedAndUndefinedRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b?: number;
    }>();
  });

  test('outputWithUndefinedAndRecordAndIndexSignature', async () => {
    type Output =
      AppRouterOutputs['outputWithUndefinedAndUndefinedRecordAndUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b?: number;
    }>();
  });
  */

  test('outputWithUndefinedIndexSignature', async () => {
    type Output = AppRouterOutputs['outputWithUndefinedIndexSignature'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecord', async () => {
    type Output = AppRouterOutputs['outputWithUndefinedRecord'];
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecordAndUndefinedIndexSignature', async () => {
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
