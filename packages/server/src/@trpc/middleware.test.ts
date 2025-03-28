/////////////// utils, should be external /////////////////

import z from 'zod';
import type { inferMiddlewareBuilderOptions } from './middleware';
import { createMiddlewareBuilder } from './middleware';

const IGNORE_EXTENSIONS = null as any;

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
  }>({
    builder: IGNORE_EXTENSIONS,
  });

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
  const base = createMiddlewareBuilder<{
    ctx: object;
    meta: object;
  }>({
    builder: IGNORE_EXTENSIONS,
  });

  const a = base.input(z.object({ foo: z.string() }));
  const b = base.input(z.object({ bar: z.string() }));

  const concat = a.concat(b);

  type $Types = inferMiddlewareBuilderOptions<typeof concat>;
  expectTypeOf<$Types['input_out']>().toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();
});

test('errors', async () => {
  const parser = z.object({ foo: z.string() });
  const res = await parser.safeParseAsync({ foo: 'bar' });
  if (res.success) {
    res.success;
    res.data;
  } else {
    res.error;
  }
});
