import type { JsonSchema } from './types'
import { DEFAULT_MAX_BIGINT_DIGITS, get, getOwn, isPlainObject, isTypescriptObject, parseBigIntString, toArray, tryOrUndefined } from '@orpc/shared'
import { decodeJsonPointerSegment } from './ref-utils'
import { JsonSchemaXNativeType } from './types'

/**
 * How well a value matches a schema, used to pick the best union branch.
 */
const UNSATISFIED = 0
/**
 * Every keyword matches except some object keys or array items no schema describes.
 * JSON Schema allows those, and validators usually strip or ignore them, but a branch
 * that describes every key is still a better match.
 */
const LOOSELY_SATISFIED = 1
/** Every keyword matches. */
const SATISFIED = 2

type Satisfaction = typeof UNSATISFIED | typeof LOOSELY_SATISFIED | typeof SATISFIED

type CoercionResult = [satisfied: Satisfaction, coerced: unknown]

interface NativeCoerceOptions {
  maxBigIntDigits: number
}

interface NativeType {
  types: readonly string[]
  is: (value: unknown) => boolean
  coerce: (value: unknown, options: NativeCoerceOptions) => unknown
  afterTypeCheck?: boolean
}

const NATIVE_TYPES = new Map<unknown, NativeType>([
  [JsonSchemaXNativeType.Date, {
    types: ['string'],
    is: value => value instanceof Date,
    coerce: value => typeof value === 'string' ? stringToDate(value) : value,
  }],
  [JsonSchemaXNativeType.BigInt, {
    types: ['string', 'integer', 'number'],
    is: value => typeof value === 'bigint',
    coerce: (value, { maxBigIntDigits }) => typeof value === 'string'
      ? stringToBigInt(value, maxBigIntDigits)
      : typeof value === 'number' ? numberToBigInt(value) : value,
  }],
  [JsonSchemaXNativeType.Url, {
    types: ['string'],
    is: value => value instanceof URL,
    coerce: value => typeof value === 'string' ? stringToURL(value) : value,
  }],
  [JsonSchemaXNativeType.Set, {
    types: ['array'],
    is: value => value instanceof Set,
    coerce: value => Array.isArray(value) ? arrayToSet(value) : value,
    afterTypeCheck: true,
  }],
  [JsonSchemaXNativeType.Map, {
    types: ['array'],
    is: value => value instanceof Map,
    coerce: value => Array.isArray(value) ? arrayToMap(value) : value,
    afterTypeCheck: true,
  }],
])

function minSatisfaction(a: Satisfaction, b: Satisfaction): Satisfaction {
  return a < b ? a : b
}

const MIN_BUDGETED_VALUES = 100

export interface JsonSchemaCoercerOptions {
  /**
   * Maximum digits, excluding a leading `-`, of a string coerced to `bigint`. Longer strings are left unchanged.
   * `Number.POSITIVE_INFINITY` disables it.
   *
   * @default 4300
   */
  maxBigIntDigits?: number | undefined

  /**
   * Maximum coercion steps per input value, where a step applies one schema to one value.
   * Inputs with fewer than 100 values are budgeted as 100. Past the budget the whole input is left uncoerced,
   * so validation still runs and reports any mismatch.
   *
   * @default 1000
   */
  maxStepsPerValue?: number | undefined
}

interface CoercionContext {
  rootSchema: JsonSchema
  memo: Map<JsonSchema, Map<unknown, CoercionResult>> | undefined
  /** Memoizing `$ref` results only pays off once a keyword applies several schemas to the same value. */
  memoize: boolean
  steps: number
  maxSteps: number
  input: unknown
}

function createContext(): CoercionContext {
  return { rootSchema: true, memo: undefined, memoize: false, steps: 0, maxSteps: 0, input: undefined }
}

class CoercionBudgetExceededError extends Error {}

export class JsonSchemaCoercer {
  private readonly nativeCoerceOptions: NativeCoerceOptions
  private readonly maxStepsPerValue: number

  /** Reused between calls, since building a context is slow until V8 warms up. */
  private idleContext: CoercionContext | undefined = createContext()

  constructor(options: JsonSchemaCoercerOptions = {}) {
    this.nativeCoerceOptions = {
      maxBigIntDigits: options.maxBigIntDigits ?? DEFAULT_MAX_BIGINT_DIGITS,
    }
    this.maxStepsPerValue = options.maxStepsPerValue ?? 1_000
  }

  coerce([schema, optional]: [schema: JsonSchema, optional: boolean], value: unknown): unknown {
    if (optional && value === undefined) {
      return value
    }

    const context = this.idleContext ?? createContext()
    this.idleContext = undefined

    context.rootSchema = schema
    context.memoize = false
    context.steps = 0
    context.maxSteps = this.maxStepsPerValue * MIN_BUDGETED_VALUES
    context.input = value

    try {
      const [, coerced] = this.coerceInternal(context, schema, value)
      return coerced
    }
    catch (error) {
      // partially coerced output would be harder to predict than the original input
      if (error instanceof CoercionBudgetExceededError) {
        return value
      }

      throw error
    }
    finally {
      // keep no reference to this call's input or results
      context.memo = undefined
      context.input = undefined
      this.idleContext = context
    }
  }

  private coerceInternal(
    context: CoercionContext,
    schema: JsonSchema,
    value: unknown,
    /**
     * Schemas already applied to this exact value, used to stop `$ref` cycles.
     * Only shared between keywords that re-apply a schema to the same value, never with nested values.
     */
    appliedRefs?: Set<JsonSchema>,
  ): CoercionResult {
    if (++context.steps > context.maxSteps) {
      this.extendBudget(context)
    }

    if (typeof schema === 'boolean') {
      return [schema ? SATISFIED : UNSATISFIED, value]
    }

    if (Array.isArray(schema.type)) {
      return this.coerceInternal(
        context,
        { anyOf: schema.type.map(type => ({ ...schema, type })) },
        value,
        appliedRefs,
      )
    }

    let coerced = value
    let satisfied: Satisfaction = SATISFIED

    if (typeof schema.$ref === 'string') {
      const resolved
        = schema.$ref.startsWith('#/')
          ? get(context.rootSchema, schema.$ref.slice('#/'.length).split('/').map(decodeJsonPointerSegment)) as JsonSchema | undefined
          : schema.$ref === '#'
            ? context.rootSchema
            : undefined

      if (resolved !== undefined && !appliedRefs?.has(resolved)) {
        if (schema.type === 'object' || schema.type === 'array') {
          context.memoize = true
        }

        const [subSatisfied, subCoerced] = this.coerceRef(context, resolved, coerced, appliedRefs)

        coerced = subCoerced
        satisfied = minSatisfaction(satisfied, subSatisfied)
      }
    }

    const enumValues = schema.const !== undefined ? [schema.const] : schema.enum
    if (enumValues !== undefined && !enumValues.includes(coerced)) {
      if (typeof coerced === 'string') {
        const numberValue = stringToNumber(coerced)

        if (enumValues.includes(numberValue)) {
          coerced = numberValue
        }
        else {
          const booleanValue = stringToBoolean(coerced)

          if (enumValues.includes(booleanValue)) {
            coerced = booleanValue
          }
          else {
            satisfied = UNSATISFIED
          }
        }
      }
      else {
        satisfied = UNSATISFIED
      }
    }

    const declaredNativeType = NATIVE_TYPES.get(schema['x-native-type'])
    const nativeType = schema.type === undefined || declaredNativeType?.types.includes(schema.type)
      ? declaredNativeType
      : undefined

    if (nativeType && !nativeType.afterTypeCheck) {
      coerced = nativeType.coerce(coerced, this.nativeCoerceOptions)
    }

    if (schema.type && !nativeType?.is(coerced)) {
      switch (schema.type) {
        case 'null': {
          if (coerced !== null) {
            satisfied = UNSATISFIED
          }

          break
        }
        case 'string': {
          if (typeof coerced !== 'string') {
            satisfied = UNSATISFIED
          }

          break
        }
        case 'number': {
          if (typeof coerced === 'string') {
            coerced = stringToNumber(coerced)
          }

          if (typeof coerced !== 'number') {
            satisfied = UNSATISFIED
          }

          break
        }
        case 'integer': {
          if (typeof coerced === 'string') {
            coerced = stringToInteger(coerced)
          }

          if (typeof coerced !== 'number' || !Number.isInteger(coerced)) {
            satisfied = UNSATISFIED
          }

          break
        }
        case 'boolean': {
          if (typeof coerced === 'string') {
            coerced = stringToBoolean(coerced)
          }

          if (typeof coerced !== 'boolean') {
            satisfied = UNSATISFIED
          }

          break
        }
        case 'array': {
          if (Array.isArray(coerced)) {
            const prefixItemSchemas: readonly JsonSchema[] = 'prefixItems' in schema
              ? toArray(schema.prefixItems)
              : Array.isArray(schema.items)
                ? schema.items
                : []

            const itemSchema: JsonSchema | undefined = Array.isArray(schema.items)
              ? schema.additionalItems as JsonSchema | undefined
              : schema.items as JsonSchema | undefined

            let shouldUseCoercedItems = false

            const coercedItems = coerced.map((item, i) => {
              const subSchema = prefixItemSchemas[i] ?? itemSchema
              if (subSchema === undefined) {
                satisfied = minSatisfaction(satisfied, LOOSELY_SATISFIED)
                return item
              }

              const [subSatisfied, subCoerced] = this.coerceInternal(context, subSchema, item)

              satisfied = minSatisfaction(satisfied, subSatisfied)

              if (subCoerced !== item) {
                shouldUseCoercedItems = true
              }

              return subCoerced
            })

            if (typeof schema.minItems === 'number' && coercedItems.length < schema.minItems) {
              satisfied = UNSATISFIED
            }

            if (shouldUseCoercedItems) {
              coerced = coercedItems
            }
          }
          else {
            satisfied = UNSATISFIED
          }
          break
        }
        case 'object': {
          if (Array.isArray(coerced)) {
            coerced = { ...coerced }
          }

          if (isPlainObject(coerced)) {
            let shouldUseCoercedItems = false
            // copy here so special keys like `__proto__` are kept as own properties
            const coercedItems = { ...coerced }

            const patternProperties = Object.entries(schema.patternProperties ?? {})
              .flatMap(([key, value]) => {
                // an invalid pattern is a schema mistake, it should not break coercion of the other keys
                const pattern = tryOrUndefined(() => new RegExp(key))
                return pattern ? [[pattern, value] as const] : []
              })

            const propertySchemas: Record<string, JsonSchema> = schema.properties ?? {}

            for (const key of Object.keys(coerced)) {
              const value = coerced[key]

              const subSchema = getOwn(propertySchemas, key)
                ?? patternProperties.find(([pattern]) => pattern.test(key))?.[1]
                ?? schema.additionalProperties

              if (value !== undefined || schema.required?.includes(key)) {
                if (subSchema === undefined) {
                  satisfied = minSatisfaction(satisfied, LOOSELY_SATISFIED)
                }
                else {
                  const [subSatisfied, subCoerced] = this.coerceInternal(context, subSchema, value)
                  coercedItems[key] = subCoerced

                  satisfied = minSatisfaction(satisfied, subSatisfied)

                  if (subCoerced !== value) {
                    shouldUseCoercedItems = true
                  }
                }
              }
            }

            if (schema.required?.some(key => !Object.hasOwn(coercedItems, key))) {
              satisfied = UNSATISFIED
            }

            if (shouldUseCoercedItems) {
              coerced = coercedItems
            }
          }
          else {
            satisfied = UNSATISFIED
          }

          break
        }
      }
    }

    if (nativeType) {
      if (nativeType.afterTypeCheck) {
        coerced = nativeType.coerce(coerced, this.nativeCoerceOptions)
      }

      if (!nativeType.is(coerced)) {
        satisfied = UNSATISFIED
      }
    }

    if (schema.allOf) {
      context.memoize = true

      for (const subSchema of schema.allOf) {
        const [subSatisfied, subCoerced] = this.coerceInternal(context, subSchema, coerced, appliedRefs)

        coerced = subCoerced
        satisfied = minSatisfaction(satisfied, subSatisfied)
      }
    }

    for (const key of ['anyOf', 'oneOf'] as const) {
      if (schema[key]) {
        context.memoize = true

        /**
         * The best branch is the first one that accepts the value untouched,
         * then the most satisfied branch that accepts it after a conversion.
         */
        let best: { satisfied: Satisfaction, value: unknown } | undefined

        for (const subSchema of schema[key]) {
          const [subSatisfied, subCoerced] = this.coerceInternal(context, subSchema, coerced, appliedRefs)

          if (subSatisfied === UNSATISFIED) {
            continue
          }

          if (subCoerced === coerced) {
            best = { satisfied: subSatisfied, value: subCoerced }
            break
          }

          if (!best || subSatisfied > best.satisfied) {
            best = { satisfied: subSatisfied, value: subCoerced }
          }
        }

        // a matching branch never repairs a sibling keyword that already failed, so satisfaction only decreases
        if (best) {
          coerced = best.value
          satisfied = minSatisfaction(satisfied, best.satisfied)
        }
        else {
          satisfied = UNSATISFIED
        }
      }
    }

    if (typeof schema.not !== 'undefined') {
      context.memoize = true

      const [notSatisfied] = this.coerceInternal(context, schema.not, coerced, appliedRefs)

      if (notSatisfied !== UNSATISFIED) {
        satisfied = UNSATISFIED
      }
    }

    return [satisfied, coerced]
  }

  private coerceRef(
    context: CoercionContext,
    resolved: JsonSchema,
    value: unknown,
    appliedRefs: Set<JsonSchema> | undefined,
  ): CoercionResult {
    let memo: Map<unknown, CoercionResult> | undefined

    // while another `$ref` is applied to the value, the cycle check changes the result
    if (context.memoize && !appliedRefs?.size && isTypescriptObject(value)) {
      context.memo ??= new Map()
      memo = context.memo.get(resolved)

      if (!memo) {
        memo = new Map()
        context.memo.set(resolved, memo)
      }

      const cached = memo.get(value)

      if (cached) {
        return cached
      }
    }

    appliedRefs ??= new Set()
    appliedRefs.add(resolved)

    const result = this.coerceInternal(context, resolved, value, appliedRefs)

    appliedRefs.delete(resolved)
    memo?.set(value, result)

    return result
  }

  private extendBudget(context: CoercionContext): void {
    const limit = 2 * context.steps / this.maxStepsPerValue
    context.maxSteps = this.maxStepsPerValue * Math.max(countValues(context.input, limit), MIN_BUDGETED_VALUES)

    if (context.steps > context.maxSteps) {
      throw new CoercionBudgetExceededError()
    }
  }
}

function countValues(input: unknown, limit: number): number {
  const walked = new Set<object>()
  const stack = [input]
  let count = 1

  while (stack.length) {
    const value = stack.pop()

    if ((Array.isArray(value) || isPlainObject(value)) && !walked.has(value)) {
      walked.add(value)

      const items = Array.isArray(value) ? value : Object.values(value)

      for (let i = 0; i < items.length; i++) {
        if (++count >= limit) {
          return count
        }

        const item = items[i]

        if (isTypescriptObject(item)) {
          stack.push(item)
        }
      }
    }
  }

  return count
}

const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
function stringToNumber(value: string): number | string {
  if (!NUMBER_PATTERN.test(value)) {
    return value
  }

  const num = Number(value)

  // beyond the safe range digits get lost, `'12345678901234567890'` would become `12345678901234567168`
  if (num < Number.MIN_SAFE_INTEGER || num > Number.MAX_SAFE_INTEGER) {
    return value
  }

  return num
}

const INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/
function stringToInteger(value: string): number | string {
  if (!INTEGER_PATTERN.test(value)) {
    return value
  }

  const num = Number(value)

  if (!Number.isSafeInteger(num)) {
    return value
  }

  return num
}

function stringToBigInt(value: string, maxDigits: number): bigint | string {
  return parseBigIntString(value, maxDigits) ?? value
}

function numberToBigInt(value: number): bigint | number {
  if (!Number.isInteger(value)) {
    return value
  }

  return BigInt(value)
}

function stringToBoolean(value: string): boolean | string {
  const lower = value.toLowerCase()

  if (lower === 'false' || lower === 'off') {
    return false
  }

  if (lower === 'true' || lower === 'on') {
    return true
  }

  return value
}

const DATE_TIME_PATTERN = /^(?!-0{6})(?:[+-]\d{2})?\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
function stringToDate(value: string): Date | string {
  if (!DATE_TIME_PATTERN.test(value)) {
    return value
  }

  const yearEnd = value.indexOf('-', 1)
  const month = readTwoDigits(value, yearEnd + 1)
  const day = readTwoDigits(value, yearEnd + 4)

  if (
    day < 1
    || day > (DAYS_IN_MONTH[month - 1] ?? 0)
    || (month === 2 && day === 29 && !isLeapYear(Number(value.slice(0, yearEnd))))
  ) {
    return value
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date
}

function readTwoDigits(value: string, index: number): number {
  return (value.charCodeAt(index) - 48) * 10 + value.charCodeAt(index + 1) - 48
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function stringToURL(value: string): URL | string {
  return tryOrUndefined(() => new URL(value)) ?? value
}

function arrayToSet(value: unknown[]): Set<unknown> | unknown[] {
  const set = new Set(value)

  if (set.size !== value.length) {
    return value
  }

  return set
}

function arrayToMap(value: unknown[]): Map<unknown, unknown> | unknown[] {
  if (value.some(item => !Array.isArray(item) || item.length !== 2)) {
    return value
  }

  const result = new Map(value as [unknown, unknown][])

  if (result.size !== value.length) {
    return value
  }

  return result
}
