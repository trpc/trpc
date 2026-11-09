import { assert, describe, it } from "@effect/vitest"
import { Effect, type Layer, Ref, Stream } from "effect"
import { GraphQLClient } from "effect/graphql"
import type * as GraphQLProtocol from "effect/graphql/GraphQLProtocol"
import * as UrlParams from "effect/http/UrlParams"
import { expectReason, IssuesGroup, protocolLayer } from "./fixtures.ts"

const issue = (number: number) => ({ number, title: `#${number}`, createdAt: "2026-01-01T00:00:00Z" })

const page = (nodes: ReadonlyArray<unknown>, pageInfo: { hasNextPage: boolean; endCursor: string | null }) => ({
  data: { repository: { issues: { pageInfo, nodes } } }
})

const noRepository = { data: { repository: null } }

/** Scripts one response per `after` cursor; the first page is keyed `start`. */
const pagedLayer = Effect.fnUntraced(function*(pages: Record<string, unknown>) {
  const requests = yield* Ref.make<Array<GraphQLProtocol.GraphQLRequest>>([])
  const layer = protocolLayer({
    execute: (request) =>
      Effect.as(
        Ref.update(requests, (all) => [...all, request]),
        { body: pages[(request.variables as { after?: string | null }).after ?? "start"] }
      )
  })
  return { layer, requests }
})

const twoPages = {
  start: page([issue(1), null], { hasNextPage: true, endCursor: "c1" }),
  c1: page([issue(2)], { hasNextPage: false, endCursor: null })
}

const variables = { owner: "Effect-TS", name: "effect" }

const makeClient = <R>(layer: Layer.Layer<R>) => GraphQLClient.make(IssuesGroup).pipe(Effect.provide(layer))

describe("GraphQLClient.pages / items", () => {
  it.effect("pages passes endCursor as $after until hasNextPage is false", () =>
    Effect.gen(function*() {
      const { layer, requests } = yield* pagedLayer(twoPages)
      const client = yield* makeClient(layer)
      const pages = yield* Stream.runCollect(
        GraphQLClient.pages(client.RepoIssues, { variables, connection: (r) => r.repository?.issues })
      )
      assert.deepStrictEqual(pages.map((p) => p.pageInfo.endCursor), ["c1", null])
      assert.deepStrictEqual(
        (yield* Ref.get(requests)).map((r) => (r.variables as { after?: string | null }).after),
        [undefined, "c1"]
      )
    }))

  it.effect("items flattens nodes across pages and keeps null entries", () =>
    Effect.gen(function*() {
      const { layer } = yield* pagedLayer(twoPages)
      const client = yield* makeClient(layer)
      const items = yield* Stream.runCollect(
        GraphQLClient.items(client.RepoIssues, { variables, connection: (r) => r.repository?.issues })
      )
      assert.deepStrictEqual(items.map((i) => i === null ? null : i.number), [1, null, 2])
    }))

  it.effect("options are forwarded to every page request", () =>
    Effect.gen(function*() {
      const { layer, requests } = yield* pagedLayer(twoPages)
      const client = yield* makeClient(layer)
      yield* Stream.runDrain(GraphQLClient.pages(client.RepoIssues, {
        variables,
        connection: (r) => r.repository?.issues,
        options: { headers: { "x-page-run": "1" }, urlParams: { preview: "t" } }
      }))
      const sent = yield* Ref.get(requests)
      assert.deepStrictEqual(sent.map((r) => r.headers["x-page-run"]), ["1", "1"])
      assert.deepStrictEqual(sent.map((r) => UrlParams.getAll(r.urlParams, "preview")), [["t"], ["t"]])
    }))

  it.effect("a null connection on the first page is an empty stream", () =>
    Effect.gen(function*() {
      const { layer } = yield* pagedLayer({ start: noRepository })
      const client = yield* makeClient(layer)
      const pages = yield* Stream.runCollect(
        GraphQLClient.pages(client.RepoIssues, { variables, connection: (r) => r.repository?.issues })
      )
      assert.deepStrictEqual(pages, [])
    }))

  it.effect("a null connection on a later page is a PaginationError naming the cursor used", () =>
    Effect.gen(function*() {
      const { layer } = yield* pagedLayer({ ...twoPages, c1: noRepository })
      const client = yield* makeClient(layer)
      const reason = yield* Stream.runCollect(
        GraphQLClient.pages(client.RepoIssues, { variables, connection: (r) => r.repository?.issues })
      ).pipe(expectReason("PaginationError"))
      assert.strictEqual(reason.cursor, "c1")
    }))

  it.effect("a cursor that does not advance is a PaginationError instead of a refetch", () =>
    Effect.gen(function*() {
      const { layer, requests } = yield* pagedLayer({
        ...twoPages,
        c1: page([issue(2)], { hasNextPage: true, endCursor: "c1" })
      })
      const client = yield* makeClient(layer)
      const reason = yield* Stream.runCollect(
        GraphQLClient.pages(client.RepoIssues, { variables, connection: (r) => r.repository?.issues })
      ).pipe(expectReason("PaginationError"))
      assert.strictEqual(reason.cursor, "c1")
      assert.strictEqual((yield* Ref.get(requests)).length, 2)
    }))
})
