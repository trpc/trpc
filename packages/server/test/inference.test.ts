import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import * as trpc from '../src';
import { inferProcedureInput, inferProcedureOutput } from '../src';

test('infer input & output', async () => {
  const router = trpc
    .router()
    .query('withInput', {
      input: z.string(),
      async resolve({ input }) {
        return { input };
      },
    })
    .query('noInput', {
      async resolve({ input }) {
        return { input };
      },
    });
  type TQueries = typeof router['_def']['queries'];
  {
    const input: inferProcedureInput<TQueries['withInput']> = null as any;
    const output: inferProcedureOutput<TQueries['withInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<string>();
    expectTypeOf(output).toMatchTypeOf<{ input: string }>();
  }
  {
    const input: inferProcedureInput<TQueries['noInput']> = null as any;
    const output: inferProcedureOutput<TQueries['noInput']> = null as any;
    expectTypeOf(input).toMatchTypeOf<undefined | null | void>();
    expectTypeOf(output).toMatchTypeOf<{ input: undefined }>();
  }
});
