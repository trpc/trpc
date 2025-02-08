import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

test('experimental caller', async () => {
  const t = initTRPC.create();

  const base = t.procedure
    .use((opts) => {
      return opts.next({
        ctx: {
          foo: 'bar' as const,
        },
      });
    })
    .experimental_caller(async (opts) => {
      switch (opts._def.type) {
        case 'mutation': {
          /**
           * When you wrap an action with useFormState, it gets an extra argument as its first argument.
           * The submitted form data is therefore its second argument instead of its first as it would usually be.
           * The new first argument that gets added is the current state of the form.
           * @see https://react.dev/reference/react-dom/hooks/useFormState#my-action-can-no-longer-read-the-submitted-form-data
           */
          const input = opts.args.length === 1 ? opts.args[0] : opts.args[1];

          return opts.invoke({
            type: 'query',
            ctx: {},
            getRawInput: async () => input,
            path: '',
            input,
            signal: undefined,
          });
        }
        case 'query': {
          const input = opts.args[0];
          return opts.invoke({
            type: 'query',
            ctx: {},
            getRawInput: async () => input,
            path: '',
            input,
            signal: undefined,
          });
        }
        case 'subscription':
        default: {
          throw new TRPCError({
            code: 'NOT_IMPLEMENTED',
            message: `Not implemented for type ${opts._def.type}`,
          });
        }
      }
    });

  {
    // no input
    const proc = base.query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect((proc as any)._def.type).toMatchInlineSnapshot(`"query"`);
  }

  {
    // input
    const proc = base
      .input(z.string())
      .query(async (opts) => `hello ${opts.input}`);
    const result = await proc('world');
    expect(result).toBe('hello world');
  }
  {
    // mutation with input
    const proc = base.input(z.string()).mutation(async (opts) => {
      return opts.input;
    });

    const result = await proc('world');
    expect(result).toBe('world');
    expect((proc as any)._def.type).toBe('mutation');
  }
});
