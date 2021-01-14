export namespace tsutil {
  export type BasePrimitive = string | number | boolean;
  export type Primitive = BasePrimitive | BasePrimitive[];

  export type isUndefined<T> = undefined extends T
    ? T extends undefined
      ? true
      : false
    : false;
  export type isNull<T> = null extends T
    ? T extends null
      ? true
      : false
    : false;
  export type isTrue<T> = true extends T
    ? T extends true
      ? true
      : false
    : false;
  export type isFalse<T> = false extends T
    ? T extends false
      ? true
      : false
    : false;
  export type isObject<T> = T extends { [k: string]: any }
    ? T extends Array<any>
      ? false
      : true
    : false;
  export type isObjectArray<T> = T extends Array<{ [k: string]: any }>
    ? true
    : false;
  export type isEqual<T, U> = U extends T
    ? T extends U
      ? true
      : false
    : false;

  type ResolverFn<TContext, TData, TArgs extends any[]> = (
    ctx: TContext,
    ...args: TArgs
  ) => Promise<TData> | TData;

  type DropFirst<T extends readonly unknown[]> = T extends readonly [
    any?,
    ...(infer U)
  ]
    ? U
    : [...T];

  export type stripNull<T> = T extends null ? never : T;
  export type stripUndefined<T> = T extends undefined ? never : T;
  export type flattenArray<T> = T extends (infer U)[]
    ? any[] extends T
      ? U
      : T
    : T;

  export type require<T> = stripNull<stripUndefined<T>>;
  export type clean<T> = flattenArray<stripNull<stripUndefined<T>>>;
  export type cleanObject<T extends object> = flattenArray<
    stripNull<stripUndefined<T>>
  >;
  export type variants<T> = T | T[] | undefined | null;

  export type isOptional<T> = undefined extends T ? true : false;
  export type isNullable<T> = null extends T ? true : false;
  export type isArray<T> = any[] extends T ? true : false;

  export type identity<T> = T;
  export type neverKeys<T> = {
    [k in keyof T]: T[k] extends never ? k : never;
  }[keyof T];
  export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
  export type noNever<T> = Omit<T, neverKeys<T>>;
  export type flatten<T extends object> = identity<
    { [k in keyof noNever<T>]: T[k] }
  >;
  export type format<T extends object> = identity<{ [k in keyof T]: T[k] }>;
  export interface Json {
    [key: string]:
      | BasePrimitive
      | BasePrimitive[]
      | undefined
      | null
      | Json
      | Json[];
  }

  export type typeToTuples<T> = T extends boolean
    ? [boolean | null | undefined] | [boolean[] | null | undefined]
    : [T | null | undefined] | [T[] | null | undefined];

  export type nullableCheck<
    T,
    D extends { nullable: any }
  > = D['nullable'] extends true ? T | null : T;
  export type optionalCheck<
    T,
    D extends { optional: any }
  > = D['optional'] extends true ? T | undefined : T;
  export type arrayCheck<T, D extends { array: any }> = D['array'] extends true
    ? T[]
    : T;
  export type declean<
    T,
    D extends { nullable: boolean; optional: boolean; array: boolean }
  > = optionalCheck<nullableCheck<arrayCheck<T, D>, D>, D>;

  export type copyNullable<T, Y> = null extends Y ? T | null : T;
  export type copyOptional<T, Y> = undefined extends Y ? T | undefined : T;
  export type copyArray<T, Y> = any[] extends Y ? T[] : T;
  export type toVariant<T, OriginalT> = copyNullable<
    copyOptional<copyArray<T, OriginalT>, OriginalT>,
    OriginalT
  >;

  // detecting unions
  type boxed<T> = [T];
  type nondistributed<T> = [T] extends [infer U] ? boxed<U> : never;
  type distributed<T> = T extends infer U ? boxed<U> : never;
  export type isUnion<T> = distributed<T> extends nondistributed<T>
    ? nondistributed<T> extends distributed<T>
      ? false
      : true
    : true;

  // object utilities
  export type setKey<
    T extends object,
    Key extends string,
    Value extends any
  > = flatten<
    {
      [k in Exclude<keyof T, Key>]: T[k];
    } &
      { [k in Key]: Value }
  >;

  export type promisify<T> = T extends Promise<any> ? T : Promise<T>;

  export type returnPromisify<T extends (...args: any) => any> = (
    ...args: Parameters<T>
  ) => ReturnType<T> extends Promise<any>
    ? ReturnType<T>
    : Promise<ReturnType<T>>;
  //////////////////////////
  //// Object Wrangling ////
  //////////////////////////

  export type makeOptional<
    T extends object,
    OptionalKeys extends keyof T = never
  > = {
    [k in Exclude<keyof T, OptionalKeys>]: T[k];
  } &
    { [k in OptionalKeys]?: T[k] };

  export type getRequiredKeys<Shape extends object> = NonNullable<
    {
      [k in keyof Shape]: undefined extends Shape[k] ? never : k;
    }[keyof Shape]
  >;

  export type getOptionalKeys<Shape extends object> = Exclude<
    keyof Shape,
    getRequiredKeys<Shape>
  >;

  export type setDefaults<
    Shape extends object,
    Defaults extends { [k: string]: any }
  > = flatten<
    {
      [k in getRequiredKeys<Shape>]: Shape[k];
    } &
      { [k in Exclude<keyof Defaults, getRequiredKeys<Shape>>]: Defaults[k] }
  >;

  export type filterByClass<T, Class> = flatten<
    { [k in keyof clean<T>]: clean<T>[k] extends Class ? clean<T>[k] : never }
  >;

  export type filterByNotClass<T, Class> = flatten<
    { [k in keyof clean<T>]: clean<T>[k] extends Class ? never : clean<T>[k] }
  >;

  export type merge<A extends object, B extends object> = {
    [k in Exclude<keyof A, keyof B>]: A[k];
  } &
    B;

  export function assertNever(_x: never): never {
    throw new Error();
  }
}
