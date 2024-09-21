/////////////// utils, should be external /////////////////

import z from 'zod';
import { createMiddlewareBuilder } from './middleware';

test('middleware builder', () => {
  interface Context {
    foo: string;
  }
  interface Meta {
    bar: string;
  }

  const mw = createMiddlewareBuilder<{
    ctx: Context;
    meta: Meta;
  }>();

  mw.input(
    z.object({
      foo: z.string(),
    }),
  )
    .input(
      z.object({
        lengthOf: z.string().transform((it) => it.length),
      }),
    )
    .use((opts) =>
      opts.next({
        ctx: {
          bar: 'bar',
        },
      }),
    )
    .use((opts) => {
      opts.ctx.bar;
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: string;
        bar: string;
      }>();
      expectTypeOf(opts.meta).toEqualTypeOf<Meta | undefined>();
      expectTypeOf(opts.input).toEqualTypeOf<{
        foo: string;
        lengthOf: number;
      }>();

      return opts.next();
    });
});

test('middleware builder returns', () => {
  const mw = createMiddlewareBuilder<{
    ctx: object;
    meta: object;
  }>();

  const res = mw.input(z.object({ foo: z.string() })).return((opts) => {
    return opts.input.foo;
  });
});

test('concat', () => {
  const a = createMiddlewareBuilder<{
    ctx: object;
    meta: object;
  }>().input(z.object({ foo: z.string() }));
  const b = createMiddlewareBuilder<{
    ctx: object;
    meta: object;
  }>().input(z.object({ bar: z.string() }));

  const concat = a.concat(b);

  expectTypeOf(concat._def.$types.input_in).toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();
});
