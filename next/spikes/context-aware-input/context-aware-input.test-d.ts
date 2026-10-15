import { type as arkType } from 'arktype';
import { Context, Effect, Schema, SchemaGetter } from 'effect';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { initTrpc, type inferInput, type InputOpts } from './core.ts';

interface User {
  id: string;
  isPro: boolean;
}
const t = initTrpc<{ ctx: { user: User | null }; meta: { scope?: string } }>();
const authed = t.procedure.use(({ ctx }) => {
  if (!ctx.user) throw new Error('UNAUTHORIZED');
  return { user: ctx.user };
});

describe('callback', () => {
  test('ctx is the ctx at that point in the chain', () => {
    authed.input(({ ctx, meta }) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
      expectTypeOf(meta).toEqualTypeOf<{ scope?: string }>();
      return z.object({});
    });
    t.procedure.input(({ ctx }) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User | null>();
      return z.object({});
    });
  });

  test('input types come from the returned schema', () => {
    const procedure = authed
      .input(({ ctx }) =>
        z.object({ limit: z.number().max(ctx.user.isPro ? 1000 : 100) }),
      )
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ limit: number }>();
        return null;
      });
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      limit: number;
    }>();
  });

  test('returning different shapes per ctx gives a wrong input type', () => {
    const procedure = authed
      .input(({ ctx }) =>
        ctx.user.isPro
          ? z.object({ limit: z.number(), export: z.boolean() })
          : z.object({ limit: z.number() }),
      )
      .query(({ input }) => input);
    // TS subtype-reduces the two ZodObjects before we see them: `export` is
    // silently dropped from the client's input type
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      limit: number;
    }>();
  });

  test('chaining merges callback and static inputs', () => {
    const procedure = authed
      .input(z.object({ orgId: z.string() }))
      .input(() => z.object({ limit: z.number() }))
      .query(({ input }) => input);
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      orgId: string;
      limit: number;
    }>();
  });

  test('Effect Schema classes are schemas, not callbacks', () => {
    class Post extends Schema.Class<Post>('Post')({ id: Schema.String }) {}
    const procedure = t.procedure.input(Post).query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<Post>();
      return null;
    });
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      readonly id: string;
    }>();
  });

  test('ArkType types are callable, but still resolve to the schema overload', () => {
    const procedure = t.procedure
      .input(arkType({ id: 'string' }))
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ id: string }>();
        return null;
      });
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      id: string;
    }>();
  });

  test('there is no plain-function parser any more', () => {
    // @ts-expect-error: a function must return a schema
    t.procedure.input((raw: unknown) => raw as { id: string });
  });
});

describe('AsyncLocalStorage accessor', () => {
  test('typed by the builder it is called on', () => {
    expectTypeOf(authed.inputContext()).toEqualTypeOf<
      InputOpts<{ user: User }, { scope?: string }>
    >();
  });

  test('but nothing ties the schema to that builder', () => {
    const NeedsUser = z
      .number()
      .refine((n) => n <= (authed.inputContext().ctx.user.isPro ? 1000 : 100));
    // compiles, although `ctx.user` is `null` here at runtime
    t.procedure.input(z.object({ limit: NeedsUser }));
  });
});

describe('Effect Schema services', () => {
  class CurrentUser extends Context.Service<CurrentUser, User>()(
    'CurrentUser',
  ) {}
  const Limit = Schema.Number.pipe(
    Schema.decode({
      decode: SchemaGetter.checkEffect((n: number) =>
        CurrentUser.use((user) =>
          Effect.succeed(n <= (user.isPro ? 1000 : 100)),
        ),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  );
  const Input = Schema.Struct({ limit: Limit });

  test('the requirement is part of the schema type', () => {
    expectTypeOf<
      (typeof Input)['DecodingServices']
    >().toEqualTypeOf<CurrentUser>();
  });

  test('using it without providing the service is a type error', () => {
    // @ts-expect-error: CurrentUser is not provided
    authed.input(Input);
    authed.provideService(CurrentUser, (ctx) => ctx.user).input(Input);
  });

  test('the check also applies to schemas returned from a callback', () => {
    // @ts-expect-error: CurrentUser is not provided
    authed.input(() => Input);
    authed.provideService(CurrentUser, (ctx) => ctx.user).input(() => Input);
  });
});
