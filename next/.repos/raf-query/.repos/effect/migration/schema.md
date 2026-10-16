# Schema: Migration from v3

This document maps v3 Schema APIs to their v4 equivalents. Simple renames and argument changes are covered in the summary table below. More complex migrations have dedicated sections with code examples.

## Migration types

- **auto** — mechanical find-and-replace, safe to auto-apply
- **semi-auto** — follows a clear pattern but needs structural changes
- **manual** — requires case-by-case decisions, flag for human review
- **removed** — no v4 equivalent

## Summary table

| v3 API                                          | v4 API                                                                        | Migration type    |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `asSchema(schema)`                              | `revealCodec(schema)`                                                         | rename            |
| `encodedSchema(schema)`                         | `toEncoded(schema)`                                                           | rename            |
| `typeSchema(schema)`                            | `toType(schema)`                                                              | rename            |
| `compose(schemaB)`                              | `decodeTo(schemaB)`                                                           | rename            |
| `annotations(ann)`                              | `annotate(ann)`                                                               | rename            |
| `decodingFallback` annotation                   | `catchDecoding(...)`                                                          | rename            |
| `parseJson()`                                   | `fromJsonString(Unknown)`                                                     | rename            |
| `parseJson(schema)`                             | `fromJsonString(schema)`                                                      | rename            |
| `pattern(regex)`                                | `check(isPattern(regex))`                                                     | rename            |
| `nonEmptyString`                                | `isNonEmpty`                                                                  | rename            |
| `BigIntFromSelf`                                | `BigInt`                                                                      | rename            |
| `SymbolFromSelf`                                | `Symbol`                                                                      | rename            |
| `URLFromSelf`                                   | `URL`                                                                         | rename            |
| `RedactedFromSelf`                              | `Redacted`                                                                    | rename            |
| `Redacted`                                      | `RedactedFromValue`                                                           | rename            |
| `EitherFromSelf`                                | `Result`                                                                      | rename            |
| `DateFromNumber`                                | `DateFromMillis`                                                              | rename            |
| `Date`                                          | `DateFromString`                                                              | restructure       |
| `decodeUnknown`                                 | `decodeUnknownEffect`                                                         | rename            |
| `decode`                                        | `decodeEffect`                                                                | rename            |
| `decodeUnknownEither`                           | `decodeUnknownExit`                                                           | rename            |
| `decodeEither`                                  | `decodeExit`                                                                  | rename            |
| `encodeUnknown`                                 | `encodeUnknownEffect`                                                         | rename            |
| `encode`                                        | `encodeEffect`                                                                | rename            |
| `encodeUnknownEither`                           | `encodeUnknownExit`                                                           | rename            |
| `encodeEither`                                  | `encodeExit`                                                                  | rename            |
| `asserts(schema)(input)`                        | `asserts(schema, input)`                                                      | semi-auto         |
| `Literal(null)`                                 | `Null`                                                                        | restructure       |
| `Literal("a", "b")`                             | `Literals(["a", "b"])`                                                        | variadic-to-array |
| `pickLiteral("a", "b")`                         | `Literals(...).pick(["a", "b"])`                                              | restructure       |
| `Union(A, B)`                                   | `Union([A, B])`                                                               | variadic-to-array |
| `Tuple(A, B)`                                   | `Tuple([A, B])`                                                               | variadic-to-array |
| `TemplateLiteral(A, B)`                         | `TemplateLiteral([A, B])`                                                     | variadic-to-array |
| `TemplateLiteralParser(A, B)`                   | `TemplateLiteralParser(schema.parts)`                                         | restructure       |
| `Record({ key, value })`                        | `Record(key, value)`                                                          | restructure       |
| `filter(predicate)`                             | `check(makeFilter(predicate))`                                                | restructure       |
| `filter(refinement)`                            | `refine(refinement)`                                                          | restructure       |
| `UUID`                                          | `String.check(isUUID())`                                                      | restructure       |
| `ULID`                                          | `String.check(isULID())`                                                      | restructure       |
| `pick("a")`                                     | `mapFields(Struct.pick(["a"]))`                                               | restructure       |
| `omit("a")`                                     | `mapFields(Struct.omit(["a"]))`                                               | restructure       |
| `partial`                                       | `mapFields(Struct.map(Schema.optional))`                                      | restructure       |
| `partialWith({ exact: true })`                  | `mapFields(Struct.map(Schema.optionalKey))`                                   | restructure       |
| `required(schema)`                              | `schema.mapFields(Struct.map(Schema.requiredKey))`                            | restructure       |
| `extend(structB)`                               | `mapFields(Struct.assign(fieldsB))` or `fieldsAssign(fieldsB)`                | restructure       |
| `transform(from, to, { decode, encode })`       | `from.pipe(decodeTo(to, SchemaTransformation.transform({ decode, encode })))` | restructure       |
| `transformOrFail(from, to, { decode, encode })` | `from.pipe(decodeTo(to, { decode: SchemaGetter.transformEffect(...), ... }))` | restructure       |
| `transformLiteral(from, to)`                    | `Literal(from).transform(to)`                                                 | restructure       |
| `transformLiterals([0,"a"], [1,"b"])`           | `Literals([0, 1]).transform(["a", "b"])`                                      | restructure       |
| `attachPropertySignature("k", "v")`             | `mapFields(f => ({...f, k: tagDefaultOmit("v")}))`                            | restructure       |
| `validate*`                                     | removed (use `decode*` + `toType`)                                            | removed           |
| `keyof`                                         | —                                                                             | removed           |
| `NonEmptyArrayEnsure`                           | —                                                                             | removed           |
| `withDefaults`                                  | —                                                                             | removed           |
| `Data(schema)`                                  | —                                                                             | removed           |
| `optionalWith(schema, opts)`                    | varies by options (see [optionalWith](#optionalwith))                         | manual            |
| `optionalToOptional`                            | see [optional field transformations](#optional-field-transformations)         | manual            |
| `optionalToRequired`                            | see [optional field transformations](#optional-field-transformations)         | manual            |
| `requiredToOptional`                            | see [optional field transformations](#optional-field-transformations)         | manual            |
| `filterEffect`                                  | see [filterEffect](#filtereffect)                                             | manual            |
| `fromKey`                                       | see [rename](#rename)                                                         | manual            |
| `rename({ a: "c" })`                            | see [rename](#rename)                                                         | manual            |
| `format(schema)`                                | see [format](#format)                                                         | manual            |
| `ParseResult.ArrayFormatter.formatError(error)` | see [ParseResult formatters](#parseresult-formatters)                         | manual            |
| `declare`                                       | see [declare](#declare)                                                       | manual            |

## Additional rename notes

### `*FromSelf` renames

The following `*FromSelf` schemas have been renamed to drop the suffix:

`DateFromSelf` → `Date`, `DurationFromSelf` → `Duration`, `ChunkFromSelf` → `Chunk`, `ReadonlyMapFromSelf` → `ReadonlyMap`, `ReadonlySetFromSelf` → `ReadonlySet`, `HashMapFromSelf` → `HashMap`, `HashSetFromSelf` → `HashSet`, `BigDecimalFromSelf` → `BigDecimal`, `CauseFromSelf` → `Cause`, `ExitFromSelf` → `Exit`, `OptionFromSelf` → `Option`, `RegExpFromSelf` → `RegExp`

### `Date` encoded contract

**Migration: restructure**

In v3, `Schema.Date` decoded an ISO date string to a `Date` and rejected invalid dates. In v4, `Schema.Date` is the renamed `Schema.DateFromSelf`, so it expects a valid `Date` as its encoded value. Existing code can still type-check after upgrading while no longer accepting the same input.

v3

```ts
import { Schema } from "effect"

const DateFromIsoString = Schema.Date
```

v4

```ts
import { Schema } from "effect"

const DateFromIsoString = Schema.DateFromString
```

`Schema.DateFromString` preserves the string-to-`Date` transformation and rejects strings that produce invalid dates.

### Filter renames

All filters have been renamed with an `is` prefix and now use `check(...)` or `pipe(Schema.check(...))`:

`greaterThan` → `isGreaterThan`, `greaterThanOrEqualTo` → `isGreaterThanOrEqualTo`, `lessThan` → `isLessThan`, `lessThanOrEqualTo` → `isLessThanOrEqualTo`, `between` → `isBetween`, `int` → `isInt`, `multipleOf` → `isMultipleOf`, `finite` → `isFinite`, `minLength` → `isMinLength`, `maxLength` → `isMaxLength`, `length` → `isBetweenLength`

Note: `positive`, `negative`, `nonNegative`, `nonPositive` have been removed in v4.

### Utility renames

`equivalence` → `toEquivalence`, `arbitrary` → [`Arbitrary.schema`](#migrating-from-the-fast-check-bridge-to-native-arbitrary) from `effect/Arbitrary`, `pretty` → `toFormatter`, `standardSchemaV1` → `toStandardSchemaV1`

## Detailed migrations

### Redacted

**Migration: rename with behavior distinction**

In v3, `Schema.Redacted(value)` decoded the raw encoded value and wrapped the decoded value in `Redacted`.

In v4, that behavior is named `Schema.RedactedFromValue(value)`.

v3

```ts
import { Schema } from "effect"

const schema = Schema.Redacted(Schema.String)
const decode = Schema.decodeSync(schema)

decode("secret")
```

v4

```ts
import { Redacted, Schema } from "effect"

const schema = Schema.RedactedFromValue(Schema.String)
const decode = Schema.decodeSync(schema)

const redacted = decode("secret")
console.log(Redacted.value(redacted))
// secret
```

`Schema.Redacted(value)` in v4 is the replacement for v3 `Schema.RedactedFromSelf(value)`: it expects the input to already be a `Redacted` value, so both `Type` and `Encoded` are `Redacted<...>`.

### asserts signature

**Migration: semi-auto**

`Schema.asserts` now asserts an input directly instead of returning an assertion function.

v3

```ts
import { Schema } from "effect"

const assertString = Schema.asserts(Schema.String)
assertString(input)
```

v4

```ts
import { Schema } from "effect"

Schema.asserts(Schema.String, input)
```

### validate* removal

**Migration: removed**

The `validate`, `validateEither`, `validatePromise`, `validateSync`, and `validateOption` APIs have been removed. Use `Schema.decode*` + `Schema.toType` instead.

```ts
import { Schema } from "effect"

// v3: Schema.validateSync(Schema.String)(input)
// v4:
const validateSync = Schema.decodeSync(Schema.toType(Schema.String))
```

### Data removal

**Migration: removed**

`Schema.Data` has no v4 equivalent. Remove it. `Equal.equals` performs deep structural comparison on objects by default in v4, so `Schema.Data` is unnecessary.

### pickLiterals

**Migration: auto**

v3

```ts
import { Schema } from "effect"

const schema = Schema.Literal("a", "b", "c").pipe(Schema.pickLiteral("a", "b"))
```

v4

```ts
import { Schema } from "effect"

const schema = Schema.Literals(["a", "b", "c"]).pick(["a", "b"])
```

### TemplateLiteralParser

**Migration: semi-auto**

v3

```ts
import { Schema } from "effect"

const schema = Schema.TemplateLiteral(Schema.String, ".", Schema.String)
const parser = Schema.TemplateLiteralParser(Schema.String, ".", Schema.String)
```

v4

```ts
import { Schema } from "effect"

const schema = Schema.TemplateLiteral([Schema.String, ".", Schema.String])
// use the `parts` property instead of repeating the template parts
const parser = Schema.TemplateLiteralParser(schema.parts)
```

Behavior note: `TemplateLiteral` and `TemplateLiteralParser` match parts semantically. Checks on string, number, and bigint schema parts are applied while matching each segment, so refined parts can reject strings that would match the broader primitive shape.

### format

**Migration: manual**

**New imports:** `SchemaRepresentation`

v3

```ts
import { Schema } from "effect"

console.log(Schema.format(Schema.String))
// string
```

v4

```ts
import { Schema, SchemaRepresentation } from "effect"

const doc = SchemaRepresentation.toRepresentation(Schema.String.ast)
const multi = SchemaRepresentation.toMultiDocument(doc)
const codeDoc = SchemaRepresentation.toCodeDocument(multi)
console.log(codeDoc.codes[0].Type)
// string
```

### ParseResult formatters

**Migration: manual**

**New imports:** `SchemaIssue`

In v4, schema parsing fails with `Schema.SchemaError`, which contains a nested `SchemaIssue` in its `issue` field.

Use `SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues` for the v3 `ParseResult.ArrayFormatter.formatError(error)` equivalent.

v3

```ts
import { Either, ParseResult, Schema } from "effect"

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number
})

const decode = Schema.decodeUnknownEither(Person)

const result = decode({})
if (Either.isLeft(result)) {
  console.error("Decoding failed:")
  console.error(ParseResult.ArrayFormatter.formatErrorSync(result.left))
}
/*
Decoding failed:
[ { _tag: 'Missing', path: [ 'name' ], message: 'is missing' } ]
*/
```

v4

```ts
import { Schema, SchemaIssue } from "effect"

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number
})

const decode = Schema.decodeUnknownSync(Person)

try {
  decode({})
} catch (error) {
  if (error instanceof Error) {
    console.error("Decoding failed:")
    if (SchemaIssue.isIssue(error.cause)) {
      console.error(SchemaIssue.makeFormatterStandardSchemaV1()(error.cause).issues)
    }
  }
}
/*
Decoding failed:
[ { path: [ 'name' ], message: 'Missing key' } ]
*/
```

### Record

**Migration: auto**

v3

```ts
import { Schema } from "effect"

const schema = Schema.Record({ key: Schema.String, value: Schema.Number })
```

v4

```ts
import { Schema } from "effect"

const schema = Schema.Record(Schema.String, Schema.Number)
```

Behavior note: dynamic record key schemas select matching own properties before the value schema is applied. Refined key schemas such as `Schema.String.check(...)`, `Schema.Int`, or checked template literals ignore properties that do not match the key schema; they do not validate the value at those ignored keys. For transformed key schemas, selection is based on encoded property names before selected keys are decoded.

### pick / omit

**Migration: semi-auto**

**New imports:** `Struct`

v3

```ts
import { Schema } from "effect"

const picked = Schema.Struct({ a: Schema.String, b: Schema.Number }).pipe(Schema.pick("a"))
const omitted = Schema.Struct({ a: Schema.String, b: Schema.Number }).pipe(Schema.omit("b"))
```

v4

```ts
import { Schema, Struct } from "effect"

const picked = Schema.Struct({ a: Schema.String, b: Schema.Number }).mapFields(Struct.pick(["a"]))
const omitted = Schema.Struct({ a: Schema.String, b: Schema.Number }).mapFields(Struct.omit(["b"]))
```

### partial / partialWith

**Migration: semi-auto**

**New imports:** `Struct`

- `Schema.partial` → `mapFields(Struct.map(Schema.optional))` (allows `undefined`)
- `Schema.partialWith({ exact: true })` → `mapFields(Struct.map(Schema.optionalKey))` (exact)

```ts
import { Schema, Struct } from "effect"

const struct = Schema.Struct({ a: Schema.String, b: Schema.Number })

// v3: struct.pipe(Schema.partial)
const withUndefined = struct.mapFields(Struct.map(Schema.optional))

// v3: struct.pipe(Schema.partialWith({ exact: true }))
const exact = struct.mapFields(Struct.map(Schema.optionalKey))
```

You can also make a subset of fields partial:

```ts
import { Schema, Struct } from "effect"

const schema = Schema.Struct({ a: Schema.String, b: Schema.Number })
  .mapFields(Struct.mapPick(["a"], Schema.optional))
```

### required

**Migration: semi-auto**

**New imports:** `Struct`

- `Schema.requiredKey`: makes `optionalKey` fields required; makes `optional` fields required as `T | undefined`
- `Schema.required`: makes `optional` fields required (removes `undefined`)

```ts
import { Schema, Struct } from "effect"

const original = Schema.Struct({
  a: Schema.optionalKey(Schema.String),
  b: Schema.optionalKey(Schema.Number)
})

// v3: Schema.required(original)
const schema = original.mapFields(Struct.map(Schema.requiredKey))
// { readonly a: string; readonly b: number; }
```

### optional field transformations

**Migration: manual**

**New imports:** `SchemaGetter`

`optionalToOptional`, `optionalToRequired`, and `requiredToOptional` are all replaced by `Schema.decodeTo` + `SchemaGetter.transformOptional`.

The pattern: start with the encoded optionality (`optionalKey` or required), pipe to `decodeTo` with the decoded optionality, and provide `transformOptional` functions for decode/encode.

**Example** (v3 `optionalToRequired`: setting `null` as default for missing field)

v3

```ts
import { Option, Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalToRequired(Schema.String, Schema.NullOr(Schema.String), {
    decode: Option.getOrElse(() => null),
    encode: Option.liftPredicate((value) => value !== null)
  })
})
```

v4

```ts
import { Option, Schema, SchemaGetter } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalKey(Schema.String).pipe(
    Schema.decodeTo(Schema.NullOr(Schema.String), {
      decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== null))
    })
  )
})
```

**Example** (v3 `requiredToOptional`: empty string as missing value)

v3

```ts
import { Option, Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.requiredToOptional(Schema.String, Schema.String, {
    decode: Option.liftPredicate((s) => s !== ""),
    encode: Option.getOrElse(() => "")
  })
})
```

v4

```ts
import { Option, Schema, SchemaGetter } from "effect"

const schema = Schema.Struct({
  a: Schema.String.pipe(
    Schema.decodeTo(Schema.optionalKey(Schema.String), {
      decode: SchemaGetter.transformOptional(Option.filter((value) => value !== "")),
      encode: SchemaGetter.transformOptional(Option.orElseSome(() => ""))
    })
  )
})
```

### optionalWith

**Migration: manual**

**New imports:** `SchemaGetter`, `Predicate` (for nullable variants)

#### Decision tree

| v3 options                                 | v4 pattern                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `{ exact: true }`                          | `optionalKey(schema)`                                                   |
| `{ default }`                              | `schema.pipe(withDecodingDefaultType(...))`                             |
| `{ exact: true, default }`                 | `schema.pipe(withDecodingDefaultTypeKey(...))`                          |
| `{ nullable: true }`                       | `optional(NullOr(schema))` + `decodeTo` + filter null                   |
| `{ nullable: true, exact: true }`          | `optionalKey(NullOr(schema))` + `decodeTo` + filter null                |
| `{ nullable: true, default }`              | `optional(NullOr(schema))` + `decodeTo` + filter null + `orElseSome`    |
| `{ nullable: true, exact: true, default }` | `optionalKey(NullOr(schema))` + `decodeTo` + filter null + `orElseSome` |

Key rules:

- `exact: true` → use `optionalKey` instead of `optional`
- `nullable: true` → wrap inner schema in `NullOr` and filter nulls via `Option.filter(Predicate.isNotNull)`
- `default` → use `withDecodingDefaultType` (or `withDecodingDefaultTypeKey` with `exact: true`)

#### Example: `{ exact: true }` (simplest case)

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalWith(Schema.NumberFromString, { exact: true })
})
```

v4

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalKey(Schema.NumberFromString)
})
```

#### Example: `{ default }`

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalWith(Schema.String, { default: () => "" })
})
```

v4

```ts
import { Effect, Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("")))
})
```

#### Example: `{ exact: true, default }`

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalWith(Schema.String, { exact: true, default: () => "" })
})
```

v4

```ts
import { Effect, Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.String.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("")))
})
```

#### Example: `{ nullable: true, exact: true, default }` (most complex case)

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalWith(Schema.NumberFromString, { nullable: true, default: () => -1, exact: true })
})
```

v4

```ts
import { Option, Predicate, Schema, SchemaGetter } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalKey(Schema.NullOr(Schema.NumberFromString)).pipe(
    Schema.decodeTo(Schema.Number, {
      decode: SchemaGetter.transformOptional((o) =>
        o.pipe(Option.filter(Predicate.isNotNull), Option.orElseSome(() => -1))
      ),
      encode: SchemaGetter.required()
    })
  )
})
```

### pluck

**Migration: manual**

**New imports:** `SchemaGetter`, `Struct`

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({ a: Schema.String, b: Schema.Number }).pipe(Schema.pluck("a"))
```

v4

```ts
import { Schema, SchemaGetter, Struct } from "effect"

function pluck<P extends PropertyKey>(key: P) {
  return <S extends Schema.Top>(
    schema: Schema.Struct<{ [K in P]: S }>
  ): Schema.decodeTo<Schema.toType<S>, Schema.Struct<{ [K in P]: S }>> => {
    return schema.mapFields(Struct.pick([key])).pipe(
      Schema.decodeTo(Schema.toType(schema.fields[key]), {
        decode: SchemaGetter.transform((whole: any) => whole[key]),
        encode: SchemaGetter.transform((value) => ({ [key]: value } as any))
      })
    )
  }
}

const schema = Schema.Struct({ a: Schema.String, b: Schema.Number }).pipe(pluck("a"))
```

### extend

**Migration: semi-auto**

**New imports:** `Struct` (Struct case), `Tuple` (Union case)

#### Struct extends Struct

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
}).pipe(Schema.extend(Schema.Struct({ c: Schema.Number })))
```

v4

```ts
import { Schema, Struct } from "effect"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
}).mapFields(Struct.assign({ c: Schema.Number }))

// or more succinctly
const schema2 = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
}).pipe(Schema.fieldsAssign({ c: Schema.Number }))
```

#### Union extends Struct

v3

```ts
import { Schema } from "effect"

const schema = Schema.Union(
  Schema.Struct({ a: Schema.String }),
  Schema.Struct({ b: Schema.Number })
).pipe(Schema.extend(Schema.Struct({ c: Schema.Boolean })))
```

v4

```ts
import { Schema, Tuple } from "effect"

const schema = Schema.Union([
  Schema.Struct({ a: Schema.String }),
  Schema.Struct({ b: Schema.Number })
]).mapMembers(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))
```

### filter

**Migration: semi-auto**

v3

```ts
import { Schema } from "effect"

// inline filter
const a = Schema.String.pipe(Schema.filter((s) => s.length > 0))

// refinement
const b = Schema.Option(Schema.String).pipe(Schema.filter(Option.isSome))
```

v4

```ts
import { Option, Schema } from "effect"

// inline filter
const a = Schema.String.check(Schema.makeFilter((s) => s.length > 0))

// refinement
const b = Schema.Option(Schema.String).pipe(Schema.refine(Option.isSome))
```

In v4, a `makeFilter` predicate can return any of the shapes described by `Schema.FilterOutput`:

- `undefined` / `true` — success
- `false` — generic failure
- `string` — failure with that message
- `SchemaIssue.Issue` — a fully-formed issue
- `{ path, issue }` — failure at a nested path (`issue` is a `string` or `SchemaIssue.Issue`)
- `ReadonlyArray<Schema.FilterIssue>` — several failures reported together (empty array = success, single element is unwrapped, otherwise grouped into an `Issue.Composite`)

**Example** (Failure at a nested path)

```ts
import { Schema } from "effect"

const schema = Schema.Struct({ password: Schema.String, confirmPassword: Schema.String }).check(
  Schema.makeFilter((o) =>
    o.password === o.confirmPassword
      ? undefined
      : { path: ["password"], issue: "password and confirmPassword must match" }
  )
)

console.log(String(Schema.decodeUnknownExit(schema)({ password: "123456", confirmPassword: "1234567" })))
// Failure(Cause([Fail(SchemaError: password and confirmPassword must match
//   at ["password"])]))
```

**Example** (Reporting multiple failures at once)

```ts
import { Schema } from "effect"

const schema = Schema.Struct({ a: Schema.Finite, b: Schema.Finite, c: Schema.Finite }).check(
  Schema.makeFilter((o) => {
    const issues: Array<Schema.FilterIssue> = []
    if (o.a > 0) {
      if (o.b <= 0) issues.push({ path: ["b"], issue: "b must be greater than 0" })
      if (o.c <= 0) issues.push({ path: ["c"], issue: "c must be greater than 0" })
    }
    return issues
  })
)

console.log(String(Schema.decodeUnknownExit(schema)({ a: 1, b: 0, c: 0 })))
// Failure(Cause([Fail(SchemaError: b must be greater than 0
//   at ["b"]
// c must be greater than 0
//   at ["c"])]))
```

### filterEffect

**Migration: manual**

**New imports:** `SchemaGetter`, `Result`

v3

```ts
import { Effect, Schema } from "effect"

async function validateUsername(username: string) {
  return Promise.resolve(username === "gcanti")
}

const ValidUsername = Schema.String.pipe(
  Schema.filterEffect((username) =>
    Effect.promise(() => validateUsername(username).then((valid) => valid || "Invalid username"))
  )
)
```

v4

```ts
import { Effect, Result, Schema, SchemaGetter } from "effect"

async function validateUsername(username: string) {
  return Promise.resolve(username === "gcanti")
}

const ValidUsername = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.checkEffect((username) =>
      Effect.promise(() => validateUsername(username).then((valid) => valid || "Invalid username"))
    ),
    encode: SchemaGetter.passthrough()
  })
)
```

### transform

**Migration: semi-auto**

**New imports:** `SchemaTransformation`

v3

```ts
import { Schema } from "effect"

const BooleanFromString = Schema.transform(Schema.Literal("on", "off"), Schema.Boolean, {
  strict: true,
  decode: (literal) => literal === "on",
  encode: (bool) => (bool ? "on" : "off")
})
```

v4

```ts
import { Schema, SchemaTransformation } from "effect"

const BooleanFromString = Schema.Literals(["on", "off"]).pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: (literal) => literal === "on",
      encode: (bool) => (bool ? "on" : "off")
    })
  )
)
```

### transformOrFail

**Migration: semi-auto**

**New imports:** `SchemaGetter`, `SchemaIssue`

v3

```ts
import { ParseResult, Schema } from "effect"

const NumberFromString = Schema.transformOrFail(Schema.String, Schema.Number, {
  strict: true,
  decode: (input, _, ast) => {
    const parsed = parseFloat(input)
    if (isNaN(parsed)) {
      return ParseResult.fail(new ParseResult.Type(ast, input, "Failed to convert string to number"))
    }
    return ParseResult.succeed(parsed)
  },
  encode: (input) => ParseResult.succeed(input.toString())
})
```

v4

```ts
import { Effect, Number, Schema, SchemaGetter, SchemaIssue } from "effect"

const NumberFromString = Schema.String.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transformEffect((s) => {
      const n = Number.parse(s)
      if (n === undefined) {
        return Effect.fail(new SchemaIssue.InvalidValue())
      }
      return Effect.succeed(n)
    }),
    encode: SchemaGetter.String()
  })
)
```

### transformLiteral / transformLiterals

**Migration: auto**

v3

```ts
import { Schema } from "effect"

const a = Schema.transformLiteral(0, "a")
const b = Schema.transformLiterals([0, "a"], [1, "b"], [2, "c"])
```

v4

```ts
import { Schema } from "effect"

const a = Schema.Literal(0).transform("a")
const b = Schema.Literals([0, 1, 2]).transform(["a", "b", "c"])
```

### attachPropertySignature

**Migration: semi-auto**

v3

```ts
import { Schema } from "effect"

const Circle = Schema.Struct({ radius: Schema.Number })
const Square = Schema.Struct({ sideLength: Schema.Number })

const DiscriminatedShape = Schema.Union(
  Circle.pipe(Schema.attachPropertySignature("kind", "circle")),
  Square.pipe(Schema.attachPropertySignature("kind", "square"))
)
```

v4

```ts
import { Schema } from "effect"

const Circle = Schema.Struct({ radius: Schema.Number })
const Square = Schema.Struct({ sideLength: Schema.Number })

const DiscriminatedShape = Schema.Union([
  Circle.mapFields((fields) => ({ ...fields, kind: Schema.tagDefaultOmit("circle") })),
  Square.mapFields((fields) => ({ ...fields, kind: Schema.tagDefaultOmit("square") }))
])
```

### decodingFallback

**Migration: auto**

v3

```ts
import { Effect, Schema } from "effect"

const schema = Schema.String.annotations({
  decodingFallback: () => Effect.succeed("a")
})
```

v4

```ts
import { Effect, Schema } from "effect"

const schema = Schema.String.pipe(Schema.catchDecoding(() => Effect.succeedSome("a")))
```

### rename

**Migration: manual**

**New imports:** `SchemaTransformation`

v3

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
}).pipe(Schema.rename({ a: "c" }))
```

v4

```ts
import { Schema } from "effect"

// experimental API
const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
}).pipe(Schema.encodeKeys({ a: "c" }))
```

### Capitalize / Lowercase / Uppercase / Uncapitalize

**Migration: semi-auto**

**New imports:** `SchemaTransformation`

v3

```ts
import { Schema } from "effect"

const schema = Schema.Capitalize
```

v4

```ts
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isCapitalized()), SchemaTransformation.capitalize())
)
```

### NonEmptyTrimmedString

**Migration: semi-auto**

v3

```ts
import { Schema } from "effect"

const schema = Schema.NonEmptyTrimmedString
```

v4

```ts
import { Schema } from "effect"

const schema = Schema.Trimmed.check(Schema.isNonEmpty())
```

### split

**Migration: manual**

**New imports:** `SchemaTransformation`

v3

```ts
import { Schema } from "effect"

const schema = Schema.split(",")
```

v4

```ts
import { Schema, SchemaTransformation } from "effect"

function split(separator: string) {
  return Schema.String.pipe(
    Schema.decodeTo(
      Schema.Array(Schema.String),
      SchemaTransformation.transform({
        decode: (s) => s.split(separator) as ReadonlyArray<string>,
        encode: (as) => as.join(separator)
      })
    )
  )
}
```

## Migrating from the fast-check bridge to native Arbitrary

This section covers migration from the fast-check bridge published in `effect@4.0.0-rc.109` to the native,
Schema-first module at `effect/Arbitrary`.

The new module removes fast-check from the `effect` package. Applications may still install and use fast-check
directly, but Effect Schema generation and `@effect/vitest` property tests no longer depend on it.

For the new API and its semantics, see [Arbitrary in Effect](../packages/effect/ARBITRARY.md).

### Import changes

The following APIs have been removed:

- `effect/testing/FastCheck`;
- `Schema.toArbitrary`;
- `Schema.Arbitrary`;
- the legacy `Schema.Annotations.ToArbitrary` contract and declaration-level `toArbitrary` annotation;
- the legacy `arbitrary` filter annotation;
- raw fast-check arbitrary inputs and `fastCheck` options in `@effect/vitest`.

Import the native module explicitly:

```ts
import * as Arbitrary from "effect/Arbitrary"
```

If other tests still use fast-check-specific APIs, add fast-check as a direct development dependency and import it
from `"fast-check"`. Do not import it through Effect.

### Generating samples

Previously, `Schema.toArbitrary` returned a factory that needed the fast-check module:

```ts
import { Schema } from "effect"
import { FastCheck } from "effect/testing"

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Int
})

const personArbitrary = Schema.toArbitrary(Person)(FastCheck)
const samples = FastCheck.sample(personArbitrary, { numRuns: 20, seed: 42 })
```

Now derive and sample through the Effect-native module:

```ts
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Int
})

const personArbitrary = Arbitrary.schema(Person)
const samples = await Effect.runPromise(
  Arbitrary.sampleEffect(personArbitrary, { count: 20, seed: 42 })
)
```

`Arbitrary.sampleEffect` returns an `Effect` because sampling is interruptible, uses Effect `Random` when no seed is
provided, and reports bounded generation exhaustion as a typed `SampleError`.

The generated values still use the decoded Schema `Type`. The sequence and distribution are not compatible with
fast-check, even when the same numeric seed is used.

### Checking properties

Previously, fast-check owned both the property and the runner:

```ts
import { Schema } from "effect"
import { FastCheck } from "effect/testing"

const integer = Schema.toArbitrary(Schema.Int)(FastCheck)

FastCheck.assert(
  FastCheck.property(integer, (value) => Number.isInteger(value)),
  { numRuns: 100, seed: 42 }
)
```

Now `Arbitrary.checkEffect` runs a pure or Effectful property and returns a structured result:

```ts
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const result = await Effect.runPromise(
  Arbitrary.checkEffect(
    Arbitrary.schema(Schema.Int),
    (value) => Number.isInteger(value),
    { runs: 100, seed: 42 }
  )
)
```

Unlike `FastCheck.assert`, `Arbitrary.checkEffect` does not throw for an ordinary falsification. Handle `Passed`,
`Falsified`, `Exhausted`, and `ReplayMismatch` explicitly, or use `@effect/vitest`, which converts non-passing results
into test failures.

Typed failures from Effectful properties are preserved in `Falsified.failure`. Defects and interruption continue
through the returned Effect.

### Option mapping

The most common options map as follows:

| Previous fast-check option | Native option        | Migration note                                                     |
| -------------------------- | -------------------- | ------------------------------------------------------------------ |
| `numRuns`                  | `count` or `runs`    | Use `count` for `sampleEffect` and `runs` for `checkEffect`.       |
| `seed`                     | `seed`               | The type is compatible, but generated sequences are not.           |
| `path`                     | `replay`             | Existing fast-check paths cannot be converted.                     |
| `maxSkipsPerRun`           | `maxDiscards`        | Native uses one absolute discard budget, not a multiplier per run. |
| `examples`                 | No direct equivalent | Keep explicit regression cases as ordinary tests.                  |
| `endOnFailure`             | `maxShrinks`         | Use `maxShrinks: 0` to stop at the initial failure.                |
| `interruptAfterTimeLimit`  | Effect interruption  | Apply an Effect or test timeout around the check.                  |
| `skipAllAfterTimeLimit`    | No direct equivalent | Prefer explicit run and discard bounds.                            |
| `verbose`                  | No direct equivalent | Inspect `CheckResult` or use `@effect/vitest` failure output.      |

Review any less common fast-check runner option manually. The native API deliberately does not reproduce the complete
`fc.Parameters` surface.

### Replay migration

Fast-check replay used a seed plus a shrink `path`. Native replay uses one opaque token returned by a `Falsified`
result:

```ts
const replayed = Arbitrary.checkEffect(arbitrary, property, {
  replay: previousFailure.replay
})
```

There is no conversion from a fast-check seed and path to a native replay token. Re-run the property with the native
engine, then record the new token from its `Falsified` result.

Replay tokens are intended for reproducing and diagnosing a current failure. Because the module is unstable, they are
not guaranteed to survive upgrades. Preserve important failing inputs as explicit regression tests.

Array shrinking now tries deleting prefixes and interior blocks as well as suffixes. Products and objects retain child
shrink candidates when exploring other branches. Shrunk outputs and replay paths can therefore differ from earlier
native releases, including RC.115. Re-run affected properties to record new tokens.
For arrays of composed Arbitraries, use `Arbitrary.array(item, { maxLength: 50 })` instead of shrinking a generated
length through `flatMap` and `all`; deletions then preserve the remaining generated elements.

### Migrating declaration annotations

The old `toArbitrary` annotation directly constructed a fast-check arbitrary and exposed fast-check recursion and
constraint details:

```ts
import { Schema } from "effect"

class UserId {
  readonly value: number
  constructor(value: number) {
    this.value = value
  }
}

const UserIdSchema = Schema.instanceOf(UserId, {
  toArbitrary: () => (fc) => fc.integer({ min: 1, max: 1_000_000 }).map((value) => new UserId(value))
})
```

The native `toCodecArbitrary` annotation describes a generatable representation as a Schema `Link`:

```ts
import { Schema, SchemaTransformation } from "effect"

class UserId {
  readonly value: number
  constructor(value: number) {
    this.value = value
  }
}

const UserIdSchema = Schema.instanceOf(UserId, {
  toCodecArbitrary: () =>
    Schema.link<UserId>()(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      SchemaTransformation.transform({
        decode: (value) => new UserId(value),
        encode: (id) => id.value
      })
    )
})
```

Before adding `toCodecArbitrary`, check whether the declaration already has a useful `toCodecJson` or `toCodec`.
Native derivation falls back to those canonical codecs automatically. Add an arbitrary-specific Link only when the
canonical representation is opaque or generates valid values too rarely.

The migration changes where generation logic lives:

| Legacy contract                                | Native contract                                                |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Returns a `fast-check.Arbitrary`               | Returns a `SchemaAST.Link` through `Schema.link`.              |
| Receives generated arbitrary type parameters   | Receives decoded Schema type parameters.                       |
| Receives fast-check constraints and recursion  | Receives normalized constraints.                               |
| Manages terminal recursive branches explicitly | Leaves recursion analysis and budgets to the native compiler.  |
| Uses arbitrary combinators                     | Uses Schema constructors, checks, and a Schema transformation. |

The original declaration remains authoritative. Values decoded by the Link are checked against it. Failed decodes and
rejected values become bounded discards.

#### Custom filter metadata

The old `arbitrary` filter annotation has been replaced by `arbitraryConstraint`. Ordinary custom filters continue to
work as residual filters without generation metadata:

```ts
import { Schema } from "effect"

const Even = Schema.Int.check(
  Schema.makeFilter((value) => value % 2 === 0)
)
```

Residual filtering is bounded, so a very selective or impossible predicate may produce `SampleError` or `Exhausted`.

If the previous annotation supplied a recognized constructive constraint, move it to `arbitraryConstraint` and adapt
its shape. The predicate remains authoritative:

```ts
import { Order, Schema } from "effect"

const Positive = Schema.Number.check(
  Schema.makeFilter(
    (value) => value > 0,
    {
      arbitraryConstraint: {
        order: Order.Number,
        minimum: 0,
        exclusiveMinimum: true
      }
    }
  )
)
```

The main constraint-shape changes are:

| Previous field                       | Native field                                                        |
| ------------------------------------ | ------------------------------------------------------------------- |
| `ordered.order`                      | `order`                                                             |
| `ordered.minimum` / `maximum`        | `minimum` / `maximum`                                               |
| `ordered.exclusiveMinimum` / maximum | `exclusiveMinimum: true` / `exclusiveMaximum: true`                 |
| `integer: true`                      | `number: "integer"`                                                 |
| `noNaN` and `noInfinity`             | `number: "finite"` when both restrictions apply                     |
| collection `minLength` / `maxLength` | `minLength`, `minSize`, or `minProperties` and its matching maximum |
| string pattern                       | `{ source, flags }` in `patterns`                                   |
| `unique: true`                       | `uniqueBy: identity`                                                |
| `candidate`                          | No direct equivalent                                                |

Choose the cardinality field that matches the Schema domain: `minLength` and `maxLength` for strings and arrays,
`minSize` and `maxSize` for sized collections, and `minProperties` and `maxProperties` for object properties.

For an opaque declaration that needs a reusable statistically better source domain, express that source as a Schema
Link with `toCodecArbitrary`.

### Migrating `@effect/vitest`

Property inputs may be Schemas, native Arbitraries, or mixtures of both.

Schema-only properties need only an option rename:

```ts
// Before
it.prop(
  "commutative",
  [Schema.Int, Schema.Int],
  ([a, b]) => a + b === b + a,
  { fastCheck: { numRuns: 200, seed: 42 } }
)

// After
it.prop(
  "commutative",
  [Schema.Int, Schema.Int],
  ([a, b]) => a + b === b + a,
  { arbitrary: { runs: 200, seed: 42 } }
)
```

Raw or mixed fast-check inputs are no longer accepted:

```ts
// No longer supported
it.prop("raw arbitrary", [fc.integer()], ([value]) => Number.isInteger(value))
it.prop("mixed", [Schema.String, fc.integer()], ([text, value]) => true)
```

Replace those inputs with Schemas when they describe a domain supported by Schema, or compose a native Arbitrary:

```ts
import * as Arbitrary from "effect/Arbitrary"

const integer = Arbitrary.schema(Schema.Int)

it.prop("native arbitrary", [integer], ([value]) => Number.isInteger(value))
it.prop("mixed", [Schema.String, integer], ([text, value]) => typeof text === "string" && Number.isInteger(value))
```

If a test genuinely needs a fast-check-specific arbitrary or runner feature, use fast-check directly with Vitest
rather than passing it through `@effect/vitest`.

`it.prop`, `it.effect.prop`, and `it.live.prop` all accept native check options under `arbitrary`.

### Behavioral differences to review

Migration is not only an import rename. Review the following differences:

- native generation and shrinking have different distributions and may find different shrunk inputs;
- native checking returns structured results instead of using fast-check's assertion exceptions;
- generation that cannot find enough valid samples is bounded and reports `SampleError` or `Exhausted`;
- pure and Effectful properties share one interruptible runner;
- recursive and mutually recursive Schemas are analyzed as a graph and must have a finite generation path;
- replay tokens, seeds, and shrink paths are not compatible with fast-check;
- generated values are the decoded Schema `Type`;
- properties must not mutate generated values.

### Migration checklist

1. Replace `effect/testing/FastCheck` imports. Use the native Arbitrary module for Schema generation and import
   `"fast-check"` directly only where it is still independently required.
2. Replace `Schema.toArbitrary(schema)(FastCheck)` with `Arbitrary.schema(schema)`.
3. Replace `FastCheck.sample` with `Arbitrary.sampleEffect` and run the returned Effect.
4. Replace `FastCheck.check` or `FastCheck.assert` for Schema-derived inputs with `Arbitrary.checkEffect`, then handle its
   structured result.
5. Rename `@effect/vitest` options from `fastCheck` to `arbitrary` and convert `numRuns` to `runs`.
6. Replace raw fast-check inputs in `@effect/vitest` with Schemas or native Arbitraries.
7. Migrate declaration-level `toArbitrary` callbacks to the `toCodecArbitrary` Link-returning contract and replace old
   filter-level `arbitrary` annotations with `arbitraryConstraint`.
8. Re-run properties with the native engine and record new replay tokens or explicit regression examples.
9. Review discard limits for selective custom filters.
