import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import * as z from 'zod';

function encodeCodec<TSchema extends z.ZodType>(schema: TSchema) {
  return (value: z.output<TSchema>): z.input<TSchema> => {
    return z.encode(schema, value);
  };
}

test('output binds procedure return type to custom parser input type', async () => {
  const stringToBigInt = z.codec(z.string(), z.bigint(), {
    decode: (raw) => BigInt(raw),
    encode: (num) => num.toString(),
  });

  const t = initTRPC.create();
  const appRouter = t.router({
    byCodec: t.procedure
      .output(encodeCodec(z.object({ count: stringToBigInt })))
      .query(() => ({ count: 42n })),
    badCodec: t.procedure
      .output(encodeCodec(z.object({ count: stringToBigInt })))
      // @ts-expect-error resolver must return codec input bigint, not wire string
      .query(() => ({ count: '42' })),
    asyncTransform: t.procedure
      .output(
        async (value: { createdAt: Date }): Promise<{ createdAt: string }> => {
          return { createdAt: value.createdAt.toISOString() };
        },
      )
      .query(() => ({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    legacyUnknown: t.procedure
      .input((value: unknown) => value as { ok: boolean })
      .output((value: unknown) => value as { ok: boolean })
      .query((opts) => opts.input),
  });

  await using ctx = testServerAndClientResource(appRouter);

  const codecResult = await ctx.client.byCodec.query();
  expectTypeOf(codecResult).toEqualTypeOf<{ count: string }>();
  expect(codecResult).toEqual({ count: '42' });

  const asyncResult = await ctx.client.asyncTransform.query();
  expectTypeOf(asyncResult).toEqualTypeOf<{ createdAt: string }>();
  expect(asyncResult).toEqual({ createdAt: '2026-01-01T00:00:00.000Z' });

  const legacyResult = await ctx.client.legacyUnknown.query({ ok: true });
  expectTypeOf(legacyResult).toEqualTypeOf<{ ok: boolean }>();
  expect(legacyResult).toEqual({ ok: true });
});
