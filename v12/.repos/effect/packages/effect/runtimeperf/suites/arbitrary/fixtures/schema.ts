import * as BigDecimal from "effect/BigDecimal"
import * as DateTime from "effect/DateTime"
import type * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import assert from "node:assert/strict"

export interface Tree {
  readonly label: string
  readonly score: Option.Option<number>
  readonly children: ReadonlyArray<Tree>
}

export const makeTreeSchema = (): Schema.Codec<Tree> => {
  const Tree: Schema.Codec<Tree> = Schema.Struct({
    label: Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(12)),
    score: Schema.Option(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
    children: Schema.Array(Schema.suspend(() => Tree)).check(Schema.isMaxLength(3))
  })
  return Tree
}

export const makeConstrainedStringSchema = () => Schema.String.check(Schema.isMinLength(32), Schema.isMaxLength(32))

const optionalInt = Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 })))

export const makeOptionalStructSchema = () =>
  Schema.Struct({
    a: optionalInt,
    b: optionalInt,
    c: optionalInt,
    d: optionalInt,
    e: optionalInt,
    f: optionalInt,
    g: optionalInt,
    h: optionalInt
  })

export const regularExpression = /^(?:a|[B-D]{2}|[0-9]{3}){16}$/

export const makeRegExpSchema = () => Schema.String.check(Schema.isPattern(regularExpression))

export const makeRareFilterSchema = () =>
  Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 255 }),
    Schema.makeFilter((value: number) => value % 16 === 0)
  )

export const makeUniqueArraySchema = () =>
  Schema.UniqueArray(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_023 }))).check(
    Schema.isMinLength(32),
    Schema.isMaxLength(32)
  )

export const makeBigDecimalSchema = () =>
  Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
    minimum: BigDecimal.make(BigInt(1234), 3),
    maximum: BigDecimal.make(BigInt(1236), 3),
    exclusiveMinimum: true,
    exclusiveMaximum: true
  }))

const isBetweenDateTime = Schema.makeIsBetween({ order: DateTime.Order })

export const makeDateTimeUtcSchema = () =>
  Schema.DateTimeUtc.check(isBetweenDateTime({
    minimum: DateTime.makeUnsafe(-1_000_000_000),
    maximum: DateTime.makeUnsafe(1_000_000_000)
  }))

export const makeDateTimeZonedSchema = () =>
  Schema.DateTimeZoned.check(isBetweenDateTime({
    minimum: DateTime.makeZonedUnsafe(-1_000_000_000, { timeZone: "UTC" }),
    maximum: DateTime.makeZonedUnsafe(1_000_000_000, { timeZone: "UTC" })
  }))

const validateTree = Schema.is(makeTreeSchema())

const countTreeNodes = (tree: Tree): number =>
  1 + tree.children.reduce((total, child) => total + countTreeNodes(child), 0)

export const validateTrees = (count: number, minimumNodes: number, maximumNodes: number) => (values: unknown) => {
  assert.ok(Array.isArray(values))
  assert.equal(values.length, count)
  assert.equal(values.every(validateTree), true)
  const nodes = values.reduce((total, tree) => total + countTreeNodes(tree), 0)
  assert.ok(nodes >= minimumNodes && nodes <= maximumNodes)
}

export const validateStrings = (count: number) => (values: unknown) => {
  assert.ok(Array.isArray(values))
  assert.equal(values.length, count)
  assert.equal(values.every((value) => typeof value === "string" && value.length === 32), true)
}

export const validateRegExpValues = (count: number) => (values: unknown) => {
  assert.ok(Array.isArray(values))
  assert.equal(values.length, count)
  assert.equal(
    values.every((value) => typeof value === "string" && regularExpression.test(value)),
    true
  )
}

export const validateRegExpCoverage = (values: unknown) => {
  validateRegExpValues(64)(values)
  assert.ok(Array.isArray(values))
  assert.ok(new Set(values.map((value) => value.length)).size > 1)
  assert.equal(values.some((value) => value.includes("a")), true)
  assert.equal(values.some((value) => /[B-D]{2}/.test(value)), true)
  assert.equal(values.some((value) => /[0-9]{3}/.test(value)), true)
}

export const validateNumbers = (count: number) => (values: unknown) => {
  assert.ok(Array.isArray(values))
  assert.equal(values.length, count)
  assert.equal(values.every((value) => typeof value === "number" && value >= 2 && value <= 4), true)
}

export const validateUint8Arrays = (count: number) => (values: unknown) => {
  assert.ok(Array.isArray(values))
  assert.equal(values.length, count)
  assert.equal(values.every((value) => value instanceof Uint8Array && value.length <= 10), true)
  const bytes = values.reduce((total, value) => total + value.length, 0)
  assert.ok(bytes >= 500 && bytes <= 700)
}

export const validateSchemaValues = (schema: Schema.Top, count: number) => {
  const is = Schema.is(schema)
  return (values: unknown) => {
    assert.ok(Array.isArray(values))
    assert.equal(values.length, count)
    assert.equal(values.every(is), true)
  }
}
