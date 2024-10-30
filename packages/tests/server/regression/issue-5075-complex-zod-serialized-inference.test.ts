import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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

describe('Zod schema serialization kitchen sink', () => {
  test('Test serialization of different zod schemas against z.infer', () => {
    const zObjectZArrayZRecordZTupleZUnionZIntersectionZLazyZPromiseZFunctionZMapZSetZEnumZNativeEnumZUnknownZNullableZOptionalZLiteralZBooleanZStringZNumberZBigintZDateZUndefinedZAny =
      z.object({
        zArray: z.array(z.string()),
        zRecord: z.record(z.string()),
        zTuple: z.tuple([z.string(), z.number()]),
        zUnion: z.union([z.string(), z.number()]),
        zIntersection: z.intersection(
          z.object({ name: z.string() }),
          z.object({ age: z.number() }),
        ),
        zLazy: z.lazy(() => z.string()),
        zPromise: z.promise(z.string()),
        zFunction: z.function(),
        zMap: z.map(z.string(), z.number()),
        zSet: z.set(z.string()),
        zEnum: z.enum(['foo', 'bar']),
        zNativeEnum: z.nativeEnum({ foo: 1, bar: 2 }),
        zUnknown: z.unknown(),
        zNullable: z.nullable(z.string()),
        zOptional: z.optional(z.string()),
        zLiteral: z.literal('foo'),
        zBoolean: z.boolean(),
        zString: z.string(),
        zNumber: z.number(),
        zBigint: z.bigint(),
        zDate: z.date(),
        zUndefined: z.undefined(),
        zAny: z.any(),
        zArrayOptional: z.array(z.string()).optional(),
        zArrayOrRecord: z.union([z.array(z.string()), z.record(z.string())]),
      });

    const t = initTRPC.create();

    const router = t.router({
      createProject: t.procedure
        .output(
          zObjectZArrayZRecordZTupleZUnionZIntersectionZLazyZPromiseZFunctionZMapZSetZEnumZNativeEnumZUnknownZNullableZOptionalZLiteralZBooleanZStringZNumberZBigintZDateZUndefinedZAny,
        )
        .query(() => {
          return zObjectZArrayZRecordZTupleZUnionZIntersectionZLazyZPromiseZFunctionZMapZSetZEnumZNativeEnumZUnknownZNullableZOptionalZLiteralZBooleanZStringZNumberZBigintZDateZUndefinedZAny.parse(
            null as any,
          );
        }),
    });

    type SerializedOutput = inferRouterOutputs<typeof router>['createProject'];

    expectTypeOf<SerializedOutput>().toEqualTypeOf<{
      zArray: string[];
      zRecord: Record<string, string>;
      zTuple: [string, number];
      zUnion: string | number;
      zIntersection: { name: string; age: number };
      zLazy: string;
      zPromise: {};
      // zFunction: (...args: any[]) => any; <-- not serialized, OK.
      zMap: object;
      zSet: object;
      zEnum: 'foo' | 'bar';
      zNativeEnum: number;
      zUnknown?: unknown; // <-- why is this optional?
      zNullable: string | null;
      zOptional?: string | undefined;
      zLiteral: 'foo';
      zBoolean: boolean;
      zString: string;
      zNumber: number;
      zBigint: never; // <-- should this be never or omitted?
      zDate: string;
      // zUndefined: undefined; <-- not serialized, OK.
      zAny?: any; // <-- why is this optional?
      zArrayOptional?: string[] | undefined;
      zArrayOrRecord: string[] | Record<string, string>;
    }>();
  });
});
