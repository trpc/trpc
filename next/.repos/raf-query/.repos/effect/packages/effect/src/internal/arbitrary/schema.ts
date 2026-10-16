import * as BigDecimal from "../../BigDecimal.ts"
import * as Effect from "../../Effect.ts"
import * as Equal from "../../Equal.ts"
import { identity } from "../../Function.ts"
import * as Hash from "../../Hash.ts"
import * as Option from "../../Option.ts"
import * as Order from "../../Order.ts"
import * as Predicate from "../../Predicate.ts"
import * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as SchemaGetter from "../../SchemaGetter.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalArray from "../array.ts"
import { effectIsExit } from "../effect.ts"
import { errorWithPath } from "../errors.ts"
import * as InternalRecord from "../record.ts"
import { sample as arraySample } from "./array.ts"
import * as BigDecimalArbitrary from "./bigDecimal.ts"
import * as BigIntArbitrary from "./bigInt.ts"
import * as Model from "./model.ts"
import * as Regexp from "./regexp.ts"

type FilterConstraint = Schema.Annotations.ToArbitrary.FilterConstraint<any>
type GenerationConstraint = Schema.Annotations.ToArbitrary.GenerationConstraint<any>

interface Checks {
  readonly constraint: FilterConstraint | undefined
  readonly filters: ReadonlyArray<SchemaAST.Filter<any>>
}

const infinity = Number.POSITIVE_INFINITY
const finiteNumberConstraint: FilterConstraint = { number: "finite" }
const optionMatch = { onFailure: Option.none, onSuccess: Option.some }

const optionComputation = <A, E, R>(self: Effect.Effect<A, E, R>): Model.Computation<Option.Option<A>> => {
  const result = Effect.matchEager(self, optionMatch) as Effect.Effect<Option.Option<A>>
  return effectIsExit(result) && result._tag === "Success" ? result.value : result
}

/** @internal */
export function compileValidator<S extends Schema.Constraint>(
  schema: S
): (value: S["Type"]) => Model.Computation<Option.Option<S["Type"]>> {
  const parse = SchemaParser.run<S["Type"], never>(SchemaAST.toType(schema.ast))
  return (value) => optionComputation(parse(value))
}

function arbitraryError(what: string, path: ReadonlyArray<PropertyKey>) {
  return errorWithPath(`Unable to derive an arbitrary for ${what}`, path)
}

function sumCosts(costs: Iterable<number>): number {
  let out = 0
  for (const cost of costs) {
    if (cost === infinity) return infinity
    out += cost
  }
  return out
}

function mergeOrderedBound<T>(
  order: Order.Order<T>,
  self: T | undefined,
  selfExclusive: boolean | undefined,
  that: T | undefined,
  thatExclusive: boolean | undefined,
  takeComparison: -1 | 1
): readonly [T | undefined, boolean | undefined] {
  if (that === undefined || self === undefined) {
    return that === undefined ? [self, selfExclusive] : [that, thatExclusive]
  }
  const comparison = order(self, that)
  return comparison === takeComparison
    ? [that, thatExclusive]
    : comparison === 0
    ? [self, selfExclusive || thatExclusive]
    : [self, selfExclusive]
}

function mergeMinimum(self: number | undefined, that: number | undefined): number | undefined {
  return self === undefined ? that : that === undefined ? self : Math.max(self, that)
}

function mergeMaximum(self: number | undefined, that: number | undefined): number | undefined {
  return self === undefined ? that : that === undefined ? self : Math.min(self, that)
}

function mergeConstraint(self: FilterConstraint | undefined, that: FilterConstraint): FilterConstraint {
  const order = that.order ?? self?.order
  if (self?.order !== undefined && that.order !== undefined && self.order !== that.order) {
    throw new Error("Cannot merge ordered arbitrary constraints with different Order instances")
  }
  const [minimum, exclusiveMinimum] = order === undefined
    ? [that.minimum ?? self?.minimum, that.exclusiveMinimum ?? self?.exclusiveMinimum]
    : mergeOrderedBound(
      order,
      self?.minimum,
      self?.exclusiveMinimum,
      that.minimum,
      that.exclusiveMinimum,
      -1
    )
  const [maximum, exclusiveMaximum] = order === undefined
    ? [that.maximum ?? self?.maximum, that.exclusiveMaximum ?? self?.exclusiveMaximum]
    : mergeOrderedBound(
      order,
      self?.maximum,
      self?.exclusiveMaximum,
      that.maximum,
      that.exclusiveMaximum,
      1
    )
  const minLength = mergeMinimum(self?.minLength, that.minLength)
  const maxLength = mergeMaximum(self?.maxLength, that.maxLength)
  const minCodePoints = mergeMinimum(self?.minCodePoints, that.minCodePoints)
  const maxCodePoints = mergeMaximum(self?.maxCodePoints, that.maxCodePoints)
  const minSize = mergeMinimum(self?.minSize, that.minSize)
  const maxSize = mergeMaximum(self?.maxSize, that.maxSize)
  const minProperties = mergeMinimum(self?.minProperties, that.minProperties)
  const maxProperties = mergeMaximum(self?.maxProperties, that.maxProperties)
  const patterns = self?.patterns === undefined
    ? that.patterns
    : that.patterns === undefined
    ? self.patterns
    : [...self.patterns, ...that.patterns] as [
      Schema.Annotations.ToArbitrary.Pattern,
      ...Array<Schema.Annotations.ToArbitrary.Pattern>
    ]
  const number = self?.number === "integer" || that.number === "integer"
    ? "integer"
    : self?.number === "finite" || that.number === "finite"
    ? "finite"
    : undefined
  const uniqueBy = that.uniqueBy ?? self?.uniqueBy
  return {
    ...(order === undefined ? undefined : { order }),
    ...(minimum === undefined ? undefined : { minimum }),
    ...(exclusiveMinimum === true ? { exclusiveMinimum: true } : undefined),
    ...(maximum === undefined ? undefined : { maximum }),
    ...(exclusiveMaximum === true ? { exclusiveMaximum: true } : undefined),
    ...(minLength === undefined ? undefined : { minLength }),
    ...(maxLength === undefined ? undefined : { maxLength }),
    ...(minCodePoints === undefined ? undefined : { minCodePoints }),
    ...(maxCodePoints === undefined ? undefined : { maxCodePoints }),
    ...(minSize === undefined ? undefined : { minSize }),
    ...(maxSize === undefined ? undefined : { maxSize }),
    ...(minProperties === undefined ? undefined : { minProperties }),
    ...(maxProperties === undefined ? undefined : { maxProperties }),
    ...(patterns === undefined ? undefined : { patterns }),
    ...(number === undefined ? undefined : { number }),
    ...(uniqueBy === undefined ? undefined : { uniqueBy })
  }
}

function collectChecks(checks: SchemaAST.Checks | undefined, inherited: FilterConstraint | undefined): Checks {
  let constraint = inherited
  const filters: Array<SchemaAST.Filter<any>> = []
  const visit = (check: SchemaAST.Check<any>): void => {
    const next = check.annotations?.arbitraryConstraint
    if (next !== undefined) constraint = mergeConstraint(constraint, next)
    if (check._tag === "Filter") {
      filters.push(check)
    } else {
      check.checks.forEach(visit)
    }
  }
  checks?.forEach(visit)
  return { constraint, filters }
}

function applyFilters(
  compiled: Model.Compiled<any>,
  ast: SchemaAST.AST,
  filters: ReadonlyArray<SchemaAST.Filter<any>>
): void {
  if (filters.length === 0) return
  const generate = compiled.generate
  const passes = (value: unknown) => {
    for (let index = 0; index < filters.length; index++) {
      if (filters[index].run(value, ast, SchemaAST.defaultParseOptions) !== undefined) return false
    }
    return true
  }
  compiled.generate = (state) =>
    Model.mapGeneration(generate(state), (attempt) => {
      if (attempt._tag === "Discarded") return Model.discarded
      if (!state.shrinks) return passes(attempt.value) ? attempt : Model.discarded
      const sample = Model.filterSample(attempt, passes)
      return sample ?? Model.discarded
    })
}

function validateConstraint(constraint: FilterConstraint | undefined, path: ReadonlyArray<PropertyKey>): void {
  if (constraint === undefined) return
  const cardinalities = [
    [constraint.minLength, constraint.maxLength],
    [constraint.minCodePoints, constraint.maxCodePoints],
    [constraint.minSize, constraint.maxSize],
    [constraint.minProperties, constraint.maxProperties]
  ] as const
  for (const [minimum, maximum] of cardinalities) {
    if (
      minimum !== undefined && (!Number.isSafeInteger(minimum) || minimum < 0) ||
      maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 0) ||
      minimum !== undefined && maximum !== undefined && minimum > maximum
    ) {
      throw arbitraryError("constraints", path)
    }
  }
  if (constraint.order !== undefined && constraint.minimum !== undefined && constraint.maximum !== undefined) {
    const comparison = constraint.order(constraint.minimum, constraint.maximum)
    if (
      comparison > 0 ||
      comparison === 0 && (constraint.exclusiveMinimum === true || constraint.exclusiveMaximum === true)
    ) {
      throw arbitraryError("constraints", path)
    }
  }
}

function withoutOrder(constraint: FilterConstraint | undefined): GenerationConstraint | undefined {
  if (constraint === undefined) return undefined
  const { order: _, ...out } = constraint
  return Object.keys(out).length === 0 ? undefined : out
}

const minimumDateTimestamp = -8_640_000_000_000_000
const maximumDateTimestamp = 8_640_000_000_000_000
const regexpArbitraryFlags = ["g", "i", "m", "s", "u", "y"] as const

function jsonSchema(): Schema.Codec<Schema.Json> {
  let schema: Schema.Codec<Schema.Json>
  schema = Schema.Union([
    Schema.Null,
    Schema.Finite,
    Schema.Boolean,
    Schema.String,
    Schema.Array(Schema.suspend(() => schema)),
    Schema.Record(Schema.String, Schema.suspend(() => schema))
  ]) as Schema.Codec<Schema.Json>
  return schema
}

function regexpSchema() {
  return Schema.Struct({
    source: Schema.Literals([
      "",
      ".",
      ".*",
      "\\d+",
      "\\w+",
      "[a-z]+",
      "[A-Z]+",
      "[0-9]+",
      "^[a-zA-Z0-9]+$",
      "^\\d{4}-\\d{2}-\\d{2}$"
    ]),
    flags: Schema.Struct({
      g: Schema.Boolean,
      i: Schema.Boolean,
      m: Schema.Boolean,
      s: Schema.Boolean,
      u: Schema.Boolean,
      y: Schema.Boolean
    })
  })
}

function urlSchema() {
  return Schema.Struct({
    protocol: Schema.Literals(["http", "https"]),
    label: Schema.String.check(Schema.isPattern(/^[a-z0-9]+$/), Schema.isMinLength(1), Schema.isMaxLength(63)),
    suffix: Schema.String.check(Schema.isPattern(/^[a-z]+$/), Schema.isMinLength(2), Schema.isMaxLength(10)),
    path: Schema.Array(
      Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._~%-]*$/), Schema.isMaxLength(16))
    ).check(Schema.isMaxLength(4))
  })
}

function dateSchema(constraint: GenerationConstraint | undefined) {
  const minimum = Math.max(
    minimumDateTimestamp,
    constraint?.minimum === undefined
      ? minimumDateTimestamp
      : constraint.minimum.getTime() + (constraint.exclusiveMinimum === true ? 1 : 0)
  )
  const maximum = Math.min(
    maximumDateTimestamp,
    constraint?.maximum === undefined
      ? maximumDateTimestamp
      : constraint.maximum.getTime() - (constraint.exclusiveMaximum === true ? 1 : 0)
  )
  return Schema.Int.check(Schema.isBetween({ minimum, maximum }))
}

const linkToArbitrary = Schema.linkDecoding

function builtInDeclarationLink(
  ast: SchemaAST.Declaration,
  typeParameters: ReadonlyArray<Schema.Constraint>,
  constraint: GenerationConstraint | undefined
): SchemaAST.Link | undefined {
  const representation = (ast.annotations as Schema.Annotations.Declaration<any> | undefined)?.representation
  if (representation === undefined) return undefined
  switch (representation.id) {
    case "effect/schema/Json":
      return linkToArbitrary<Schema.Json>()(jsonSchema(), SchemaGetter.passthrough())
    case "effect/schema/MutableJson":
      return linkToArbitrary<Schema.MutableJson>()(
        jsonSchema(),
        SchemaGetter.passthrough<Schema.MutableJson, Schema.Json>({ strict: false })
      )
    case "effect/schema/RegExp":
      return linkToArbitrary<globalThis.RegExp>()(
        regexpSchema(),
        SchemaGetter.transform(({ flags, source }) =>
          new globalThis.RegExp(source, regexpArbitraryFlags.filter((flag) => flags[flag]).join(""))
        )
      )
    case "effect/schema/URL":
      return linkToArbitrary<globalThis.URL>()(
        urlSchema(),
        SchemaGetter.transform(({ label, path, protocol, suffix }) =>
          new globalThis.URL(`${protocol}://${label}.${suffix}/${path.join("/")}`)
        )
      )
    case "effect/schema/Date":
      return linkToArbitrary<globalThis.Date>()(dateSchema(constraint), SchemaGetter.Date<number>())
    case "effect/schema/ReadonlyMap": {
      const [key, value] = typeParameters
      return linkToArbitrary<globalThis.ReadonlyMap<unknown, unknown>>()(
        Schema.withArrayLengthConstraints(
          Schema.Array(Schema.Tuple([key, value])).check(Schema.isUniqueKey()),
          constraint?.minSize,
          constraint?.maxSize
        ),
        SchemaGetter.transform((entries) => new globalThis.Map(entries))
      )
    }
    case "effect/schema/ReadonlySet":
      return linkToArbitrary<globalThis.ReadonlySet<unknown>>()(
        Schema.withArrayLengthConstraints(
          Schema.Array(typeParameters[0]).check(Schema.isUnique()),
          constraint?.minSize,
          constraint?.maxSize
        ),
        SchemaGetter.transform((values) => new globalThis.Set(values))
      )
    case "effect/schema/Uint8Array":
      return linkToArbitrary<globalThis.Uint8Array<ArrayBufferLike>>()(
        Schema.withArrayLengthConstraints(
          Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
          constraint?.minLength,
          constraint?.maxLength
        ),
        SchemaGetter.transform<globalThis.Uint8Array<ArrayBufferLike>, ReadonlyArray<number>>((values) =>
          globalThis.Uint8Array.from(values)
        )
      )
    default:
      return undefined
  }
}

function lengthBounds(
  constraint: FilterConstraint | undefined,
  keys: readonly [
    minimum: "minLength" | "minCodePoints" | "minSize" | "minProperties",
    maximum: "maxLength" | "maxCodePoints" | "maxSize" | "maxProperties"
  ],
  path: ReadonlyArray<PropertyKey>,
  label: string
): readonly [minimum: number, maximum: number | undefined] {
  const minimum = constraint?.[keys[0]] ?? 0
  const maximum = constraint?.[keys[1]]
  if (
    !Number.isSafeInteger(minimum) || minimum < 0 ||
    maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < minimum)
  ) {
    throw arbitraryError(`${label} constraints`, path)
  }
  return [minimum, maximum]
}

function constant<A>(value: A): Model.Compiled<A> {
  const sample = Model.makeSample(value)
  return Model.makeCompiled([], () => 0, () => sample)
}

const uninhabited: Model.Compiled<never> = Model.makeCompiled([], () => infinity, () => Model.discarded)

interface ObjectEntry {
  readonly key: PropertyKey
  readonly keySample?: Model.Sample<PropertyKey> | undefined
  readonly sample: Model.Sample<any>
  readonly removable: boolean
}

interface RetainedObjectEntry extends Omit<ObjectEntry, "sample" | "keySample"> {
  readonly sample: Model.Retained<any>
  readonly keySample?: Model.Retained<PropertyKey> | undefined
}

function normalizePropertyKeySample(sample: Model.Sample<any>): Model.Sample<PropertyKey> | undefined {
  const filtered = Model.filterSample(sample, Predicate.isPropertyKey)
  return filtered === undefined
    ? undefined
    : Model.mapSample(filtered, (value) => typeof value === "symbol" ? value : globalThis.String(value))
}

function objectSample(
  entries: ReadonlyArray<ObjectEntry>,
  minimum: number,
  nullPrototype: boolean,
  reservedKeys: ReadonlySet<PropertyKey>,
  shrinks = true
): Model.Sample<Record<PropertyKey, any>> {
  const make = (entries: ReadonlyArray<ObjectEntry | RetainedObjectEntry>) => {
    const out = Model.makeObject(nullPrototype)
    for (const entry of entries) InternalRecord.assignProperty(out, entry.key, entry.sample.value)
    return out
  }
  if (!shrinks) return Model.makeSample(make(entries))
  const rebuild = (
    entries: ReadonlyArray<RetainedObjectEntry>,
    valueStart = 0,
    keyStart = 0
  ): Model.Sample<Record<PropertyKey, any>> => {
    const pulls: Array<Model.ShrinkPull<Model.Attempt<Record<PropertyKey, any>>>> = []
    if (entries.length > minimum) {
      const structural = entries.flatMap((entry, index) =>
        entry.removable
          ? [() => rebuild(entries.slice(0, index).concat(entries.slice(index + 1)))]
          : []
      )
      if (structural.length > 0) pulls.push(Effect.map(Model.pullFromArray(structural), (make) => make()))
    }
    for (let index = valueStart; index < entries.length; index++) {
      const entry = entries[index]
      if (entry.sample.shrinks === undefined) continue
      pulls.push(Effect.map(
        entry.sample.shrinks(),
        (attempt) =>
          attempt._tag === "Discarded"
            ? attempt
            : rebuild(InternalArray.replaceAt(entries, index, { ...entry, sample: attempt }), index)
      ))
    }
    // Key shrinking uses the same uniqueness-preserving descendant filtering principle as fast-check v4.9.0's
    // ArrayArbitrary (MIT). Structural removals and value shrinks retain their established precedence.
    // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/ArrayArbitrary.ts
    for (let index = keyStart; index < entries.length; index++) {
      const entry = entries[index]
      if (entry.keySample === undefined || entry.keySample.shrinks === undefined) continue
      const filtered = Model.filterSample(
        Model.fromRetained(entry.keySample),
        (key) =>
          !reservedKeys.has(key) &&
          !entries.some((other, otherIndex) => otherIndex !== index && other.key === key)
      )
      if (filtered?.shrinks === undefined) continue
      pulls.push(Effect.map(
        filtered.shrinks,
        (attempt) =>
          attempt._tag === "Discarded"
            ? attempt
            : rebuild(
              InternalArray.replaceAt(entries, index, {
                ...entry,
                key: attempt.value,
                keySample: Model.retain(attempt)
              }),
              entries.length,
              index
            )
      ))
    }
    return Model.makeSample(make(entries), pulls.length === 0 ? undefined : Model.concatPulls(pulls))
  }
  return Model.makeSampleWithLazyShrinks(
    make(entries),
    () =>
      rebuild(entries.map((entry) => ({
        ...entry,
        sample: Model.retain(entry.sample),
        keySample: entry.keySample === undefined ? undefined : Model.retain(entry.keySample)
      }))).shrinks
  )
}

const generateSamples = (
  children: ReadonlyArray<Model.Compiled<any>>,
  state: Model.GenerationState,
  additionalReserved = 0
): Model.Computation<Array<Model.Sample<any>> | undefined> => {
  let reserved = additionalReserved
  let recursive: Array<number> | undefined
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (reserved !== infinity) reserved += child.minCost
    if (child.mayRecurse) (recursive ??= []).push(index)
  }
  if (reserved > state.budget.remaining) return undefined
  let order: Array<number> | undefined
  if (recursive !== undefined && recursive.length > 1) {
    order = children.map((_, index) => index)
    const shuffled = Model.shuffle(state, recursive)
    let next = 0
    for (let index = 0; index < order.length; index++) {
      if (children[index].mayRecurse) order[index] = shuffled[next++]
    }
  }
  return Model.generateProduct(children, state, order, reserved)
}

const generateRequiredObjectValues = (
  properties: ReadonlyArray<{
    readonly property: { readonly name: PropertyKey }
    readonly compiled: Model.Compiled<any>
  }>,
  state: Model.GenerationState,
  nullPrototype: boolean
): Model.Generation<Record<PropertyKey, any>> => {
  let reserved = 0
  let recursive: Array<number> | undefined
  for (let index = 0; index < properties.length; index++) {
    const child = properties[index].compiled
    if (reserved !== infinity) reserved += child.minCost
    if (child.mayRecurse) (recursive ??= []).push(index)
  }
  if (reserved > state.budget.remaining) return Model.discarded
  let order: Array<number> | undefined
  if (recursive !== undefined && recursive.length > 1) {
    order = properties.map((_, index) => index)
    const shuffled = Model.shuffle(state, recursive)
    let next = 0
    for (let index = 0; index < order.length; index++) {
      if (properties[index].compiled.mayRecurse) order[index] = shuffled[next++]
    }
  }
  const values = new Array<any>(properties.length)
  let index = 0
  const loop = (): Model.Generation<Record<PropertyKey, any>> => {
    while (index < properties.length) {
      const childIndex = order?.[index] ?? index
      index++
      const child = properties[childIndex]
      reserved -= child.compiled.minCost
      const generated = Model.generateWithReservedBudget(child.compiled, state, reserved)
      if (Model.isAttempt(generated)) {
        if (generated._tag === "Discarded") return Model.discarded
        values[childIndex] = generated.value
        continue
      }
      return Effect.flatMapEager(generated, (attempt) => {
        if (attempt._tag === "Discarded") return Effect.succeed(Model.discarded)
        values[childIndex] = attempt.value
        return Model.toEffectGeneration(loop())
      })
    }
    const out = Model.makeObject(nullPrototype)
    for (let index = 0; index < properties.length; index++) {
      InternalRecord.assignProperty(out, properties[index].property.name, values[index])
    }
    return Model.makeSample(out)
  }
  return loop()
}

const generateRepeatedValues = (
  child: Model.Compiled<any>,
  count: number,
  state: Model.GenerationState
): Model.Generation<ReadonlyArray<any>> => {
  // The packed push loop follows fast-check v4.9.0's ArrayArbitrary generation strategy (MIT).
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/ArrayArbitrary.ts
  const out: Array<any> = []
  let remaining = count
  let reserved = count * child.minCost
  const loop = (): Model.Generation<ReadonlyArray<any>> => {
    while (remaining > 0) {
      reserved -= child.minCost
      const generated = Model.generateWithReservedBudget(child, state, reserved)
      if (Model.isAttempt(generated)) {
        if (generated._tag === "Discarded") return Model.discarded
        out.push(generated.value)
        remaining--
        continue
      }
      return Effect.flatMapEager(generated, (attempt) => {
        if (attempt._tag === "Discarded") return Effect.succeed(Model.discarded)
        out.push(attempt.value)
        remaining--
        return Model.toEffectGeneration(loop())
      })
    }
    return Model.makeSample(out)
  }
  return loop()
}

const generateRepeatedRecursiveValues = (
  child: Model.Compiled<any>,
  count: number,
  state: Model.GenerationState
): Model.Generation<ReadonlyArray<any>> => {
  const out = new Array<any>(count)
  const order = Model.shuffle(state, Array.from({ length: count }, (_, index) => index))
  let index = 0
  let reserved = count * child.minCost
  const loop = (): Model.Generation<ReadonlyArray<any>> => {
    while (index < count) {
      reserved -= child.minCost
      const generated = Model.generateWithReservedBudget(child, state, reserved)
      if (Model.isAttempt(generated)) {
        if (generated._tag === "Discarded") return Model.discarded
        out[order[index++]] = generated.value
        continue
      }
      return Effect.flatMapEager(generated, (attempt) => {
        if (attempt._tag === "Discarded") return Effect.succeed(Model.discarded)
        out[order[index++]] = attempt.value
        return Model.toEffectGeneration(loop())
      })
    }
    return Model.makeSample(out)
  }
  return loop()
}

// Selector-based uniqueness and primitive Set tracking follow fast-check v4.9.0's uniqueArray and SameValueSet
// strategies (MIT). Hash buckets extend them with Effect's equality semantics for objects.
// https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/uniqueArray.ts
// https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/helpers/SameValueSet.ts
const makeUniqueAdder = (): (value: any) => boolean => {
  let primitives: Set<any> | undefined
  let buckets: Map<number, Array<any>> | undefined
  return (value) => {
    if (value === null || typeof value !== "object" && typeof value !== "function") {
      const set = primitives ??= new Set()
      const size = set.size
      set.add(value)
      return set.size !== size
    }
    const hash = Hash.hash(value)
    const map = buckets ??= new Map()
    const bucket = map.get(hash)
    if (bucket !== undefined) {
      for (let index = 0; index < bucket.length; index++) {
        if (Equal.equals(bucket[index], value)) return false
      }
      bucket.push(value)
    } else {
      map.set(hash, [value])
    }
    return true
  }
}

const makeUniqueAdderBy = (
  uniqueBy: (value: any) => unknown
): (value: any) => boolean => {
  const add = makeUniqueAdder()
  return uniqueBy === identity ? add : (input) => add(uniqueBy(input))
}

const generateRepeatedUniqueValues = (
  child: Model.Compiled<any>,
  count: number,
  state: Model.GenerationState,
  uniqueBy: (value: any) => unknown
): Model.Generation<ReadonlyArray<any>> => {
  const out: Array<any> = []
  const addUnique = makeUniqueAdderBy(uniqueBy)
  let remaining = count
  let reserved = count * child.minCost
  let retries = 0
  let budget = state.budget.remaining
  const loop = (): Model.Generation<ReadonlyArray<any>> => {
    while (remaining > 0) {
      if (retries === 0) {
        reserved -= child.minCost
        budget = state.budget.remaining
      }
      const generated = Model.generateWithReservedBudget(child, state, reserved)
      if (Model.isAttempt(generated)) {
        if (generated._tag === "Discarded") return Model.discarded
        if (!addUnique(generated.value)) {
          if (++retries >= count) return Model.discarded
          state.budget.remaining = budget
          continue
        }
        out.push(generated.value)
        remaining--
        retries = 0
        continue
      }
      return Effect.flatMapEager(generated, (attempt) => {
        if (attempt._tag === "Discarded") return Effect.succeed(Model.discarded)
        if (!addUnique(attempt.value)) {
          if (++retries >= count) return Effect.succeed(Model.discarded)
          state.budget.remaining = budget
        } else {
          out.push(attempt.value)
          remaining--
          retries = 0
        }
        return Model.toEffectGeneration(loop())
      })
    }
    return Model.makeSample(out)
  }
  return loop()
}

function shrinkString(value: string, minimum: number): ReadonlyArray<string> {
  const values = value.length <= minimum
    ? []
    : [
      value.slice(0, minimum),
      value.slice(0, Math.max(minimum, Math.floor(value.length / 2))),
      value.slice(0, -1)
    ]
  // fast-check v4.9.0 builds strings from shrinkable units (MIT). Effect keeps UTF-16 code units as its string domain
  // and applies its integer-halving shrink toward the Effect-owned null-unit target.
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/string.ts
  for (let index = 0; index < value.length; index++) {
    for (const candidate of shrinkInteger(value.charCodeAt(index), 0, true)) {
      values.push(
        value.slice(0, index) + globalThis.String.fromCharCode(candidate.value) + value.slice(index + 1)
      )
    }
  }
  return [...new Set(values)].filter((candidate) => candidate !== value)
}

// Edge-case injection is inspired by fast-check v4.9.0's cached dangerous slices (MIT). The concrete corpus is
// Effect-owned and also covers control, numeric-property, and UTF-16 boundaries.
// https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/helpers/SlicesForStringBuilder.ts
const stringEdgeCases = [
  "",
  " ",
  "\t",
  "\n",
  "\0",
  "0",
  "-1",
  "4294967295",
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "\uD800",
  "\uDC00",
  "😀"
] as const

function randomString(state: Model.GenerationState, minimum: number, maximum: number): string {
  if (Model.randomInt(state, 1, state.biasFactor) === 1) {
    let eligible = 0
    for (const value of stringEdgeCases) {
      if (value.length >= minimum && value.length <= maximum) eligible++
    }
    if (eligible > 0) {
      let target = Model.randomIndex(state, eligible)
      for (const value of stringEdgeCases) {
        if (value.length < minimum || value.length > maximum) continue
        if (target-- === 0) return value
      }
    }
  }
  const length = Model.randomLength(state, minimum, maximum)
  let value = ""
  for (let index = 0; index < length; index++) {
    value += globalThis.String.fromCharCode(Model.randomInt(state, 32, 126))
  }
  return value
}

function randomCodePointString(
  state: Model.GenerationState,
  minimum: number,
  maximum: number,
  minCodePoints: number,
  maxCodePoints: number
): string {
  const count = Model.randomLength(state, minCodePoints, maxCodePoints)
  const length = Model.randomLength(state, Math.max(minimum, count), Math.min(maximum, count * 2))
  let pairs = length - count
  let value = ""
  for (let remaining = count; remaining > 0; remaining--) {
    if (Model.randomInt(state, 1, remaining) <= pairs) {
      value += globalThis.String.fromCodePoint(Model.randomInt(state, 0x10000, 0x10ffff))
      pairs--
    } else {
      value += globalThis.String.fromCharCode(Model.randomInt(state, 32, 126))
    }
  }
  return value
}

function numberBounds(constraint: FilterConstraint | undefined, integer: boolean, path: ReadonlyArray<PropertyKey>) {
  const ordered = constraint?.order === Order.Number ? constraint : undefined
  let minimum = ordered?.minimum as number | undefined
  let maximum = ordered?.maximum as number | undefined
  if (minimum !== undefined && Number.isNaN(minimum) || maximum !== undefined && Number.isNaN(maximum)) {
    throw arbitraryError(integer ? "integer constraints" : "number constraints", path)
  }
  if (integer) {
    if (minimum !== undefined) {
      minimum = ordered?.exclusiveMinimum === true
        ? Math.floor(minimum) + 1
        : Math.ceil(minimum)
    }
    if (maximum !== undefined) {
      maximum = ordered?.exclusiveMaximum === true
        ? Math.ceil(maximum) - 1
        : Math.floor(maximum)
    }
  } else {
    if (minimum !== undefined && ordered?.exclusiveMinimum === true && minimum === Infinity) {
      throw arbitraryError("number constraints", path)
    }
    if (maximum !== undefined && ordered?.exclusiveMaximum === true && maximum === -Infinity) {
      throw arbitraryError("number constraints", path)
    }
    if (minimum !== undefined) {
      minimum = ordered?.exclusiveMinimum === true ? Model.nextNumber(minimum) : minimum === 0 ? -0 : minimum
    }
    if (maximum !== undefined) {
      maximum = ordered?.exclusiveMaximum === true ? Model.previousNumber(maximum) : maximum === 0 ? 0 : maximum
    }
  }
  if (integer || constraint?.number === "finite") {
    if (minimum === Infinity || maximum === -Infinity) {
      throw arbitraryError(integer ? "integer constraints" : "number constraints", path)
    }
    if (minimum === -Infinity) minimum = integer ? Number.MIN_SAFE_INTEGER : -Number.MAX_VALUE
    if (maximum === Infinity) maximum = integer ? Number.MAX_SAFE_INTEGER : Number.MAX_VALUE
  }
  if (integer) {
    if (
      minimum !== undefined && minimum > Number.MAX_SAFE_INTEGER ||
      maximum !== undefined && maximum < Number.MIN_SAFE_INTEGER
    ) {
      throw arbitraryError("integer constraints", path)
    }
    if (minimum !== undefined) minimum = Math.max(minimum, Number.MIN_SAFE_INTEGER)
    if (maximum !== undefined) maximum = Math.min(maximum, Number.MAX_SAFE_INTEGER)
  }
  if (
    minimum !== undefined && maximum !== undefined &&
    (integer ? minimum > maximum : Model.numberToIndex(minimum) > Model.numberToIndex(maximum))
  ) {
    throw arbitraryError(integer ? "integer constraints" : "number constraints", path)
  }
  return { minimum, maximum }
}

interface NumberShrink {
  readonly value: number
  readonly context: number | undefined
}

function shrinkInteger(current: number, target: number, tryTargetAsap: boolean): ReadonlyArray<NumberShrink> {
  const out: Array<NumberShrink> = []
  const realGap = current - target
  let previous = tryTargetAsap ? undefined : target
  for (
    let toRemove = tryTargetAsap ? realGap : Math.trunc(realGap / 2);
    toRemove !== 0;
    toRemove = Math.trunc(toRemove / 2)
  ) {
    const value = toRemove === realGap ? target : current - toRemove
    out.push({ value, context: previous })
    previous = value
  }
  return out
}

function shrinkNumber(current: number, target: number, tryTargetAsap: boolean): ReadonlyArray<NumberShrink> {
  if (Number.isNaN(current)) return [{ value: target, context: undefined }]
  const currentIndex = Model.numberToIndex(current)
  const targetIndex = Model.numberToIndex(target)
  const realGap = currentIndex - targetIndex
  let previous = tryTargetAsap ? undefined : target
  const out: Array<NumberShrink> = []
  for (
    let toRemove = tryTargetAsap ? realGap : realGap / BigInt(2);
    toRemove !== BigInt(0);
    toRemove /= BigInt(2)
  ) {
    const value = toRemove === realGap ? target : Model.indexToNumber(currentIndex - toRemove)
    out.push({ value, context: previous })
    previous = value
  }
  return out
}

function numberTarget(minimum: number | undefined, maximum: number | undefined): number {
  if (minimum !== undefined && minimum > 0) return minimum
  if (maximum !== undefined && maximum < 0) return maximum
  return 0
}

function numberSample(
  value: number,
  minimum: number | undefined,
  maximum: number | undefined,
  integer: boolean,
  context?: number
): Model.Sample<number> {
  if (!integer) {
    // fast-check v4.9.0's double arbitrary shrinks the monotone IEEE-754 index through its BigInt arbitrary (MIT).
    // The sample keeps the equivalent last-passing index context without exposing either representation.
    // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/double.ts
    let candidates: ReadonlyArray<NumberShrink>
    const target = numberTarget(minimum, maximum)
    if (context === undefined) {
      candidates = shrinkNumber(value, target, true)
    } else if (
      !Number.isNaN(value) &&
      (Model.numberToIndex(value) === Model.numberToIndex(context) + BigInt(1) ||
        Model.numberToIndex(value) === Model.numberToIndex(context) - BigInt(1))
    ) {
      candidates = [{ value: context, context: undefined }]
    } else {
      candidates = shrinkNumber(value, context, false)
    }
    return Model.makeSample(
      value,
      candidates.length === 0
        ? undefined
        : Effect.map(
          Model.pullFromArray(candidates),
          (candidate) => numberSample(candidate.value, minimum, maximum, false, candidate.context)
        )
    )
  }
  // The passing-value context and halving sequence are adapted from fast-check v4.9.0's IntegerArbitrary and
  // ShrinkInteger (MIT). Retaining the closest passing candidate lets the runner converge on a local failure boundary.
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/IntegerArbitrary.ts
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/helpers/ShrinkInteger.ts
  let candidates: ReadonlyArray<NumberShrink>
  if (context === undefined) {
    const target = Math.min(maximum ?? 0, Math.max(minimum ?? 0, 0))
    candidates = shrinkInteger(value, target, true)
  } else if (
    value > 0 && value === context + 1 && (minimum === undefined || value > minimum) ||
    value < 0 && value === context - 1 && (maximum === undefined || value < maximum)
  ) {
    candidates = [{ value: context, context: undefined }]
  } else {
    candidates = shrinkInteger(value, context, false)
  }
  return Model.makeSample(
    value,
    candidates.length === 0
      ? undefined
      : Effect.map(
        Model.pullFromArray(candidates),
        (candidate) => numberSample(candidate.value, minimum, maximum, true, candidate.context)
      )
  )
}

/** @internal */
export function compile<S extends Schema.Constraint>(schema: S): Model.Compiled<S["Type"]> {
  const rootAst = SchemaAST.toType(schema.ast)
  const cache = new WeakMap<SchemaAST.AST, Map<FilterConstraint | undefined, Model.Compiled<any>>>()
  const nodes: Array<Model.Compiled<any>> = []
  const suspendBodies = new Map<Model.Compiled<any>, Model.Compiled<any>>()
  const pending: Array<() => void> = []
  const recur = (
    ast: SchemaAST.AST,
    path: ReadonlyArray<PropertyKey>,
    inherited?: FilterConstraint
  ): Model.Compiled<any> => {
    let entries = cache.get(ast)
    const cached = entries?.get(inherited)
    if (cached !== undefined) return cached
    if (entries === undefined) {
      entries = new Map()
      cache.set(ast, entries)
    }
    const placeholder = Model.makeCompiled<any>([], () => infinity, () => Model.discarded)
    entries.set(inherited, placeholder)
    nodes.push(placeholder)
    pending.push(() => {
      const checks = collectChecks(ast.checks, inherited)
      const baseAst = ast.checks === undefined ? ast : SchemaAST.replaceChecks(ast, undefined)
      const base = compileBase(baseAst, path, checks.constraint)
      if (baseAst._tag === "Suspend") {
        const body = base.dependencies[0]
        placeholder.dependencies = [body]
        placeholder.computeMinCost = () => {
          if (body.minCost === infinity) return infinity
          return body.minCost + (placeholder.recursive ? 1 : 0)
        }
        placeholder.generate = (state) =>
          Effect.suspend(() => {
            if (placeholder.recursive) {
              if (state.budget.remaining <= 0) return Effect.succeed(Model.discarded)
              state.budget.remaining--
            }
            return Model.toEffectGeneration(body.generate(state))
          })
        suspendBodies.set(placeholder, body)
      } else {
        placeholder.dependencies = base.dependencies
        placeholder.computeMinCost = base.computeMinCost
        placeholder.generate = base.generate
      }
      applyFilters(placeholder, ast, checks.filters)
    })
    return placeholder
  }

  const compileBase = (
    ast: SchemaAST.AST,
    path: ReadonlyArray<PropertyKey>,
    constraint: FilterConstraint | undefined
  ): Model.Compiled<any> => {
    switch (ast._tag) {
      case "Never":
        return uninhabited
      case "Null":
        return constant(null)
      case "Undefined":
      case "Void":
        return constant(undefined)
      case "Literal":
        return constant(ast.literal)
      case "UniqueSymbol":
        return constant(ast.symbol)
      case "Boolean":
        return Model.makeCompiled(
          [],
          () => 0,
          (state) => {
            const value = Model.randomBoolean(state)
            return Model.makeSample(
              value,
              state.shrinks && value ? Model.pullFromArray([Model.makeSample(false)]) : undefined
            )
          }
        )
      case "String": {
        const patterns: Array<Regexp.Compiled> = []
        for (const candidate of constraint?.patterns ?? []) {
          const pattern = Regexp.compile(candidate)
          if (pattern !== undefined) patterns.push(pattern)
        }
        let [minimum, maximum = infinity] = lengthBounds(constraint, ["minLength", "maxLength"], path, "string")
        const hasCodePoints = constraint?.minCodePoints !== undefined || constraint?.maxCodePoints !== undefined
        let [minCodePoints, maxCodePoints = infinity] = lengthBounds(
          constraint,
          ["minCodePoints", "maxCodePoints"],
          path,
          "string code point"
        )
        if (hasCodePoints) {
          minimum = Math.max(minimum, minCodePoints)
          maximum = Math.min(maximum, maxCodePoints * 2)
          minCodePoints = Math.max(minCodePoints, Math.ceil(minimum / 2))
          maxCodePoints = Math.min(maxCodePoints, maximum)
          if (minimum > maximum || minCodePoints > maxCodePoints) {
            throw arbitraryError("string constraints", path)
          }
        }
        return Model.makeCompiled(
          [],
          () => 0,
          (state) => {
            const pattern = patterns.length === 0
              ? undefined
              : patterns.length === 1
              ? patterns[0]
              : patterns[Model.randomIndex(state, patterns.length)]
            let currentMaximum = Math.max(minimum, pattern?.minimumLength ?? 0, state.size)
            if (hasCodePoints && pattern !== undefined) {
              // A longer UTF-16 alternative can use fewer code points than the shortest match.
              currentMaximum *= 2
            }
            const upper = Math.min(maximum, currentMaximum)
            const value = pattern !== undefined
              ? pattern.generate(state, minimum, upper)
              : hasCodePoints
              ? randomCodePointString(state, minimum, upper, minCodePoints, Math.min(maxCodePoints, upper))
              : randomString(state, minimum, upper)
            if (value === undefined) return Model.discarded
            return state.shrinks
              ? Model.sampleFromShrink(
                value,
                pattern === undefined
                  ? (value) => shrinkString(value, minimum)
                  : (value) => pattern.shrink(value, minimum)
              )
              : Model.makeSample(value)
          }
        )
      }
      case "Number": {
        const integer = constraint?.number === "integer"
        const bounds = numberBounds(constraint, integer, path)
        const numberMinimum = bounds.minimum ?? (constraint?.number !== undefined
          ? -Number.MAX_VALUE
          : Number.NEGATIVE_INFINITY)
        const numberMaximum = bounds.maximum ?? (constraint?.number !== undefined
          ? Number.MAX_VALUE
          : Number.POSITIVE_INFINITY)
        const randomNumber = integer
          ? undefined
          : Model.makeRandomNumber(
            numberMinimum,
            numberMaximum,
            constraint?.number === undefined && bounds.minimum === undefined
          )
        let integerMinimum: number | undefined
        let integerMaximum: number | undefined
        let randomInteger: ((state: Model.GenerationState) => number) | undefined
        return Model.makeCompiled(
          [],
          () => 0,
          (state) => {
            let minimum = numberMinimum
            let maximum = numberMaximum
            if (integer) {
              const magnitude = Math.max(1, state.size * state.size)
              const center = bounds.minimum !== undefined && bounds.minimum > 0
                ? bounds.minimum
                : bounds.maximum !== undefined && bounds.maximum < 0
                ? bounds.maximum
                : 0
              minimum = bounds.minimum ?? center - magnitude
              maximum = bounds.maximum ?? center + magnitude
              if (randomInteger === undefined || minimum !== integerMinimum || maximum !== integerMaximum) {
                integerMinimum = minimum
                integerMaximum = maximum
                randomInteger = Model.makeRandomNumericInt(minimum, maximum)
              }
            }
            const value = integer
              ? randomInteger!(state)
              : randomNumber!(state)
            return state.shrinks
              ? numberSample(value, bounds.minimum, bounds.maximum, integer)
              : Model.makeSample(value)
          }
        )
      }
      case "BigInt": {
        const ordered = constraint?.order === Order.BigInt ? constraint : undefined
        let minimum = ordered?.minimum as bigint | undefined
        let maximum = ordered?.maximum as bigint | undefined
        if (minimum !== undefined && ordered?.exclusiveMinimum === true) minimum++
        if (maximum !== undefined && ordered?.exclusiveMaximum === true) maximum--
        if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
          throw arbitraryError("bigint constraints", path)
        }
        return BigIntArbitrary.make(minimum, maximum)
      }
      case "Symbol": {
        const strings = recur(SchemaAST.string, path, constraint)
        return Model.makeCompiled(
          [strings],
          () => strings.minCost,
          (state) =>
            Model.mapGeneration(strings.generate(state), (attempt) =>
              attempt._tag === "Discarded"
                ? attempt
                : Model.mapSample(attempt, (value) => Symbol.for(value)))
        )
      }
      case "Unknown":
      case "Any": {
        const json = recur(Schema.Json.ast, path)
        return Model.makeCompiled([json], () => json.minCost, (state) => json.generate(state))
      }
      case "ObjectKeyword": {
        const json = recur(Schema.Json.ast, path)
        return Model.makeCompiled(
          [json],
          () => 0,
          (state) =>
            Model.mapGeneration(json.generate(state), (attempt) => {
              if (
                attempt._tag === "Generated" && typeof attempt.value === "object" &&
                attempt.value !== null
              ) {
                return attempt
              }
              return Model.makeSample({})
            })
        )
      }
      case "Enum": {
        const values = [...new Set(ast.enums.map(([, value]) => value))]
        if (values.length === 0) throw arbitraryError("an enum with no members", path)
        return Model.makeCompiled(
          [],
          () => 0,
          (state) => Model.makeSample(values[Model.randomIndex(state, values.length)])
        )
      }
      case "TemplateLiteral": {
        const parts = ast.parts.map((part, index) => recur(part, [...path, index], finiteNumberConstraint))
        return Model.makeCompiled(
          parts,
          () => sumCosts(parts.map((part) => part.minCost)),
          (state) =>
            Model.mapComputation(generateSamples(parts, state), (generated) => {
              if (generated === undefined) return Model.discarded
              const sample = arraySample(generated, {
                fixedCount: generated.length,
                optionalCount: 0,
                repeatCount: 0,
                tailCount: 0,
                minimum: generated.length
              }, state.shrinks)
              return Model.mapSample(sample, (parts) => parts.map(globalThis.String).join(""))
            })
        )
      }
      case "Union": {
        const members = ast.types.map((member) => recur(member, path, constraint))
        if (members.length === 0) throw arbitraryError("a union with no members", path)
        let generate = (state: Model.GenerationState): Model.Generation<unknown> => Model.generateUnion(members, state)
        if (ast.options?.mode === "oneOf") {
          const parse = SchemaParser.run<unknown, never>(ast)
          const validate = (value: unknown) => optionComputation(parse(value))
          generate = (state) => Model.filterMapGeneration(Model.generateUnion(members, state), validate)
        }
        return Model.makeCompiled(
          members,
          () => Math.min(...members.map((member) => member.minCost)),
          generate
        )
      }
      case "Arrays":
        return compileArrays(ast, path, constraint)
      case "Objects": {
        const compiled = compileObjects(ast, path, constraint)
        if (
          ast.indexSignatures.length === 0 ||
          (ast.indexSignatures.length === 1 && ast.propertySignatures.length === 0)
        ) return compiled
        const parse = SchemaParser.run<Record<PropertyKey, any>, never>(
          new SchemaAST.Objects([], ast.indexSignatures)
        )
        const generate = compiled.generate
        compiled.generate = (state) =>
          Model.filterMapGeneration(
            generate(state),
            (value) =>
              Model.mapComputation(optionComputation(parse(value)), (parsed) =>
                Option.isNone(parsed) ? parsed : Option.some(value))
          )
        return compiled
      }
      case "Suspend": {
        const body = recur(ast.thunk(), path)
        return Model.makeCompiled([body], () => body.minCost, (state) => body.generate(state))
      }
      case "Declaration":
        return compileDeclaration(ast, path, constraint)
    }
  }

  const compileArrays = (
    ast: SchemaAST.Arrays,
    path: ReadonlyArray<PropertyKey>,
    constraint: FilterConstraint | undefined
  ): Model.Compiled<ReadonlyArray<any>> => {
    const uniqueBy = constraint?.uniqueBy
    const elements = ast.elements.map((element, index) => ({
      optional: SchemaAST.isOptional(element),
      compiled: recur(element, [...path, index])
    }))
    const requiredCount = elements.findIndex((element) => element.optional)
    const required = requiredCount === -1 ? elements.length : requiredCount
    const optional = elements.length - required
    const rest = ast.rest.map((element, index) => recur(element, [...path, elements.length + index]))
    const head = rest[0]
    const tail = rest.slice(1)
    const [minimum, maximum] = lengthBounds(constraint, ["minLength", "maxLength"], path, "array")
    if (
      maximum !== undefined && maximum < required + tail.length ||
      head === undefined && minimum > elements.length + tail.length
    ) {
      throw arbitraryError("array constraints", path)
    }
    const dependencies = [...elements.map((element) => element.compiled), ...rest]
    const combinations = (limit: number): Array<readonly [optional: number, repeat: number, cost: number]> => {
      const out: Array<readonly [number, number, number]> = []
      const requiredCost = sumCosts(elements.slice(0, required).map((element) => element.compiled.minCost))
      const tailCost = sumCosts(tail.map((element) => element.minCost))
      const currentMaximum = Math.max(minimum, required + tail.length, limit)
      const upper = maximum === undefined ? currentMaximum : Math.min(maximum, currentMaximum)
      for (let optionalCount = 0; optionalCount <= optional; optionalCount++) {
        const fixed = required + optionalCount + tail.length
        const minimumRepeat = Math.max(0, minimum - fixed)
        const maximumRepeat = head === undefined ? 0 : Math.max(minimumRepeat, upper - fixed)
        if (fixed + minimumRepeat > upper || head === undefined && minimumRepeat > 0) continue
        const optionalCost = sumCosts(
          elements.slice(required, required + optionalCount).map((element) => element.compiled.minCost)
        )
        for (let repeat = minimumRepeat; repeat <= maximumRepeat; repeat++) {
          if ((repeat > 0 || tail.length > 0) && optionalCount < optional) continue
          const repeatCost = repeat === 0 ? 0 : repeat * (head?.minCost ?? 0)
          const cost = requiredCost + optionalCost + tailCost + repeatCost
          out.push([optionalCount, repeat, cost])
        }
      }
      return out
    }
    let cachedLimit: number | undefined
    let cachedBudget: number | undefined
    let cachedCombinations: ReadonlyArray<readonly [optional: number, repeat: number, cost: number]> = []
    let cachedPossible: ReadonlyArray<readonly [optional: number, repeat: number, cost: number]> = []
    const possibleCombinations = (limit: number, budget: number) => {
      if (limit !== cachedLimit) {
        cachedLimit = limit
        cachedBudget = undefined
        cachedCombinations = combinations(limit)
      }
      if (budget !== cachedBudget) {
        cachedBudget = budget
        cachedPossible = cachedCombinations.filter(([, , cost]) => cost <= budget)
      }
      return cachedPossible
    }
    return Model.makeCompiled(
      dependencies,
      () => {
        const possible = combinations(0)
        return possible.length === 0 ? infinity : Math.min(...possible.map(([, , cost]) => cost))
      },
      (state) => {
        const possible = possibleCombinations(state.size, state.budget.remaining)
        if (possible.length === 0) return Model.discarded
        const [optionalCount, repeatCount] = possible[Model.randomLength(state, 0, possible.length - 1)]
        // Explicit collection minima must stay productive while progressive checks are still at size zero.
        const itemState = state.size >= repeatCount ? state : { ...state, size: repeatCount }
        // Lower homogeneous arrays directly when no shrink context is needed.
        if (
          !state.shrinks && elements.length === 0 && tail.length === 0 && head !== undefined &&
          (!head.mayRecurse || uniqueBy === undefined)
        ) {
          return head.mayRecurse
            ? generateRepeatedRecursiveValues(head, repeatCount, itemState)
            : uniqueBy !== undefined
            ? generateRepeatedUniqueValues(head, repeatCount, itemState, uniqueBy)
            : generateRepeatedValues(head, repeatCount, itemState)
        }
        const selected = [
          ...elements.slice(0, required + optionalCount).map((element) => element.compiled),
          ...Array.from({ length: repeatCount }, () => head!),
          ...tail
        ]
        const makeAttempt = (generated: ReadonlyArray<Model.Sample<any>>) =>
          arraySample(generated, {
            fixedCount: required + optionalCount,
            optionalCount,
            repeatCount,
            tailCount: tail.length,
            minimum
          }, state.shrinks)
        if (uniqueBy === undefined) {
          return Model.mapComputation(
            generateSamples(selected, itemState),
            (generated) => generated === undefined ? Model.discarded : makeAttempt(generated)
          )
        }
        // The requested-length consecutive duplicate circuit breaker follows fast-check v4.9.0's ArrayArbitrary
        // strategy (MIT).
        // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/ArrayArbitrary.ts
        const generated: Array<Model.Sample<any>> = []
        const addUnique = makeUniqueAdderBy(uniqueBy)
        let reserved = sumCosts(selected.map((child) => child.minCost))
        const maximumRetries = selected.length
        let index = 0
        let retries = 0
        let budget = state.budget.remaining
        const loop = (): Model.Generation<ReadonlyArray<any>> => {
          while (index < selected.length) {
            const child = selected[index]
            if (retries === 0) {
              reserved -= child.minCost
              budget = state.budget.remaining
            }
            const generatedChild = Model.generateWithReservedBudget(child, itemState, reserved)
            if (Model.isAttempt(generatedChild)) {
              const attempt = generatedChild
              if (attempt._tag === "Discarded") return Model.discarded
              if (!addUnique(attempt.value)) {
                if (++retries >= maximumRetries) return Model.discarded
                state.budget.remaining = budget
                continue
              }
              generated.push(attempt)
              index++
              retries = 0
              continue
            }
            return Effect.flatMapEager(generatedChild, (attempt) => {
              if (attempt._tag === "Discarded") return Effect.succeed(Model.discarded)
              if (!addUnique(attempt.value)) {
                if (++retries >= maximumRetries) return Effect.succeed(Model.discarded)
                state.budget.remaining = budget
              } else {
                generated.push(attempt)
                index++
                retries = 0
              }
              return Model.toEffect(loop())
            })
          }
          return makeAttempt(generated)
        }
        return loop()
      }
    )
  }

  const compileObjects = (
    ast: SchemaAST.Objects,
    path: ReadonlyArray<PropertyKey>,
    constraint: FilterConstraint | undefined
  ): Model.Compiled<Record<PropertyKey, any>> => {
    const constrainedIndexes = ast.indexSignatures.flatMap((index, position) => {
      const constraint = collectChecks(index.type.checks, undefined).constraint
      return constraint === undefined ? [] : [{ index, position, constraint }]
    })
    const compileIndexedValue = (type: SchemaAST.AST, path: ReadonlyArray<PropertyKey>) => {
      const compiled = recur(type, path)
      // Scalar specializations have no recursive dependencies and keep the same minimum cost.
      const candidates = type._tag === "String" || type._tag === "Number" || type._tag === "BigInt"
        ? constrainedIndexes.filter(({ index }) => index.type !== type && index.type._tag === type._tag)
        : []
      const specializations = new Map<string, Model.Compiled<any>>()
      const forKey = (key: PropertyKey): Model.Compiled<any> => {
        if (candidates.length === 0) return compiled
        const input = { [key]: undefined }
        const matching = candidates.filter(({ index }) =>
          SchemaAST.getIndexSignatureKeys(input, index.parameter).length > 0
        )
        if (matching.length === 0) return compiled
        const cacheKey = matching.map(({ position }) => position).join(",")
        const cached = specializations.get(cacheKey)
        if (cached !== undefined) return cached
        let specialized = compiled
        try {
          let inherited: FilterConstraint | undefined
          for (const match of matching) inherited = mergeConstraint(inherited, match.constraint)
          const checks = collectChecks(type.checks, inherited)
          specialized = compileBase(type, path, checks.constraint)
          specialized.minCost = 0
          applyFilters(specialized, type, checks.filters)
        } catch {
          // Incompatible scalar constraints keep the original generator and indexed validation.
        }
        specializations.set(cacheKey, specialized)
        return specialized
      }
      return {
        compiled,
        forKey
      }
    }
    const properties = ast.propertySignatures.map((property) => ({
      property,
      optional: SchemaAST.isOptional(property.type),
      compiled: compileIndexedValue(property.type, [...path, property.name]).forKey(property.name)
    }))
    const propertyNames = new Set<PropertyKey>(
      properties.map(({ property }) =>
        typeof property.name === "symbol" ? property.name : globalThis.String(property.name)
      )
    )
    const indexes = ast.indexSignatures.map((index, position) => {
      const value = compileIndexedValue(index.type, [...path, `index-${position}-value`])
      return {
        parameter: recur(index.parameter, [...path, `index-${position}-key`]),
        value: value.compiled,
        valueForKey: value.forKey
      }
    })
    const required = properties.filter((property) => !property.optional)
    const optional = properties.filter((property) => property.optional)
    const [minimum, maximum] = lengthBounds(
      constraint,
      ["minProperties", "maxProperties"],
      path,
      "object property"
    )
    if (maximum !== undefined && maximum < required.length || indexes.length === 0 && minimum > properties.length) {
      throw arbitraryError("object property constraints", path)
    }
    const needed = Math.max(0, minimum - required.length)
    const minOptional = indexes.length === 0 ? needed : 0
    const minimumPropertyPlan = () => {
      const indexCost = Math.min(...indexes.map((index) => index.parameter.minCost + index.value.minCost))
      const selected = optional
        .filter((property) => property.compiled.minCost <= indexCost)
        .sort((a, b) => a.compiled.minCost - b.compiled.minCost)
        .slice(0, needed)
      const indexCount = needed - selected.length
      return {
        optional: selected,
        indexCount,
        indexCost,
        cost: sumCosts(selected.map((property) => property.compiled.minCost)) +
          (indexCount === 0 ? 0 : indexCount * indexCost)
      }
    }
    const dependencies = [
      ...properties.map((property) => property.compiled),
      ...indexes.flatMap((index) => [index.parameter, index.value])
    ]
    return Model.makeCompiled(
      dependencies,
      () => sumCosts(required.map((property) => property.compiled.minCost)) + minimumPropertyPlan().cost,
      (state) => {
        if (!state.shrinks && optional.length === 0 && indexes.length === 0) {
          return generateRequiredObjectValues(required, state, state.nullPrototype)
        }
        const currentMaximum = Math.max(minimum, required.length, state.size)
        const upper = maximum === undefined ? currentMaximum : Math.min(maximum, currentMaximum)
        const maxOptional = Math.min(optional.length, upper - required.length)
        const minimumPlan = minimumPropertyPlan()
        const minimumIndexCost = minimumPlan.indexCost
        const optionalCount = Model.randomInt(state, minOptional, maxOptional)
        let named = optionalCount === 0
          ? required
          : [...required, ...Model.shuffle(state, optional).slice(0, optionalCount)]
        let minimumIndexes = Math.max(0, minimum - named.length)
        let namedCost = sumCosts(named.map((property) => property.compiled.minCost))
        if (namedCost + (minimumIndexes === 0 ? 0 : minimumIndexes * minimumIndexCost) > state.budget.remaining) {
          named = [...required, ...minimumPlan.optional]
          minimumIndexes = minimumPlan.indexCount
          namedCost = sumCosts(named.map((property) => property.compiled.minCost))
        }
        const maximumIndexes = indexes.length === 0
          ? 0
          : upper - named.length
        const affordableIndexes = minimumIndexCost === 0
          ? maximumIndexes
          : minimumIndexCost === infinity
          ? 0
          : Math.min(maximumIndexes, Math.floor((state.budget.remaining - namedCost) / minimumIndexCost))
        if (affordableIndexes < minimumIndexes) return Model.discarded
        const indexCount = Model.randomLength(state, minimumIndexes, affordableIndexes)
        const indexReserved = indexCount === 0 ? 0 : indexCount * minimumIndexCost
        return Model.flatMapComputation(
          generateSamples(named.map((property) => property.compiled), state, indexReserved),
          (samples) => {
            if (samples === undefined) return Model.discarded
            const entries: Array<ObjectEntry> = samples.map((sample, index) => ({
              key: named[index].property.name,
              sample,
              removable: named[index].optional
            }))
            if (indexCount === 0) {
              return objectSample(entries, minimum, state.nullPrototype, propertyNames, state.shrinks)
            }
            return Effect.gen(function*() {
              for (let position = 0; position < indexCount; position++) {
                const futureReserved = (indexCount - position - 1) * minimumIndexCost
                const eligible = indexes.filter((index) =>
                  index.parameter.minCost + index.value.minCost + futureReserved <= state.budget.remaining
                )
                if (eligible.length === 0) return Model.discarded
                const index = eligible[Model.randomIndex(state, eligible.length)]
                const budget = state.budget.remaining
                const reservedAfterKey = index.value.minCost + futureReserved
                // Multiple required index entries need enough key diversity before progressive size can advance.
                const keyState = state.size >= indexCount ? state : { ...state, size: indexCount }
                let keyAttempt = yield* Model.toEffectGeneration(
                  Model.generateWithReservedBudget(index.parameter, keyState, reservedAfterKey)
                )
                let keySample: Model.Sample<PropertyKey>
                let retries = 0
                while (true) {
                  if (keyAttempt._tag === "Discarded") return Model.discarded
                  const normalized = normalizePropertyKeySample(keyAttempt)
                  if (normalized === undefined) return Model.discarded
                  keySample = normalized
                  if (
                    !propertyNames.has(keySample.value) &&
                    !entries.some((entry) => entry.key === keySample.value)
                  ) break
                  if (retries++ >= 10) return Model.discarded
                  state.budget.remaining = budget
                  keyAttempt = yield* Model.toEffectGeneration(
                    Model.generateWithReservedBudget(index.parameter, keyState, reservedAfterKey)
                  )
                }
                const value = yield* Model.toEffectGeneration(
                  Model.generateWithReservedBudget(index.valueForKey(keySample.value), state, futureReserved)
                )
                if (value._tag === "Discarded") return Model.discarded
                entries.push({ key: keySample.value, keySample, sample: value, removable: true })
              }
              return objectSample(entries, minimum, state.nullPrototype, propertyNames, state.shrinks)
            })
          }
        )
      }
    )
  }

  const compileDeclaration = (
    ast: SchemaAST.Declaration,
    path: ReadonlyArray<PropertyKey>,
    constraint: FilterConstraint | undefined
  ): Model.Compiled<any> => {
    validateConstraint(constraint, path)
    const typeParameters = ast.typeParameters.map((parameter, index) => recur(parameter, [...path, index]))
    const parameters = ast.typeParameters.map((parameter) => Schema.make(SchemaAST.toType(parameter)))
    const getArbitrary = ast.annotations?.toCodecArbitrary
    const representation = (ast.annotations as Schema.Annotations.Declaration<any> | undefined)?.representation
    if (typeof getArbitrary !== "function" && representation?.id === "effect/schema/BigDecimal") {
      const ordered = constraint?.order === BigDecimal.Order ? constraint : undefined
      const compiled: Model.Compiled<unknown> | undefined = BigDecimalArbitrary.make({
        minimum: ordered?.minimum as BigDecimal.BigDecimal | undefined,
        exclusiveMinimum: ordered?.exclusiveMinimum,
        maximum: ordered?.maximum as BigDecimal.BigDecimal | undefined,
        exclusiveMaximum: ordered?.exclusiveMaximum
      })
      if (compiled === undefined) throw arbitraryError("BigDecimal constraints", path)
      return compiled
    }
    let link: SchemaAST.Link
    if (typeof getArbitrary === "function") {
      link = getArbitrary({
        typeParameters: parameters,
        constraint: withoutOrder(constraint)
      })
    } else {
      const builtInLink = builtInDeclarationLink(ast, parameters, withoutOrder(constraint))
      if (builtInLink !== undefined) {
        link = builtInLink
      } else {
        const getJson = ast.annotations?.toCodecJson
        if (typeof getJson === "function") {
          const jsonLink = getJson(parameters)
          if (jsonLink === undefined) throw arbitraryError("an opaque self-canonical Declaration", path)
          link = jsonLink
        } else {
          const get = ast.annotations?.toCodec
          if (typeof get !== "function") throw arbitraryError("an unsupported Declaration", path)
          link = get(parameters)
        }
      }
    }
    const target = recur(SchemaAST.toType(link.to), path)
    const decodeDeclaration = SchemaParser.run<unknown, never>(ast)
    const decode = (value: unknown): Model.Computation<Option.Option<unknown>> => {
      const transformed = link.transformation._tag === "Transformation"
        ? SchemaGetter.run(link.transformation.decode, Option.some(value), SchemaAST.defaultParseOptions)
        : link.transformation.decode(Effect.succeed(Option.some(value)), SchemaAST.defaultParseOptions)
      return Model.flatMapComputation(optionComputation(transformed), (outer) => {
        if (Option.isNone(outer) || Option.isNone(outer.value)) return Option.none()
        return optionComputation(decodeDeclaration(outer.value.value))
      })
    }
    return Model.makeCompiled(
      [target, ...typeParameters],
      () => target.minCost,
      (state) => Model.filterMapGeneration(target.generate(state), decode)
    )
  }

  const root = recur(rootAst, [])
  for (let index = 0; index < pending.length; index++) pending[index]()
  const dependents = analyzeDependencyGraph(nodes, suspendBodies)
  const recursiveQueue = nodes.filter((node) => node.recursive)
  for (let index = 0; index < recursiveQueue.length; index++) {
    const node = recursiveQueue[index]
    if (node.mayRecurse) continue
    node.mayRecurse = true
    recursiveQueue.push(...dependents.get(node)!)
  }
  const queue = nodes.slice()
  const queued = new Set(nodes)
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]
    queued.delete(node)
    const next = node.computeMinCost()
    if (next >= node.minCost) continue
    node.minCost = next
    for (const dependent of dependents.get(node)!) {
      if (!queued.has(dependent)) {
        queued.add(dependent)
        queue.push(dependent)
      }
    }
  }
  if (root.minCost === infinity) {
    throw arbitraryError("a schema without a finite generation path", [])
  }
  return root
}

function analyzeDependencyGraph(
  nodes: ReadonlyArray<Model.Compiled<any>>,
  suspendBodies: ReadonlyMap<Model.Compiled<any>, Model.Compiled<any>>
): ReadonlyMap<Model.Compiled<any>, ReadonlyArray<Model.Compiled<any>>> {
  const visited = new Set<Model.Compiled<any>>()
  const finished: Array<Model.Compiled<any>> = []
  for (const root of nodes) {
    if (visited.has(root)) continue
    visited.add(root)
    const stack: Array<{ readonly node: Model.Compiled<any>; index: number }> = [{ node: root, index: 0 }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.index < frame.node.dependencies.length) {
        const dependency = frame.node.dependencies[frame.index++]
        if (!visited.has(dependency)) {
          visited.add(dependency)
          stack.push({ node: dependency, index: 0 })
        }
      } else {
        finished.push(frame.node)
        stack.pop()
      }
    }
  }

  const reverse = new Map<Model.Compiled<any>, Array<Model.Compiled<any>>>()
  for (const node of visited) reverse.set(node, [])
  for (const node of visited) {
    for (const dependency of node.dependencies) reverse.get(dependency)?.push(node)
  }
  const component = new Map<Model.Compiled<any>, number>()
  let componentId = 0
  for (let index = finished.length - 1; index >= 0; index--) {
    const root = finished[index]
    if (component.has(root)) continue
    component.set(root, componentId)
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      for (const dependency of reverse.get(node)!) {
        if (component.has(dependency)) continue
        component.set(dependency, componentId)
        stack.push(dependency)
      }
    }
    componentId++
  }
  for (const [suspend, body] of suspendBodies) {
    suspend.recursive = component.get(suspend) === component.get(body)
  }
  return reverse
}
