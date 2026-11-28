import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import type { inferParser } from '@trpc/server/unstable-core-do-not-import';
import * as z from 'zod';

function encodeCodec<TSchema extends z.ZodType>(schema: TSchema) {
  return (value: z.output<TSchema>): z.input<TSchema> => {
    return z.encode(schema, value);
  };
}

type CallableWithTypedParamAndAssert = ((data: string) => { data?: number }) & {
  assert(value: unknown): asserts value is number;
};

const assertCalls: unknown[] = [];
const fnCalls: unknown[] = [];

const callableAssertParser: CallableWithTypedParamAndAssert = Object.assign(
  (data: string): { data?: number } => {
    fnCalls.push(data);
    return { data: 1 };
  },
  {
    assert(value: unknown): asserts value is number {
      assertCalls.push(value);
      if (typeof value !== 'number') {
        throw new Error('Expected number');
      }
    },
  },
);

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
    typedInputTransform: t.procedure
      .input((v: { id: string }) => ({ id: Number(v.id) }))
      .query((opts) => {
        expectTypeOf(opts.input).toEqualTypeOf<{ id: number }>();
        return opts.input;
      }),
    unannotatedInputValidator: t.procedure
      .input((v) => {
        expectTypeOf(v).toEqualTypeOf<unknown>();
        return v as { id: string };
      })
      .query((opts) => opts.input),
    legacyUnknown: t.procedure
      .input((value: unknown) => value as { ok: boolean })
      .output((value: unknown) => value as { ok: boolean })
      .query((opts) => opts.input),
    unannotatedValidator: t.procedure
      .output((value): string => {
        expectTypeOf(value).toEqualTypeOf<unknown>();
        if (typeof value === 'string') {
          return value;
        }
        throw new Error('Output is not a string');
      })
      .query(() => 'ok'),
    unannotatedInferredReturn: t.procedure
      .output((value) => {
        expectTypeOf(value).toEqualTypeOf<unknown>();
        if (typeof value === 'string') {
          return value;
        }
        throw new Error('Output is not a string');
      })
      .query(() => 'ok'),
    callableAssertInput: t.procedure
      .input(callableAssertParser)
      .query((opts) => {
        expectTypeOf(opts.input).toEqualTypeOf<number | { data?: number }>();
        return 'ok' as const;
      }),
  });

  type CallableWithAssert = ((data: unknown) => { data?: number }) & {
    assert(value: unknown): asserts value is number;
  };
  expectTypeOf<inferParser<CallableWithAssert>>().toEqualTypeOf<{
    in: number | { data?: number };
    out: number | { data?: number };
  }>();
  expectTypeOf<inferParser<CallableWithTypedParamAndAssert>>().toEqualTypeOf<{
    in: number | { data?: number };
    out: number | { data?: number };
  }>();

  await using ctx = testServerAndClientResource(appRouter);

  const codecResult = await ctx.client.byCodec.query();
  expectTypeOf(codecResult).toEqualTypeOf<{ count: string }>();
  expect(codecResult).toEqual({ count: '42' });

  const asyncResult = await ctx.client.asyncTransform.query();
  expectTypeOf(asyncResult).toEqualTypeOf<{ createdAt: string }>();
  expect(asyncResult).toEqual({ createdAt: '2026-01-01T00:00:00.000Z' });

  const typedInputResult = await ctx.client.typedInputTransform.query({
    id: '42',
  });
  expectTypeOf(typedInputResult).toEqualTypeOf<{ id: number }>();
  expect(typedInputResult).toEqual({ id: 42 });

  const unannotatedInputResult =
    await ctx.client.unannotatedInputValidator.query({
      id: 'ok',
    });
  expectTypeOf(unannotatedInputResult).toEqualTypeOf<{ id: string }>();
  expect(unannotatedInputResult).toEqual({ id: 'ok' });

  const legacyResult = await ctx.client.legacyUnknown.query({ ok: true });
  expectTypeOf(legacyResult).toEqualTypeOf<{ ok: boolean }>();
  expect(legacyResult).toEqual({ ok: true });

  const unannotatedResult = await ctx.client.unannotatedValidator.query();
  expectTypeOf(unannotatedResult).toEqualTypeOf<string>();
  expect(unannotatedResult).toEqual('ok');

  const inferredResult = await ctx.client.unannotatedInferredReturn.query();
  expectTypeOf(inferredResult).toEqualTypeOf<string>();
  expect(inferredResult).toEqual('ok');

  const callableAssertResult = await ctx.client.callableAssertInput.query(123);
  expectTypeOf(callableAssertResult).toEqualTypeOf<'ok'>();
  expect(callableAssertResult).toEqual('ok');
  expect(assertCalls).toEqual([123]);
  expect(fnCalls).toEqual([]);
  await expect(
    ctx.client.callableAssertInput.query('not-a-number' as never),
  ).rejects.toThrow('Expected number');
});
