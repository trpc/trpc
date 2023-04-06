import * as trpc from '@trpc/server/src';
import { inferProcedureInput, inferProcedureOutput } from '@trpc/server/src';
import { Observable, observable } from '@trpc/server/src/observable';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

describe('infer query input & output', () => {
  const router = trpc
    .router()
    .query('noInput', {
      async resolve({ input }) {
        return { input };
      },
    })
    .query('withInput', {
      input: z.string(),
      output: z.object({
        input: z.string(),
      }),
      async resolve({ input }) {
        return { input };
      },
    })
    .query('withOutput', {
      output: z.object({
        input: z.string(),
      }),
      // @ts-expect-error - ensure type inferred from "output" is expected as "resolve" fn return type
      async resolve({ input }) {
        return { input };
      },
    })
    .query('withOutputEmptyObject', {
      output: z.object({
        input: z.string(),
      }),
      // @ts-expect-error - ensure type inferred from "output" is higher priority than "resolve" fn return type
      resolve() {
        return {};
      },
    })
    .query('withInputOutput', {
      input: z.string(),
      output: z.object({
        input: z.string(),
      }),
      async resolve({ input }) {
        return { input };
      },
    })
    .interop();
  type TQueries = (typeof router)['_def']['queries'];

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
  const router = trpc
    .router()
    .mutation('noInput', {
      async resolve({ input }) {
        return { input };
      },
    })
    .mutation('withInput', {
      input: z.string(),
      output: z.object({
        input: z.string(),
      }),
      async resolve({ input }) {
        return { input };
      },
    })
    .mutation('withOutput', {
      output: z.object({
        input: z.string(),
      }),
      // @ts-expect-error - ensure type inferred from "output" is expected as "resolve" fn return type
      async resolve({ input }) {
        return { input };
      },
    })
    .mutation('withOutputEmptyObject', {
      output: z.object({
        input: z.string(),
      }),
      // @ts-expect-error - ensure type inferred from "output" is higher priority than "resolve" fn return type
      resolve() {
        return {};
      },
    })
    .mutation('withInputOutput', {
      input: z.string(),
      output: z.object({
        input: z.string(),
      }),
      async resolve({ input }) {
        return { input };
      },
    })
    .interop();
  type TMutations = (typeof router)['_def']['mutations'];

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
  // @ts-expect-error - ensure "output" is omitted in subscription procedure
  const router = trpc
    .router()
    .subscription('noSubscription', {
      // @ts-expect-error - ensure Observable is expected as "resolve" fn return type
      async resolve({ input }) {
        return { input };
      },
    })
    .subscription('noInput', {
      async resolve() {
        return observable(() => () => null);
      },
    })
    .subscription('withInput', {
      input: z.string(),
      async resolve({ input }) {
        return observable<typeof input>((emit) => {
          emit.next(input);
          return () => null;
        });
      },
    })
    .subscription('withOutput', {
      input: z.string(),
      output: z.null(),
      async resolve({ input }) {
        return observable<typeof input>((emit) => {
          emit.next(input);
          return () => null;
        });
      },
    })
    .interop();
  type TSubscriptions = (typeof router)['_def']['subscriptions'];

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
