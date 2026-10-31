/**
 * Batch lookups through a GraphQL client method with `RequestResolver`.
 * {@link ordered} matches results by position; {@link findById} matches by
 * key; {@link aliased} repeats an operation under aliases in one request.
 * {@link request} turns any of them into `(key) => Effect`.
 *
 * Client middleware still run. When a method needs services, such as a
 * middleware's `requires`, `batchKey` keeps lookups with different services
 * in separate batches. Compose `RequestResolver.setDelay` and
 * `RequestResolver.batchN` with `.pipe` to control batching.
 *
 * Lookups with different protocol URLs are batched separately, and
 * `RequestResolver.batchN` limits each URL's batches. See
 * `GraphQLProtocol.layerHttp` for middleware and caching constraints.
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { dual } from "../Function.ts"
import * as Headers from "../http/Headers.ts"
import * as UrlParams from "../http/UrlParams.ts"
import * as internalGraphQL from "../internal/graphql.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import * as Request from "../Request.ts"
import * as RequestResolver from "../RequestResolver.ts"
import * as Tracer from "../Tracer.ts"
import type * as Types from "../Types.ts"
import type * as GraphQL from "./GraphQL.ts"
import type { OperationMethod, PartialResult } from "./GraphQLClient.ts"
import { DecodeError, type GraphQLClientError, type GraphQLError } from "./GraphQLClientError.ts"
import type { ExecutionResult, GraphQLRequest } from "./GraphQLProtocol.ts"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type NonNull<A> = Exclude<A, null | undefined>

type Step<A, K> = K extends keyof NonNull<A> ? NonNull<A>[K] : never

// Check one segment at a time for autocomplete without enumerating all paths.
// The path must end at a list and cannot cross one.
type CheckPath<A, P> = NonNull<A> extends ReadonlyArray<any> ? readonly []
  : P extends readonly [infer Head, ...infer Tail]
    ? readonly [Head extends keyof NonNull<A> ? Head : keyof NonNull<A>, ...CheckPath<Step<A, Head>, Tail>]
  : readonly [keyof NonNull<A>]

type Path<A, P> = P extends CheckPath<A, P> ? P : CheckPath<A, P>

type AtPath<A, P> = P extends readonly [infer Head, ...infer Tail] ? AtPath<Step<A, Head>, Tail> : A

type Item<A, P> = NonNull<AtPath<A, P>> extends ReadonlyArray<infer I> ? NonNull<I> : never

type Typenames<I> = Types.IsUnion<I> extends true ?
  I extends { readonly __typename: infer T extends string } ? T : never
  : never

type Narrow<I, T> = [T] extends [never] ? I : Extract<I, { readonly __typename: T }>

type BatchKey<Op extends GraphQL.Any> = [GraphQL.Services<Op>] extends [never] ? { readonly batchKey?: never }
  : { readonly batchKey: (context: Context.Context<GraphQL.Services<Op>>) => unknown }

interface KeyRequest<K, A, E, R> extends Request.Request<A, E, R> {
  readonly key: K
  /** The protocol URL {@link request} resolved for this lookup, if it could. */
  readonly url: string | undefined
}

// Requests are structural, so two requests with equal keys and URLs are one request.
const makeRequest = <K, A, E, R>(key: K, url: string | undefined): KeyRequest<K, A, E, R> =>
  Request.of<KeyRequest<K, A, E, R>>()({ key, url })

// -----------------------------------------------------------------------------
// Running
// -----------------------------------------------------------------------------

/**
 * Looks up a key with an {@link ordered}, {@link findById} or {@link aliased}
 * resolver, using `request(resolver)(key)` or `request(key, resolver)`.
 *
 * **Details**
 *
 * Concurrent lookups are batched. Keys equal under `Equal` and `Hash`
 * are sent once per batch and share the result.
 *
 * **Example** (Looking up repositories by id)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema, Stream } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
 *
 * const RepoNodes = GraphQL.query("RepoNodes", {
 *   document: "query RepoNodes($ids:[ID!]!){nodes(ids:$ids){... on Repository{name}}}",
 *   variables: { ids: Schema.Array(Schema.String) },
 *   result: Schema.Struct({ nodes: Schema.Array(Schema.NullOr(Schema.Struct({ name: Schema.String }))) })
 * })
 *
 * let calls = 0
 * const Scripted = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
 *   execute: (request) => {
 *     calls++
 *     const { ids } = request.variables as { ids: Array<string> }
 *     return Effect.succeed({ body: { data: { nodes: ids.map((id) => ({ name: `repo-${id}` })) } } })
 *   },
 *   subscribe: () => Stream.empty
 * })
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(RepoNodes))
 *   const getRepo = GraphQLResolver.request(GraphQLResolver.ordered(client.RepoNodes, {
 *     variables: (ids: ReadonlyArray<string>) => ({ ids }),
 *     path: ["nodes"]
 *   }))
 *   const repos = yield* Effect.forEach(["1", "2", "1"], getRepo, { concurrency: "unbounded" })
 *   return [repos.map((repo) => repo.name), calls]
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Scripted))) // => [["repo-1", "repo-2", "repo-1"], 1]
 * ```
 *
 * @stability experimental
 * @category running
 * @since 4.0.0
 */
export const request: {
  <K, A, E, R>(
    resolver: RequestResolver.RequestResolver<KeyRequest<K, A, E, R>>
  ): (key: K) => Effect.Effect<A, E, R>
  <K, A, E, R>(key: K, resolver: RequestResolver.RequestResolver<KeyRequest<K, A, E, R>>): Effect.Effect<A, E, R>
} = dual(
  2,
  <K, A, E, R>(key: K, resolver: RequestResolver.RequestResolver<KeyRequest<K, A, E, R>>): Effect.Effect<A, E, R> => {
    // Resolved in the caller's fiber, so the URL is part of the pending batch's key.
    const resolveUrl = urlResolvers.get(resolver.batchKey)
    return resolveUrl === undefined
      ? queue(makeRequest<K, A, E, R>(key, undefined), resolver)
      : Effect.flatMap(resolveUrl, (url) => queue(makeRequest<K, A, E, R>(key, url), resolver))
  }
)

// -----------------------------------------------------------------------------
// Resolvers
// -----------------------------------------------------------------------------

/**
 * Batches lookups for fields such as `nodes(ids:)` that return one entry per
 * key in input order.
 *
 * **Details**
 *
 * `variables` maps batch keys to operation variables; annotate its parameter
 * to set the key type. `path` selects a list through object fields, with
 * autocomplete at each level. For `__typename` unions, `typename` narrows
 * the success type and treats other types as missing.
 *
 * Null entries, typename mismatches and null parents fail with
 * `Cause.NoSuchElementError`. GraphQL errors whose paths start with
 * `[...path, i]` fail only entry `i`; its `ResponseError` contains those errors
 * and the response status. Other GraphQL errors fail the batch with the same
 * `ResponseError` as a non-partial call. Transport, encode and decode errors
 * also fail the batch. A list length mismatch fails with `DecodeError`.
 *
 * `pageInfo.hasNextPage: true` on the list's parent fails the batch with
 * `DecodeError` to avoid reporting unreturned entries as missing. Set the
 * operation's page size at least as large as `RequestResolver.batchN`.
 *
 * A batch uses one lookup's services. Methods requiring services also require
 * `batchKey`; only lookups with keys equal under `Equal` share a batch. Return
 * the value that distinguishes those services, for example
 * `(context) => Context.get(context, CurrentUser).tenantId`. Methods without
 * services use one batch and do not accept `batchKey`.
 *
 * **Gotchas**
 *
 * Don't return the whole context from `batchKey`. It also holds the caller's
 * span, so most lookups would get a batch of their own.
 *
 * A middleware that reads a `Context.Reference` with a default value doesn't
 * add it to the method's services. `batchKey` isn't required for it, and
 * lookups with different values can share a batch.
 *
 * **Example** (Looking up repositories in a `Node` union)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Layer, RequestResolver, Schema, Stream } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
 *
 * const Repository = Schema.Struct({ __typename: Schema.Literal("Repository"), nameWithOwner: Schema.String })
 * const User = Schema.Struct({ __typename: Schema.Literal("User"), login: Schema.String })
 *
 * const RepoNodes = GraphQL.query("RepoNodes", {
 *   document: "query RepoNodes($ids:[ID!]!){nodes(ids:$ids){__typename ...on Repository{nameWithOwner} ...on User{login}}}",
 *   variables: { ids: Schema.Array(Schema.String) },
 *   result: Schema.Struct({ nodes: Schema.Array(Schema.NullOr(Schema.Union([Repository, User]))) })
 * })
 *
 * const store: Record<string, unknown> = {
 *   R_1: { __typename: "Repository", nameWithOwner: "Effect-TS/effect" },
 *   U_1: { __typename: "User", login: "tim" }
 * }
 * const Scripted = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
 *   execute: (request) => {
 *     const { ids } = request.variables as { ids: Array<string> }
 *     return Effect.succeed({ body: { data: { nodes: ids.map((id) => store[id] ?? null) } } })
 *   },
 *   subscribe: () => Stream.empty
 * })
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(RepoNodes))
 *   const RepoById = GraphQLResolver.ordered(client.RepoNodes, {
 *     variables: (ids: ReadonlyArray<string>) => ({ ids }),
 *     path: ["nodes"],
 *     typename: "Repository"
 *   }).pipe(RequestResolver.batchN(100))
 *   const getRepo = GraphQLResolver.request(RepoById)
 *   return yield* Effect.forEach(
 *     ["R_1", "U_1", "R_2"],
 *     (id) => getRepo(id).pipe(
 *       Effect.map((repo) => repo.nameWithOwner),
 *       Effect.catchIf(Cause.isNoSuchElementError, () => Effect.succeed("missing"))
 *     ),
 *     { concurrency: "unbounded" }
 *   )
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Scripted))) // => ["Effect-TS/effect", "missing", "missing"]
 * ```
 *
 * @stability experimental
 * @category resolvers
 * @since 4.0.0
 */
export const ordered = <
  Op extends GraphQL.Any,
  K,
  const P extends ReadonlyArray<string>,
  T extends Typenames<Item<GraphQL.Result<Op>, P>> = never
>(
  method: OperationMethod<Op>,
  options: {
    readonly variables: (keys: ReadonlyArray<K>) => GraphQL.Variables<Op>
    readonly path: Path<GraphQL.Result<Op>, P>
    readonly typename?: T | undefined
  } & BatchKey<Op>
): RequestResolver.RequestResolver<
  KeyRequest<
    K,
    Narrow<Item<GraphQL.Result<Op>, P>, T>,
    GraphQL.Error<Op> | Cause.NoSuchElementError,
    GraphQL.Services<Op>
  >
> => {
  const path = options.path as ReadonlyArray<string>
  const codec = internalGraphQL.makeCodec(method.operation)
  return makeResolver(
    method,
    options.batchKey,
    (entries) =>
      Effect.flatMap(callBatch(method, entries, options.variables), ({ keys, targets, result }) => {
        const byIndex = new Map<number, Arr.NonEmptyArray<GraphQLError>>()
        for (const error of result.errors) {
          const index = entryIndex(error, path, keys.length)
          if (index === undefined) return batchError(codec, result)
          const errors = byIndex.get(index)
          if (errors === undefined) byIndex.set(index, [error])
          else errors.push(error)
        }
        const list = findList(result.data, path)
        // An error in a non-null item nulls the whole list, so every entry lost its data to it.
        if (list === undefined) return result.errors.length > 0 ? batchError(codec, result) : completeAll(targets)
        if (list.truncated) return Effect.fail(codec.fail(truncated(path)))
        if (list.items.length !== keys.length) {
          return Effect.fail(codec.fail(
            new DecodeError({
              description: `Expected ${keys.length} entries at ${path.join(".")}, received ${list.items.length}`
            })
          ))
        }
        const response = internalGraphQL.partialResponses.get(result)
        for (let i = 0; i < targets.length; i++) {
          const errors = byIndex.get(i)
          const item = list.items[i]
          targets[i].completeUnsafe(
            errors !== undefined
              ? Exit.fail(codec.fail(
                internalGraphQL.responseError({ status: response?.status, headers: response?.headers }, errors)
              ))
              : matchesTypename(item, options.typename)
              ? Exit.succeed(item)
              : constNoSuchElement
          )
        }
        return Effect.void
      })
  )
}

/**
 * Batches lookups by key for searches and collections that return results
 * in any order.
 *
 * **Details**
 *
 * Write `key` before `variables` to infer the key type from its return type.
 * `variables` maps batch keys to operation variables. Keys are compared with
 * `Equal` and `Hash`. `path` and `typename` work as in {@link ordered};
 * `key` receives the narrowed item type.
 *
 * Missing keys, null parents, pagination and `batchKey` behave as in
 * {@link ordered}.
 * Any GraphQL error fails the batch with the same `ResponseError` as a
 * non-partial call, since error paths cannot be matched to keys.
 *
 * **Example** (Finding repositories through search)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, Schema, Stream } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
 *
 * const Repository = Schema.Struct({ __typename: Schema.Literal("Repository"), nameWithOwner: Schema.String })
 * const User = Schema.Struct({ __typename: Schema.Literal("User"), login: Schema.String })
 *
 * const SearchRepos = GraphQL.query("SearchRepos", {
 *   document: "query SearchRepos($query:String!){search(query:$query,type:REPOSITORY,first:100){pageInfo{hasNextPage} nodes{__typename ...on Repository{nameWithOwner} ...on User{login}}}}",
 *   variables: { query: Schema.String },
 *   result: Schema.Struct({
 *     search: Schema.Struct({
 *       pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean }),
 *       nodes: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Union([Repository, User]))))
 *     })
 *   })
 * })
 *
 * const Scripted = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
 *   execute: (request) => {
 *     const { query } = request.variables as { query: string }
 *     const nodes = query.split(" ").map((term) => ({ __typename: "Repository", nameWithOwner: term.slice(5) }))
 *     return Effect.succeed({ body: { data: { search: { pageInfo: { hasNextPage: false }, nodes: nodes.reverse() } } } })
 *   },
 *   subscribe: () => Stream.empty
 * })
 *
 * const program = Effect.gen(function*() {
 *   const client = yield* GraphQLClient.make(GraphQLGroup.make(SearchRepos))
 *   const RepoByName = GraphQLResolver.findById(client.SearchRepos, {
 *     key: (repo) => repo.nameWithOwner,
 *     variables: (names) => ({ query: names.map((name) => `repo:${name}`).join(" ") }),
 *     path: ["search", "nodes"],
 *     typename: "Repository"
 *   })
 *   const repos = yield* Effect.forEach(
 *     ["Effect-TS/effect", "Effect-TS/website"],
 *     GraphQLResolver.request(RepoByName),
 *     { concurrency: "unbounded" }
 *   )
 *   return repos.map((repo) => repo.nameWithOwner)
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Scripted))) // => ["Effect-TS/effect", "Effect-TS/website"]
 * ```
 *
 * @stability experimental
 * @category resolvers
 * @since 4.0.0
 */
export const findById = <
  Op extends GraphQL.Any,
  K,
  const P extends ReadonlyArray<string>,
  T extends Typenames<Item<GraphQL.Result<Op>, P>> = never
>(
  method: OperationMethod<Op>,
  options: {
    readonly variables: (keys: ReadonlyArray<K>) => GraphQL.Variables<Op>
    readonly path: Path<GraphQL.Result<Op>, P>
    readonly key: (item: Narrow<Item<GraphQL.Result<Op>, P>, T>) => K
    readonly typename?: T | undefined
  } & BatchKey<Op>
): RequestResolver.RequestResolver<
  KeyRequest<
    K,
    Narrow<Item<GraphQL.Result<Op>, P>, T>,
    GraphQL.Error<Op> | Cause.NoSuchElementError,
    GraphQL.Services<Op>
  >
> => {
  const path = options.path as ReadonlyArray<string>
  const codec = internalGraphQL.makeCodec(method.operation)
  return makeResolver(
    method,
    options.batchKey,
    (entries) =>
      Effect.flatMap(callBatch(method, entries, options.variables), ({ keys, targets, result }) => {
        if (result.errors.length > 0) return batchError(codec, result)
        const list = findList(result.data, path)
        if (list === undefined) return completeAll(targets)
        if (list.truncated) return Effect.fail(codec.fail(truncated(path)))
        const pending = MutableHashMap.empty<K, Request.Entry<any>>()
        for (let i = 0; i < keys.length; i++) MutableHashMap.set(pending, keys[i], targets[i])
        for (const item of list.items) {
          if (!matchesTypename(item, options.typename)) continue
          const key = options.key(item as Narrow<Item<GraphQL.Result<Op>, P>, T>)
          const target = MutableHashMap.get(pending, key)
          if (target._tag === "None") continue
          MutableHashMap.remove(pending, key)
          target.value.completeUnsafe(Exit.succeed(item))
        }
        MutableHashMap.forEach(pending, (target) => target.completeUnsafe(constNoSuchElement))
        return Effect.void
      })
  )
}

/**
 * Batches calls to a generated query or mutation by repeating the operation
 * under aliases in one request.
 *
 * **When to use**
 *
 * Use when the API has no list-key field, such as GitHub's pull requests by
 * repository and number. Otherwise, {@link ordered} or {@link findById} send
 * a smaller query.
 *
 * **Details**
 *
 * Use {@link request} to get `(variables) => Effect`. Variables that encode
 * to the same JSON share a slice; each slice uses the operation's result Schema.
 * Throws when the resolver is built if the operation has no document
 * template, if an operation directive references a variable, or if a root
 * selection is a fragment spread or inline fragment, since none of these can
 * be repeated under aliases.
 *
 * Batches use `POST` even with `queryMethod: "GET"`. The default batch size
 * is 10; change it with `RequestResolver.batchN`. Middleware run once per
 * batch, and `batchKey` works as in {@link ordered}. Mock and custom methods
 * are called once per slice instead.
 *
 * Errors with a matching `path[0]` fail only that slice, with the alias prefix
 * removed from the error path. Errors without a matching path, transport errors
 * and middleware failures fail the batch.
 *
 * **Gotchas**
 *
 * An error under a non-null root field can null the entire response, failing
 * every slice. GitHub's `repository` and `pullRequest` are nullable.
 *
 * Middleware that hash queries must use `request.query`, not
 * `operation.document`. Trusted-document allowlists don't support batching;
 * query hashing does, since the same operation and slice count produce the
 * same document.
 *
 * Mutations are allowed, but the caller cannot control root-field order.
 *
 * **Example** (Looking up pull requests by number)
 *
 * ```ts import.meta.vitest
 * import { Effect, Layer, RequestResolver, Schema, Stream } from "effect"
 * import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
 *
 * // Generated from:
 * //   query PullRequest($owner: String!, $name: String!, $number: Int!) {
 * //     repository(owner: $owner, name: $name) { pullRequest(number: $number) { title } }
 * //   }
 * const PullRequest = GraphQL.query("PullRequest", {
 *   document: {
 *     variables: [
 *       { name: "owner", body: "String!" },
 *       { name: "name", body: "String!" },
 *       { name: "number", body: "Int!" }
 *     ],
 *     selections: [{
 *       name: "repository",
 *       body: ["(owner:$", "owner", ",name:$", "name", "){pullRequest(number:$", "number", "){title}}"]
 *     }],
 *     fragments: []
 *   },
 *   variables: { owner: Schema.String, name: Schema.String, number: Schema.Int },
 *   result: Schema.Struct({
 *     repository: Schema.NullOr(Schema.Struct({
 *       pullRequest: Schema.NullOr(Schema.Struct({ title: Schema.String }))
 *     }))
 *   })
 * })
 *
 * // A stand-in server that answers every aliased slice
 * const queries: Array<string> = []
 * const Scripted = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
 *   execute: (request) => {
 *     queries.push(request.query)
 *     const data: Record<string, unknown> = {}
 *     for (const [key, number] of Object.entries(request.variables as Record<string, unknown>)) {
 *       const prefix = /^(_\d+_)number$/.exec(key)?.[1]
 *       if (prefix !== undefined) data[`${prefix}repository`] = { pullRequest: { title: `PR ${number}` } }
 *     }
 *     return Effect.succeed({ body: { data } })
 *   },
 *   subscribe: () => Stream.empty
 * })
 *
 * const program = Effect.gen(function*() {
 *   const github = yield* GraphQLClient.make(GraphQLGroup.make(PullRequest))
 *   const PullRequests = GraphQLResolver.aliased(github.PullRequest).pipe(RequestResolver.batchN(20))
 *   const getPullRequest = GraphQLResolver.request(PullRequests)
 *   const results = yield* Effect.forEach(
 *     [1, 2, 3],
 *     (number) => getPullRequest({ owner: "Effect-TS", name: "effect", number }),
 *     { concurrency: "unbounded" }
 *   )
 *   return [results.map((result) => result.repository?.pullRequest?.title), queries.length]
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Scripted))) // => [["PR 1", "PR 2", "PR 3"], 1]
 * ```
 *
 * @stability experimental
 * @category resolvers
 * @since 4.0.0
 */
export const aliased = <Op extends GraphQL.Any>(
  method: OperationMethod<Op>,
  ...[options]: {} extends BatchKey<Op> ? [options?: BatchKey<Op>] : [options: BatchKey<Op>]
): RequestResolver.RequestResolver<AliasedRequest<Op>> => {
  const operation = method.operation
  const template = operation.template
  if (template === undefined) {
    throw new Error(`GraphQLResolver.aliased: operation ${operation.name} has no document template`)
  }
  const unsliceable = internalGraphQL.templateUnsliceableReason(template)
  if (unsliceable !== undefined) {
    throw new Error(`GraphQLResolver.aliased: cannot batch operation ${operation.name}: ${unsliceable}`)
  }
  const codec = internalGraphQL.makeCodec(operation)
  // The registered hook uses this operation's middleware errors and services.
  const execute = internalGraphQL.rawExecutors.get(method)?.execute as
    | ((request: GraphQLRequest) => Effect.Effect<ExecutionResult, GraphQL.Error<Op>, GraphQL.Services<Op>>)
    | undefined
  // Generic conditional parameters prevent calling the strict overload directly.
  const call = method as unknown as (
    variables: GraphQL.Variables<Op>
  ) => Effect.Effect<GraphQL.Result<Op>, GraphQL.Error<Op>, GraphQL.Services<Op>>

  return makeResolver<AliasedRequest<Op>>(method, options?.batchKey, (entries) =>
    Effect.flatMap(
      Effect.forEach(entries, (entry) => Effect.exit(codec.encodeVariables(entry.request.key))),
      (encoded) => {
        const slices: Array<Slice<Op>> = []
        const byJson = new Map<string, Slice<Op>>()
        for (let i = 0; i < entries.length; i++) {
          const exit = encoded[i]
          if (exit._tag === "Failure") {
            entries[i].completeUnsafe(exit)
            continue
          }
          const json = internalGraphQL.canonicalJson(exit.value)
          const slice = byJson.get(json)
          if (slice !== undefined) {
            slice.entries.push(entries[i])
            continue
          }
          const created = { variables: entries[i].request.key, encoded: exit.value, entries: [entries[i]] }
          byJson.set(json, created)
          slices.push(created)
        }
        const complete = <R>(slice: Slice<Op>, effect: Effect.Effect<GraphQL.Result<Op>, GraphQL.Error<Op>, R>) =>
          Effect.map(Effect.exit(effect), (exit) => {
            for (const entry of slice.entries) entry.completeUnsafe(exit)
          })
        if (execute === undefined) {
          return Effect.forEach(slices, (slice) => complete(slice, call(slice.variables)), { discard: true })
        }
        if (!Arr.isReadonlyArrayNonEmpty(slices)) return Effect.void
        const prefixes = Arr.map(slices, (_, i) => `_${i}_`)
        return execute({
          kind: operation.kind,
          query: internalGraphQL.renderSlices(operation.kind, operation.name, template, prefixes),
          operationName: operation.name,
          variables: Object.fromEntries(
            slices.flatMap((slice, i) =>
              Object.entries(slice.encoded ?? {}).map(([name, value]) => [prefixes[i] + name, value])
            )
          ),
          headers: Headers.empty,
          urlParams: UrlParams.empty
        }).pipe(
          Effect.flatMap((result) => {
            const results = internalGraphQL.splitSlices(result, template, prefixes)
            return results === undefined
              ? codec.failResponse(result)
              : Effect.forEach(slices, (slice, i) => complete(slice, codec.decodeStrict(results[i])), { discard: true })
          })
        )
      }
    )).pipe(RequestResolver.batchN(10))
}

type AliasedRequest<Op extends GraphQL.Any> = KeyRequest<
  GraphQL.Variables<Op>,
  GraphQL.Result<Op>,
  GraphQL.Error<Op>,
  GraphQL.Services<Op>
>

interface Slice<Op extends GraphQL.Any> {
  readonly variables: GraphQL.Variables<Op>
  readonly encoded: unknown
  readonly entries: Array<Request.Entry<AliasedRequest<Op>>>
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

const constNoSuchElement = Exit.fail(new Cause.NoSuchElementError())

/**
 * URL resolvers by resolver `batchKey`, which `RequestResolver.batchN` and
 * `setDelay` keep, so {@link request} can resolve a lookup's URL before it is
 * queued.
 */
const urlResolvers = new WeakMap<Function, Effect.Effect<string>>()

/**
 * Groups pending entries by URL and `batchKey`, so collection limits apply to
 * each group. A URL that `request` couldn't resolve, for example after
 * `RequestResolver.grouped` replaced the key, is resolved here in the entry's
 * context, and the batch is split again. Each batch runs in its first entry's
 * context, under any span opened around the batch, carrying the URL it was
 * grouped by, so the transport doesn't resolve it again.
 */
const makeResolver = <A extends KeyRequest<any, any, any, any>>(
  method: OperationMethod<any>,
  batchKey: ((context: Context.Context<any>) => unknown) | undefined,
  runAll: (entries: Arr.NonEmptyArray<Request.Entry<A>>) => Effect.Effect<void, Request.Error<A>, any>
): RequestResolver.RequestResolver<A> => {
  const resolve = internalGraphQL.rawExecutors.get(method)?.url
  const resolveUrl = resolve?.({ kind: method.operation.kind, operationName: method.operation.name })
  // Arrays are compared structurally, so equal keys share a batch.
  const keyOf = (entry: Request.Entry<A>, url: string | undefined) => [url, batchKey?.(entry.context)] as const
  const urlOf = (entry: Request.Entry<A>) =>
    entry.request.url !== undefined || resolveUrl === undefined
      ? Effect.succeed(entry.request.url)
      : runIn(resolveUrl, entry.context)
  const resolver = RequestResolver.makeGrouped<A, unknown>({
    key: (entry) => keyOf(entry, entry.request.url),
    resolver: (entries) =>
      Effect.contextWith((current: Context.Context<never>) => {
        const span = batchSpan(current)
        return Effect.flatMap(Effect.forEach(entries, urlOf, { concurrency: "unbounded" }), (urls) => {
          const batches = MutableHashMap.empty<
            readonly [string | undefined, unknown],
            Arr.NonEmptyArray<Request.Entry<A>>
          >()
          entries.forEach((entry, i) => {
            const key = keyOf(entry, urls[i])
            const batch = MutableHashMap.get(batches, key)
            if (batch._tag === "Some") batch.value.push(entry)
            else MutableHashMap.set(batches, key, [entry])
          })
          return Effect.forEach(batches, ([[url], entries]) => {
            let context: Context.Context<any> = entries[0].context
            if (url !== undefined) context = Context.add(context, internalGraphQL.ResolvedUrl, { resolve, url })
            if (span !== undefined) context = Context.add(context, Tracer.ParentSpan, span)
            return runIn(runAll(entries), context)
          }, { concurrency: "unbounded", discard: true })
        })
      })
  })
  if (resolveUrl !== undefined) urlResolvers.set(resolver.batchKey, resolveUrl)
  return resolver
}

// Replaces, rather than merges into, the batch fiber's context, which may
// belong to a lookup with other services or `Context.Reference` values.
const runIn = <A, E>(effect: Effect.Effect<A, E, any>, context: Context.Context<any>): Effect.Effect<A, E> =>
  Effect.updateContext(effect, (_: Context.Context<never>) => context)

// The caller's span when it queued a lookup. A batch fiber inherits it from the
// caller that started or filled the batch, even if that caller was interrupted.
const QueuedSpan = Context.Reference<Tracer.AnySpan | undefined>("effect/graphql/GraphQLResolver/QueuedSpan", {
  defaultValue: () => undefined
})

const queue = <K, A, E, R>(
  request: KeyRequest<K, A, E, R>,
  resolver: RequestResolver.RequestResolver<KeyRequest<K, A, E, R>>
): Effect.Effect<A, E, R> =>
  Effect.contextWith((context: Context.Context<never>) =>
    Effect.provideService(
      Effect.request(request, resolver),
      QueuedSpan,
      Context.getOrUndefined(context, Tracer.ParentSpan)
    )
  )

// A span opened around the batch, such as `RequestResolver.withSpan`'s, rather
// than the one the batch fiber inherited from a caller.
const batchSpan = (context: Context.Context<never>) => {
  const span = Context.getOrUndefined(context, Tracer.ParentSpan)
  return span === Context.get(context, QueuedSpan) ? undefined : span
}

/**
 * Calls the method with deduplicated keys. Each target completes all entries
 * sharing its key.
 */
const callBatch = <Op extends GraphQL.Any, K>(
  method: OperationMethod<Op>,
  entries: Arr.NonEmptyArray<Request.Entry<KeyRequest<K, any, any, any>>>,
  variables: (keys: ReadonlyArray<K>) => GraphQL.Variables<Op>
) => {
  const keys: Array<K> = []
  const targets: Array<Request.Entry<KeyRequest<K, any, any, any>>> = []
  const indices = MutableHashMap.empty<K, number>()
  for (const entry of entries) {
    const index = MutableHashMap.get(indices, entry.request.key)
    if (index._tag === "None") {
      MutableHashMap.set(indices, entry.request.key, keys.length)
      keys.push(entry.request.key)
      targets.push(entry)
      continue
    }
    const previous = targets[index.value]
    targets[index.value] = {
      ...previous,
      completeUnsafe(exit) {
        previous.completeUnsafe(exit)
        entry.completeUnsafe(exit)
      }
    }
  }
  // Generic conditional parameters prevent calling the partial overload directly.
  const call = method as unknown as (
    variables: GraphQL.Variables<Op>,
    options: { readonly partial: true }
  ) => Effect.Effect<PartialResult<GraphQL.Result<Op>>, GraphQL.Error<Op>, GraphQL.Services<Op>>
  return Effect.map(call(variables(keys), { partial: true }), (result) => ({ keys, targets, result }))
}

// Fails the batch with the response's errors and transport metadata.
const batchError = (
  codec: { readonly failResponse: (result: ExecutionResult) => Effect.Effect<never, GraphQLClientError> },
  result: PartialResult<unknown>
) => codec.failResponse(internalGraphQL.partialResponses.get(result) ?? { errors: result.errors })

const truncated = (path: ReadonlyArray<string>) =>
  new DecodeError({
    description: `pageInfo.hasNextPage is true next to ${
      path.join(".")
    }, so results beyond the page would be reported missing. Make the page size at least the RequestResolver.batchN size`
  })

const completeAll = (targets: ReadonlyArray<Request.Entry<any>>) => {
  for (const target of targets) target.completeUnsafe(constNoSuchElement)
  return Effect.void
}

const entryIndex = (error: GraphQLError, path: ReadonlyArray<string>, length: number): number | undefined => {
  const errorPath = error.path
  if (errorPath === undefined || errorPath.length <= path.length) return undefined
  for (let i = 0; i < path.length; i++) {
    if (errorPath[i] !== path[i]) return undefined
  }
  const index = errorPath[path.length]
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < length ? index : undefined
}

const findList = (
  data: unknown,
  path: ReadonlyArray<string>
): { readonly items: ReadonlyArray<unknown>; readonly truncated: boolean } | undefined => {
  // Path guarantees object fields leading to a list.
  let parent = data as Record<string, any> | null | undefined
  for (let i = 0; i < path.length - 1; i++) parent = parent?.[path[i]]
  const items = parent?.[path[path.length - 1]] as ReadonlyArray<unknown> | null | undefined
  if (items === null || items === undefined) return undefined
  return { items, truncated: parent!.pageInfo?.hasNextPage === true }
}

const matchesTypename = (item: unknown, typename: string | undefined): boolean =>
  item !== null && item !== undefined &&
  (typename === undefined || (item as { readonly __typename?: unknown }).__typename === typename)
