import { type as arkType } from 'arktype';
import { Context, Effect, Schema, SchemaGetter } from 'effect';
import { describe, expect, test } from 'vite-plus/test';
import { z } from 'zod';
import {
  call,
  initTrpc,
  inputContext,
  staticInputSchemas,
  TrpcError,
} from './core.ts';

interface User {
  id: string;
  isPro: boolean;
  orgs: string[];
}
const t = initTrpc<{ ctx: { user: User | null } }>();
const pro: User = { id: 'u1', isPro: true, orgs: ['acme'] };
const free: User = { id: 'u2', isPro: false, orgs: ['acme'] };

const authed = t.procedure.use(({ ctx }) => {
  if (!ctx.user) throw new Error('UNAUTHORIZED');
  return { user: ctx.user };
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rejection(promise: Promise<unknown>): Promise<TrpcError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TrpcError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('callback: .input(({ ctx }) => schema)', () => {
  let built = 0;
  const list = authed
    .input(({ ctx }) => {
      built++;
      return z.object({
        limit: z
          .number()
          .max(ctx.user.isPro ? 1000 : 100)
          .default(10),
      });
    })
    .query(({ input }) => input.limit);

  test('the schema depends on ctx', async () => {
    expect(
      await call(list, { ctx: { user: pro }, input: { limit: 500 } }),
    ).toBe(500);
    const error = await rejection(
      call(list, { ctx: { user: free }, input: { limit: 500 } }),
    );
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.issues?.[0]?.path).toEqual(['limit']);
  });

  test('the schema is rebuilt on every call', async () => {
    built = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        call(list, { ctx: { user: pro }, input: {} }),
      ),
    );
    expect(built).toBe(5);
  });

  test('the callback sees ctx from middleware before it, not after', async () => {
    const seen: string[][] = [];
    const procedure = t.procedure
      .use(() => ({ a: 1 }))
      .input(({ ctx }) => {
        seen.push(Object.keys(ctx));
        return z.object({});
      })
      .use(() => ({ b: 2 }))
      .query(({ ctx }) => Object.keys(ctx));
    expect(await call(procedure, { ctx: { user: null }, input: {} })).toEqual([
      'user',
      'a',
      'b',
    ]);
    expect(seen).toEqual([['user', 'a']]);
  });

  test('a throwing callback is a server error, not BAD_REQUEST', async () => {
    const procedure = t.procedure
      .input((): z.ZodString => {
        throw new Error('boom');
      })
      .query(({ input }) => input);
    const error = await rejection(
      call(procedure, { ctx: { user: null }, input: 'x' }),
    );
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  test('generators and contracts get nothing to look at', () => {
    const fixed = t.procedure
      .input(z.object({ limit: z.number().max(1000) }))
      .query(() => null);
    const [schema] = staticInputSchemas(fixed);
    expect(schema).not.toBe('callback');
    expect(
      (schema as z.ZodType)['~standard'].jsonSchema.input({
        target: 'draft-2020-12',
      }),
    ).toMatchObject({ properties: { limit: { maximum: 1000 } } });

    expect(staticInputSchemas(list)).toEqual(['callback']);
  });

  test('callable schemas (ArkType, Schema.Class) are not mistaken for callbacks', async () => {
    const Ark = arkType({ id: 'string' });
    expect(typeof Ark).toBe('function');
    class Post extends Schema.Class<Post>('Post')({ id: Schema.String }) {}
    expect(typeof Post).toBe('function');

    const ark = t.procedure.input(Ark).query(({ input }) => input.id);
    const post = t.procedure
      .input(Post)
      .query(({ input }) => input instanceof Post);
    expect(await call(ark, { ctx: { user: null }, input: { id: 'a' } })).toBe(
      'a',
    );
    expect(await call(post, { ctx: { user: null }, input: { id: 'a' } })).toBe(
      true,
    );
    expect(staticInputSchemas(ark)).toEqual([Ark]);
  });

  test('Effect Schema works in the callback too', async () => {
    const procedure = authed
      .input(({ ctx }) =>
        Schema.Struct({
          orgId: Schema.Literals(ctx.user.orgs as [string, ...string[]]),
        }),
      )
      .query(({ input }) => input.orgId);
    expect(
      await call(procedure, { ctx: { user: pro }, input: { orgId: 'acme' } }),
    ).toBe('acme');
    const error = await rejection(
      call(procedure, { ctx: { user: pro }, input: { orgId: 'evil' } }),
    );
    expect(error.code).toBe('BAD_REQUEST');
  });
});

describe('no callback: AsyncLocalStorage inside a zod schema', () => {
  const Limit = z.object({
    limit: z
      .number()
      .refine(
        (n) => n <= (authed.inputContext().ctx.user.isPro ? 1000 : 100),
        'over your plan limit',
      ),
  });
  const list = authed.input(Limit).query(({ input }) => input.limit);

  test('a refinement can read ctx', async () => {
    expect(
      await call(list, { ctx: { user: pro }, input: { limit: 500 } }),
    ).toBe(500);
    const error = await rejection(
      call(list, { ctx: { user: free }, input: { limit: 500 } }),
    );
    expect(error.issues?.[0]?.message).toBe('over your plan limit');
  });

  test('the schema stays static, so JSON Schema still works', () => {
    const [schema] = staticInputSchemas(list);
    expect(
      (schema as z.ZodType)['~standard'].jsonSchema.input({
        target: 'draft-2020-12',
      }),
    ).toMatchObject({ properties: { limit: { type: 'number' } } });
  });

  test('async refinements keep their own ctx under concurrency', async () => {
    const OwnOrg = z.object({
      orgId: z.string().refine(async (orgId) => {
        await sleep(Math.random() * 5);
        return inputContext<{ user: User }>().ctx.user.orgs.includes(orgId);
      }, 'not your org'),
    });
    const procedure = authed.input(OwnOrg).query(({ ctx }) => ctx.user.id);
    const users = Array.from({ length: 50 }, (_, i) => ({
      id: `u${i}`,
      isPro: false,
      orgs: [`org${i}`],
    }));
    const results = await Promise.all(
      users.map((user) =>
        call(procedure, { ctx: { user }, input: { orgId: user.orgs[0] } }),
      ),
    );
    expect(results).toEqual(users.map((user) => user.id));
  });

  test('the store is the ctx at the .input() position', async () => {
    const procedure = t.procedure
      .use(() => ({ a: 1 }))
      .input(
        z.object({}).refine(() => {
          expect(Object.keys(inputContext<object>().ctx)).toEqual([
            'user',
            'a',
          ]);
          return true;
        }),
      )
      .use(() => ({ b: 2 }))
      .query(() => 'ok');
    expect(await call(procedure, { ctx: { user: null }, input: {} })).toBe(
      'ok',
    );
  });

  test('the same schema throws outside tRPC (shared client/form schemas)', () => {
    expect(() => Limit.safeParse({ limit: 1 })).toThrow(
      'inputContext() called outside tRPC input validation',
    );
  });

  test("zod's Standard Schema validate runs refinements twice when one is async", async () => {
    let sync = 0;
    let async = 0;
    const schema = z.object({
      a: z.string().refine(() => {
        sync++;
        return true;
      }),
      b: z.string().refine(async () => {
        async++;
        await sleep(1);
        return true;
      }),
    });
    const procedure = t.procedure.input(schema).query(() => 'ok');
    await call(procedure, { ctx: { user: null }, input: { a: '', b: '' } });
    // a sync attempt hits the async refine and throws, then it reruns async
    expect({ sync, async }).toEqual({ sync: 2, async: 2 });

    sync = 0;
    async = 0;
    await schema.parseAsync({ a: '', b: '' });
    expect({ sync, async }).toEqual({ sync: 1, async: 1 });
  });
});

describe('no callback: Effect Schema services', () => {
  class CurrentUser extends Context.Service<CurrentUser, User>()(
    'CurrentUser',
  ) {}

  const OrgId = Schema.String.pipe(
    Schema.decode({
      decode: SchemaGetter.checkEffect((orgId: string) =>
        CurrentUser.use((user) =>
          Effect.succeed(
            user.orgs.includes(orgId) ? undefined : 'not your org',
          ),
        ),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  );
  const Input = Schema.Struct({ orgId: OrgId });

  const procedure = authed
    .provideService(CurrentUser, (ctx) => ctx.user)
    .input(Input)
    .query(({ input }) => input.orgId);

  test('a check reads a service provided from ctx', async () => {
    expect(
      await call(procedure, { ctx: { user: pro }, input: { orgId: 'acme' } }),
    ).toBe('acme');
    const error = await rejection(
      call(procedure, { ctx: { user: pro }, input: { orgId: 'evil' } }),
    );
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.issues?.[0]).toMatchObject({
      message: 'not your org',
      path: ['orgId'],
    });
  });

  test('the schema stays static, so JSON Schema still works', () => {
    expect(Schema.toJsonSchemaDocument(Input).schema).toMatchObject({
      type: 'object',
      properties: { orgId: { type: 'string' } },
    });
  });

  test('it cannot become a Standard Schema, so it needs native Effect Schema (V-A)', () => {
    // @ts-expect-error: toStandardSchemaV1 requires DecodingServices = never
    Schema.toStandardSchemaV1(Input);
  });
});
