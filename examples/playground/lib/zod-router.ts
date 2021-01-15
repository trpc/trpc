import { ResolverFn, Router } from './router';
import { ZodRawShape } from 'zod/lib/src/types/base';
import * as z from 'zod';

export class ZodRouter<
  TContext extends {},
  TEndpoints extends Record<string, ResolverFn<TContext, any, any>> = {}
> extends Router<TContext, TEndpoints> {
  public safepoint<
    TData,
    TPath extends string,
    TSchema extends z.ZodObject<TSchemaShape>,
    TSchemaShape extends ZodRawShape
  >(
    path: TPath,
    {
      schema,
      resolve,
    }: {
      schema: TSchema;
      resolve: ResolverFn<TContext, TData, [z.infer<TSchema>]>;
    },
  ) {
    return this.endpoint(path, (ctx, input: z.infer<TSchema>) => {
      const parsed = schema.parse(input);

      return resolve(ctx, parsed);
    });
  }
}

const router = new ZodRouter().safepoint('test', {
  schema: z.object({
    foo: z.literal('bar'),
    num: z.number().min(10),
  }),
  resolve(_ctx, input) {
    return 'all good here in the ' + input.foo;
  },
});

async function main() {
  const handle = router.handler({});
  const res = await handle('test', {
    foo: 'bar',
    num: 10,
  });
  console.log('res', res);
}

main();
