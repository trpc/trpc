import {
  inferProcedureInput,
  inferProcedureOutput,
  initTRPC,
} from '@trpc/server/src';
import { Observable, observable } from '@trpc/server/src/observable';
import { z } from 'zod';
import { expectTypeOf } from './inferenceUtils';

describe('infer query input & output', () => {
  const t = initTRPC.create();

  const router = t.router({
    noInput: t.procedure.input(z.undefined()).query(({ input }) => {
      return { input };
    }),

    withInput: t.procedure
      .input(z.string())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return { input };
      }),

    withOutput: t.procedure
      .output(
        z.object({
          input: z.string(),
        }),
      )
      // @ts-expect-error - ensure type inferred from "output" is expected as "resolve" fn return type
      .query(async ({ input }) => {
        return { input };
      }),

    withOutputEmptyObject: t.procedure
      .input(z.undefined())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      // @ts-expect-error - ensure type inferred from "output" is higher priority than "resolve" fn return type
      .query(({}) => {
        return {};
      }),

    withInputOutput: t.procedure
      .input(z.string())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      .query(({ input }) => {
        return { input };
      }),
  });

  type TQueries = (typeof router)['_def']['procedures'];

  test('no input', () => {
    const input: inferProcedureInput<TQueries['noInput']> = null as any;
    const output: inferProcedureOutput<TQueries['noInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: undefined }>();
  });
  test('with input', () => {
    const input: inferProcedureInput<TQueries['withInput']> = null as any;
    const output: inferProcedureOutput<TQueries['withInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with output', () => {
    const input: inferProcedureInput<TQueries['withOutput']> = null as any;
    const output: inferProcedureOutput<TQueries['withOutput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with output empty object', () => {
    const input: inferProcedureInput<TQueries['withOutputEmptyObject']> =
      null as any;
    const output: inferProcedureOutput<TQueries['withOutputEmptyObject']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with input and output', () => {
    const input: inferProcedureInput<TQueries['withInputOutput']> = null as any;
    const output: inferProcedureOutput<TQueries['withInputOutput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
});

describe('infer mutation input & output', () => {
  const t = initTRPC.create();

  const router = t.router({
    noInput: t.procedure.input(z.undefined()).mutation(async ({ input }) => {
      return { input };
    }),

    withInput: t.procedure
      .input(z.string())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return { input };
      }),

    withOutput: t.procedure
      .output(
        z.object({
          input: z.string(),
        }),
      )
      // @ts-expect-error - ensure type inferred from "output" is expected as "resolve" fn return type
      .mutation(async ({ input }) => {
        return { input };
      }),

    withOutputEmptyObject: t.procedure
      .input(z.undefined())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      // @ts-expect-error - ensure type inferred from "output" is higher priority than "resolve" fn return type
      .mutation(({}) => {
        return {};
      }),

    withInputOutput: t.procedure
      .input(z.string())
      .output(
        z.object({
          input: z.string(),
        }),
      )
      .mutation(({ input }) => {
        return { input };
      }),
  });

  type TMutations = (typeof router)['_def']['procedures'];

  test('no input', () => {
    const input: inferProcedureInput<TMutations['noInput']> = null as any;
    const output: inferProcedureOutput<TMutations['noInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: undefined }>();
  });
  test('with input', () => {
    const input: inferProcedureInput<TMutations['withInput']> = null as any;
    const output: inferProcedureOutput<TMutations['withInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with output', () => {
    const input: inferProcedureInput<TMutations['withOutput']> = null as any;
    const output: inferProcedureOutput<TMutations['withOutput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with output empty object', () => {
    const input: inferProcedureInput<TMutations['withOutputEmptyObject']> =
      null as any;
    const output: inferProcedureOutput<TMutations['withOutputEmptyObject']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
  test('with input and output', () => {
    const input: inferProcedureInput<TMutations['withInputOutput']> =
      null as any;
    const output: inferProcedureOutput<TMutations['withInputOutput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  });
});

describe('infer subscription input & output', () => {
  const t = initTRPC.create();

  const router = t.router({
    noSubscription: t.procedure
      .input(z.undefined())
      .subscription(async ({ input }) => {
        return { input };
      }),

    noInput: t.procedure.mutation(async ({}) => {
      return observable(() => () => null);
    }),

    withInput: t.procedure.input(z.string()).subscription(({ input }) => {
      return observable<typeof input>((emit) => {
        emit.next(input);
        return () => null;
      });
    }),

    withOutput: t.procedure
      .output(
        z.object({
          input: z.string(),
        }),
      )
      // @ts-expect-error - ensure type inferred from "output" is expected as "resolve" fn return type
      .subscription(async ({ input }) => {
        return observable<typeof input>((emit) => {
          emit.next(input);
          return () => null;
        });
      }),
  });

  type TSubscriptions = (typeof router)['_def']['procedures'];

  test('no input', () => {
    const input: inferProcedureInput<TSubscriptions['noInput']> = null as any;
    const output: inferProcedureOutput<TSubscriptions['noInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<Observable<unknown, unknown>>();
  });
  test('with input', () => {
    const input: inferProcedureInput<TSubscriptions['withInput']> = null as any;
    const output: inferProcedureOutput<TSubscriptions['withInput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<Observable<string, unknown>>();
  });
});
