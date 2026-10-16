/**
 * Low-level SQL statement and fragment primitives.
 *
 * `SqlClient` uses this module to build executable, parameterized SQL from
 * reusable fragments. A statement can be executed, streamed, run without row
 * transformation, or compiled to SQL text and parameters for a specific
 * dialect. The module also contains helpers for identifiers, parameters,
 * inserts, updates, custom dialect fragments, statement compilation, and row
 * transformation.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Effectable from "../Effectable.ts"
import type * as Fiber from "../Fiber.ts"
import { constUndefined } from "../Function.ts"
import * as internalEffect from "../internal/effect.ts"
import * as InternalRecord from "../internal/record.ts"
import { hasProperty } from "../Predicate.ts"
import { TracerTimingEnabled } from "../References.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import type { Acquirer, Borrower, Connection, Row } from "./SqlConnection.ts"
import type { SqlError } from "./SqlError.ts"

const FragmentTypeId = "~effect/sql/Statement/Fragment"

/**
 * Composable SQL fragment represented as low-level segments that can be
 * interpolated into statements.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Fragment {
  readonly [FragmentTypeId]: typeof FragmentTypeId
  readonly segments: ReadonlyArray<Segment>
}

/**
 * Constructs a SQL `Fragment` from low-level statement segments.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fragment = (
  segments: ReadonlyArray<Segment>
): Fragment => ({
  [FragmentTypeId]: FragmentTypeId,
  segments
})

/**
 * Supported SQL dialect identifiers used by statement compilers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Dialect = "sqlite" | "pg" | "mysql" | "mssql" | "clickhouse"

/**
 * Executable SQL statement that is also a `Fragment` and `Effect`, with helpers
 * for raw execution, streaming, value rows, unprepared execution, no-transform
 * execution, and compilation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Statement<A> extends Fragment, Effect.Effect<ReadonlyArray<A>, SqlError> {
  readonly raw: Effect.Effect<unknown, SqlError>
  readonly withoutTransform: Effect.Effect<ReadonlyArray<A>, SqlError>
  readonly stream: Stream.Stream<A, SqlError>
  readonly values: Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>
  readonly valuesUnprepared: Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>
  readonly unprepared: Effect.Effect<ReadonlyArray<A>, SqlError>
  readonly compile: (withoutTransform?: boolean | undefined) => readonly [
    sql: string,
    params: ReadonlyArray<unknown>
  ]
}

/**
 * Hook that can rewrite or wrap a `Statement` before execution, using the
 * current SQL constructor, fiber, and tracing span.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Transformer = (
  self: Statement<unknown>,
  sql: Constructor,
  fiber: Fiber.Fiber<unknown, unknown>,
  span: Tracer.Span
) => Effect.Effect<Statement<unknown>>

/**
 * Context reference for an optional current SQL statement transformer applied
 * before statement execution.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const CurrentTransformer = Context.Reference<Transformer | undefined>("effect/sql/CurrentTransformer", {
  defaultValue: constUndefined
})

/**
 * Parents driver spans under `sql.execute` for every client in the current scope,
 * including acquisition and stream pulls. Defaults to `false`; ignored when tracing is disabled.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SpanPropagationEnabled = Context.Reference<boolean>("effect/sql/SpanPropagationEnabled", {
  defaultValue: () => false
})

/**
 * Returns `true` when a value is a SQL `Fragment`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isFragment = (u: unknown): u is Fragment => hasProperty(u, FragmentTypeId)

/**
 * Creates a type guard for custom SQL segments with the specified custom kind.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCustom = <A extends Custom<any, any, any, any>>(
  kind: A["kind"]
) =>
(u: unknown): u is A => hasProperty(u, "_tag") && u._tag === "Custom" && (u as any).kind === kind

/**
 * Union of low-level segment types that make up a SQL `Fragment`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Segment =
  | Literal
  | Identifier
  | Parameter
  | ArrayHelper
  | RecordInsertHelper
  | RecordUpdateHelper
  | RecordUpdateHelperSingle
  | Custom<any, any, any, any>

/**
 * Raw SQL literal segment. The literal text is inserted directly into the
 * compiled SQL, while optional `params` are appended as bind parameters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Literal {
  readonly _tag: "Literal"
  readonly value: string
  readonly params?: ReadonlyArray<unknown> | undefined
}

/**
 * Constructs a raw SQL literal segment. The literal text is not escaped, so use
 * bound parameters for untrusted values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const literal = (value: string, params?: ReadonlyArray<unknown> | undefined): Literal => ({
  _tag: "Literal",
  value,
  params
})

/**
 * SQL identifier segment whose value is escaped by the active dialect compiler.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Identifier {
  readonly _tag: "Identifier"
  readonly value: string
}

/**
 * Constructs a SQL identifier segment that will be escaped by the active
 * compiler.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const identifier = (value: string): Identifier => ({
  _tag: "Identifier",
  value
})

/**
 * Bound parameter segment whose value is emitted as a dialect-specific
 * placeholder and bind value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Parameter {
  readonly _tag: "Parameter"
  readonly value: unknown
}

/**
 * Constructs a bound parameter segment for a statement value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const parameter = (value: unknown): Parameter => ({
  _tag: "Parameter",
  value
})

/**
 * Helper segment for compiling an array of values, commonly used to produce
 * placeholder lists for `IN` clauses.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ArrayHelper {
  readonly _tag: "ArrayHelper"
  readonly value: ReadonlyArray<unknown | Fragment>
}

/**
 * Constructs an `ArrayHelper` segment for an array of values or fragments.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const arrayHelper = (value: ReadonlyArray<unknown | Fragment>): ArrayHelper => ({
  _tag: "ArrayHelper",
  value
})

/**
 * Helper segment for compiling one or more record objects into an INSERT
 * column/value clause, with optional returning output.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RecordInsertHelper {
  readonly _tag: "RecordInsertHelper"
  readonly value: ReadonlyArray<Record<string, unknown>>
  /**
   * @internal
   */
  readonly returningIdentifier: string | Fragment | undefined
  readonly returning: (sql: string | Identifier | Fragment) => RecordInsertHelper
}

const RecordInsertHelperProto = {
  _tag: "RecordInsertHelper" as const,
  returning(this: RecordInsertHelper, sql: string | Identifier | Fragment) {
    const self = Object.create(Object.getPrototypeOf(this))
    Object.assign(self, this, {
      returningIdentifier: typeof sql === "string" || isFragment(sql) ? sql : fragment([sql])
    })
    return self
  }
}

/**
 * Constructs a `RecordInsertHelper` from one or more row objects.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const recordInsertHelper = (
  value: ReadonlyArray<Record<string, unknown>>
): RecordInsertHelper =>
  Object.assign(Object.create(RecordInsertHelperProto), {
    value,
    returningIdentifier: undefined
  })

/**
 * Helper segment for compiling multi-row update values with a table alias and
 * optional returning output.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RecordUpdateHelper {
  readonly _tag: "RecordUpdateHelper"
  readonly value: ReadonlyArray<Record<string, unknown>>
  readonly alias: string
  /**
   * @internal
   */
  readonly returningIdentifier: string | Fragment | undefined
  readonly returning: (sql: string | Identifier | Fragment) => RecordUpdateHelper
}

const RecordUpdateHelperProto = {
  ...RecordInsertHelperProto,
  _tag: "RecordUpdateHelper" as const
}

/**
 * Constructs a `RecordUpdateHelper` for multi-row update compilation using the
 * provided alias.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const recordUpdateHelper = (
  value: ReadonlyArray<Record<string, unknown>>,
  alias: string
): RecordUpdateHelper =>
  Object.assign(Object.create(RecordUpdateHelperProto), {
    value,
    alias,
    returningIdentifier: undefined
  })

/**
 * Helper segment for compiling a single record into update assignments,
 * omitting selected columns and optionally returning output.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RecordUpdateHelperSingle {
  readonly _tag: "RecordUpdateHelperSingle"
  readonly value: Record<string, unknown>
  readonly omit: ReadonlyArray<string>
  /**
   * @internal
   */
  readonly returningIdentifier: string | Fragment | undefined
  readonly returning: (sql: string | Identifier | Fragment) => RecordUpdateHelperSingle
}

const RecordUpdateHelperSingleProto = {
  ...RecordInsertHelperProto,
  _tag: "RecordUpdateHelperSingle" as const
}

/**
 * Constructs a `RecordUpdateHelperSingle` from a record and a list of columns
 * to omit from the update.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const recordUpdateHelperSingle = (
  value: Record<string, unknown>,
  omit: ReadonlyArray<string>
): RecordUpdateHelperSingle =>
  Object.assign(Object.create(RecordUpdateHelperSingleProto), {
    value,
    omit,
    returningIdentifier: undefined
  })

/**
 * Custom SQL segment identified by `kind` and interpreted by the compiler's
 * `onCustom` callback.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Custom<
  T extends string = string,
  A = void,
  B = void,
  C = void
> {
  readonly _tag: "Custom"
  readonly kind: T
  readonly paramA: A
  readonly paramB: B
  readonly paramC: C
}

/**
 * Creates a constructor for custom SQL segments of a specific kind handled by
 * the active compiler.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const custom = <C extends Custom<any, any, any, any>>(
  kind: C["kind"]
) =>
(
  paramA: C["paramA"],
  paramB: C["paramB"],
  paramC: C["paramC"]
): C => ({ _tag: "Custom", kind, paramA, paramB, paramC } as C)

/**
 * Names the primitive value categories recognized by SQL statement helpers and
 * `primitiveKind`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PrimitiveKind =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "Date"
  | "null"
  | "Int8Array"
  | "Uint8Array"

/**
 * Union of helper segment types accepted by the SQL statement constructor.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Helper =
  | ArrayHelper
  | RecordInsertHelper
  | RecordUpdateHelper
  | RecordUpdateHelperSingle
  | Identifier
  | Custom

/**
 * SQL tagged-template constructor and helper API for building parameterized
 * statements, escaped identifiers, fragments, record helpers, and
 * dialect-specific branches. Raw helpers such as `unsafe` and `literal` insert
 * SQL text directly.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Constructor {
  <A extends object = Row>(
    strings: TemplateStringsArray,
    ...args: Array<any>
  ): Statement<A>

  (value: string): Identifier

  /**
   * Create unsafe SQL query
   */
  readonly unsafe: <A extends object>(
    sql: string,
    params?: ReadonlyArray<unknown> | undefined
  ) => Statement<A>

  readonly literal: (sql: string) => Fragment

  readonly in: {
    (value: ReadonlyArray<unknown>): ArrayHelper
    (column: string, value: ReadonlyArray<unknown>): Fragment
  }

  readonly insert: {
    (
      value: ReadonlyArray<Record<string, unknown>>
    ): RecordInsertHelper
    (value: Record<string, unknown>): RecordInsertHelper
  }

  /** Update a single row */
  readonly update: <A extends Record<string, unknown>>(
    value: A,
    omit?: ReadonlyArray<keyof A>
  ) => RecordUpdateHelperSingle

  /**
   * Update multiple rows.
   *
   * **Gotchas**
   *
   * Not supported in sqlite.
   */
  readonly updateValues: (
    value: ReadonlyArray<Record<string, unknown>>,
    alias: string
  ) => RecordUpdateHelper

  /**
   * Create an `AND` chain for a where clause
   */
  readonly and: (clauses: ReadonlyArray<string | Fragment>) => Fragment

  /**
   * Create an `OR` chain for a where clause
   */
  readonly or: (clauses: ReadonlyArray<string | Fragment>) => Fragment

  /**
   * Create comma seperated values, with an optional prefix.
   *
   * **When to use**
   *
   * Use when `ORDER BY` and `GROUP BY` clauses.
   */
  readonly csv: {
    (values: ReadonlyArray<string | Fragment>): Fragment
    (prefix: string, values: ReadonlyArray<string | Fragment>): Fragment
  }

  readonly join: (
    literal: string,
    addParens?: boolean,
    fallback?: string
  ) => (clauses: ReadonlyArray<string | Fragment>) => Fragment

  readonly onDialect: <A, B, C, D, E>(options: {
    readonly sqlite: () => A
    readonly pg: () => B
    readonly mysql: () => C
    readonly mssql: () => D
    readonly clickhouse: () => E
  }) => A | B | C | D | E

  readonly onDialectOrElse: <A, B = never, C = never, D = never, E = never, F = never>(options: {
    readonly orElse: () => A
    readonly sqlite?: () => B
    readonly pg?: () => C
    readonly mysql?: () => D
    readonly mssql?: () => E
    readonly clickhouse?: () => F
  }) => A | B | C | D | E | F
}

/**
 * Creates a cached SQL statement constructor from a connection acquirer,
 * compiler, tracing attributes, and optional row transformation function.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  acquirer: Acquirer,
  compiler: Compiler,
  spanAttributes: ReadonlyArray<readonly [string, unknown]>,
  transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  borrower?: Borrower | undefined
): Constructor => {
  const cache = transformRows === undefined ? constructorCache.noTransforms : constructorCache.transforms
  if (cache.has(acquirer)) {
    return cache.get(acquirer)!
  }
  const self = Object.assign(
    function sql(strings: unknown, ...args: Array<any>): any {
      if (typeof strings === "string") {
        return identifier(strings)
      } else if (Array.isArray(strings) && "raw" in strings) {
        return statement(
          acquirer,
          compiler,
          strings as TemplateStringsArray,
          args,
          spanAttributes,
          transformRows,
          borrower
        )
      }

      throw "absurd"
    },
    {
      unsafe<A extends object = Row>(
        sql: string,
        params?: ReadonlyArray<unknown>
      ) {
        return makeUnsafe<A>(
          [literal(sql, params)],
          acquirer,
          compiler,
          spanAttributes,
          transformRows,
          borrower
        )
      },
      literal(sql: string) {
        return fragment([literal(sql)])
      },
      in: in_,
      insert(value: any) {
        return recordInsertHelper(
          Array.isArray(value) ? value : [value]
        )
      },
      update(value: any, omit: any) {
        return recordUpdateHelperSingle(value, omit ?? [])
      },
      updateValues(value: any, alias: any) {
        return recordUpdateHelper(value, alias)
      },
      and,
      or,
      csv,
      join,
      onDialect(options: Record<Dialect, any>) {
        return options[compiler.dialect]()
      },
      onDialectOrElse(options: any) {
        return options[compiler.dialect] !== undefined ? options[compiler.dialect]() : options.orElse()
      }
    }
  )

  cache.set(acquirer, self)

  return self
}

const constructorCache = {
  transforms: new WeakMap<Acquirer, Constructor>(),
  noTransforms: new WeakMap<Acquirer, Constructor>()
}

/**
 * Builds a `Statement` from template strings and arguments, preserving
 * fragments and helper segments while converting ordinary interpolated values
 * into bound parameters.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const statement = <A = Row>(
  acquirer: Acquirer,
  compiler: Compiler,
  strings: TemplateStringsArray,
  args: Array<any>,
  spanAttributes: ReadonlyArray<readonly [string, unknown]>,
  transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  borrower?: Borrower | undefined
): Statement<A> => {
  const segments: Array<Segment> = strings[0].length > 0 ? [literal(strings[0])] : []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (isFragment(arg)) {
      segments.push(...arg.segments)
    } else if (isSegment(arg)) {
      segments.push(arg)
    } else {
      segments.push(parameter(arg))
    }

    if (strings[i + 1].length > 0) {
      segments.push(literal(strings[i + 1]))
    }
  }

  return makeUnsafe(segments, acquirer, compiler, spanAttributes, transformRows, borrower)
}

/**
 * Creates a helper that joins SQL clauses with a literal separator, optionally
 * wrapping multiple clauses in parentheses and using a fallback for an empty
 * list.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function join(lit: string, addParens = true, fallback = "") {
  const literalStatement = literal(lit)
  const fallbackFragment = fragment([literal(fallback)])

  return (clauses: ReadonlyArray<string | Fragment>): Fragment => {
    if (clauses.length === 0) {
      return fallbackFragment
    } else if (clauses.length === 1) {
      return fragment(convertLiteralOrFragment(clauses[0]))
    }

    const segments: Array<Segment> = []

    if (addParens) {
      segments.push(literal("("))
    }

    segments.push.apply(segments, convertLiteralOrFragment(clauses[0]))

    for (let i = 1; i < clauses.length; i++) {
      segments.push(literalStatement)
      segments.push.apply(segments, convertLiteralOrFragment(clauses[i]))
    }

    if (addParens) {
      segments.push(literal(")"))
    }

    return fragment(segments)
  }
}

/**
 * Combines clauses with `AND`, parenthesizing multiple clauses and returning
 * `1=1` when the list is empty.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const and: (clauses: ReadonlyArray<string | Fragment>) => Fragment = join(" AND ", true, "1=1")

/**
 * Combines clauses with `OR`, parenthesizing multiple clauses and returning
 * `1=1` when the list is empty.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const or: (clauses: ReadonlyArray<string | Fragment>) => Fragment = join(" OR ", true, "1=1")

/**
 * Creates a comma-separated SQL fragment from values, optionally adding a
 * prefix, and returns an empty fragment when no values are provided.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const csv: {
  (values: ReadonlyArray<string | Fragment>): Fragment
  (prefix: string, values: ReadonlyArray<string | Fragment>): Fragment
} = function(
  ...args:
    | [values: ReadonlyArray<string | Fragment>]
    | [prefix: string, values: ReadonlyArray<string | Fragment>]
) {
  if (args[args.length - 1].length === 0) {
    return emptyFragment
  }

  if (args.length === 1) {
    return csvRaw(args[0])
  }

  return fragment([
    literal(`${args[0]} `),
    ...csvRaw(args[1]).segments
  ])
}

const csvRaw = join(",", false)
const emptyFragment = fragment([literal("")])

/**
 * Dialect-specific compiler that converts a SQL `Fragment` into SQL text and
 * bind parameters, with a no-transform variant.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Compiler {
  readonly dialect: Dialect
  readonly compile: (
    statement: Fragment,
    withoutTransform: boolean
  ) => readonly [sql: string, params: ReadonlyArray<unknown>]
  readonly withoutTransform: this
}

/**
 * Callbacks used by `makeCompiler` to render dialect placeholders,
 * identifiers, insert helpers, update helpers, and custom SQL segments.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CompilerOptions<C extends Custom<any, any, any, any> = any> = {
  readonly dialect: Dialect
  readonly placeholder: (index: number, value: unknown) => string
  readonly onIdentifier: (value: string, withoutTransform: boolean) => string
  readonly onRecordUpdate: (
    placeholders: string,
    alias: string,
    columns: string,
    values: ReadonlyArray<ReadonlyArray<unknown>>,
    returning: readonly [sql: string, params: ReadonlyArray<unknown>] | undefined
  ) => readonly [sql: string, params: ReadonlyArray<unknown>]
  readonly onCustom: (
    type: C,
    placeholder: (u: unknown) => string,
    withoutTransform: boolean
  ) => readonly [sql: string, params: ReadonlyArray<unknown>]
  readonly onInsert?: (
    columns: ReadonlyArray<string>,
    placeholders: string,
    values: ReadonlyArray<ReadonlyArray<unknown>>,
    returning: readonly [sql: string, params: ReadonlyArray<unknown>] | undefined
  ) => readonly [sql: string, binds: ReadonlyArray<unknown>]
  readonly onRecordUpdateSingle?: (
    columns: ReadonlyArray<string>,
    values: ReadonlyArray<unknown>,
    returning: readonly [sql: string, params: ReadonlyArray<unknown>] | undefined
  ) => readonly [sql: string, params: ReadonlyArray<unknown>]
}

/**
 * Creates a dialect-specific SQL `Compiler` from rendering callbacks.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCompiler = <C extends Custom<any, any, any, any> = any>(
  options: CompilerOptions<C>
): Compiler => {
  const self = Object.create(CompilerProto)
  self.options = options
  self.dialect = options.dialect
  self.disableTransforms = false
  self.statementCache = new WeakMap<Fragment, CompiledStatement>()
  self.statementCacheNoTransform = new WeakMap<Fragment, CompiledStatement>()
  return self
}

type CompiledStatement = readonly [sql: string, binds: ReadonlyArray<unknown>]

interface CompilerImpl extends Compiler {
  readonly options: CompilerOptions
  readonly disableTransforms: boolean
  readonly statementCache: WeakMap<Fragment, CompiledStatement>
  readonly statementCacheNoTransform: WeakMap<Fragment, CompiledStatement>
  compile(
    statement: Fragment,
    withoutTransform?: boolean,
    placeholderOverride?: (u: unknown) => string
  ): CompiledStatement
}

const CompilerProto = {
  compile(
    this: CompilerImpl,
    statement: Fragment,
    withoutTransform = false,
    placeholderOverride?: (u: unknown) => string
  ): readonly [sql: string, binds: ReadonlyArray<unknown>] {
    const opts = this.options
    withoutTransform = withoutTransform || this.disableTransforms
    const cache = withoutTransform ? this.statementCacheNoTransform : this.statementCache
    const cached = cache.get(statement)
    if (cached !== undefined && placeholderOverride === undefined) {
      return cached
    }

    const segments = statement.segments
    const len = segments.length

    let sql = ""
    const binds: Array<unknown> = []
    let placeholderCount = 0
    const placeholder = placeholderOverride ?? ((u: unknown) => opts.placeholder(++placeholderCount, u))
    const placeholderNoIncrement = (u: unknown) => opts.placeholder(placeholderCount, u)
    const placeholders = makePlaceholdersArray(placeholder)

    for (let i = 0; i < len; i++) {
      const segment = segments[i]

      switch (segment._tag) {
        case "Literal": {
          sql += segment.value
          if (segment.params) {
            binds.push.apply(binds, segment.params as any)
          }
          break
        }

        case "Identifier": {
          sql += opts.onIdentifier(segment.value, withoutTransform)
          break
        }

        case "Parameter": {
          sql += placeholder(segment.value)
          binds.push(segment.value)
          break
        }

        case "ArrayHelper": {
          sql += `(${placeholders(segment.value)})`
          binds.push.apply(binds, segment.value as any)
          break
        }

        case "RecordInsertHelper": {
          const keys = Object.keys(segment.value[0])

          if (opts.onInsert) {
            const values: Array<ReadonlyArray<unknown>> = new Array(segment.value.length)
            let placeholders = ""
            for (let i = 0; i < segment.value.length; i++) {
              const row: Array<unknown> = new Array(keys.length)
              values[i] = row
              placeholders += i === 0 ? "(" : ",("
              for (let j = 0; j < keys.length; j++) {
                const key = keys[j]
                const value = segment.value[i][key]
                const primitive = extractPrimitive(value, opts.onCustom, placeholderNoIncrement, withoutTransform)
                row[j] = primitive
                placeholders += j === 0 ? placeholder(value) : `,${placeholder(value)}`
              }
              placeholders += ")"
            }
            const [s, b] = opts.onInsert(
              keys.map((_) => opts.onIdentifier(_, withoutTransform)),
              placeholders,
              values,
              typeof segment.returningIdentifier === "string"
                ? [segment.returningIdentifier, []]
                : segment.returningIdentifier
                ? this.compile(segment.returningIdentifier, withoutTransform, placeholder)
                : undefined
            )
            sql += s
            binds.push.apply(binds, b as any)
          } else {
            let placeholders = ""
            for (let i = 0; i < segment.value.length; i++) {
              placeholders += i === 0 ? "(" : ",("
              for (let j = 0; j < keys.length; j++) {
                const value = segment.value[i][keys[j]]
                const primitive = extractPrimitive(value, opts.onCustom, placeholderNoIncrement, withoutTransform)
                binds.push(primitive)
                placeholders += j === 0 ? placeholder(value) : `,${placeholder(value)}`
              }
              placeholders += ")"
            }
            sql += `${
              generateColumns(
                keys,
                opts.onIdentifier,
                withoutTransform
              )
            } VALUES ${placeholders}`

            if (typeof segment.returningIdentifier === "string") {
              sql += ` RETURNING ${segment.returningIdentifier}`
            } else if (segment.returningIdentifier) {
              sql += " RETURNING "
              const [s, b] = this.compile(segment.returningIdentifier, withoutTransform, placeholder)
              sql += s
              binds.push.apply(binds, b as any)
            }
          }
          break
        }

        case "RecordUpdateHelperSingle": {
          let keys = Object.keys(segment.value)
          if (segment.omit.length > 0) {
            keys = keys.filter((key) => !segment.omit.includes(key))
          }
          if (opts.onRecordUpdateSingle) {
            const [s, b] = opts.onRecordUpdateSingle(
              keys.map((_) => opts.onIdentifier(_, withoutTransform)),
              keys.map((key) =>
                extractPrimitive(
                  segment.value[key],
                  opts.onCustom,
                  placeholderNoIncrement,
                  withoutTransform
                )
              ),
              typeof segment.returningIdentifier === "string"
                ? [segment.returningIdentifier, []]
                : segment.returningIdentifier
                ? this.compile(segment.returningIdentifier, withoutTransform, placeholder)
                : undefined
            )
            sql += s
            binds.push.apply(binds, b as any)
          } else {
            for (let i = 0, len = keys.length; i < len; i++) {
              const column = opts.onIdentifier(keys[i], withoutTransform)
              if (i === 0) {
                sql += `${column} = ${placeholder(segment.value[keys[i]])}`
              } else {
                sql += `, ${column} = ${placeholder(segment.value[keys[i]])}`
              }
              binds.push(
                extractPrimitive(
                  segment.value[keys[i]],
                  opts.onCustom,
                  placeholderNoIncrement,
                  withoutTransform
                )
              )
            }
            if (typeof segment.returningIdentifier === "string") {
              if (this.dialect === "mssql") {
                sql += ` OUTPUT ${segment.returningIdentifier === "*" ? "INSERTED.*" : segment.returningIdentifier}`
              } else {
                sql += ` RETURNING ${segment.returningIdentifier}`
              }
            } else if (segment.returningIdentifier) {
              sql += this.dialect === "mssql" ? " OUTPUT " : " RETURNING "
              const [s, b] = this.compile(segment.returningIdentifier, withoutTransform, placeholder)
              sql += s
              binds.push.apply(binds, b as any)
            }
          }
          break
        }

        case "RecordUpdateHelper": {
          const keys = Object.keys(segment.value[0])
          const values: Array<ReadonlyArray<unknown>> = new Array(segment.value.length)
          let placeholders = ""
          for (let i = 0; i < segment.value.length; i++) {
            const row: Array<unknown> = new Array(keys.length)
            values[i] = row
            placeholders += i === 0 ? "(" : ",("
            for (let j = 0; j < keys.length; j++) {
              const key = keys[j]
              const value = segment.value[i][key]
              row[j] = extractPrimitive(value, opts.onCustom, placeholderNoIncrement, withoutTransform)
              placeholders += j === 0 ? placeholder(value) : `,${placeholder(value)}`
            }
            placeholders += ")"
          }
          const [s, b] = opts.onRecordUpdate(
            placeholders,
            segment.alias,
            generateColumns(keys, opts.onIdentifier, withoutTransform),
            values,
            typeof segment.returningIdentifier === "string"
              ? [segment.returningIdentifier, []]
              : segment.returningIdentifier
              ? this.compile(segment.returningIdentifier, withoutTransform, placeholder)
              : undefined
          )
          sql += s
          binds.push.apply(binds, b as any)
          break
        }

        case "Custom": {
          const [s, b] = opts.onCustom(segment, placeholder, withoutTransform)
          sql += s
          binds.push.apply(binds, b as any)
          break
        }
      }
    }

    const result = [sql, binds] as const
    if (placeholderOverride !== undefined) {
      return result
    }
    cache.set(statement, result)
    return result
  },

  get withoutTransform() {
    const self = Object.create(CompilerProto)
    Object.assign(self, this, {
      disableTransforms: true
    })
    return self
  }
}

/**
 * Creates a SQLite compiler that uses `?` placeholders and quoted identifiers,
 * optionally transforming identifier names before escaping.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCompilerSqlite = (transform?: ((_: string) => string) | undefined): Compiler =>
  makeCompiler({
    dialect: "sqlite",
    placeholder(_) {
      return "?"
    },
    onIdentifier: transform ?
      function(value, withoutTransform) {
        return withoutTransform ? escapeSqlite(value) : escapeSqlite(transform(value))
      } :
      escapeSqlite,
    onRecordUpdate() {
      return ["", []]
    },
    onCustom() {
      return ["", []]
    }
  })

/**
 * Creates an identifier escaping function that wraps names in the given
 * delimiter, doubles delimiter characters, and escapes dots between identifier
 * parts.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function defaultEscape(c: string) {
  const re = new RegExp(c, "g")
  const double = c + c
  const dot = c + "." + c
  return function(str: string): string {
    return c + str.replace(re, double).replace(/\./g, dot) + c
  }
}

/**
 * Classifies a JavaScript value as a SQL primitive kind, treating `undefined`
 * as `null` and defaulting unrecognized objects to `string`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const primitiveKind = (value: unknown): PrimitiveKind => {
  switch (typeof value) {
    case "string":
      return "string"
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "bigint":
      return "bigint"
    case "undefined":
      return "null"
  }

  if (value === null) {
    return "null"
  } else if (value instanceof Date) {
    return "Date"
  } else if (value instanceof Uint8Array) {
    return "Uint8Array"
  } else if (value instanceof Int8Array) {
    return "Int8Array"
  }

  return "string"
}

/**
 * Builds value, object, and row-array transformers that rename object keys with
 * the supplied function and optionally recurse into nested object arrays.
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const defaultTransforms = (
  transformer: (str: string) => string,
  nested = true
) => {
  const transformValue = (value: any) => {
    if (Array.isArray(value)) {
      if (value.length === 0 || value[0].constructor !== Object) {
        return value
      }
      return array(value)
    } else if (value?.constructor === Object) {
      return transformObject(value)
    }
    return value
  }

  const transformObject = (obj: Record<string, any>): any => {
    const newObj: Record<string, any> = {}
    for (const key of Object.keys(obj)) {
      InternalRecord.assignProperty(newObj, transformer(key), transformValue(obj[key]))
    }
    return newObj
  }

  const transformArrayNested = <A extends object>(
    rows: ReadonlyArray<A>
  ): ReadonlyArray<A> => {
    const newRows: Array<A> = new Array(rows.length)
    for (let i = 0, len = rows.length; i < len; i++) {
      const row = rows[i]
      if (Array.isArray(row)) {
        newRows[i] = transformArrayNested(row) as any
      } else {
        const obj: any = {}
        for (const [key, value] of Object.entries(row)) {
          InternalRecord.assignProperty(obj, transformer(key), transformValue(value))
        }
        newRows[i] = obj
      }
    }
    return newRows
  }

  const transformArray = <A extends object>(
    rows: ReadonlyArray<A>
  ): ReadonlyArray<A> => {
    const newRows: Array<A> = new Array(rows.length)
    for (let i = 0, len = rows.length; i < len; i++) {
      const row = rows[i]
      if (Array.isArray(row)) {
        newRows[i] = transformArray(row) as any
      } else {
        const obj: any = {}
        for (const [key, value] of Object.entries(row)) {
          InternalRecord.assignProperty(obj, transformer(key), value)
        }
        newRows[i] = obj
      }
    }
    return newRows
  }

  const array = nested ? transformArrayNested : transformArray

  return {
    value: transformValue,
    object: transformObject,
    array
  } as const
}

// internal

const ATTR_DB_OPERATION_NAME = "db.operation.name"
const ATTR_DB_QUERY_TEXT = "db.query.text"

interface StatementImpl<A> extends Statement<A> {
  readonly segments: ReadonlyArray<Segment>
  readonly acquirer: Acquirer
  readonly compiler: Compiler
  readonly spanAttributes: ReadonlyArray<readonly [string, unknown]>
  readonly transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  readonly borrower: Borrower | undefined

  withConnection<XA, E>(
    operation: string,
    f: (
      connection: Connection,
      sql: string,
      params: ReadonlyArray<unknown>
    ) => Effect.Effect<XA, E>,
    withoutTransform?: boolean | undefined
  ): Effect.Effect<XA, E | SqlError>
  withConnectionSpan<XA, E>(
    operation: string,
    f: (
      connection: Connection,
      sql: string,
      params: ReadonlyArray<unknown>
    ) => Effect.Effect<XA, E>,
    withoutTransform: boolean,
    span: Tracer.Span
  ): Effect.Effect<XA, E | SqlError>
}

const makeUnsafe = <A = Row>(
  segments: ReadonlyArray<Segment>,
  acquirer: Acquirer,
  compiler: Compiler,
  spanAttributes: ReadonlyArray<readonly [string, unknown]>,
  transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  borrower: Borrower | undefined
): StatementImpl<A> => {
  const self = Object.create(StatementProto)
  self.segments = segments
  self.acquirer = acquirer
  self.compiler = compiler
  self.spanAttributes = spanAttributes
  self.transformRows = transformRows
  self.borrower = borrower
  return self
}

// TODO: figure out why these diagnostics are emitted
const StatementProto: Omit<
  StatementImpl<any>,
  "segments" | "acquirer" | "compiler" | "spanAttributes" | "transformRows" | "borrower"
> = {
  [FragmentTypeId]: FragmentTypeId,
  withConnection<XA, E>(
    this: StatementImpl<any>,
    operation: string,
    f: (
      connection: Connection,
      sql: string,
      params: ReadonlyArray<unknown>
    ) => Effect.Effect<XA, E>,
    withoutTransform = false
  ): Effect.Effect<XA, E | SqlError> {
    return Effect.useSpan(
      "sql.execute",
      { kind: "client" },
      (span) =>
        this.withConnectionSpan(
          operation,
          f,
          withoutTransform,
          span
        )
    )
  },
  withConnectionSpan<XA, E>(
    this: StatementImpl<any>,
    operation: string,
    f: (
      connection: Connection,
      sql: string,
      params: ReadonlyArray<unknown>
    ) => Effect.Effect<XA, E>,
    withoutTransform: boolean,
    span: Tracer.Span
  ): Effect.Effect<XA, E | SqlError> {
    return withStatement(this, span, (statement, fiber) => {
      const [sql, params] = statement.compile(withoutTransform)
      for (const [key, value] of this.spanAttributes) {
        span.attribute(key, value)
      }
      span.attribute(ATTR_DB_OPERATION_NAME, operation)
      span.attribute(ATTR_DB_QUERY_TEXT, sql)
      const execute = this.borrower === undefined
        ? Effect.scoped(Effect.flatMap(this.acquirer, (_) => f(_, sql, params)))
        : this.borrower((connection: Connection) => f(connection, sql, params))
      return fiber.cache.tracerEnabled && fiber.getRef(SpanPropagationEnabled)
        ? Effect.provideService(execute, Tracer.ParentSpan, span)
        : execute
    })
  },

  get withoutTransform(): Effect.Effect<ReadonlyArray<any>, SqlError> {
    return this.withConnection(
      "executeWithoutTransform",
      (connection, sql, params) => connection.execute(sql, params, undefined),
      true
    )
  },

  get raw(): Effect.Effect<unknown, SqlError> {
    return this.withConnection(
      "executeRaw",
      (connection, sql, params) => connection.executeRaw(sql, params),
      true
    )
  },

  get stream(): Stream.Stream<any, SqlError> {
    const self = this as StatementImpl<any>
    return Stream.unwrap(Effect.flatMap(
      Effect.makeSpanScoped("sql.execute", { kind: "client" }),
      (span) =>
        withStatement(self, span, (statement, fiber) => {
          const [sql, params] = statement.compile()
          for (const [key, value] of self.spanAttributes) {
            span.attribute(key, value)
          }
          span.attribute(ATTR_DB_OPERATION_NAME, "executeStream")
          span.attribute(ATTR_DB_QUERY_TEXT, sql)
          const acquire = Effect.map(self.acquirer, (_) => _.executeStream(sql, params, self.transformRows))
          return fiber.cache.tracerEnabled && fiber.getRef(SpanPropagationEnabled)
            ? Effect.succeed(Stream.provideService(Stream.unwrap(acquire), Tracer.ParentSpan, span))
            : acquire
        })
    ))
  },

  get values(): Effect.Effect<
    ReadonlyArray<ReadonlyArray<unknown>>,
    SqlError
  > {
    return this.withConnection("executeValues", (connection, sql, params) => connection.executeValues(sql, params))
  },

  get valuesUnprepared(): Effect.Effect<
    ReadonlyArray<ReadonlyArray<unknown>>,
    SqlError
  > {
    return this.withConnection(
      "executeValuesUnprepared",
      (connection, sql, params) => connection.executeValuesUnprepared(sql, params)
    )
  },

  get unprepared(): Effect.Effect<ReadonlyArray<any>, SqlError> {
    const self = this as StatementImpl<any>
    return self.withConnection(
      "executeUnprepared",
      (connection, sql, params) => connection.executeUnprepared(sql, params, self.transformRows)
    )
  },

  ...Effectable.Prototype<StatementImpl<any>>({
    label: "Statement",
    evaluate(fiber) {
      const span = internalEffect.makeSpanUnsafe(fiber, "sql.execute", { kind: "client" })
      const clock = fiber.getRef(Clock)
      const timingEnabled = fiber.getRef(TracerTimingEnabled)
      return Effect.onExit(
        this.withConnectionSpan(
          "execute",
          (connection, sql, params) => connection.execute(sql, params, this.transformRows),
          false,
          span
        ),
        (exit) => internalEffect.endSpan(span, exit, clock, timingEnabled)
      )
    }
  }),

  compile(
    this: StatementImpl<any>,
    withoutTransform?: boolean | undefined
  ) {
    return this.compiler.compile(this, withoutTransform ?? false)
  },
  toJSON(this: StatementImpl<any>) {
    const [sql, params] = this.compile()
    return {
      _id: "Statement",
      segments: this.segments,
      sql,
      params
    }
  }
}

const withStatement = <A, X, E, R>(
  self: StatementImpl<A>,
  span: Tracer.Span,
  f: (statement: StatementImpl<A>, fiber: Fiber.Fiber<unknown, unknown>) => Effect.Effect<X, E, R>
) =>
  Effect.withFiber<X, E, R>((fiber) => {
    const transform = fiber.getRef(CurrentTransformer)
    if (transform === undefined) {
      return f(self, fiber)
    }
    return Effect.flatMap(
      transform(
        self,
        make(self.acquirer, self.compiler, self.spanAttributes, self.transformRows, self.borrower),
        fiber,
        span
      ) as Effect.Effect<StatementImpl<A>>,
      (statement) => f(statement, fiber)
    )
  })

const isSegment = (u: unknown): u is Segment => {
  if (!hasProperty(u, "_tag")) {
    return false
  }
  switch (u._tag) {
    case "Literal":
    case "Parameter":
    case "ArrayHelper":
    case "RecordInsertHelper":
    case "RecordUpdateHelper":
    case "RecordUpdateHelperSingle":
    case "Identifier":
    case "Custom":
      return true
    default:
      return false
  }
}

function convertLiteralOrFragment(clause: string | Fragment): Array<Segment> {
  if (typeof clause === "string") {
    return [literal(clause)]
  }
  return clause.segments as Array<Segment>
}

const makePlaceholdersArray = (evaluate: (u: unknown) => string) => (values: ReadonlyArray<unknown>): string => {
  if (values.length === 0) {
    return ""
  }

  let result = evaluate(values[0])
  for (let i = 1; i < values.length; i++) {
    result += `,${evaluate(values[i])}`
  }

  return result
}

const generateColumns = (
  keys: ReadonlyArray<string>,
  escape: (_: string, withoutTransform: boolean) => string,
  withoutTransform: boolean
) => {
  if (keys.length === 0) {
    return "()"
  }

  let str = `(${escape(keys[0], withoutTransform)}`
  for (let i = 1; i < keys.length; i++) {
    str += `,${escape(keys[i], withoutTransform)}`
  }
  return str + ")"
}

const extractPrimitive = (
  value: unknown,
  onCustom: (
    type: Custom<string, unknown, unknown>,
    placeholder: (u: unknown) => string,
    withoutTransform: boolean
  ) => readonly [sql: string, binds: ReadonlyArray<unknown>],
  placeholder: (u: unknown) => string,
  withoutTransform: boolean
): unknown => {
  if (value === undefined) {
    return null
  } else if (isFragment(value)) {
    const head = value.segments[0]
    if (head._tag === "Custom") {
      const compiled = onCustom(head, placeholder, withoutTransform)
      return compiled[1][0] ?? null
    } else if (head._tag === "Parameter") {
      return head.value
    }
    return null
  }
  return value
}

const escapeSqlite = defaultEscape("\"")

function in_(values: ReadonlyArray<unknown>): ArrayHelper
function in_(column: string, values: ReadonlyArray<unknown>): Fragment
function in_(): Fragment | ArrayHelper {
  if (arguments.length === 1) {
    return arrayHelper(arguments[0])
  }
  const column = arguments[0]
  const values = arguments[1]
  return values.length === 0 ? neverFragment : fragment([
    identifier(column),
    literal(" IN "),
    arrayHelper(values)
  ])
}

const neverFragment = fragment([literal("1=0")])
