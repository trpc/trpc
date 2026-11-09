# @effect/graphql-generator

Generates typed operations for the experimental `effect/graphql` client from
`.graphql` documents and a GraphQL schema. The lexer, parser and validation are
built in; `graphql-js` isn't needed.

## Installation

```sh
npm install effect @effect/platform-node
npm install --save-dev @effect/graphql-generator
```

The package provides the `graphqlgen` command. It loads `graphql.config.ts`
with a plain `import()`, so it needs Bun, Deno, or Node.js 22.18 or later
(where type stripping is on by default). Under Node the config can only use
erasable TypeScript syntax: no `enum`, no `namespace` with values, no
constructor parameter properties.

## Configuration

Put a `graphql.config.ts` in the directory you run `graphqlgen` from:

```ts
import { defineConfig } from "@effect/graphql-generator/Config"

export default defineConfig({
  // An SDL file (.graphql) or an introspection result (.json)
  schema: "./schema/github.graphql",
  // Glob patterns for the operation documents
  documents: ["src/**/*.graphql"],
  // One Schema codec per custom scalar, as "<module>#<export>"
  scalars: {
    GitObjectID: "effect/Schema#String"
  }
})
```

`schema` and `documents` are the keys graphql-config reads, so the VS Code
GraphQL extension can share the file.

| Key               | Description                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`          | The schema file, relative to the config file. It is never treated as a document.                                                                                                                                                             |
| `documents`       | Glob patterns (`*`, `**`, `?`, `{a,b}`) relative to the config file; absolute patterns are rejected. `node_modules`, dot-directories and dangling symlinks are skipped. Documents (`.graphql` or `.gql`) hold only operations and fragments. |
| `scalars`         | Optional. A codec per custom scalar; can also override the built-in `Int`, `Float` and `ID`.                                                                                                                                                 |
| `shared`          | Optional. Where the shared module goes. Defaults to the schema's name next to it: `github.graphql` or `github.json` gives `github.graphql.ts`. It can't be the schema, a document or a document's output.                                    |
| `importExtension` | Optional. `".ts"` (default) or `".js"`, used in imports between generated files and to relative scalar modules.                                                                                                                              |

In a pattern, a `{` without a closing `}` matches itself.

One config means one schema: for two schemas, write two config files and run
`graphqlgen --config <file>` for each.

### Scalars

Each scalar maps to a `Schema` codec, used for variables and results alike. The
value is a `"<module>#<export>"` string because the generator emits an
`import` for it. A relative module resolves against the config file and is
rewritten relative to the shared module, with a `.ts`, `.js` or missing
extension replaced by `importExtension` and any other extension, such as
`.mjs`, kept; a bare module is imported as written.
The generator doesn't check the target; `tsc` does.

Unless overridden, `Int` is a 32-bit integer, `Float` a finite number and `ID`
a string. Custom scalars named exactly `DateTime` and `URI` default to
`Schema.DateTimeUtcFromString` and `Schema.String`. A `scalars` entry overrides
any of these defaults. Other custom scalars without a mapping decode as
`Schema.Json`, with one warning listing every unmapped scalar the operations
reach. Defaulted scalars are not included in that warning.

## Generated files

`foo.graphql` generates `foo.graphql.ts` next to it (`foo.gql` generates
`foo.gql.ts`), exporting:

- a `GraphQL.query`, `GraphQL.mutation` or `GraphQL.subscription` per
  operation, carrying the compact document and the variables and result
  Schemas, plus a type namespace such as `RepoIssues.Variables` and
  `RepoIssues.Result`. Queries and mutations give the document as a
  `GraphQL.DocumentTemplate`, which marks the variable and fragment names a
  batch would rename; the operation joins it into the same compact text.
- a Schema per fragment
- a `Schema.Struct` const and a same-named interface per nested object
  selection and per member of an interface or union selection
- `FooGraphQLGroup`, a `GraphQLGroup` with every operation in the file

A nested selection's schema and interface are named after its GraphQL type,
such as `Issue` or `User`, inside fragments too. Each is a top-level export of the
file, so operations and fragments in one file draw from the same names. The
member covering the types an interface or union selection doesn't name ends
in `Other`, such as `EventOther`. An interface or union selection without any
`... on` type conditions is one struct rather than a union, so its schema takes
the abstract type's name with no `Other`, such as `Event`.

Selections of a type share one schema and interface across the whole file when they select
the same fields under the same response keys, with the same nested
selections and `@skip` / `@include` optionality, in any order. When different
selections would get the same name, or a name is already taken by an
operation, fragment or import in the file, by the file's group or by
`Schema`, `GraphQL`, `GraphQLGroup` or `Shared`, each adds its field's
response key (`AuthorUser`), then parent response keys one at a time
(`CommentsAuthorUser`), then the operation or fragment name
(`RepoIssuesCommentsAuthorUser`), until the names are free. A shared schema
uses the path of its first occurrence. A clash left after all of that is an
error: alias the field.

Object fragments and ordinary input objects use the same declaration shape:

```ts
export const Author = Schema.Struct({
  name: Schema.NullOr(Schema.String)
})
export interface Author extends Schema.Struct.Type<typeof Author.fields> {}
```

The const is the runtime schema, including decoding, encoding and `make`; the
interface supplies a named decoded type without the type-checking overhead of
an Opaque class. Custom scalar codecs retain their encoded types. Unlike the
previous Opaque classes, nested selections in inferred types and editor hovers
can expand structurally instead of showing these names. Use the exported
interfaces in explicit type annotations when a named type is useful. Abstract
fragments still use a union schema and type alias, and `@oneOf` inputs retain
their Opaque union schema and explicit type alias.

The shared module holds only the scalars, enums, input objects and
`__typename` unions the operations reach. Commit the generated files, and
exclude `*.graphql.ts` from your linter and formatter: the output has one fixed
style, and a reformatted file shows up as out of date in `graphqlgen --check`.

After a successful run, `graphqlgen` deletes each `*.graphql.ts` or `*.gql.ts`
under the `documents` glob roots whose first line exactly matches the generated
header naming its sibling `.graphql` or `.gql` source, if that source is
missing. Shared modules and files without a matching document header are never
touched.

## CLI

```sh
graphqlgen [--config <path>] [--watch | --check]
```

| Flag             | Description                                                                             |
| ---------------- | --------------------------------------------------------------------------------------- |
| `--config`, `-c` | The config file. Defaults to `graphql.config.ts` in the current directory.              |
| `--watch`, `-w`  | Keep running and regenerate on changes.                                                 |
| `--check`        | Write nothing; list every file that would be created, updated or deleted. Use it in CI. |

Diagnostics go to stderr as `file:line:col: error|warning: message` with a code
excerpt. Any error means nothing is written.

| Exit code | Meaning                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `0`       | Success, including runs with warnings only.                                                                  |
| `1`       | Generation reported an error, a file couldn't be read or written, or `--check` found out-of-date files.      |
| `2`       | Invalid CLI usage (including `--watch --check`), or the config couldn't be loaded or doesn't fit the schema. |

### Watch mode

`graphqlgen --watch` runs once, then watches the config file, the schema file
and the static prefix of each `documents` glob (`src` for `src/**/*.graphql`).
Changes are debounced by about 50 ms, and only files whose bytes changed are
written. A cycle with errors writes nothing, so the last good output stays; a
successful one prints a line such as `regenerated 3 files, deleted 1`.

Editing the config re-imports it, keeping the previous config if the new one
fails to load. Only a config that fails at startup exits (with code `2`).
Modules the config imports are not reloaded: restart after editing them.

## Using the generated code

Merge the groups you need and build a client, a service with one method per
operation:

```ts
import { Context, Layer } from "effect"
import { GraphQLClient, GraphQLGroup, GraphQLProtocol } from "effect/graphql"
import { FetchHttpClient } from "effect/http"
import { IssuesGraphQLGroup } from "./src/issues.graphql.ts"
import { ViewerGraphQLGroup } from "./src/viewer.graphql.ts"

export class GitHub extends Context.Service<GitHub>()("app/GitHub", {
  make: GraphQLClient.make(GraphQLGroup.merge(IssuesGraphQLGroup, ViewerGraphQLGroup))
}) {
  static readonly layer = Layer.effect(GitHub, GitHub.make).pipe(
    Layer.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
    Layer.provide(FetchHttpClient.layer)
  )
}

// const { viewer } = yield* github.Viewer()
// const { repository } = yield* github.RepoIssues({ owner: "Effect-TS", name: "effect" })
```

The getting-started example under `ai-docs/src/52_graphql` shows auth
middleware and paging; the `effect/graphql` API reference covers
subscriptions, errors and `{ partial: true }` for responses that carry both
`data` and `errors`.

### Paging and `$after`

`GraphQLClient.items` and `GraphQLClient.pages` page forward through a cursor
connection. Name the cursor variable `$after`, declare it as a nullable
`String`, pass it to the connection and select `pageInfo`:

```graphql
query RepoIssues($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
      }
    }
  }
}
```

```ts
const issues = GraphQLClient.items(github.RepoIssues, {
  variables: { owner: "Effect-TS", name: "effect" }, // everything except `after`
  connection: (result) => result.repository?.issues
})
```

An operation without `$after` or `pageInfo`, or without `nodes` for `items`,
doesn't compile. The generator needs nothing beyond this convention.

### Paging with a cap

Pages are fetched as the stream is pulled, so `Stream.take` on `pages` caps
the number of requests. The last page's `pageInfo.hasNextPage` tells you
whether the cap cut the read short. `Stream.runCollect` drops every row when
the stream fails, so catch the `PaginationError` inside the stream to keep the
rows read before it, and mark the result partial:

```ts
import { Effect, Stream } from "effect"
import { GraphQLClient } from "effect/graphql"

export const recentIssues = Effect.fn("recentIssues")(function*(maxPages: number) {
  // `Stream.take(0)` reads nothing, which would look like a complete read
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    return yield* Effect.die(new RangeError(`maxPages must be a positive integer, got ${maxPages}`))
  }
  const github = yield* GitHub
  const pages = yield* GraphQLClient.pages(github.RepoIssues, {
    variables: { owner: "Effect-TS", name: "effect" },
    connection: (result) => result.repository?.issues
  }).pipe(
    Stream.take(maxPages),
    // End the stream with a `null` marker instead of failing it
    Stream.catchReason("GraphQLClientError", "PaginationError", () => Stream.make(null)),
    Stream.runCollect
  )
  const last = pages.at(-1)
  return {
    issues: pages.flatMap((page) => page?.nodes ?? []),
    partial: last === null || last?.pageInfo.hasNextPage === true
  }
})
```

Other errors still fail the whole read. To keep rows on those as well, catch
`GraphQLClientError` the same way.

### Batching

`GraphQLResolver` from `effect/graphql` collects concurrent lookups and makes
one call to a generated operation, DataLoader style. Generate
`repos.graphql.ts` from this GitHub document. Create the client and reusable
resolver in the `GitHub` service:

```graphql
query RepoNodes($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on Repository { id nameWithOwner }
  }
}
```

```ts
import { Context, Effect, Layer, RequestResolver } from "effect"
import { GraphQLClient, GraphQLGroup, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
import { FetchHttpClient } from "effect/http"
import { IssuesGraphQLGroup } from "./src/issues.graphql.ts"
import { ReposGraphQLGroup } from "./src/repos.graphql.ts"
import { ViewerGraphQLGroup } from "./src/viewer.graphql.ts"

export class GitHub extends Context.Service<GitHub>()("app/GitHub", {
  make: Effect.gen(function*() {
    const client = yield* GraphQLClient.make(
      GraphQLGroup.merge(IssuesGraphQLGroup, ViewerGraphQLGroup, ReposGraphQLGroup)
    )
    const RepoById = GraphQLResolver.ordered(client.RepoNodes, {
      variables: (ids: ReadonlyArray<string>) => ({ ids }),
      path: ["nodes"],
      typename: "Repository"
    }).pipe(RequestResolver.batchN(100)) // GitHub's nodes(ids:) limit
    return { ...client, getRepo: GraphQLResolver.request(RepoById) }
  })
}) {
  static readonly layer = Layer.effect(GitHub, GitHub.make).pipe(
    Layer.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
    Layer.provide(FetchHttpClient.layer)
  )
}

export const repoNames = Effect.fn("repoNames")(function*(ids: ReadonlyArray<string>) {
  const github = yield* GitHub
  const repos = yield* Effect.forEach(ids, github.getRepo, { concurrency: "unbounded" })
  return repos.map((repo) => repo.nameWithOwner)
})

export const program = repoNames(["R_1", "R_2"]).pipe(Effect.provide(GitHub.layer))
```

`ordered` matches the `nodes` list to the ids by position. `path` leads from
the result to the list, one autocompleted key at a time, and `typename`
narrows each entry to `Repository`. A `null` entry or a node of another type
fails only its own lookup, with `Cause.NoSuchElementError`, and a GraphQL
error at `["nodes", i]` fails only entry `i`. Any other GraphQL error, and
transport or decoding failures, fail the whole batch. Middleware still run,
because the resolver calls the generated client.

Each batch makes one call with the services of one of its lookups. When a
middleware `requires` a per-request service, such as the signed-in user,
`ordered` and `findById` require a `batchKey` that reads it. Only lookups
with equal keys share a call, so one user's lookups never go out with another
user's token:

```ts
const RepoById = GraphQLResolver.ordered(client.RepoNodes, {
  variables: (ids: ReadonlyArray<string>) => ({ ids }),
  path: ["nodes"],
  typename: "Repository",
  batchKey: (context) => Context.get(context, CurrentUser).id
})
```

Without services, `batchKey` isn't accepted and all lookups share a batch.
A middleware that reads a `Context.Reference` with a default value doesn't
add it to the services, so `batchKey` doesn't cover it.

When results come back in any order, as from a search, `findById` matches them
by a key read from each result. Add a `SearchRepos` operation to `repos.graphql`,
then create its resolver inside `GitHub.make`, after the client:

```ts
// search(query: $query, type: REPOSITORY, first: 50) { pageInfo { hasNextPage } nodes { ... } }
const RepoByName = GraphQLResolver.findById(client.SearchRepos, {
  key: (repo) => repo.nameWithOwner,
  variables: (names) => ({ query: names.map((name) => `repo:${name}`).join(" ") }),
  path: ["search", "nodes"],
  typename: "Repository"
}).pipe(RequestResolver.batchN(50))
const getRepoByName = GraphQLResolver.request(RepoByName)
```

Include `getRepoByName` in the returned service and use it with `Effect.forEach`,
as with `getRepo` above. Write `key` before `variables`, so that the key type is
inferred from it.

A list field returns one page, so a key past the end of the page would look
missing. Set the page size (`first`, `limit`) and `RequestResolver.batchN` to
the same value; when the object holding the list reports
`pageInfo.hasNextPage: true`, the whole batch fails instead.

- For the simplest option, call a method per item with
  `Effect.forEach(items, f, { concurrency: 4 })`, at the cost of one request
  (and rate-limit charge) per item.

See [the RequestResolver example](../../../ai-docs/src/05_batching/10_request-resolver.ts).

### Aliased batching

Some lookups have no list field. GitHub finds a pull request by repository
and number, one at a time. `GraphQLResolver.aliased` repeats a generated query
under aliases in one request, so each slice still has the generated types.
Add this operation to `repos.graphql`:

```graphql
query PullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { number title }
  }
}
```

Then create the resolver inside `GitHub.make`, after the client:

```ts
const PullRequests = GraphQLResolver.aliased(client.PullRequest)
const getPullRequest = GraphQLResolver.request(PullRequests)
```

`getPullRequest` takes the operation's variables and returns the decoded
result, like `getRepo` above. Concurrent calls go out as one `POST`, built
from the document template the generator emits:

```graphql
query PullRequest($_0_owner: String!, $_0_name: String!, $_0_number: Int!, $_1_owner: String!, ...) {
  _0_repository: repository(owner: $_0_owner, name: $_0_name) { pullRequest(number: $_0_number) { number title } }
  _1_repository: repository(owner: $_1_owner, name: $_1_name) { pullRequest(number: $_1_number) { number title } }
}
```

The response is split by prefix and each slice is decoded with the generated
result Schema. A GraphQL error under `_1_repository` fails only the second
call; an error without a `path` fails them all. Calls whose variables encode
to the same JSON share a slice. A batch holds 10 slices unless you pipe
`RequestResolver.batchN`, because GitHub's query cost and timeouts grow with
its size.

An error fails every slice when the root field and every field down to the
error are non-null, since the `null` reaches `data`. One nullable field on
the way keeps it inside the slice. GitHub's `repository` and `pullRequest`
are both nullable. Middleware that hash the query should hash
`request.query`, which holds the batched document, and allowlists of trusted
documents can't cover batches.

### Partial results

When a field fails, GraphQL sets it to `null`. If the field is non-null, the
`null` moves up to the nearest nullable parent, and on to `data` if there is
none. An error stays inside one alias or list entry only when some field from
that alias or entry down to the failed field is nullable, so the `null` stops
there. Otherwise it wipes out data that other aliases or entries share. This
holds for `{ partial: true }`, `aliased` slices and `ordered` / `findById`
entries alike. In `repository { pullRequest { title } }`, an error on `title`
(a `String!`) nulls `pullRequest`, which GitHub declares nullable, so the rest
of the response survives.

## GitHub

GitHub's API has a few behaviours worth handling from the start: rate-limit
headers, typed errors, rate limits, timeouts and per-installation tokens.
The snippets below use the `GitHub` service and the operations from the
sections above.

### Rate-limit headers

GitHub reports the primary rate limit on every response in
`x-ratelimit-remaining`, `x-ratelimit-used` and `x-ratelimit-reset` (epoch
seconds). A middleware reads them from the result `next` returns:

```ts
import { Effect, Layer } from "effect"
import { GraphQLMiddleware } from "effect/graphql"

export class RateLimit extends GraphQLMiddleware.Service<RateLimit>()("app/RateLimit") {
  static readonly layer = Layer.succeed(RateLimit, {
    execute: ({ next, request }) =>
      Effect.tap(next(request), (result) => {
        const remaining = Number(result.headers?.["x-ratelimit-remaining"])
        return remaining < 500
          ? Effect.logWarning(`GitHub rate limit: ${remaining} points left`)
          : Effect.void
      }),
    subscribe: ({ next, request }) => next(request)
  })
}
```

Attach it with `GraphQLGroup.merge(...).middleware(RateLimit)` and provide
`RateLimit.layer`. A response with GraphQL `errors` still reaches the
middleware as a result; a transport failure fails `next` instead. Either
way, a failed call keeps the response `headers` and `status`, which
`GraphQLClientError` exposes for both reasons.

### Error types

GitHub adds a top-level `type` to each GraphQL error, such as `NOT_FOUND`,
`FORBIDDEN`, `INSUFFICIENT_SCOPES` or `RATE_LIMITED`. `GraphQLError` keeps
fields it doesn't know as JSON, so `type` can be read from
`ResponseError.errors`:

```ts
import { Effect } from "effect"
import type { GraphQLClientError } from "effect/graphql"

const hasErrorType = (error: GraphQLClientError.GraphQLClientError, type: string) =>
  error.reason._tag === "ResponseError" && error.reason.errors.every((entry) => entry.type === type)

export const findPullRequest = Effect.fn("findPullRequest")(function*(owner: string, name: string, number: number) {
  const github = yield* GitHub
  return yield* github.PullRequest({ owner, name, number }).pipe(
    Effect.map(({ repository }) => repository?.pullRequest ?? null),
    Effect.catchIf((error) => hasErrorType(error, "NOT_FOUND"), () => Effect.succeed(null))
  )
})
```

`every` keeps a `NOT_FOUND` that comes with another error a failure.

### Rate limits

GitHub's secondary rate limits, on concurrent requests and points per
minute, answer 403 or 429 with a JSON body that isn't a GraphQL response. The
client reports them as a `TransportError` with `status` and `headers`. They
usually come with `retry-after`, and an error with a `retry-after` is
retryable at any status. A primary rate limit arrives as a `RATE_LIMITED`
GraphQL error with `x-ratelimit-remaining: 0` and often no `retry-after`, so
`isRetryable` can be `false` and only the headers show it. GitHub asks
clients to wait for `retry-after` when it is set, and until
`x-ratelimit-reset` (epoch seconds) when `x-ratelimit-remaining` is `0`:

```ts
import { Duration, Effect, Schedule } from "effect"
import type { GraphQLClientError } from "effect/graphql"

const rateLimited = (error: GraphQLClientError.GraphQLClientError) => error.headers?.["x-ratelimit-remaining"] === "0"

const gitHubRetry = Schedule.exponential("1 second").pipe(
  Schedule.setInputType<GraphQLClientError.GraphQLClientError>(),
  Schedule.modifyDelay(({ duration, input, now }) => {
    if (input.retryAfter !== undefined) return Effect.succeed(input.retryAfter)
    if (!rateLimited(input)) return Effect.succeed(duration)
    const reset = Number(input.headers?.["x-ratelimit-reset"]) * 1000
    return Effect.succeed(Number.isFinite(reset) ? Duration.millis(Math.max(0, reset - now)) : Duration.minutes(1))
  })
)

export const retryGitHub = <A, R>(effect: Effect.Effect<A, GraphQLClientError.GraphQLClientError, R>) =>
  Effect.retry(effect, {
    schedule: gitHubRetry,
    while: (error) => error.isRetryable || rateLimited(error),
    times: 5
  })
```

`retryGitHub(github.RepoIssues(variables))` waits as long as GitHub asks
after a rate limit, and backs off exponentially after other retryable
errors. Don't retry on `isRetryable` with a plain backoff instead: it ignores
`retry-after`, and GitHub may ban an integration that keeps sending requests
while rate limited. Subscriptions reconnect on their own after a retryable
failure, and `GraphQLClient.defaultSubscriptionRetry` never reconnects sooner
than its `retryAfter`. A primary rate limit without `retry-after` isn't
retryable, though, so it ends the subscription, whatever `subscriptionRetry`
says. Wait until `x-ratelimit-reset` before subscribing again.

### Timeouts

GitHub stops a query that runs too long and answers 502 or 504, usually with
a GraphQL body such as `{"data":null,"errors":[{"message":"Something went
wrong while executing your query..."}]}`. That is a `ResponseError`, and
`isRetryable` is `true` for any 429 or 5xx status. A 5xx without a GraphQL
body is a retryable `TransportError`. `retryGitHub` above retries both.

`Stream.retry` on `pages` or `items` starts again from the first page. To
retry only the page that timed out, repeat the call in a middleware. A
timeout with a GraphQL body reaches the middleware as a result of `next`, and
one without fails `next` with a `TransportError`, so check the `status` of
both, and wait for a `retry-after` on either:

```ts
import { Duration, Effect, Layer, Result, Schedule } from "effect"
import { type GraphQLClientError, GraphQLMiddleware, type GraphQLProtocol } from "effect/graphql"

type Outcome = Result.Result<GraphQLProtocol.ExecutionResult, GraphQLClientError.GraphQLClientError>

const timedOut = (outcome: Outcome) => {
  const status = Result.isSuccess(outcome) ? outcome.success.status : outcome.failure.status
  return status === 502 || status === 504
}

// A result's headers are raw, so read `retry-after` as seconds or an HTTP
// date, as the client does for errors
const retryAfter = (outcome: Outcome, now: number) => {
  if (Result.isFailure(outcome)) return outcome.failure.retryAfter
  const value = outcome.success.headers?.["retry-after"]?.trim()
  if (value === undefined) return undefined
  const millis = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now
  return Number.isNaN(millis) ? undefined : Duration.millis(Math.max(0, millis))
}

const timeoutRetry = Schedule.exponential("1 second").pipe(
  Schedule.setInputType<Outcome>(),
  Schedule.modifyDelay(({ duration, input, now }) => Effect.succeed(retryAfter(input, now) ?? duration))
)

export class RetryTimeouts extends GraphQLMiddleware.Service<RetryTimeouts>()("app/RetryTimeouts") {
  static readonly layer = Layer.succeed(RetryTimeouts, {
    execute: ({ next, request }) =>
      Effect.result(next(request)).pipe(
        Effect.repeat({ while: timedOut, schedule: timeoutRetry, times: 3 }),
        Effect.flatMap(Effect.fromResult)
      ),
    subscribe: ({ next, request }) => next(request)
  })
}
```

Attach `RetryTimeouts` only to operations that are safe to send twice, and
don't wrap other mutations in `retryGitHub` either. A mutation that timed
out may still have been applied.

### Pull requests per installation

A GitHub App calls the API with one token per installation. When the auth
middleware `requires` the installation, `aliased` needs a `batchKey`, so pull
requests for different installations never share a request:

```ts
import { Context, Effect, Layer, Redacted } from "effect"
import { GraphQLClient, GraphQLGroup, GraphQLMiddleware, GraphQLProtocol, GraphQLResolver } from "effect/graphql"
import { FetchHttpClient, Headers } from "effect/http"
import { IssuesGraphQLGroup } from "./src/issues.graphql.ts"
import { ReposGraphQLGroup } from "./src/repos.graphql.ts"

// The installation a call runs as, with its access token
export class Installation extends Context.Service<Installation, {
  readonly id: number
  readonly token: Redacted.Redacted
}>()("app/Installation") {}

export class InstallationAuth extends GraphQLMiddleware.Service<InstallationAuth, {
  requires: Installation
}>()("app/InstallationAuth") {
  static readonly layer = Layer.succeed(
    InstallationAuth,
    GraphQLMiddleware.mapRequest(Effect.fnUntraced(function*(request) {
      const { token } = yield* Installation
      return { ...request, headers: Headers.set(request.headers, "authorization", `Bearer ${Redacted.value(token)}`) }
    }))
  )
}

export class GitHub extends Context.Service<GitHub>()("app/GitHub", {
  make: Effect.gen(function*() {
    const client = yield* GraphQLClient.make(
      GraphQLGroup.merge(IssuesGraphQLGroup, ReposGraphQLGroup).middleware(InstallationAuth)
    )
    const PullRequests = GraphQLResolver.aliased(client.PullRequest, {
      batchKey: (context) => Context.get(context, Installation).id
    })
    return { ...client, getPullRequest: GraphQLResolver.request(PullRequests) }
  })
}) {
  static readonly layer = Layer.effect(GitHub, GitHub.make).pipe(
    Layer.provide(InstallationAuth.layer),
    Layer.provide(GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" })),
    Layer.provide(FetchHttpClient.layer)
  )
}

export const pullRequestTitles = Effect.fn("pullRequestTitles")(function*(
  installation: Installation["Service"],
  repo: { readonly owner: string; readonly name: string },
  numbers: ReadonlyArray<number>
) {
  const github = yield* GitHub
  const results = yield* Effect.forEach(
    numbers,
    (number) => github.getPullRequest({ ...repo, number }),
    { concurrency: "unbounded" }
  ).pipe(Effect.provideService(Installation, installation))
  return results.map((result) => result.repository?.pullRequest?.title ?? null)
})
```

Every method of this client requires `Installation`. Concurrent
`pullRequestTitles` calls for two installations send one request per
installation, each with up to 10 pull requests and that installation's token.

## Links

- [Website](https://effect.website): documentation, guides, and news.
- [Reference](https://effect.website/docs/v4/api/graphql-generator): API documentation for this package.
- [Discord](https://discord.gg/effect-ts): ask questions, share what you're building, and talk to the core team.
- [Community](https://effect.website/community-hub): meetups and events, or bring Effect to your own.
- [Issues](https://github.com/Effect-TS/effect/issues): bug reports and feature requests.

## Let's talk

Whether your team is considering Effect, rolling it out, or already running it in production, we'd love to hear from you: what you're building, what works, and what you need from Effect next.

- **Talk to the maintainers.** Introduce your team on [Discord](https://discord.gg/effect-ts) or email [contact@effectful.co](mailto:contact@effectful.co). We're happy to connect privately on Slack or Discord for feedback and help with adoption.
- **Production support.** We're exploring how to better support teams running Effect in production. If your organization has specific support needs, let's discuss them.
- **Adoption help.** Our [adoption partners](https://effect.website/adoption-partners) offer implementation, consulting, team extension, training, and commercial support.
