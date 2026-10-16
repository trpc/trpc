/**
 * Schema-aware `RequestResolver` helpers for SQL-backed data loading.
 *
 * This module represents each lookup or mutation as a `SqlRequest` and batches
 * concurrent requests into SQL operations. Request payloads are encoded with the
 * request schema before `execute` is called, and returned rows are decoded with
 * the result schema before requests are completed. It provides ordered,
 * grouped, id-based, and side-effect-only resolver constructors, and keeps
 * batches separated by the active SQL transaction connection.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import * as Exit from "../Exit.ts"
import * as Hash from "../Hash.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import * as Option from "../Option.ts"
import * as Request from "../Request.ts"
import * as RequestResolver from "../RequestResolver.ts"
import * as Schema from "../Schema.ts"
import type * as Types from "../Types.ts"
import * as SqlClient from "./SqlClient.ts"
import { ResultLengthMismatch } from "./SqlError.ts"

/**
 * Request type used by SQL request resolvers, carrying the input payload
 * together with the resolver's result, error, and environment types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SqlRequest<In, A, E, R> extends Request.Request<A, E | Schema.SchemaError, R> {
  readonly payload: In
}

const SqlRequestProto = {
  ...Request.Class.prototype,
  [Equal.symbol](
    this: SqlRequest<any, any, any, any>,
    that: SqlRequest<any, any, any, any>
  ): boolean {
    return Equal.equals(this.payload, that.payload)
  },
  [Hash.symbol](this: SqlRequest<any, any, any, any>): number {
    return Hash.hash(this.payload)
  }
}

/**
 * Runs a payload as a `SqlRequest` through a request resolver, either directly
 * with a payload and resolver or curried by resolver.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const request: {
  <In, A, E, R>(
    resolver: RequestResolver.RequestResolver<SqlRequest<In, A, E, R>>
  ): (payload: In) => Effect.Effect<A, E | Schema.SchemaError, R>
  <In, A, E, R>(
    payload: In,
    resolver: RequestResolver.RequestResolver<SqlRequest<In, A, E, R>>
  ): Effect.Effect<A, E | Schema.SchemaError, R>
} = function() {
  if (arguments.length === 1) {
    const resolver = arguments[0]
    return (payload: any) => Effect.request(SqlRequest(payload), resolver)
  }
  return Effect.request(SqlRequest(arguments[0]), arguments[1])
} as any

/**
 * Constructs a `SqlRequest` from a payload. Equality and hashing are based on
 * the payload so equal requests can be batched and deduplicated.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const SqlRequest = <In, A, E, R>(payload: In): SqlRequest<In, A, E, R> => {
  const self = Object.create(SqlRequestProto)
  self.payload = payload
  return self
}

/**
 * Creates a resolver for a SQL query with a request schema and a result schema.
 *
 * **Details**
 *
 * The request schema is used to validate the input of the query, and the result
 * schema is used to validate the output of the query. Results are mapped to the
 * requests in order, so the length of the results must match the length of the
 * requests.
 *
 * @stability unstable
 * @category resolvers
 * @since 4.0.0
 */
export const ordered = <Req extends Schema.Constraint, Res extends Schema.Constraint, _, E, R>(
  options: {
    readonly Request: Req
    readonly Result: Res
    readonly execute: (
      requests: Arr.NonEmptyArray<Req["Encoded"]>
    ) => Effect.Effect<ReadonlyArray<_>, E, R>
  }
): RequestResolver.RequestResolver<
  SqlRequest<Req["Type"], Res["Type"], E | ResultLengthMismatch, Req["EncodingServices"] | Res["DecodingServices"] | R>
> => {
  const decodeArray = Schema.decodeUnknownEffect(Schema.Array(options.Result))
  return RequestResolver.makeGrouped<
    SqlRequest<
      Req["Type"],
      Res["Type"],
      E | ResultLengthMismatch,
      Req["EncodingServices"] | Res["DecodingServices"] | R
    >,
    SqlClient.TransactionConnection.Service | undefined
  >({
    key: transactionKey,
    resolver: Effect.fnUntraced(function*(entries) {
      const [inputs, encodedEntries] = yield* partitionRequests(entries, options.Request)
      if (!Arr.isArrayNonEmpty(inputs)) return
      const results = yield* options.execute(inputs).pipe(
        Effect.provideContext(entries[0].context)
      )
      if (results.length !== inputs.length) {
        return yield* new ResultLengthMismatch({ expected: inputs.length, actual: results.length })
      }
      const decodedResults = yield* decodeArray(results).pipe(
        Effect.provideContext(entries[0].context)
      )
      for (let i = 0; i < encodedEntries.length; i++) {
        encodedEntries[i].completeUnsafe(Exit.succeed(decodedResults[i]))
      }
    })
  })
}

/**
 * Creates a batched SQL request resolver that encodes requests, decodes result
 * rows, groups decoded results by matching request and result keys, and fails a
 * request with `NoSuchElementError` when no result group exists.
 *
 * @stability unstable
 * @category resolvers
 * @since 4.0.0
 */
export const grouped = <Req extends Schema.Constraint, Res extends Schema.Constraint, K, Row, E, R>(
  options: {
    readonly Request: Req
    readonly RequestGroupKey: (request: Req["Type"]) => K
    readonly Result: Res
    readonly ResultGroupKey: (result: Res["Type"], row: Types.NoInfer<Row>) => K
    readonly execute: (
      requests: Arr.NonEmptyArray<Req["Encoded"]>
    ) => Effect.Effect<ReadonlyArray<Row>, E, R>
  }
): RequestResolver.RequestResolver<
  SqlRequest<
    Req["Type"],
    Arr.NonEmptyArray<Res["Type"]>,
    E | Schema.SchemaError | Cause.NoSuchElementError,
    Req["EncodingServices"] | Res["DecodingServices"] | R
  >
> => {
  const decodeResults = Schema.decodeUnknownEffect(Schema.Array(options.Result))

  return RequestResolver.makeGrouped<
    SqlRequest<
      Req["Type"],
      Arr.NonEmptyArray<Res["Type"]>,
      E | Schema.SchemaError | Cause.NoSuchElementError,
      Req["EncodingServices"] | Res["DecodingServices"] | R
    >,
    SqlClient.TransactionConnection.Service | undefined
  >({
    key: transactionKey,
    resolver: Effect.fnUntraced(function*(entries) {
      const [inputs] = yield* partitionRequests(entries, options.Request)
      if (!Arr.isArrayNonEmpty(inputs)) return
      const resultMap = MutableHashMap.empty<K, Arr.NonEmptyArray<Res["Type"]>>()
      const results = yield* options.execute(inputs).pipe(
        Effect.provideContext(entries[0].context)
      )
      const decodedResults = yield* decodeResults(results).pipe(
        Effect.provideContext(entries[0].context)
      )
      for (let i = 0, len = decodedResults.length; i < len; i++) {
        const result = decodedResults[i]
        const key = options.ResultGroupKey(result, results[i])
        const group = MutableHashMap.get(resultMap, key)
        if (group._tag === "None") {
          MutableHashMap.set(resultMap, key, [result])
        } else {
          group.value.push(result)
        }
      }
      for (let i = 0, len = entries.length; i < len; i++) {
        const entry = entries[i]
        const key = options.RequestGroupKey(entry.request.payload)
        const result = MutableHashMap.get(resultMap, key)
        entry.completeUnsafe(
          result._tag === "None" ? constNoSuchElement : Exit.succeed(result.value)
        )
      }
    })
  })
}

/**
 * Creates a batched resolver that fetches rows for encoded ids, decodes
 * results, completes each matching request using `ResultId`, and fails missing
 * ids with `NoSuchElementError`.
 *
 * @stability unstable
 * @category resolvers
 * @since 4.0.0
 */
export const findById = <Id extends Schema.Constraint, Res extends Schema.Constraint, Row, E, R>(
  options: {
    readonly Id: Id
    readonly Result: Res
    readonly ResultId: (result: Res["Type"], row: Types.NoInfer<Row>) => Id["Type"]
    readonly execute: (
      requests: Arr.NonEmptyArray<Id["Encoded"]>
    ) => Effect.Effect<ReadonlyArray<Row>, E, R>
  }
): RequestResolver.RequestResolver<
  SqlRequest<
    Id["Type"],
    Res["Type"],
    E | Schema.SchemaError | Cause.NoSuchElementError,
    Id["EncodingServices"] | Res["DecodingServices"] | R
  >
> => {
  const decodeResults = Schema.decodeUnknownEffect(Schema.Array(options.Result))

  return RequestResolver.makeGrouped<
    SqlRequest<
      Id["Type"],
      Res["Type"],
      E | Schema.SchemaError | Cause.NoSuchElementError,
      Id["EncodingServices"] | Res["DecodingServices"] | R
    >,
    SqlClient.TransactionConnection.Service | undefined
  >({
    key: transactionKey,
    resolver: Effect.fnUntraced(function*(entries) {
      const [inputs, idMap] = yield* partitionRequestsById(entries, options.Id)
      if (!Arr.isArrayNonEmpty(inputs)) return
      const results = yield* options.execute(inputs).pipe(
        Effect.provideContext(entries[0].context)
      )
      const decodedResults = yield* decodeResults(results).pipe(
        Effect.provideContext(entries[0].context)
      )
      for (let i = 0; i < decodedResults.length; i++) {
        const result = decodedResults[i]
        const id = options.ResultId(result, results[i])
        const request = MutableHashMap.get(idMap, id)
        if (request._tag === "None") {
          continue
        }
        MutableHashMap.remove(idMap, id)
        request.value.completeUnsafe(Exit.succeed(result))
      }
      if (MutableHashMap.isEmpty(idMap)) {
        return
      }
      MutableHashMap.forEach(idMap, (request) => {
        request.completeUnsafe(constNoSuchElement)
      })
    })
  })
}

const void_ = <Req extends Schema.Constraint, _, E, R>(
  options: {
    readonly Request: Req
    readonly execute: (
      requests: Arr.NonEmptyArray<Req["Encoded"]>
    ) => Effect.Effect<ReadonlyArray<_>, E, R>
  }
): RequestResolver.RequestResolver<
  SqlRequest<
    Req["Type"],
    void,
    E | Schema.SchemaError,
    Req["EncodingServices"] | R
  >
> =>
  RequestResolver.makeGrouped<
    SqlRequest<
      Req["Type"],
      void,
      E | Schema.SchemaError,
      Req["EncodingServices"] | R
    >,
    SqlClient.TransactionConnection.Service | undefined
  >({
    key: transactionKey,
    resolver: Effect.fnUntraced(function*(entries) {
      const [inputs] = yield* partitionRequests(entries, options.Request)
      if (!Arr.isArrayNonEmpty(inputs)) return
      yield* options.execute(inputs).pipe(
        Effect.provideContext(entries[0].context)
      )
      for (let i = 0; i < entries.length; i++) {
        entries[i].completeUnsafe(Exit.void)
      }
    })
  })

/**
 * @stability unstable
 */
export {
  /**
   * Create a resolver that performs side effects.
   *
   * @stability unstable
   * @category resolvers
   * @since 4.0.0
   */
  void_ as void
}

const constNoSuchElement = Exit.fail(new Cause.NoSuchElementError())

const partitionRequests = function*<In, A, E, R, InE>(
  requests: Arr.NonEmptyArray<Request.Entry<SqlRequest<In, A, E, R>>>,
  schema: Schema.ConstraintCodec<In, InE, R, R>
) {
  const len = requests.length
  const inputs = Arr.empty<InE>()
  const encodedEntries = Arr.empty<Request.Entry<SqlRequest<In, A, E, R>>>()
  let entry!: Request.Entry<SqlRequest<In, A, E, R>>
  const encode = Schema.encodeEffect(schema)
  const handle = Effect.matchCauseEager({
    onFailure(cause: Cause.Cause<Schema.SchemaError>) {
      entry.completeUnsafe(Exit.failCause(cause))
    },
    onSuccess(value: InE) {
      inputs.push(value)
      encodedEntries.push(entry)
    }
  })

  for (let i = 0; i < len; i++) {
    entry = requests[i]
    yield (Effect.provideContext(handle(encode(entry.request.payload)), entry.context) as Effect.Effect<void>)
  }

  return [inputs, encodedEntries] as const
}

const partitionRequestsById = function*<In, A, E, R, InE>(
  requests: ReadonlyArray<Request.Entry<SqlRequest<In, A, E, R>>>,
  schema: Schema.ConstraintCodec<In, InE, R, R>
) {
  const len = requests.length
  const inputs = Arr.empty<InE>()
  const byIdMap = MutableHashMap.empty<In, Request.Entry<SqlRequest<In, A, E, R>>>()

  for (let i = 0; i < len; i++) {
    const entry = requests[i]
    const existing = MutableHashMap.get(byIdMap, entry.request.payload)
    if (Option.isSome(existing)) {
      const previous = existing.value
      MutableHashMap.set(byIdMap, entry.request.payload, {
        ...previous,
        completeUnsafe(exit) {
          previous.completeUnsafe(exit)
          entry.completeUnsafe(exit)
        }
      })
    } else {
      MutableHashMap.set(byIdMap, entry.request.payload, entry)
    }
  }

  const encode = Schema.encodeEffect(schema)
  for (const [, entry] of byIdMap) {
    yield* Effect.provideContext(
      Effect.matchCauseEager(encode(entry.request.payload), {
        onFailure(cause) {
          entry.completeUnsafe(Exit.failCause(cause))
        },
        onSuccess(value) {
          inputs.push(value)
        }
      }),
      entry.context
    )
  }

  return [inputs, byIdMap] as const
}

function transactionKey<A>(entry: Request.Entry<A>): SqlClient.TransactionConnection.Service | undefined {
  const client = Context.getOrUndefined(entry.context, SqlClient.SqlClient)
  if (!client) return undefined
  const conn = Context.getOrUndefined(entry.context, client.transactionService)
  if (!conn) return undefined
  return Equal.byReferenceUnsafe(conn)
}
