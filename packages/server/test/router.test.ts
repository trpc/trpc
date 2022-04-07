/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { Router, Subscription, TRPCRouter, router } from '../src';
import type {
  ProcedureRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '../src';

test('deprecated router type is supported', () => {
  type Context = { foo: string };
  type RouterWithContext = TRPCRouter<
    Context,
    Context,
    any,
    any,
    any,
    any,
    any
  >;

  const legacyRouter = new Router<Context, any, any, any, any, any>();

  expectTypeOf(legacyRouter).toMatchTypeOf<RouterWithContext>();
  expect(legacyRouter instanceof TRPCRouter).toEqual(true);
});

test('double errors', async () => {
  expect(() => {
    router()
      .query('dupe', {
        resolve() {
          return null;
        },
      })
      .query('dupe', {
        resolve() {
          return null;
        },
      });
  }).toThrowErrorMatchingInlineSnapshot(`"Duplicate endpoint(s): dupe"`);
});

test('input type narrowing', () => {
  const narrowedRouter = new TRPCRouter<
    any,
    any,
    any,
    ProcedureRecord<any, any, any, string, any, any, any>,
    ProcedureRecord<any, any, any, string, any, any, any>,
    ProcedureRecord<
      any,
      any,
      any,
      string,
      Subscription<unknown>,
      unknown,
      unknown
    >,
    any
  >()
    .query('validInput', {
      input: z.string(),
      resolve: ({ input }) => {
        return { input };
      },
    })
    .query('invalidInput', {
      // @ts-expect-error - ensure input extends the narrowed type
      input: z.number(),
      resolve: ({ input }) => {
        return { input };
      },
    })
    .mutation('validInput', {
      input: z.string(),
      resolve: ({ input }) => {
        return { input };
      },
    })
    .mutation('invalidInput', {
      // @ts-expect-error - ensure input extends the narrowed type
      input: z.number(),
      resolve: ({ input }) => {
        return { input };
      },
    })
    .subscription('validInput', {
      input: z.string(),
      resolve: ({ input }) => {
        return new Subscription<typeof input>((emit) => {
          emit.data(input);
          return () => null;
        });
      },
    })
    .subscription('invalidInput', {
      // @ts-expect-error - ensure input extends the narrowed type
      input: z.number(),
      resolve: ({ input }) => {
        return new Subscription<typeof input>((emit) => {
          emit.data(input);
          return () => null;
        });
      },
    });

  type TQueries = typeof narrowedRouter['_def']['queries'];
  {
    const input: inferProcedureInput<TQueries['validInput']> = null as any;
    const output: inferProcedureOutput<TQueries['validInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  }
  {
    const input: inferProcedureInput<TQueries['invalidInput']> = null as any;
    const output: inferProcedureOutput<TQueries['invalidInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<unknown>();
  }

  type TMutations = typeof narrowedRouter['_def']['mutations'];
  {
    const input: inferProcedureInput<TMutations['validInput']> = null as any;
    const output: inferProcedureOutput<TMutations['validInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  }
  {
    const input: inferProcedureInput<TMutations['invalidInput']> = null as any;
    const output: inferProcedureOutput<TMutations['invalidInput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<unknown>();
  }

  type TSubscriptions = typeof narrowedRouter['_def']['subscriptions'];
  {
    const input: inferProcedureInput<TSubscriptions['validInput']> =
      null as any;
    const output: inferProcedureOutput<TSubscriptions['validInput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<Subscription<string>>();
  }
  {
    const input: inferProcedureInput<TSubscriptions['invalidInput']> =
      null as any;
    const output: inferProcedureOutput<TSubscriptions['invalidInput']> =
      null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<unknown>();
  }
});
