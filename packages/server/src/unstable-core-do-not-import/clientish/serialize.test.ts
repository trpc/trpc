import { z } from 'zod/v4';
import type { Serialize } from './serialize';

test('Date', () => {
  type Source = Date;
  type Transformed = Serialize<Source>;

  expectTypeOf<Transformed>().toEqualTypeOf<string>();
});

// regression test for https://github.com/trpc/trpc/issues/6804
test('zod v4 json', () => {
  type EqEq<T, S> = [T] extends [S] ? ([S] extends [T] ? true : false) : false;

  type EqEqEq<X, Y> =
    (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
      ? true
      : false;

  const jsonSchema = z.json();
  type Source = (typeof jsonSchema)['_zod']['output'];
  type Transformed = Serialize<Source>;

  expectTypeOf<EqEq<Transformed, Source>>().toEqualTypeOf(true);
  expectTypeOf<EqEqEq<Transformed, Source>>().toEqualTypeOf(true);

  expectTypeOf<Transformed>().toEqualTypeOf<Source>();
});

// regression test for https://github.com/trpc/trpc/issues/5197
describe('index signature and record', () => {
  test('outputWithIndexSignature', () => {
    type Source = {
      a: number;
      b: number;
      [c: string]: number;
    };
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<Source>();
  });

  test('outputWithRecord', () => {
    type Source = {
      a: number;
      b: number;
    } & Record<string, number>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<Source>();
  });

  test('outputWithRecordAndIndexSignature', () => {
    type Source = {
      a: number;
      b: number;
      [c: string]: number;
    } & Record<string, number>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<Source>();
  });

  test('outputWithUndefinedAndUndefinedIndexSignature', () => {
    type Source = {
      a: number;
      b: number | undefined;
      [c: string]: number | undefined;
    };
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedAndUndefinedRecord', () => {
    type Source = {
      a: number;
      b: number | undefined;
    } & Record<string, number | undefined>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedAndUndefinedRecordAndUndefinedIndexSignature', () => {
    type Source = {
      a: number;
      b: number | undefined;
      [c: string]: number | undefined;
    } & Record<string, number | undefined>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
    }>();
  });

  test('outputWithUndefinedIndexSignature', () => {
    type Source = {
      a: number;
      b: number;
      [c: string]: number | undefined;
    };
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecord', () => {
    type Source = {
      a: number;
      b: number;
    } & Record<string, number | undefined>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      a: number;
      b: number;
    }>();
  });

  test('outputWithUndefinedRecordAndUndefinedIndexSignature', () => {
    type Source = {
      a: number;
      b: number;
      [c: string]: number | undefined;
    } & Record<string, number | undefined>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<{
      [x: string]: number;
      [x: number]: number;
      a: number;
      b: number;
    }>();
  });
});

// regression test for https://github.com/trpc/trpc/issues/5075
describe('complex zod schema serialization', () => {
  test('Test serialization of different zod schemas against z.infer', () => {
    const mixedSchema = z.object({
      zArray: z.array(z.string()),
      zRecord: z.record(z.string(), z.string()),
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
      zArrayOrRecord: z.union([
        z.array(z.string()),
        z.record(z.string(), z.string()),
      ]),
    });

    type Source = z.infer<typeof mixedSchema>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().not.toBeAny();

    expectTypeOf<Transformed['zArray']>().toEqualTypeOf<string[]>();
    expectTypeOf<Transformed['zRecord']>().toEqualTypeOf<
      Record<string, string>
    >();
    expectTypeOf<Transformed['zTuple']>().toEqualTypeOf<[string, number]>();
    expectTypeOf<Transformed['zUnion']>().toEqualTypeOf<string | number>();
    expectTypeOf<Transformed['zIntersection']>().toMatchObjectType<{
      name: string;
      age: number;
    }>();
    expectTypeOf<Transformed['zLazy']>().toEqualTypeOf<string>();

    expectTypeOf<Transformed['zMap']>().toEqualTypeOf<object>();
    expectTypeOf<Transformed['zSet']>().toEqualTypeOf<object>();
    expectTypeOf<Transformed['zEnum']>().toEqualTypeOf<'foo' | 'bar'>();
    expectTypeOf<Transformed['zNativeEnum']>().toEqualTypeOf<number>();
    expectTypeOf<Transformed['zUnknown']>().toEqualTypeOf<unknown>();
    expectTypeOf<Transformed['zNullable']>().toEqualTypeOf<string | null>();
    expectTypeOf<Transformed['zOptional']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Transformed['zLiteral']>().toEqualTypeOf<'foo'>();
    expectTypeOf<Transformed['zBoolean']>().toEqualTypeOf<boolean>();
    expectTypeOf<Transformed['zString']>().toEqualTypeOf<string>();
    expectTypeOf<Transformed['zNumber']>().toEqualTypeOf<number>();

    expectTypeOf<Transformed['zBigint']>().toBeNever();
    expectTypeOf<Transformed['zDate']>().toEqualTypeOf<string>();

    // @ts-expect-error omitted is okay
    expectTypeOf<Transformed['zUndefined']>().toEqualTypeOf<undefined>();

    expectTypeOf<Transformed['zAny']>().toEqualTypeOf<any>();

    expectTypeOf<Transformed['zArrayOptional']>().toEqualTypeOf<
      string[] | undefined
    >();
    expectTypeOf<Transformed['zArrayOrRecord']>().toEqualTypeOf<
      string[] | Record<string, string>
    >();
  });

  test('non-records should not erroneously be inferred as Records in serialized types', () => {
    const zChange = z.object({
      status: z
        .tuple([
          z.literal('tmp').or(z.literal('active')),
          z.literal('active').or(z.literal('disabled')),
        ])
        .optional(),
      validFrom: z.tuple([z.string().nullable(), z.string()]).optional(),
      validTo: z
        .tuple([z.string().nullable(), z.string().nullable()])
        .optional(),
      canceled: z.tuple([z.boolean(), z.boolean()]).optional(),
      startsAt: z
        .tuple([z.string().nullable(), z.string().nullable()])
        .optional(),
      endsAt: z
        .tuple([z.string().nullable(), z.string().nullable()])
        .optional(),
    });

    type Source = z.infer<typeof zChange>;
    type Transformed = Serialize<Source>;

    expectTypeOf<Transformed>().toEqualTypeOf<Source>();
  });
});

test('Symbol keys get erased during serialization', () => {
  const symbol = Symbol('test');
  type Source = {
    [symbol]: string;
    str: string;
    num: number;
  };
  type Transformed = Serialize<Source>;

  expectTypeOf<Transformed>().toEqualTypeOf<{
    str: string;
    num: number;
  }>();
});
