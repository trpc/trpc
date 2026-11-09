import { Schema, SchemaGetter } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import {
  initTrpc,
  type EffectInputIssue,
  type inferInputIssue,
  type InputIssue,
  type InputValidationError,
  type SchemaValidationError,
  type StandardIssue,
  type StandardSchemaV1,
} from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const Signup = z
  .object({
    name: z.string().min(3),
    email: z.email(),
    role: z.enum(['admin', 'member']),
    contact: z.union([z.object({ phone: z.string() }), z.number()]),
  })
  .strict();

const Effectful = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(3)),
  age: Schema.NumberFromString,
  count: Schema.Number.check(Schema.isInt()),
  password: Schema.String,
  confirm: Schema.String,
}).check(
  Schema.makeFilter(
    (o) => o.password === o.confirm || { path: ['confirm'], issue: 'match' },
  ),
);

const Leaves = Schema.Struct({
  pair: Schema.Tuple([Schema.String]),
  either: Schema.Union([Schema.String, Schema.Number]),
  exactly: Schema.Union([Schema.String, Schema.NonEmptyString], {
    mode: 'oneOf',
  }),
  shape: Schema.Union([
    Schema.Struct({ a: Schema.String }),
    Schema.Struct({ b: Schema.Number }),
  ]),
  locked: Schema.String.pipe(
    Schema.decodeTo(Schema.String, {
      decode: SchemaGetter.forbidden(() => 'locked'),
      encode: SchemaGetter.passthrough(),
    }),
  ),
});

const vendor = (
  name: string,
  issues: ReadonlyArray<object>,
): StandardSchemaV1<string> => ({
  '~standard': {
    version: 1,
    vendor: name,
    validate: () => ({ issues: issues as ReadonlyArray<StandardIssue> }),
  },
});

const router = t.router({
  zod: t.procedure.input(Signup).mutation(() => 'ok'),
  effect: t.procedure.input(Effectful).mutation(() => 'ok'),
  leaves: t.procedure.input(Leaves).mutation(() => 'ok'),
  echoes: t.procedure
    .input(
      vendor('zod', [
        {
          code: 'invalid_union',
          message: 'no',
          path: [],
          input: 'secret',
          meta: {
            big: 1n,
            sym: Symbol('t'),
            gone: undefined,
            list: [undefined, 2],
            none: null,
          },
          issues: [{ code: 'custom', message: 'b', path: [], input: 2 }],
          errors: [
            [{ code: 'custom', message: 'a', path: [Symbol('s')], input: 1 }],
          ],
        },
      ]),
    )
    .query(() => 'ok'),
  other: t.procedure
    .input(vendor('valibot', [{ message: 'no', path: [], kind: 'schema' }]))
    .query(() => 'ok'),
});

async function setup() {
  const server = await createTestServer({
    router,
    createContext: () => ({}),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  return { client, [Symbol.asyncDispose]: () => server.close() };
}

test('zod issues keep their code and fields, narrowed by code', async () => {
  await using ctx = await setup();
  const [, err] = await safe(
    ctx.client.zod.mutate({
      name: 'x',
      email: 'nope',
      role: 'owner' as never,
      contact: { phone: 1 as never },
      extra: true,
    } as never),
  );
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    data: {
      issues: [
        { code: 'too_small', origin: 'string', minimum: 3, path: ['name'] },
        { code: 'invalid_format', format: 'email', path: ['email'] },
        { code: 'invalid_value', values: ['admin', 'member'], path: ['role'] },
        { code: 'invalid_union', path: ['contact'] },
        { code: 'unrecognized_keys', keys: ['extra'], path: [] },
      ],
    },
  });
  if (!(err?.defined && err.code === 'BAD_REQUEST')) return;
  const union = err.data.issues.find((i) => i.code === 'invalid_union');
  expect(union).toMatchObject({
    errors: [[{ code: 'invalid_type', path: ['phone'] }], [{ path: [] }]],
  });
  for (const issue of err.data.issues) {
    expect(issue).not.toHaveProperty('input');
    expectTypeOf(issue.path).toEqualTypeOf<
      | readonly []
      | readonly ['name']
      | readonly ['email']
      | readonly ['role']
      | readonly ['contact']
      | readonly ['contact', 'phone']
    >();
    if (issue.code === 'too_small') {
      expectTypeOf(issue.minimum).toEqualTypeOf<number | string>();
      expect(issue.minimum).toBe(3);
    }
    if (issue.code === 'invalid_format') {
      expectTypeOf(issue.format).toBeString();
    }
    if (issue.code === 'unrecognized_keys') {
      expectTypeOf(issue.keys).toEqualTypeOf<ReadonlyArray<string>>();
    }
    if (issue.code === 'invalid_union') {
      expectTypeOf(issue.errors[0]![0]!.path).toEqualTypeOf<
        ReadonlyArray<string | number>
      >();
    }
    // @ts-expect-error -- not a zod issue code
    expect(issue.code === 'invalid_email').toBe(false);
  }
});

test('Effect Schema issues are its leaves, with their _tag and the check that failed', async () => {
  await using ctx = await setup();
  const [, err] = await safe(
    ctx.client.effect.mutate({
      name: 'x',
      age: 1 as never,
      count: 1.5,
      password: 'a',
    } as never),
  );
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    data: {
      issues: [
        {
          path: ['name'],
          message: 'Expected a value with a length of at least 3',
          check: {
            id: 'effect/schema/isMinLength',
            payload: { minLength: 3 },
          },
        },
        { path: ['age'], message: 'Expected string' },
        { path: ['count'], check: { id: 'effect/schema/isInt' } },
        { path: ['confirm'], message: 'Missing key' },
      ],
    },
  });
  if (!(err?.defined && err.code === 'BAD_REQUEST')) return;
  expect(err.data.issues.map((issue) => issue._tag)).toEqual([
    'InvalidValue',
    'InvalidType',
    'InvalidValue',
    'MissingKey',
  ]);
  const issue = err.data.issues[0]!;
  expectTypeOf(issue._tag).toEqualTypeOf<EffectInputIssue['_tag']>();
  expectTypeOf(issue.path).toEqualTypeOf<
    | readonly []
    | readonly ['name']
    | readonly ['age']
    | readonly ['count']
    | readonly ['password']
    | readonly ['confirm']
  >();
  expect(err.data.issues[1]).not.toHaveProperty('check');

  const [, mismatch] = await safe(
    ctx.client.effect.mutate({
      name: 'Ada',
      age: '36',
      count: 1,
      password: 'a',
      confirm: 'b',
    }),
  );
  expect(mismatch).toMatchObject({
    data: { issues: [{ path: ['confirm'], message: 'match', check: {} }] },
  });
  expect(
    mismatch?.defined && mismatch.code === 'BAD_REQUEST'
      ? mismatch.data.issues.map((issue) => issue._tag)
      : [],
  ).toEqual(['InvalidValue']);
});

test('Effect Schema leaves past the common ones keep their _tag', async () => {
  await using ctx = await setup();
  const [, err] = await safe(
    ctx.client.leaves.mutate({
      pair: ['a', 'b'],
      either: true,
      exactly: 'abc',
      shape: {},
      locked: 'x',
    } as never),
  );
  expect(err?.data).toMatchObject({
    issues: [
      { path: ['pair', 1], message: 'Expected no excess property' },
      { path: ['either'], message: 'Expected string | number' },
      { path: ['exactly'], message: 'Expected exactly one member to match' },
      { path: ['shape', 'a'], message: 'Missing key' },
      { path: ['shape', 'b'], message: 'Missing key' },
      { path: ['locked'], message: 'locked' },
    ],
  });
  expect(
    err?.defined && err.code === 'BAD_REQUEST'
      ? err.data.issues.map((issue) => issue._tag)
      : [],
  ).toEqual([
    'UnexpectedKey',
    'AnyOf',
    'OneOf',
    'MissingKey',
    'MissingKey',
    'Forbidden',
  ]);
});

test("a zod issue's input is dropped, nested issues included; other vendors keep message and path", async () => {
  await using ctx = await setup();
  const [, echoes] = await safe(ctx.client.echoes.query(''));
  expect(echoes?.data).toEqual({
    issues: [
      {
        code: 'invalid_union',
        message: 'no',
        path: [],
        meta: { big: '1', sym: 'Symbol(t)', list: [null, 2], none: null },
        issues: [{ code: 'custom', message: 'b', path: [] }],
        errors: [[{ code: 'custom', message: 'a', path: ['Symbol(s)'] }]],
      },
    ],
  });
  const [, other] = await safe(ctx.client.other.query(''));
  expect(other?.data).toEqual({ issues: [{ message: 'no', path: [] }] });
  if (other?.defined && other.code === 'BAD_REQUEST') {
    expectTypeOf(other.data.issues[0]!).toEqualTypeOf<InputIssue<string>>();
  }
});

test('inferInputIssue picks the shape by library', () => {
  expectTypeOf<inferInputIssue<typeof Effectful>>().toEqualTypeOf<
    EffectInputIssue<(typeof Effectful)['Encoded']>
  >();
  expectTypeOf<inferInputIssue<ReturnType<typeof vendor>>>().toEqualTypeOf<
    InputIssue<string>
  >();
  expectTypeOf<inferInputIssue<typeof Signup>['code']>().toEqualTypeOf<
    z.core.$ZodIssue['code']
  >();
  type ChangedZod = StandardSchemaV1<string> & { readonly _zod: {} };
  expectTypeOf<inferInputIssue<ChangedZod>>().toEqualTypeOf<
    InputIssue<string>
  >();
});

test('a procedure carries its input schema, and the issues resolve when read', () => {
  const signup = t.procedure.input(Signup).mutation(() => 'ok');
  type Errors = NonNullable<(typeof signup)['~trpc']['~types']>['errors'];
  expectTypeOf<Errors>().toEqualTypeOf<SchemaValidationError<typeof Signup>>();
  expectTypeOf<Errors>().toExtend<
    InputValidationError<inferInputIssue<typeof Signup>>
  >();
  expectTypeOf<Errors['data']['issues'][number]>().toEqualTypeOf<
    inferInputIssue<typeof Signup>
  >();
});
