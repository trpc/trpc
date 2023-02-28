/**
 * `expect-type` from unpublished branch `dx-generics` that fixes `MISMATCH error` for v10 routers
https://raw.githubusercontent.com/mmkal/expect-type/dx-generics/src/index.ts
 * @link https://github.com/mmkal/expect-type/pull/16
 */
export type Not<T extends boolean> = T extends true ? false : true;
export type Or<Types extends boolean[]> = Types[number] extends false
  ? false
  : true;
export type And<Types extends boolean[]> = Types[number] extends true
  ? true
  : false;
export type Eq<Left extends boolean, Right extends boolean> = Left extends true
  ? Right
  : Not<Right>;

const secret = Symbol('secret');
type Secret = typeof secret;

export type IsNever<T> = [T] extends [never] ? true : false;
export type IsAny<T> = [T] extends [Secret] ? Not<IsNever<T>> : false;
export type IsUnknown<T> = [unknown] extends [T] ? Not<IsAny<T>> : false;
export type IsNeverOrAny<T> = Or<[IsNever<T>, IsAny<T>]>;
export type BrandSpecial<T> = IsAny<T> extends true
  ? { special: true; type: 'any' }
  : IsUnknown<T> extends true
  ? { special: true; type: 'unknown' }
  : IsNever<T> extends true
  ? { special: true; type: 'never' }
  : never;

/**
 * Recursively walk a type and replace it with a branded type related to the original. This is useful for
 * equality-checking stricter than `A extends B ? B extends A ? true : false : false`, because it detects
 * the difference between a few edge-case types that vanilla typescript doesn't by default:
 * - `any` vs `unknown`
 * - `{ readonly a: string }` vs `{ a: string }`
 * - `{ a?: string }` vs `{ a: string | undefined }`
 */
export type DeepBrand<T> = IsNever<T> extends true
  ? { type: 'never' }
  : IsAny<T> extends true
  ? { type: 'any' }
  : IsUnknown<T> extends true
  ? { type: 'unknown' }
  : T extends
      | string
      | number
      | boolean
      | symbol
      | bigint
      | null
      | undefined
      | void
  ? {
      type: 'primitive';
      value: T;
    }
  : T extends new (...args: any[]) => any
  ? {
      type: 'constructor';
      params: ConstructorParams<T>;
      instance: DeepBrand<InstanceType<Extract<T, new (...args: any) => any>>>;
    }
  : T extends (...args: infer P) => infer R // avoid functions with different params/return values matching
  ? {
      type: 'function';
      params: DeepBrand<P>;
      return: DeepBrand<R>;
      this: DeepBrand<ThisParameterType<T>>;
    }
  : T extends any[]
  ? {
      type: 'array';
      items: { [K in keyof T]: T[K] };
    }
  : {
      type: 'object';
      properties: { [K in keyof T]: DeepBrand<T[K]> };
      readonly: ReadonlyKeys<T>;
      required: RequiredKeys<T>;
      optional: OptionalKeys<T>;
      constructorParams: DeepBrand<ConstructorParams<T>>;
    };

export type RequiredKeys<T> = Extract<
  {
    [K in keyof T]-?: object extends Pick<T, K> ? never : K;
  }[keyof T],
  keyof T
>;
export type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

// adapted from some answers to https://github.com/type-challenges/type-challenges/issues?q=label%3A5+label%3Aanswer
// prettier-ignore
export type ReadonlyKeys<T> = Extract<{
  [K in keyof T]-?: ReadonlyEquivalent<
    {[_K in K]: T[K]},
    {-readonly [_K in K]: T[K]}
  > extends true ? never : K;
}[keyof T], keyof T>;

// prettier-ignore
type ReadonlyEquivalent<X, Y> = Extends<
  (<T>() => T extends X ? true : false),
  (<T>() => T extends Y ? true : false)
>

export type Extends<L, R> = IsNever<L> extends true
  ? IsNever<R>
  : [L] extends [R]
  ? true
  : false;
export type StrictExtends<L, R> = Extends<DeepBrand<L>, DeepBrand<R>>;

export type Equal<Left, Right> = And<
  [StrictExtends<Left, Right>, StrictExtends<Right, Left>]
>;

export type Params<Actual> = Actual extends (...args: infer P) => any
  ? P
  : never;
export type ConstructorParams<Actual> = Actual extends new (
  ...args: infer P
) => any
  ? Actual extends new () => any
    ? P | []
    : P
  : never;

type MismatchArgs<B extends boolean, C extends boolean> = Eq<B, C> extends true
  ? []
  : [never];
type Mismatch<T> = (BrandSpecial<T> | T) & {
  [secret]: 'Type should be satisfied';
};

export interface ExpectTypeOf<Actual, B extends boolean> {
  toBeAny: (...MISMATCH: MismatchArgs<IsAny<Actual>, B>) => true;
  toBeUnknown: (...MISMATCH: MismatchArgs<IsUnknown<Actual>, B>) => true;
  toBeNever: (...MISMATCH: MismatchArgs<IsNever<Actual>, B>) => true;
  toBeFunction: (
    ...MISMATCH: MismatchArgs<Extends<Actual, (...args: any[]) => any>, B>
  ) => true;
  toBeObject: (...MISMATCH: MismatchArgs<Extends<Actual, object>, B>) => true;
  toBeArray: (...MISMATCH: MismatchArgs<Extends<Actual, any[]>, B>) => true;
  toBeNumber: (...MISMATCH: MismatchArgs<Extends<Actual, number>, B>) => true;
  toBeString: (...MISMATCH: MismatchArgs<Extends<Actual, string>, B>) => true;
  toBeBoolean: (...MISMATCH: MismatchArgs<Extends<Actual, boolean>, B>) => true;
  toBeVoid: (...MISMATCH: MismatchArgs<Extends<Actual, void>, B>) => true;
  toBeSymbol: (...MISMATCH: MismatchArgs<Extends<Actual, symbol>, B>) => true;
  toBeNull: (...MISMATCH: MismatchArgs<Extends<Actual, null>, B>) => true;
  toBeUndefined: (
    ...MISMATCH: MismatchArgs<Extends<Actual, undefined>, B>
  ) => true;
  toBeNullable: (
    ...MISMATCH: MismatchArgs<Not<Equal<Actual, NonNullable<Actual>>>, B>
  ) => true;
  toMatchTypeOf: {
    <
      Expected extends B extends true
        ? Extends<Actual, Expected> extends true
          ? unknown
          : Mismatch<Actual>
        : unknown,
    >(
      ...MISMATCH: Or<
        [IsNeverOrAny<Actual>, IsNeverOrAny<Expected>]
      > extends true
        ? MismatchArgs<Extends<Actual, Expected>, B>
        : []
    ): true;
    <
      Expected extends B extends true
        ? Extends<Actual, Expected> extends true
          ? unknown
          : Mismatch<Actual>
        : unknown,
    >(
      expected: Expected,
      ...MISMATCH: Or<
        [IsNeverOrAny<Actual>, IsNeverOrAny<Expected>]
      > extends true
        ? MismatchArgs<Extends<Actual, Expected>, B>
        : []
    ): true;
  };
  toEqualTypeOf: {
    <
      Expected extends B extends true
        ? Equal<Actual, Expected> extends true
          ? unknown
          : Mismatch<Actual>
        : unknown,
    >(
      ...MISMATCH: Or<
        [IsNeverOrAny<Actual>, IsNeverOrAny<Expected>]
      > extends true
        ? MismatchArgs<Equal<Actual, Expected>, B>
        : []
    ): true;
    <
      Expected extends B extends true
        ? Equal<Actual, Expected> extends true
          ? unknown
          : Mismatch<Actual>
        : unknown,
    >(
      expected: Expected,
      ...MISMATCH: Or<
        [IsNeverOrAny<Actual>, IsNeverOrAny<Expected>]
      > extends true
        ? MismatchArgs<Equal<Actual, Expected>, B>
        : []
    ): true;
  };
  toBeCallableWith: B extends true ? (...args: Params<Actual>) => true : never;
  toBeConstructibleWith: B extends true
    ? (...args: ConstructorParams<Actual>) => true
    : never;
  toHaveProperty: <K extends string>(
    key: K,
    ...MISMATCH: MismatchArgs<Extends<K, keyof Actual>, B>
  ) => K extends keyof Actual ? ExpectTypeOf<Actual[K], B> : true;
  extract: <V>(v?: V) => ExpectTypeOf<Extract<Actual, V>, B>;
  exclude: <V>(v?: V) => ExpectTypeOf<Exclude<Actual, V>, B>;
  parameter: <K extends keyof Params<Actual>>(
    number: K,
  ) => ExpectTypeOf<Params<Actual>[K], B>;
  parameters: ExpectTypeOf<Params<Actual>, B>;
  constructorParameters: ExpectTypeOf<ConstructorParams<Actual>, B>;
  thisParameter: ExpectTypeOf<ThisParameterType<Actual>, B>;
  instance: Actual extends new (...args: any[]) => infer I
    ? ExpectTypeOf<I, B>
    : never;
  returns: Actual extends (...args: any[]) => infer R
    ? ExpectTypeOf<R, B>
    : never;
  resolves: Actual extends PromiseLike<infer R> ? ExpectTypeOf<R, B> : never;
  items: Actual extends ArrayLike<infer R> ? ExpectTypeOf<R, B> : never;
  guards: Actual extends (v: any, ...args: any[]) => v is infer T
    ? ExpectTypeOf<T, B>
    : never;
  asserts: Actual extends (v: any, ...args: any[]) => asserts v is infer T
    ? // Guard methods `(v: any) => asserts v is T` does not actually defines a return type. Thus, any function taking 1 argument matches the signature before.
      // In case the inferred assertion type `R` could not be determined (so, `unknown`), consider the function as a non-guard, and return a `never` type.
      // See https://github.com/microsoft/TypeScript/issues/34636
      unknown extends T
      ? never
      : ExpectTypeOf<T, B>
    : never;
  not: ExpectTypeOf<Actual, Not<B>>;
}
const fn: any = () => true;

export type _ExpectTypeOf = {
  <Actual>(actual: Actual): ExpectTypeOf<Actual, true>;
  <Actual>(): ExpectTypeOf<Actual, true>;
};

/**
 * Similar to Vitest's `expect`, but with type-awareness.
 * Gives you access to a number of type-matchers that let you make assertions about the
 * form of a reference or generic type parameter.
 *
 * @example
 * import {foo, bar} from '../foo'
 * import {expectTypeOf} from 'expect-type'
 *
 * test('foo types', () => {
 *   // make sure `foo` has type {a: number}
 *   expectTypeOf(foo).toMatchTypeOf({a: 1})
 *   expectTypeOf(foo).toHaveProperty('a').toBeNumber()
 *
 *   // make sure `bar` is a function taking a string:
 *   expectTypeOf(bar).parameter(0).toBeString()
 *   expectTypeOf(bar).returns.not.toBeAny()
 * })
 *
 * @description
 * See the [full docs](https://npmjs.com/package/expect-type#documentation) for lots more examples.
 */
export const expectTypeOf: _ExpectTypeOf = <Actual>(
  _actual?: Actual,
): ExpectTypeOf<Actual, true> => {
  const nonFunctionProperties = [
    'parameters',
    'returns',
    'resolves',
    'not',
    'items',
    'constructorParameters',
    'thisParameter',
    'instance',
    'guards',
    'asserts',
  ] as const;
  type Keys = keyof ExpectTypeOf<any, any>;

  type FunctionsDict = Record<
    Exclude<Keys, (typeof nonFunctionProperties)[number]>,
    any
  >;
  const obj: FunctionsDict = {
    toBeAny: fn,
    toBeUnknown: fn,
    toBeNever: fn,
    toBeFunction: fn,
    toBeObject: fn,
    toBeArray: fn,
    toBeString: fn,
    toBeNumber: fn,
    toBeBoolean: fn,
    toBeVoid: fn,
    toBeSymbol: fn,
    toBeNull: fn,
    toBeUndefined: fn,
    toBeNullable: fn,
    toMatchTypeOf: fn,
    toEqualTypeOf: fn,
    toBeCallableWith: fn,
    toBeConstructibleWith: fn,
    extract: expectTypeOf,
    exclude: expectTypeOf,
    toHaveProperty: expectTypeOf,
    parameter: expectTypeOf,
  };

  const getterProperties: readonly Keys[] = nonFunctionProperties;
  getterProperties.forEach((prop: Keys) =>
    Object.defineProperty(obj, prop, { get: () => expectTypeOf({}) }),
  );

  return obj as ExpectTypeOf<Actual, true>;
};
