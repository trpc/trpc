/**
 * Test router used by the OpenAPI generator tests.
 *
 * This file is intentionally placed inside the @trpc/server package so that
 * the TypeScript compiler can resolve all imports correctly when the
 * `trpc-openapi` CLI is called from this directory.
 */
import { z } from 'zod';
import { initTRPC } from '../index';

const t = initTRPC.create();

enum Direction {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
}

enum NumericStatus {
  Active = 1,
  Inactive = 2,
  Pending = 3,
}

enum MixedEnum {
  Foo = 'FOO',
  Bar = 1,
  Baz = 'BAZ',
}

// ---------- Named types (for nested $ref extraction tests) ----------

interface UserProfile {
  id: number;
  name: string;
  email: string;
}

interface Address {
  street: string;
  city: string;
  zipCode: string;
}

interface OrderItem {
  productId: number;
  quantity: number;
  price: number;
}

// ---------- Router with custom errorFormatter ----------

const tCustomError = initTRPC.create({
  errorFormatter(opts) {
    const { shape } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          opts.error.code === 'BAD_REQUEST'
            ? ((
                opts.error.cause as {
                  issues?: Array<{
                    message: string;
                    path: Array<string | number>;
                  }>;
                }
              )?.issues ?? null)
            : null,
      },
    };
  },
});

export const ErrorFormatterRouter = tCustomError.router({
  hello: tCustomError.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
});

export type ErrorFormatterRouter = typeof ErrorFormatterRouter;

// ---------- Main test router ----------

export const AppRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .output(z.object({ message: z.string() }))
    .query(({ input }) => ({ message: `Hello ${input.name}` })),

  noInput: t.procedure.query(() => 'hello'),

  echo: t.procedure.input(z.string()).mutation(({ input }) => input),

  user: t.router({
    list: t.procedure.query(() => [{ id: 1, name: 'Alice' }]),
    create: t.procedure
      .input(z.object({ name: z.string(), age: z.number().optional() }))
      .mutation(({ input }) => ({ id: 2, ...input })),
  }),

  // ---------- Complex Zod types ----------

  complexTypes: t.router({
    // --- Enums ---
    zodEnum: t.procedure
      .input(z.object({ status: z.enum(['active', 'inactive', 'pending']) }))
      .output(z.object({ status: z.enum(['active', 'inactive', 'pending']) }))
      .query(({ input }) => input),

    nativeEnum: t.procedure
      .input(
        z.object({
          direction: z.nativeEnum({
            Up: 'UP',
            Down: 'DOWN',
            Left: 'LEFT',
            Right: 'RIGHT',
          } as const),
        }),
      )
      .query(({ input }) => input),

    // --- Literals ---
    literal: t.procedure
      .input(
        z.object({
          strLit: z.literal('hello'),
          numLit: z.literal(42),
          boolLit: z.literal(true),
        }),
      )
      .query(({ input }) => input),

    // --- Union of literals (enum-like) ---
    literalUnion: t.procedure
      .input(
        z.object({
          color: z.union([
            z.literal('red'),
            z.literal('green'),
            z.literal('blue'),
          ]),
        }),
      )
      .query(({ input }) => input),

    // --- Discriminated union ---
    discriminatedUnion: t.procedure
      .input(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('text'),
            content: z.string(),
          }),
          z.object({
            type: z.literal('image'),
            url: z.string(),
            width: z.number(),
            height: z.number(),
          }),
          z.object({
            type: z.literal('video'),
            url: z.string(),
            duration: z.number(),
          }),
        ]),
      )
      .mutation(({ input }) => input),

    // --- Regular union (non-discriminated) ---
    union: t.procedure
      .input(
        z.object({
          value: z.union([z.string(), z.number(), z.boolean()]),
        }),
      )
      .query(({ input }) => input),

    // --- Intersection ---
    intersection: t.procedure
      .input(
        z.intersection(
          z.object({ id: z.number() }),
          z.object({ name: z.string(), email: z.string() }),
        ),
      )
      .mutation(({ input }) => input),

    // --- Tuples ---
    tuple: t.procedure
      .input(
        z.object({
          pair: z.tuple([z.string(), z.number()]),
          triple: z.tuple([z.string(), z.number(), z.boolean()]),
        }),
      )
      .query(({ input }) => input),

    // --- Record ---
    record: t.procedure
      .input(
        z.object({
          metadata: z.record(z.string(), z.string()),
          scores: z.record(z.string(), z.number()),
        }),
      )
      .query(({ input }) => input),

    // --- Arrays of complex types ---
    complexArrays: t.procedure
      .input(
        z.object({
          tags: z.array(z.string()),
          items: z.array(
            z.object({
              id: z.number(),
              label: z.string(),
              active: z.boolean(),
            }),
          ),
          matrix: z.array(z.array(z.number())),
        }),
      )
      .query(({ input }) => input),

    // --- Nested objects ---
    deeplyNested: t.procedure
      .input(
        z.object({
          level1: z.object({
            level2: z.object({
              level3: z.object({
                value: z.string(),
              }),
            }),
          }),
        }),
      )
      .query(({ input }) => input),

    // --- Date ---
    dateType: t.procedure
      .input(z.object({ createdAt: z.date() }))
      .output(z.object({ createdAt: z.date() }))
      .query(({ input }) => input),

    // --- any / unknown ---
    anyAndUnknown: t.procedure
      .input(
        z.object({
          anything: z.any(),
          something: z.unknown(),
        }),
      )
      .query(({ input }) => input),

    // --- Default values ---
    defaults: t.procedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          sort: z.enum(['asc', 'desc']).default('asc'),
        }),
      )
      .query(({ input }) => input),

    // --- Refinements (should preserve base type) ---
    refined: t.procedure
      .input(
        z.object({
          email: z.string().email(),
          age: z.number().min(0).max(150),
          url: z.string().url(),
        }),
      )
      .query(({ input }) => input),

    // --- Nullable / optional union combos ---
    nullableUnion: t.procedure
      .input(
        z.object({
          value: z.union([z.string(), z.number()]).nullable(),
          optionalValue: z.union([z.string(), z.number()]).optional(),
        }),
      )
      .query(({ input }) => input),

    // --- Passthrough and strict objects ---
    passthrough: t.procedure
      .input(z.object({ known: z.string() }).passthrough())
      .query(({ input }) => input),

    strict: t.procedure
      .input(z.object({ known: z.string() }).strict())
      .query(({ input }) => input),

    // --- Branded types (should be transparent) ---
    branded: t.procedure
      .input(
        z.object({
          userId: z.string().brand<'UserId'>(),
        }),
      )
      .query(({ input }) => input),

    // --- Catch ---
    withCatch: t.procedure
      .input(
        z.object({
          status: z.enum(['on', 'off']).catch('off'),
        }),
      )
      .query(({ input }) => input),

    // --- Pipe ---
    piped: t.procedure
      .input(
        z.object({
          value: z.string().pipe(z.coerce.number()),
        }),
      )
      .query(({ input }) => input),

    // --- Complex mutation with discriminated union output ---
    createContent: t.procedure
      .input(
        z.object({
          title: z.string(),
          body: z.string(),
          tags: z.array(z.string()).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .output(
        z.discriminatedUnion('status', [
          z.object({
            status: z.literal('success'),
            id: z.number(),
            createdAt: z.string(),
          }),
          z.object({
            status: z.literal('error'),
            message: z.string(),
            code: z.number(),
          }),
        ]),
      )
      .mutation(({ input: _input }) => ({
        status: 'success' as const,
        id: 1,
        createdAt: new Date().toISOString(),
      })),

    // --- Complex query with multiple optional filters ---
    search: t.procedure
      .input(
        z.object({
          query: z.string(),
          filters: z
            .object({
              category: z
                .enum(['all', 'posts', 'users', 'comments'])
                .optional(),
              dateRange: z
                .object({
                  from: z.string(),
                  to: z.string(),
                })
                .optional(),
              tags: z.array(z.string()).optional(),
              sortBy: z
                .union([
                  z.literal('relevance'),
                  z.literal('date'),
                  z.literal('popularity'),
                ])
                .optional(),
            })
            .optional(),
          pagination: z
            .object({
              page: z.number().int().min(1),
              limit: z.number().int().min(1).max(100),
            })
            .optional(),
        }),
      )
      .output(
        z.object({
          results: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              snippet: z.string(),
              score: z.number(),
            }),
          ),
          total: z.number(),
          hasMore: z.boolean(),
        }),
      )
      .query(() => ({ results: [], total: 0, hasMore: false })),
  }),

  // ---------- Inferred return types (no .output(), const returns) ----------

  inferredReturns: t.router({
    // --- Enum-like (string literal union) ---
    enumLike: t.procedure.query(() => {
      const status = 'active' as 'active' | 'inactive' | 'pending';
      return { status };
    }),

    // --- Literal returns ---
    stringLiteral: t.procedure.query(() => 'hello' as const),
    numberLiteral: t.procedure.query(() => 42 as const),
    booleanLiteral: t.procedure.query(() => true as const),

    // --- Discriminated union return ---
    discriminatedResult: t.procedure.mutation(() => {
      const result =
        Math.random() > 0.5
          ? { type: 'success' as const, id: 1, createdAt: '2024-01-01' }
          : { type: 'error' as const, message: 'fail', code: 500 };
      return result;
    }),

    // --- Union of primitives ---
    primitiveUnion: t.procedure.query(() => {
      const val = 'hello' as string | number | boolean;
      return { value: val };
    }),

    // --- Tuple ---
    tupleReturn: t.procedure.query(() => ['hello', 42] as [string, number]),

    // --- Record / index signature ---
    recordReturn: t.procedure.query(() => {
      const map: Record<string, number> = { a: 1, b: 2 };
      return map;
    }),

    // --- Array of objects ---
    arrayOfObjects: t.procedure.query(() => [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ]),

    // --- Nested arrays (matrix) ---
    matrix: t.procedure.query(() => [
      [1, 2, 3],
      [4, 5, 6],
    ]),

    // --- Deeply nested object ---
    deeplyNested: t.procedure.query(() => ({
      level1: {
        level2: {
          level3: {
            value: 'deep',
          },
        },
      },
    })),

    // --- Date return ---
    dateReturn: t.procedure.query(() => ({
      createdAt: new Date(),
    })),

    // --- Nullable return ---
    nullableReturn: t.procedure.query(() => {
      const val = null as string | null;
      return { value: val };
    }),

    // --- Optional fields in return ---
    optionalFields: t.procedure.query(() => {
      const result: { name: string; age?: number; email?: string } = {
        name: 'Alice',
      };
      return result;
    }),

    // --- Complex object with mixed field types ---
    mixedObject: t.procedure.query(() => ({
      id: 1,
      name: 'test',
      tags: ['a', 'b'],
      metadata: { key: 'value' } as Record<string, string>,
      active: true,
      score: 9.5,
    })),

    // --- Void / undefined return ---
    voidReturn: t.procedure.mutation(() => {
      // no return
    }),

    // --- Null return ---
    nullReturn: t.procedure.query(() => null),

    // --- Intersection-like (merged object) ---
    mergedObject: t.procedure.query(() => {
      const base = { id: 1 };
      const details = { name: 'Alice', email: 'alice@example.com' };
      return { ...base, ...details };
    }),

    // --- Array of string literals ---
    literalArray: t.procedure.query(() => ['red', 'green', 'blue'] as const),

    // --- Nested nullable / optional combos ---
    nestedNullable: t.procedure.query(() => {
      const result: {
        outer: {
          inner: string | null;
          maybeNum?: number;
        } | null;
      } = { outer: { inner: null } };
      return result;
    }),

    // --- Boolean returns (literal true, literal false, and true | false) ---
    boolReturnFalse: t.procedure.query(() => false as const),
    boolReturnTrue: t.procedure.query(() => true as const),
    boolReturn: t.procedure.query(() => false as boolean),

    // --- Number return ---
    numReturn: t.procedure.query(() => 123),

    // --- String return ---
    strReturn: t.procedure.query(() => 'hello world'),

    // --- Complex mutation with inferred return ---
    createItem: t.procedure
      .input(z.object({ name: z.string() }))
      .mutation(({ input }) => ({
        id: 1,
        name: input.name,
        createdAt: new Date(),
        status: 'created' as const,
        tags: [] as string[],
        metadata: null as Record<string, string> | null,
      })),

    // --- TypeScript enum returns ---
    stringEnum: t.procedure.query(() => {
      const dir = Direction.Up as Direction;
      return { direction: dir };
    }),

    numericEnum: t.procedure.query(() => {
      const status = NumericStatus.Active as NumericStatus;
      return { status };
    }),

    mixedEnum: t.procedure.query(() => {
      const val = MixedEnum.Foo as MixedEnum;
      return { value: val };
    }),

    // --- Branded type returns (should strip brand, keep base type) ---
    brandedReturns: t.procedure.query(() => {
      type UserId = string & { __brand: 'UserId' };
      type Score = number & { __brand: 'Score' };
      type Active = boolean & { __brand: 'Active' };
      return {
        userId: 'abc' as UserId,
        score: 99 as Score,
        active: true as Active,
      };
    }),
  }),

  // ---------- Named types at various depths ----------

  namedTypes: t.router({
    // Named type as a direct property (depth 1)
    withProfile: t.procedure.query((): { profile: UserProfile } => ({
      profile: { id: 1, name: 'Alice', email: 'a@b.com' },
    })),

    // Named type inside an array
    orderItems: t.procedure.query((): { items: OrderItem[] } => ({
      items: [{ productId: 1, quantity: 2, price: 9.99 }],
    })),

    // Same named type reused (should dedup to the same $ref)
    withAddress: t.procedure.query((): { address: Address } => ({
      address: { street: '123 Main', city: 'NYC', zipCode: '10001' },
    })),

    // Multiple named types in one return
    profileAndAddress: t.procedure.query(
      (): { profile: UserProfile; address: Address } => ({
        profile: { id: 1, name: 'Alice', email: 'a@b.com' },
        address: { street: '123 Main', city: 'NYC', zipCode: '10001' },
      }),
    ),

    // Named type deeply nested (depth 3)
    deepNested: t.procedure.query(
      (): { data: { nested: { profile: UserProfile } } } => ({
        data: {
          nested: { profile: { id: 1, name: 'Alice', email: 'a@b.com' } },
        },
      }),
    ),
  }),

  simpleCases: {
    nullish: t.procedure
      .input(
        z
          .object({
            name: z.string().nullish(),
          })
          .nullish(),
      )
      .output(
        z
          .object({
            name: z.string().nullish(),
          })
          .nullish(),
      )
      .query((opts) => opts.input),
    optional: t.procedure
      .input(
        z
          .object({
            name: z.string().optional(),
          })
          .optional(),
      )
      .output(
        z
          .object({
            name: z.string().optional(),
          })
          .optional(),
      )
      .query((opts) => opts.input),
    nullable: t.procedure
      .input(
        z
          .object({
            name: z.string().nullable(),
          })
          .nullable(),
      )
      .output(
        z
          .object({
            name: z.string().nullable(),
          })
          .nullable(),
      )
      .query((opts) => opts.input),
  },
});

export type AppRouter = typeof AppRouter;
