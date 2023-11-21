import { inferRouterOutputs, initTRPC } from '@trpc/server';
import * as z from 'zod';

describe('Non-records should not erroneously be inferred as Records in serialized types', () => {
  const zChange = z.object({
    status: z
      .tuple([
        z.literal('tmp').or(z.literal('active')),
        z.literal('active').or(z.literal('disabled')),
      ])
      .optional(),
    validFrom: z.tuple([z.string().nullable(), z.string()]).optional(),
    validTo: z.tuple([z.string().nullable(), z.string().nullable()]).optional(),
    canceled: z.tuple([z.boolean(), z.boolean()]).optional(),
    startsAt: z
      .tuple([z.string().nullable(), z.string().nullable()])
      .optional(),
    endsAt: z.tuple([z.string().nullable(), z.string().nullable()]).optional(),
  });
  type Change = z.infer<typeof zChange>;

  test('should be inferred as object', () => {
    const t = initTRPC.create();

    const router = t.router({
      createProject: t.procedure.output(zChange).query(() => {
        return zChange.parse(null as any);
      }),
      createProjectNoExplicitOutput: t.procedure.query(() => {
        return zChange.parse(null as any);
      }),
    });

    type SerializedOutput = inferRouterOutputs<typeof router>['createProject'];
    type SerializedOutputNoExplicitOutput = inferRouterOutputs<
      typeof router
    >['createProjectNoExplicitOutput'];

    expectTypeOf<SerializedOutput>().toEqualTypeOf<Change>();
    expectTypeOf<SerializedOutputNoExplicitOutput>().toEqualTypeOf<Change>();
  });
});
