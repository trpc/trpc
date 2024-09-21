/////////////// utils, should be external /////////////////

import z from 'zod';
import type { inferMiddlewareBuilderOptions } from './middleware';
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

  const $types = null! as inferMiddlewareBuilderOptions<typeof concat>;
  expectTypeOf($types.input_out).toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();
});
