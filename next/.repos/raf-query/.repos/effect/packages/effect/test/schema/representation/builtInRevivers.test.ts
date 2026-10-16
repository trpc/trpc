import { assert, describe, it } from "@effect/vitest"
import { Formatter, Schema, type SchemaAST, SchemaRepresentation } from "effect"
import { throws } from "../../utils/assert.ts"

function assertFilterReviver<T>(input: {
  readonly schema: Schema.Codec<T>
  readonly id: string
  readonly payload: Schema.Json
  readonly schemas?: ReadonlyArray<SchemaAST.AST>
  readonly reviver: SchemaRepresentation.FilterReviver<any>
  readonly dependencies?: ReadonlyArray<SchemaRepresentation.AnyReviver>
  readonly valid: unknown
  readonly invalid: unknown
  readonly hasToJsonSchema?: boolean
}): void {
  const check = input.schema.ast.checks?.at(-1)
  assert.isDefined(check)
  assert.strictEqual(check._tag, "Filter")
  if (check._tag !== "Filter") return
  assert.deepStrictEqual(check.annotations?.representation, {
    id: input.id,
    payload: input.payload,
    ...(input.schemas === undefined ? undefined : { schemas: input.schemas })
  })

  const document = SchemaRepresentation.toRepresentation(input.schema.ast)
  const json = SchemaRepresentation.toJson(document)
  const revived = SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(json), {
    revivers: [input.reviver, ...(input.dependencies ?? [])]
  }) as Schema.Codec<unknown>

  assert.strictEqual(Schema.decodeUnknownResult(revived)(input.valid)._tag, "Success")
  assert.strictEqual(Schema.decodeUnknownResult(revived)(input.invalid)._tag, "Failure")
  assert.deepStrictEqual(
    SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(revived.ast)),
    json
  )
  const revivedCheck = revived.ast.checks?.at(-1)
  assert.isDefined(revivedCheck)
  assert.strictEqual(revivedCheck._tag, "Filter")
  if (revivedCheck._tag !== "Filter") return
  assert.strictEqual(revivedCheck.annotations?.representation?.id, input.id)
  assert.strictEqual(
    typeof revivedCheck.annotations?.toJsonSchema,
    input.hasToJsonSchema === false ? "undefined" : "function"
  )
  assert.strictEqual(typeof revivedCheck.annotations?.toCode, "function")
}

function assertDeclarationReviver(input: {
  readonly schema: Schema.Top
  readonly id: string
  readonly payload: Schema.Json
  readonly reviver: SchemaRepresentation.DeclarationReviver<any>
  readonly dependencies?: ReadonlyArray<SchemaRepresentation.AnyReviver>
}): void {
  const representation = input.schema.ast.annotations?.representation
  assert.deepStrictEqual(representation, {
    id: input.id,
    payload: input.payload
  })

  const document = SchemaRepresentation.toRepresentation(input.schema.ast)
  const json = SchemaRepresentation.toJson(document)
  const revived = SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(json), {
    revivers: [input.reviver, ...(input.dependencies ?? [])]
  })

  assert.deepStrictEqual(
    SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(revived.ast)),
    json
  )
  assert.strictEqual(
    (revived.ast.annotations?.representation as { readonly id?: string } | undefined)?.id,
    input.id
  )
  assert.strictEqual(typeof revived.ast.annotations?.toCode, "function")
}

describe("SchemaRepresentation built-in string revivers", () => {
  it("revives isStringFinite", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isStringFinite()),
      id: "effect/schema/isStringFinite",
      payload: null,
      reviver: SchemaRepresentation.isStringFiniteReviver,
      valid: "1.5",
      invalid: "Infinity"
    })
  })

  it("revives isStringBigInt", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isStringBigInt()),
      id: "effect/schema/isStringBigInt",
      payload: null,
      reviver: SchemaRepresentation.isStringBigIntReviver,
      valid: "-10",
      invalid: "1.5"
    })
  })

  it("revives isStringSymbol", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isStringSymbol()),
      id: "effect/schema/isStringSymbol",
      payload: null,
      reviver: SchemaRepresentation.isStringSymbolReviver,
      valid: "Symbol(shared)",
      invalid: "shared"
    })
  })

  it("revives isMinLength", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isMinLength(1.8)),
      id: "effect/schema/isMinLength",
      payload: { minLength: 1 },
      reviver: SchemaRepresentation.isMinLengthReviver,
      valid: "a",
      invalid: ""
    })
  })

  it("revives isMaxLength", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isMaxLength(3.8)),
      id: "effect/schema/isMaxLength",
      payload: { maxLength: 3 },
      reviver: SchemaRepresentation.isMaxLengthReviver,
      valid: "abc",
      invalid: "abcd"
    })
  })

  it("revives isBetweenLength", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isBetweenLength(1.8, 3.8)),
      id: "effect/schema/isBetweenLength",
      payload: { minimum: 1, maximum: 3 },
      reviver: SchemaRepresentation.isBetweenLengthReviver,
      valid: "ab",
      invalid: ""
    })
  })

  it("revives isPattern", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isPattern(/^a+$/i)),
      id: "effect/schema/isPattern",
      payload: { source: "^a+$", flags: "i" },
      reviver: SchemaRepresentation.isPatternReviver,
      valid: "AAA",
      invalid: "bbb"
    })
  })

  it("revives isMinCodePoints", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isMinCodePoints(2.8)),
      id: "effect/schema/isMinCodePoints",
      payload: { minCodePoints: 2 },
      reviver: SchemaRepresentation.isMinCodePointsReviver,
      valid: "😀a",
      invalid: "😀"
    })
  })

  it("revives isMaxCodePoints", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isMaxCodePoints(1.8)),
      id: "effect/schema/isMaxCodePoints",
      payload: { maxCodePoints: 1 },
      reviver: SchemaRepresentation.isMaxCodePointsReviver,
      valid: "😀",
      invalid: "😀a"
    })
  })

  it("revives isBetweenCodePoints", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isBetweenCodePoints(1.8, 1.8)),
      id: "effect/schema/isBetweenCodePoints",
      payload: { minimum: 1, maximum: 1 },
      reviver: SchemaRepresentation.isBetweenCodePointsReviver,
      valid: "😀",
      invalid: "😀a"
    })
  })

  it("revives isTrimmed", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isTrimmed()),
      id: "effect/schema/isTrimmed",
      payload: null,
      reviver: SchemaRepresentation.isTrimmedReviver,
      valid: "text",
      invalid: " text "
    })
  })

  it("revives isUUID", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isUUID(4)),
      id: "effect/schema/isUUID",
      payload: { version: 4 },
      reviver: SchemaRepresentation.isUUIDReviver,
      valid: "123e4567-e89b-42d3-a456-426614174000",
      invalid: "123e4567-e89b-12d3-a456-426614174000"
    })
  })

  it("revives isGUID", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isGUID()),
      id: "effect/schema/isGUID",
      payload: null,
      reviver: SchemaRepresentation.isGUIDReviver,
      valid: "123e4567-e89b-12d3-a456-426614174000",
      invalid: "not-a-guid"
    })
  })

  it("revives isULID", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isULID()),
      id: "effect/schema/isULID",
      payload: null,
      reviver: SchemaRepresentation.isULIDReviver,
      valid: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      invalid: "not-a-ulid"
    })
  })

  it("revives isBase64", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isBase64()),
      id: "effect/schema/isBase64",
      payload: null,
      reviver: SchemaRepresentation.isBase64Reviver,
      valid: "YQ==",
      invalid: "?"
    })
  })

  it("revives isBase64Url", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isBase64Url()),
      id: "effect/schema/isBase64Url",
      payload: null,
      reviver: SchemaRepresentation.isBase64UrlReviver,
      valid: "YQ",
      invalid: "?"
    })
  })

  it("revives isStartingWith", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isStartingWith("pre")),
      id: "effect/schema/isStartingWith",
      payload: { startsWith: "pre" },
      reviver: SchemaRepresentation.isStartingWithReviver,
      valid: "prefix",
      invalid: "suffix"
    })
  })

  it("revives isEndingWith", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isEndingWith("end")),
      id: "effect/schema/isEndingWith",
      payload: { endsWith: "end" },
      reviver: SchemaRepresentation.isEndingWithReviver,
      valid: "weekend",
      invalid: "ending"
    })
  })

  it("revives isIncluding", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isIncluding("mid")),
      id: "effect/schema/isIncluding",
      payload: { includes: "mid" },
      reviver: SchemaRepresentation.isIncludingReviver,
      valid: "middle",
      invalid: "outside"
    })
  })

  it("revives isUppercased", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isUppercased()),
      id: "effect/schema/isUppercased",
      payload: null,
      reviver: SchemaRepresentation.isUppercasedReviver,
      valid: "ABC1",
      invalid: "Abc"
    })
  })

  it("revives isLowercased", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isLowercased()),
      id: "effect/schema/isLowercased",
      payload: null,
      reviver: SchemaRepresentation.isLowercasedReviver,
      valid: "abc1",
      invalid: "Abc"
    })
  })

  it("revives isCapitalized", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isCapitalized()),
      id: "effect/schema/isCapitalized",
      payload: null,
      reviver: SchemaRepresentation.isCapitalizedReviver,
      valid: "Hello",
      invalid: "hello"
    })
  })

  it("revives isUncapitalized", () => {
    assertFilterReviver({
      schema: Schema.String.check(Schema.isUncapitalized()),
      id: "effect/schema/isUncapitalized",
      payload: null,
      reviver: SchemaRepresentation.isUncapitalizedReviver,
      valid: "hello",
      invalid: "Hello"
    })
  })
})

function expectInvalidPayload(json: Schema.Json, reviver: SchemaRepresentation.AnyReviver): void {
  const path = Formatter.formatPath([
    "representation",
    "checks",
    0,
    "representation",
    "payload"
  ])
  throws(
    () => SchemaRepresentation.fromRepresentation(SchemaRepresentation.fromJson(json), { revivers: [reviver] }),
    `Invalid representation payload for ${reviver.id}\n  at ${path}`
  )
}

describe("SchemaRepresentation built-in number revivers", () => {
  it("revives isFinite", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isFinite()),
      id: "effect/schema/isFinite",
      payload: null,
      reviver: SchemaRepresentation.isFiniteReviver,
      valid: 1,
      invalid: Number.POSITIVE_INFINITY
    })
  })

  it("revives isInt", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isInt()),
      id: "effect/schema/isInt",
      payload: null,
      reviver: SchemaRepresentation.isIntReviver,
      valid: 1,
      invalid: 1.5
    })
  })

  it("revives isMultipleOf", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isMultipleOf(3)),
      id: "effect/schema/isMultipleOf",
      payload: { divisor: 3 },
      reviver: SchemaRepresentation.isMultipleOfReviver,
      valid: 6,
      invalid: 7
    })
  })

  it("revives isGreaterThan", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isGreaterThan(1)),
      id: "effect/schema/isGreaterThan",
      payload: { exclusiveMinimum: 1 },
      reviver: SchemaRepresentation.isGreaterThanReviver,
      valid: 2,
      invalid: 1
    })
  })

  it("revives isGreaterThanOrEqualTo", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isGreaterThanOrEqualTo(1)),
      id: "effect/schema/isGreaterThanOrEqualTo",
      payload: { minimum: 1 },
      reviver: SchemaRepresentation.isGreaterThanOrEqualToReviver,
      valid: 1,
      invalid: 0
    })
  })

  it("revives isLessThan", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isLessThan(2)),
      id: "effect/schema/isLessThan",
      payload: { exclusiveMaximum: 2 },
      reviver: SchemaRepresentation.isLessThanReviver,
      valid: 1,
      invalid: 2
    })
  })

  it("revives isLessThanOrEqualTo", () => {
    assertFilterReviver({
      schema: Schema.Number.check(Schema.isLessThanOrEqualTo(2)),
      id: "effect/schema/isLessThanOrEqualTo",
      payload: { maximum: 2 },
      reviver: SchemaRepresentation.isLessThanOrEqualToReviver,
      valid: 2,
      invalid: 3
    })
  })

  it("revives isBetween", () => {
    assertFilterReviver({
      schema: Schema.Number.check(
        Schema.isBetween({ minimum: 1, maximum: 3, exclusiveMinimum: true })
      ),
      id: "effect/schema/isBetween",
      payload: { minimum: 1, maximum: 3, exclusiveMinimum: true },
      reviver: SchemaRepresentation.isBetweenReviver,
      valid: 2,
      invalid: 1
    })
  })

  it("normalizes isBetween flags", () => {
    const check = Schema.isBetween({
      minimum: 1,
      maximum: 3,
      exclusiveMinimum: false,
      exclusiveMaximum: true
    })

    assert.deepStrictEqual(check.annotations?.representation, {
      id: "effect/schema/isBetween",
      payload: { minimum: 1, maximum: 3, exclusiveMaximum: true }
    })
  })

  it("rejects a non-numeric isMultipleOf payload", () => {
    const json = SchemaRepresentation.toJson(
      SchemaRepresentation.toRepresentation(Schema.Number.check(Schema.isMultipleOf(2)).ast)
    ) as any
    json.representation.checks[0].representation.payload.divisor = "2"

    expectInvalidPayload(json, SchemaRepresentation.isMultipleOfReviver)
  })

  it("rejects a non-canonical isBetween payload", () => {
    const json = SchemaRepresentation.toJson(
      SchemaRepresentation.toRepresentation(
        Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 3 })).ast
      )
    ) as any
    json.representation.checks[0].representation.payload.exclusiveMinimum = false

    expectInvalidPayload(json, SchemaRepresentation.isBetweenReviver)
  })
})

describe("SchemaRepresentation built-in BigInt revivers", () => {
  it("revives isGreaterThanBigInt", () => {
    assertFilterReviver({
      schema: Schema.BigInt.check(Schema.isGreaterThanBigInt(10n)),
      id: "effect/schema/isGreaterThanBigInt",
      payload: { exclusiveMinimum: "10" },
      reviver: SchemaRepresentation.isGreaterThanBigIntReviver,
      valid: 11n,
      invalid: 10n
    })
  })

  it("revives isGreaterThanOrEqualToBigInt", () => {
    assertFilterReviver({
      schema: Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(10n)),
      id: "effect/schema/isGreaterThanOrEqualToBigInt",
      payload: { minimum: "10" },
      reviver: SchemaRepresentation.isGreaterThanOrEqualToBigIntReviver,
      valid: 10n,
      invalid: 9n
    })
  })

  it("revives isLessThanBigInt", () => {
    assertFilterReviver({
      schema: Schema.BigInt.check(Schema.isLessThanBigInt(10n)),
      id: "effect/schema/isLessThanBigInt",
      payload: { exclusiveMaximum: "10" },
      reviver: SchemaRepresentation.isLessThanBigIntReviver,
      valid: 9n,
      invalid: 10n
    })
  })

  it("revives isLessThanOrEqualToBigInt", () => {
    assertFilterReviver({
      schema: Schema.BigInt.check(Schema.isLessThanOrEqualToBigInt(10n)),
      id: "effect/schema/isLessThanOrEqualToBigInt",
      payload: { maximum: "10" },
      reviver: SchemaRepresentation.isLessThanOrEqualToBigIntReviver,
      valid: 10n,
      invalid: 11n
    })
  })

  it("revives isBetweenBigInt", () => {
    assertFilterReviver({
      schema: Schema.BigInt.check(
        Schema.isBetweenBigInt({ minimum: -10n, maximum: 10n, exclusiveMaximum: true })
      ),
      id: "effect/schema/isBetweenBigInt",
      payload: { minimum: "-10", maximum: "10", exclusiveMaximum: true },
      reviver: SchemaRepresentation.isBetweenBigIntReviver,
      valid: 0n,
      invalid: 10n
    })
  })

  it("persists large bounds as canonical decimal strings", () => {
    const value = 900719925474099312345678901234567890n
    assert.deepStrictEqual(Schema.isGreaterThanBigInt(value).annotations?.representation, {
      id: "effect/schema/isGreaterThanBigInt",
      payload: { exclusiveMinimum: "900719925474099312345678901234567890" }
    })
  })

  it("normalizes isBetweenBigInt flags", () => {
    assert.deepStrictEqual(
      Schema.isBetweenBigInt({
        minimum: -1n,
        maximum: 1n,
        exclusiveMinimum: false,
        exclusiveMaximum: true
      }).annotations?.representation,
      {
        id: "effect/schema/isBetweenBigInt",
        payload: { minimum: "-1", maximum: "1", exclusiveMaximum: true }
      }
    )
  })
})

function date(millis: number): Date {
  return new globalThis.Date(millis)
}

const epoch = "1970-01-01T00:00:00.000Z"

describe("SchemaRepresentation built-in Date revivers", () => {
  it("revives isGreaterThanDate", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isGreaterThanDate(date(0))),
      id: "effect/schema/isGreaterThanDate",
      payload: { exclusiveMinimum: epoch },
      reviver: SchemaRepresentation.isGreaterThanDateReviver,
      valid: date(1),
      invalid: date(0)
    })
  })

  it("revives isGreaterThanOrEqualToDate", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isGreaterThanOrEqualToDate(date(0))),
      id: "effect/schema/isGreaterThanOrEqualToDate",
      payload: { minimum: epoch },
      reviver: SchemaRepresentation.isGreaterThanOrEqualToDateReviver,
      valid: date(0),
      invalid: date(-1)
    })
  })

  it("revives isLessThanDate", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isLessThanDate(date(0))),
      id: "effect/schema/isLessThanDate",
      payload: { exclusiveMaximum: epoch },
      reviver: SchemaRepresentation.isLessThanDateReviver,
      valid: date(-1),
      invalid: date(0)
    })
  })

  it("revives isLessThanOrEqualToDate", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isLessThanOrEqualToDate(date(0))),
      id: "effect/schema/isLessThanOrEqualToDate",
      payload: { maximum: epoch },
      reviver: SchemaRepresentation.isLessThanOrEqualToDateReviver,
      valid: date(0),
      invalid: date(1)
    })
  })

  it("revives isBetweenDate", () => {
    assertFilterReviver({
      schema: Schema.Any.check(
        Schema.isBetweenDate({ minimum: date(0), maximum: date(2), exclusiveMaximum: true })
      ),
      id: "effect/schema/isBetweenDate",
      payload: {
        minimum: epoch,
        maximum: "1970-01-01T00:00:00.002Z",
        exclusiveMaximum: true
      },
      reviver: SchemaRepresentation.isBetweenDateReviver,
      valid: date(1),
      invalid: date(2)
    })
  })

  it("persists millisecond precision", () => {
    assert.deepStrictEqual(Schema.isGreaterThanDate(date(123)).annotations?.representation, {
      id: "effect/schema/isGreaterThanDate",
      payload: { exclusiveMinimum: "1970-01-01T00:00:00.123Z" }
    })
  })

  it("normalizes isBetweenDate flags", () => {
    assert.deepStrictEqual(
      Schema.isBetweenDate({
        minimum: date(-1),
        maximum: date(1),
        exclusiveMinimum: false,
        exclusiveMaximum: true
      }).annotations?.representation,
      {
        id: "effect/schema/isBetweenDate",
        payload: {
          minimum: "1969-12-31T23:59:59.999Z",
          maximum: "1970-01-01T00:00:00.001Z",
          exclusiveMaximum: true
        }
      }
    )
  })
})

describe("SchemaRepresentation built-in collection revivers", () => {
  it("revives isMinSize", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isMinSize(2)),
      id: "effect/schema/isMinSize",
      payload: { minSize: 2 },
      reviver: SchemaRepresentation.isMinSizeReviver,
      valid: new Set([1, 2]),
      invalid: new Set([1])
    })
  })

  it("revives isMaxSize", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isMaxSize(1)),
      id: "effect/schema/isMaxSize",
      payload: { maxSize: 1 },
      reviver: SchemaRepresentation.isMaxSizeReviver,
      valid: new Set([1]),
      invalid: new Set([1, 2])
    })
  })

  it("revives isBetweenSize", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isBetweenSize(1, 2)),
      id: "effect/schema/isBetweenSize",
      payload: { minimum: 1, maximum: 2 },
      reviver: SchemaRepresentation.isBetweenSizeReviver,
      valid: new Set([1]),
      invalid: new Set()
    })
  })

  it("revives isUnique", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isUnique()),
      id: "effect/schema/isUnique",
      payload: null,
      reviver: SchemaRepresentation.isUniqueReviver,
      valid: [1, 2],
      invalid: [1, 1]
    })
  })

  it("revives isUniqueKey", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isUniqueKey()),
      id: "effect/schema/isUniqueKey",
      payload: null,
      reviver: SchemaRepresentation.isUniqueKeyReviver,
      valid: [["a", 1], ["b", 1]],
      invalid: [["a", 1], ["a", 2]],
      hasToJsonSchema: false
    })
  })

  it("normalizes isMinSize", () => {
    assert.deepStrictEqual(Schema.isMinSize(-1).annotations?.representation, {
      id: "effect/schema/isMinSize",
      payload: { minSize: 0 }
    })
  })

  it("normalizes isMaxSize", () => {
    assert.deepStrictEqual(Schema.isMaxSize(2.9).annotations?.representation, {
      id: "effect/schema/isMaxSize",
      payload: { maxSize: 2 }
    })
  })

  it("normalizes isBetweenSize", () => {
    assert.deepStrictEqual(Schema.isBetweenSize(1.9, 3.7).annotations?.representation, {
      id: "effect/schema/isBetweenSize",
      payload: { minimum: 1, maximum: 3 }
    })
  })
})

describe("SchemaRepresentation built-in object revivers", () => {
  it("revives isMinProperties", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isMinProperties(2)),
      id: "effect/schema/isMinProperties",
      payload: { minProperties: 2 },
      reviver: SchemaRepresentation.isMinPropertiesReviver,
      valid: { a: 1, b: 2 },
      invalid: { a: 1 }
    })
  })

  it("revives isMaxProperties", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isMaxProperties(1)),
      id: "effect/schema/isMaxProperties",
      payload: { maxProperties: 1 },
      reviver: SchemaRepresentation.isMaxPropertiesReviver,
      valid: { a: 1 },
      invalid: { a: 1, b: 2 }
    })
  })

  it("revives isBetweenProperties", () => {
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isBetweenProperties(1, 2)),
      id: "effect/schema/isBetweenProperties",
      payload: { minimum: 1, maximum: 2 },
      reviver: SchemaRepresentation.isBetweenPropertiesReviver,
      valid: { a: 1 },
      invalid: {}
    })
  })

  it("revives isPropertyNames", () => {
    const names = Schema.String.check(Schema.isPattern(/^[A-Z]/))
    assertFilterReviver({
      schema: Schema.Any.check(Schema.isPropertyNames(names)),
      id: "effect/schema/isPropertyNames",
      payload: null,
      schemas: [names.ast],
      reviver: SchemaRepresentation.isPropertyNamesReviver,
      dependencies: [SchemaRepresentation.isPatternReviver],
      valid: { Alpha: 1 },
      invalid: { alpha: 1 }
    })
  })

  it("persists the encoded key schema for isPropertyNames", () => {
    const names = Schema.String.check(Schema.isPattern(/^[A-Z]/))
    const check = Schema.isPropertyNames(names)

    assert.deepStrictEqual(check.annotations?.representation, {
      id: "effect/schema/isPropertyNames",
      payload: null,
      schemas: [names.ast]
    })
  })

  it("normalizes isMinProperties", () => {
    assert.deepStrictEqual(Schema.isMinProperties(-1).annotations?.representation, {
      id: "effect/schema/isMinProperties",
      payload: { minProperties: 0 }
    })
  })

  it("normalizes isMaxProperties", () => {
    assert.deepStrictEqual(Schema.isMaxProperties(2.9).annotations?.representation, {
      id: "effect/schema/isMaxProperties",
      payload: { maxProperties: 2 }
    })
  })

  it("normalizes isBetweenProperties", () => {
    assert.deepStrictEqual(Schema.isBetweenProperties(1.9, 3.7).annotations?.representation, {
      id: "effect/schema/isBetweenProperties",
      payload: { minimum: 1, maximum: 3 }
    })
  })
})

describe("SchemaRepresentation built-in declaration revivers", () => {
  it("revives Option", () => {
    assertDeclarationReviver({
      schema: Schema.Option(Schema.String),
      id: "effect/schema/Option",
      payload: null,
      reviver: SchemaRepresentation.OptionReviver
    })
  })

  it("revives Result", () => {
    assertDeclarationReviver({
      schema: Schema.Result(Schema.String, Schema.Number),
      id: "effect/schema/Result",
      payload: null,
      reviver: SchemaRepresentation.ResultReviver
    })
  })

  it("revives Redacted", () => {
    assertDeclarationReviver({
      schema: Schema.Redacted(Schema.String),
      id: "effect/schema/Redacted",
      payload: null,
      reviver: SchemaRepresentation.RedactedReviver
    })
  })

  it("revives CauseReason", () => {
    assertDeclarationReviver({
      schema: Schema.CauseReason(Schema.String, Schema.Number),
      id: "effect/schema/CauseReason",
      payload: null,
      reviver: SchemaRepresentation.CauseReasonReviver
    })
  })

  it("revives Cause", () => {
    assertDeclarationReviver({
      schema: Schema.Cause(Schema.String, Schema.Number),
      id: "effect/schema/Cause",
      payload: null,
      reviver: SchemaRepresentation.CauseReviver
    })
  })

  it("revives Error", () => {
    assertDeclarationReviver({
      schema: Schema.ErrorInstance(),
      id: "effect/schema/Error",
      payload: null,
      reviver: SchemaRepresentation.ErrorInstanceReviver
    })
  })

  it("revives Exit", () => {
    assertDeclarationReviver({
      schema: Schema.Exit(Schema.String, Schema.Number, Schema.Boolean),
      id: "effect/schema/Exit",
      payload: null,
      reviver: SchemaRepresentation.ExitReviver
    })
  })

  it("revives ReadonlyMap", () => {
    assertDeclarationReviver({
      schema: Schema.ReadonlyMap(Schema.String, Schema.Number),
      id: "effect/schema/ReadonlyMap",
      payload: null,
      reviver: SchemaRepresentation.ReadonlyMapReviver
    })
  })

  it("revives HashMap", () => {
    assertDeclarationReviver({
      schema: Schema.HashMap(Schema.String, Schema.Number),
      id: "effect/schema/HashMap",
      payload: null,
      reviver: SchemaRepresentation.HashMapReviver
    })
  })

  it("revives Graph", () => {
    assertDeclarationReviver({
      schema: Schema.Graph("directed", Schema.String, Schema.Number),
      id: "effect/schema/Graph",
      payload: "directed",
      reviver: SchemaRepresentation.GraphReviver
    })
  })

  it("revives ReadonlySet", () => {
    assertDeclarationReviver({
      schema: Schema.ReadonlySet(Schema.String),
      id: "effect/schema/ReadonlySet",
      payload: null,
      reviver: SchemaRepresentation.ReadonlySetReviver
    })
  })

  it("revives HashSet", () => {
    assertDeclarationReviver({
      schema: Schema.HashSet(Schema.String),
      id: "effect/schema/HashSet",
      payload: null,
      reviver: SchemaRepresentation.HashSetReviver
    })
  })

  it("revives Chunk", () => {
    assertDeclarationReviver({
      schema: Schema.Chunk(Schema.String),
      id: "effect/schema/Chunk",
      payload: null,
      reviver: SchemaRepresentation.ChunkReviver
    })
  })

  it("revives RegExp", () => {
    assertDeclarationReviver({
      schema: Schema.RegExp,
      id: "effect/schema/RegExp",
      payload: null,
      reviver: SchemaRepresentation.RegExpReviver
    })
  })

  it("revives URL", () => {
    assertDeclarationReviver({
      schema: Schema.URL,
      id: "effect/schema/URL",
      payload: null,
      reviver: SchemaRepresentation.URLReviver
    })
  })

  it("revives Date", () => {
    assertDeclarationReviver({
      schema: Schema.Date,
      id: "effect/schema/Date",
      payload: null,
      reviver: SchemaRepresentation.DateReviver
    })
  })

  it("revives Duration", () => {
    assertDeclarationReviver({
      schema: Schema.Duration,
      id: "effect/schema/Duration",
      payload: null,
      reviver: SchemaRepresentation.DurationReviver
    })
  })

  it("revives ByteSize", () => {
    assertDeclarationReviver({
      schema: Schema.ByteSize,
      id: "effect/schema/ByteSize",
      payload: null,
      reviver: SchemaRepresentation.ByteSizeReviver
    })
  })

  it("revives BigDecimal", () => {
    assertDeclarationReviver({
      schema: Schema.BigDecimal,
      id: "effect/schema/BigDecimal",
      payload: null,
      reviver: SchemaRepresentation.BigDecimalReviver
    })
  })

  it("revives File", () => {
    assertDeclarationReviver({
      schema: Schema.File,
      id: "effect/schema/File",
      payload: null,
      reviver: SchemaRepresentation.FileReviver
    })
  })

  it("revives FormData", () => {
    assertDeclarationReviver({
      schema: Schema.FormData,
      id: "effect/schema/FormData",
      payload: null,
      reviver: SchemaRepresentation.FormDataReviver
    })
  })

  it("revives URLSearchParams", () => {
    assertDeclarationReviver({
      schema: Schema.URLSearchParams,
      id: "effect/schema/URLSearchParams",
      payload: null,
      reviver: SchemaRepresentation.URLSearchParamsReviver
    })
  })

  it("revives Uint8Array", () => {
    assertDeclarationReviver({
      schema: Schema.Uint8Array,
      id: "effect/schema/Uint8Array",
      payload: null,
      reviver: SchemaRepresentation.Uint8ArrayReviver
    })
  })

  it("revives DateTimeUtc", () => {
    assertDeclarationReviver({
      schema: Schema.DateTimeUtc,
      id: "effect/schema/DateTimeUtc",
      payload: null,
      reviver: SchemaRepresentation.DateTimeUtcReviver
    })
  })

  it("revives TimeZoneOffset", () => {
    assertDeclarationReviver({
      schema: Schema.TimeZoneOffset,
      id: "effect/schema/TimeZoneOffset",
      payload: null,
      reviver: SchemaRepresentation.TimeZoneOffsetReviver
    })
  })

  it("revives TimeZoneNamed", () => {
    assertDeclarationReviver({
      schema: Schema.TimeZoneNamed,
      id: "effect/schema/TimeZoneNamed",
      payload: null,
      reviver: SchemaRepresentation.TimeZoneNamedReviver
    })
  })

  it("revives TimeZone", () => {
    assertDeclarationReviver({
      schema: Schema.TimeZone,
      id: "effect/schema/TimeZone",
      payload: null,
      reviver: SchemaRepresentation.TimeZoneReviver
    })
  })

  it("revives DateTimeZoned", () => {
    assertDeclarationReviver({
      schema: Schema.DateTimeZoned,
      id: "effect/schema/DateTimeZoned",
      payload: null,
      reviver: SchemaRepresentation.DateTimeZonedReviver
    })
  })

  it("revives Json", () => {
    assertDeclarationReviver({
      schema: Schema.Json,
      id: "effect/schema/Json",
      payload: null,
      reviver: SchemaRepresentation.JsonReviver
    })
  })

  it("revives MutableJson", () => {
    assertDeclarationReviver({
      schema: Schema.MutableJson,
      id: "effect/schema/MutableJson",
      payload: null,
      reviver: SchemaRepresentation.MutableJsonReviver
    })
  })

  it("persists Error includeStack", () => {
    assert.deepStrictEqual(Schema.ErrorInstance({ includeStack: true }).ast.annotations?.representation, {
      id: "effect/schema/Error",
      payload: { includeStack: true }
    })
  })

  it("persists Error excludeCause", () => {
    assert.deepStrictEqual(Schema.ErrorInstance({ excludeCause: true }).ast.annotations?.representation, {
      id: "effect/schema/Error",
      payload: { excludeCause: true }
    })
  })

  it("omits disabled Error options", () => {
    assert.deepStrictEqual(
      Schema.ErrorInstance({ includeStack: false, excludeCause: false }).ast.annotations?.representation,
      { id: "effect/schema/Error", payload: null }
    )
  })

  it("persists a Redacted label", () => {
    assert.deepStrictEqual(
      Schema.Redacted(Schema.String, { label: "password" }).ast.annotations?.representation,
      { id: "effect/schema/Redacted", payload: { label: "password" } }
    )
  })

  it("persists Redacted disallowJsonEncode", () => {
    assert.deepStrictEqual(
      Schema.Redacted(Schema.String, { disallowJsonEncode: true }).ast.annotations?.representation,
      { id: "effect/schema/Redacted", payload: { disallowJsonEncode: true } }
    )
  })

  it("omits disabled Redacted options", () => {
    assert.deepStrictEqual(
      Schema.Redacted(Schema.String, {
        label: undefined,
        disallowJsonEncode: false
      }).ast.annotations?.representation,
      { id: "effect/schema/Redacted", payload: null }
    )
  })
})
