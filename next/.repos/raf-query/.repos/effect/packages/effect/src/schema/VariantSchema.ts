/**
 * Builds related schemas for named variants from shared field definitions.
 *
 * `make` fixes the variant names and default variant, then lets callers define
 * fields that are shared by all variants or specific to some variants. From
 * those definitions it can create schema classes, unions, extracted struct
 * schemas, and helpers for changing fields across variants.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { Brand } from "../Brand.ts"
import * as Effect from "../Effect.ts"
import { dual } from "../Function.ts"
import * as InternalRecord from "../internal/record.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as Struct_ from "../Struct.ts"

/**
 * Runtime type identifier attached to variant schema structs.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/schema/VariantSchema"

const cacheSymbol = Symbol.for(`${TypeId}/cache`)
const defaultCacheSymbol = Symbol.for(`${TypeId}/defaultCache`)

/**
 * Pipeable container of schema fields that can be extracted into per-variant
 * `Schema.Struct` schemas.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Struct<in out A extends Field.Fields> extends Pipeable {
  readonly [TypeId]: A
  /**
   * @internal
   */
  [cacheSymbol]?: Record<string, Schema.Top>
  /**
   * @internal
   */
  [defaultCacheSymbol]?: Record<string, Schema.Top>
}

/**
 * Returns `true` when a value is a variant schema struct.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isStruct = (u: unknown): u is Struct<any> => Predicate.hasProperty(u, TypeId)

/**
 * Type-level helpers for variant schema structs.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Struct {
  /**
   * Minimal structural type for any variant schema struct.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Any = { readonly [TypeId]: any }

  /**
   * Field map accepted by a variant struct, where each property may be a schema, a
   * variant field, a nested struct, or `undefined`.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Fields = {
    readonly [key: string]:
      | Schema.Top
      | Field<any>
      | Struct<any>
      | undefined
  }

  /**
   * Type-level validation that every variant field in a struct only uses variants
   * from the configured variant set.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Validate<A, Variant extends string> = {
    readonly [K in keyof A]: A[K] extends { readonly [TypeId]: infer _ } ? Validate<A[K], Variant> :
      A[K] extends Field<infer Config> ? [keyof Config] extends [Variant] ? {} : "field must have valid variants"
      : unknown
  }
}

const FieldTypeId = "~effect/schema/VariantSchema/Field"

/**
 * Pipeable collection of variant-specific schemas for a single logical field.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Field<in out A extends Field.Config> extends Pipeable {
  readonly [FieldTypeId]: typeof FieldTypeId
  readonly schemas: A
}

/**
 * Returns `true` when a value is a variant schema field.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isField = (u: unknown): u is Field<any> => Predicate.hasProperty(u, FieldTypeId)

/**
 * Type-level helpers for variant schema fields.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Field {
  /**
   * Minimal structural type for any variant schema field.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Any = { readonly [FieldTypeId]: typeof FieldTypeId }

  /**
   * Map from variant name to the schema used for a field in that variant.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Config = {
    readonly [key: string]: Schema.Top | undefined
  }

  /**
   * Variant field configuration restricted to an optional subset of the supplied
   * variant keys.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type ConfigWithKeys<K extends string> = {
    readonly [P in K]?: Schema.Top | undefined
  }

  /**
   * Field map whose properties may be schemas, variant fields, nested structs, or
   * `undefined`.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Fields = {
    readonly [key: string]:
      | Schema.Top
      | Field<any>
      | Struct<any>
      | undefined
  }
}

/**
 * Computes the `Schema.Struct` field map for a variant by selecting matching
 * field schemas and recursively extracting nested structs.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ExtractFields<V extends string, Fields extends Struct.Fields, IsDefault = false> = {
  readonly [
    K in keyof Fields as [Fields[K]] extends [Field<infer Config>] ? V extends keyof Config ? K
      : never
      : K
  ]: [Fields[K]] extends [Struct<infer _>] ? Extract<V, Fields[K], IsDefault>
    : [Fields[K]] extends [Field<infer Config>] ? [Config[V]] extends [Schema.Top] ? Config[V]
      : never
    : [Fields[K]] extends [Schema.Top] ? Fields[K]
    : never
}

/**
 * Computes the schema type produced by extracting a single variant from a variant
 * schema struct.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Extract<V extends string, A extends Struct<any>, IsDefault = false> = [A] extends [
  Struct<infer Fields>
] ? IsDefault extends true ? [A] extends [Schema.Top] ? A : Schema.Struct<Struct_.Simplify<ExtractFields<V, Fields>>>
  : Schema.Struct<Struct_.Simplify<ExtractFields<V, Fields>>>
  : never

const extract: {
  <V extends string, const IsDefault extends boolean = false>(
    variant: V,
    options?: {
      readonly isDefault?: IsDefault | undefined
    }
  ): <A extends Struct<any>>(self: A) => Extract<V, A, IsDefault>
  <V extends string, A extends Struct<any>, const IsDefault extends boolean = false>(self: A, variant: V, options?: {
    readonly isDefault?: IsDefault | undefined
  }): Extract<V, A, IsDefault>
} = dual(
  (args) => isStruct(args[0]),
  <V extends string, A extends Struct<any>>(
    self: A,
    variant: V,
    options?: {
      readonly isDefault?: boolean | undefined
    }
  ): Extract<V, A> => {
    if (options?.isDefault === true && Schema.isSchema(self)) {
      return self as any
    }
    const cache = options?.isDefault === true
      ? self[defaultCacheSymbol] ?? (self[defaultCacheSymbol] = Object.create(null))
      : self[cacheSymbol] ?? (self[cacheSymbol] = Object.create(null))
    if (Object.hasOwn(cache, variant)) {
      return cache[variant] as any
    }
    const fields: Record<string, any> = {}
    for (const key of Object.keys(self[TypeId])) {
      const value = self[TypeId][key]
      if (value === undefined) {
        continue
      }
      if (TypeId in value) {
        if (options?.isDefault === true && Schema.isSchema(value)) {
          InternalRecord.assignProperty(fields, key, value)
        } else {
          InternalRecord.assignProperty(fields, key, extract(value, variant))
        }
      } else if (FieldTypeId in value) {
        if (Object.hasOwn(value.schemas, variant)) {
          const schema = value.schemas[variant]
          if (schema !== undefined) {
            InternalRecord.assignProperty(fields, key, schema)
          }
        }
      } else {
        InternalRecord.assignProperty(fields, key, value)
      }
    }
    const schema = Schema.Struct(fields)
    cache[variant] = schema
    return schema as any
  }
)

/**
 * Returns the original field definitions stored on a variant schema struct.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const fields = <A extends Struct<any>>(self: A): A[typeof TypeId] => self[TypeId]

/**
 * Schema class type returned by variant class constructors, combining the default
 * variant schema with access to the original variant fields.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Class<
  Self,
  Fields extends Struct.Fields,
  S extends Schema.Top & {
    readonly fields: Schema.Struct.Fields
  }
> extends Schema.Class<Self, S, {}>, Struct<Struct_.Simplify<Fields>> {
  readonly "Type": Self
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": Self
  readonly "Iso": S["Iso"]

  new(
    props: S["~type.make.in"],
    options?: {
      readonly disableChecks?: boolean
    } | undefined
  ): S["Type"]

  make<Args extends Array<any>, X>(
    this: { new(...args: Args): X },
    ...args: Args
  ): X

  readonly fields: S["fields"]
}

type MissingSelfGeneric<Params extends string = ""> =
  `Missing \`Self\` generic - use \`class Self extends Class<Self>()(${Params}{ ... })\``

/**
 * Union schema over the default schemas of a list of variant schema structs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Union<Members extends ReadonlyArray<Struct<any>>, Default extends string = string>
  extends
    Schema.Union<
      {
        readonly [K in keyof Members]: Extract<Default, Members[K], true>
      }
    >
{}

/**
 * Type-level helpers for unions of variant schema structs.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Union {
  /**
   * Computes a union schema for each variant from a list of variant schema structs.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export type Variants<Members extends ReadonlyArray<Struct<any>>, Variants extends string> = {
    readonly [Variant in Variants]: Schema.Union<
      {
        [K in keyof Members]: Extract<Variant, Members[K]>
      }
    >
  }
}

/**
 * Creates a variant schema toolkit for a fixed set of variant names and a default
 * variant.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  const Variants extends ReadonlyArray<string>,
  const Default extends Variants[number]
>(options: {
  readonly variants: Variants
  readonly defaultVariant: Default
}): {
  readonly Struct: <const A extends Struct.Fields>(
    fields: A & Struct.Validate<A, Variants[number]>
  ) => Struct<A>
  readonly Field: <const A extends Field.ConfigWithKeys<Variants[number]>>(
    config: A & { readonly [K in Exclude<keyof A, Variants[number]>]: never }
  ) => Field<A>
  readonly FieldOnly: <const Keys extends ReadonlyArray<Variants[number]>>(
    keys: Keys
  ) => <S extends Schema.Top>(
    schema: S
  ) => Field<{ readonly [K in Keys[number]]: S }>
  readonly FieldExcept: <const Keys extends ReadonlyArray<Variants[number]>>(
    keys: Keys
  ) => <S extends Schema.Top>(
    schema: S
  ) => Field<{ readonly [K in Exclude<Variants[number], Keys[number]>]: S }>
  readonly fieldEvolve: {
    <
      Self extends Field<any> | Schema.Top,
      const Mapping extends (Self extends Field<infer S> ? { readonly [K in keyof S]?: (variant: S[K]) => Schema.Top }
        : { readonly [K in Variants[number]]?: (variant: Self) => Schema.Top })
    >(f: Mapping): (self: Self) => Field<
      Self extends Field<infer S> ? {
          readonly [K in keyof S]: K extends keyof Mapping
            ? Mapping[K] extends (arg: any) => any ? ReturnType<Mapping[K]> : S[K]
            : S[K]
        } :
        {
          readonly [K in Variants[number]]: K extends keyof Mapping
            ? Mapping[K] extends (arg: any) => any ? ReturnType<Mapping[K]> : Self
            : Self
        }
    >
    <
      Self extends Field<any> | Schema.Top,
      const Mapping extends (Self extends Field<infer S> ? {
          readonly [K in keyof S]?: (variant: S[K]) => Schema.Top
        }
        : { readonly [K in Variants[number]]?: (variant: Self) => Schema.Top })
    >(self: Self, f: Mapping): Field<
      Self extends Field<infer S> ? {
          readonly [K in keyof S]: K extends keyof Mapping
            ? Mapping[K] extends (arg: any) => any ? ReturnType<Mapping[K]> : S[K]
            : S[K]
        } :
        {
          readonly [K in Variants[number]]: K extends keyof Mapping
            ? Mapping[K] extends (arg: any) => any ? ReturnType<Mapping[K]> : Self
            : Self
        }
    >
  }
  readonly Class: <Self = never>(
    identifier: string
  ) => <const Fields extends Struct.Fields>(
    fields: Fields & Struct.Validate<Fields, Variants[number]>,
    annotations?:
      | Schema.Annotations.Declaration<Self, readonly [Schema.Struct<ExtractFields<Default, Fields, true>>]>
      | undefined
  ) => [Self] extends [never] ? MissingSelfGeneric
    :
      & Class<
        Self,
        Fields,
        Schema.Struct<ExtractFields<Default, Fields, true>>
      >
      & {
        readonly [V in Variants[number]]: Extract<V, Struct<Fields>>
      }
  readonly Union: <const Members extends ReadonlyArray<Struct<any>>>(
    members: Members
  ) => Union<Members, Default> & Union.Variants<Members, Variants[number]>
  readonly extract: {
    <V extends Variants[number]>(
      variant: V
    ): <A extends Struct<any>>(self: A) => Extract<V, A, V extends Default ? true : false>
    <V extends Variants[number], A extends Struct<any>>(
      self: A,
      variant: V
    ): Extract<V, A, V extends Default ? true : false>
  }
} => {
  function Class<Self>(identifier: string) {
    return function(
      fields: Struct.Fields,
      annotations?: Schema.Annotations.Declaration<
        Self,
        readonly [Schema.Struct<ExtractFields<Default, typeof fields, true>>]
      >
    ) {
      const variantStruct = Struct(fields)
      const schema = extract(variantStruct, options.defaultVariant, {
        isDefault: true
      })
      const SClass = Schema.Class as any
      class Base extends SClass(identifier)(schema.fields, annotations) {
        static [TypeId] = fields
      }
      for (const variant of options.variants) {
        Object.defineProperty(Base, variant, {
          value: extract(variantStruct, variant).annotate({
            id: `${identifier}.${variant}`,
            title: `${identifier}.${variant}`
          })
        })
      }
      return Base
    }
  }
  function FieldOnly<const Keys extends ReadonlyArray<Variants[number]>>(keys: Keys) {
    return function<S extends Schema.Top>(schema: S) {
      const obj: Record<string, S> = {}
      for (const key of keys) {
        InternalRecord.assignProperty(obj, key, schema)
      }
      return Field(obj)
    }
  }
  function FieldExcept<const Keys extends ReadonlyArray<Variants[number]>>(keys: Keys) {
    return function<S extends Schema.Top>(schema: S) {
      const obj: Record<string, S> = {}
      for (const variant of options.variants) {
        if (!keys.includes(variant)) {
          InternalRecord.assignProperty(obj, variant, schema)
        }
      }
      return Field(obj)
    }
  }
  function UnionVariants(members: ReadonlyArray<Struct<any>>) {
    return Union(members, options.defaultVariant, options.variants)
  }
  const fieldEvolve = dual(
    2,
    (
      self: Field<any> | Schema.Top,
      f: Record<string, (schema: Schema.Top) => Schema.Top>
    ): Field<any> => {
      const field = isField(self) ? self : Field(Object.fromEntries(
        options.variants.map((variant) => [variant, self])
      ))
      return Field(Struct_.evolve(field.schemas, f))
    }
  )
  const extractVariants = dual(
    2,
    (self: Struct<any>, variant: string): any =>
      extract(self, variant, {
        isDefault: variant === options.defaultVariant
      })
  )
  return {
    Struct,
    Field,
    FieldOnly,
    FieldExcept,
    Class,
    Union: UnionVariants,
    fieldEvolve,
    // fieldFromKey,
    extract: extractVariants
  } as any
}

/**
 * Marks a value as an explicit override for an `Overrideable` schema default.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const Override = <A>(value: A): A & Brand<"Override"> => value as any

/**
 * Schema type whose constructor can use an effectful default unless a value is
 * explicitly branded with `Override`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface Overrideable<S extends Schema.Top & Schema.WithoutConstructorDefault> extends
  Schema.BottomLazy<
    S["ast"],
    Overrideable<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    "required",
    "with-default",
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"] & Brand<"Override">
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": (S["Type"] & Brand<"Override">) | undefined
  readonly "Iso": (S["Type"] & Brand<"Override">) | undefined
}

/**
 * Wraps a schema with an effectful constructor default while allowing explicit
 * values to be marked with `Override`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Overrideable = <S extends Schema.Top & Schema.WithoutConstructorDefault>(
  schema: S,
  options: {
    readonly defaultValue: Effect.Effect<S["~type.make.in"]>
  }
): Overrideable<S> =>
  schema.pipe(
    Schema.decodeTo(Schema.brand("Override")(Schema.toType(schema))),
    Schema.withConstructorDefault(Effect.map(options.defaultValue, Override))
  ) as any

const StructProto = {
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const Struct = <const A extends Field.Fields>(fields: A): Struct<A> => {
  const self = Object.create(StructProto)
  self[TypeId] = fields
  return self
}

const FieldProto = {
  [FieldTypeId]: FieldTypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const Field = <const A extends Field.Config>(schemas: A): Field<A> => {
  const self = Object.create(FieldProto)
  self.schemas = schemas
  return self
}

const Union = <
  Members extends ReadonlyArray<Struct<any>>,
  Default extends string,
  Variants extends ReadonlyArray<string>
>(
  members: Members,
  defaultVariant: Default,
  variants: Variants
) => {
  const VariantUnion = Schema.Union(
    members.map((member) => Schema.isSchema(member) ? member : extract(member, defaultVariant, { isDefault: true }))
  ) as any
  for (const variant of variants) {
    Object.defineProperty(VariantUnion, variant, {
      value: Schema.Union(members.map((member) => extract(member, variant)))
    })
  }
  return VariantUnion
}
