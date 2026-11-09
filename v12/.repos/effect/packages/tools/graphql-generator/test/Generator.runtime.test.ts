/** Generated GitHub modules drive an HTTP client against canned GitHub responses. */
import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { GraphQLClient, GraphQLProtocol } from "effect/graphql"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import { importGitHub, type UntypedClient } from "./utils/generator.ts"

interface Sent {
  readonly query: string
  readonly operationName: string
  readonly variables: unknown
}

/** A GitHub endpoint that records each request body and answers with `data`. */
const github = (data: unknown) => {
  const sent: Array<Sent> = []
  const layer = GraphQLProtocol.layerHttp({ url: "https://api.github.com/graphql" }).pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          const text = request.body instanceof HttpBody.Uint8Array ? request.body.text : undefined
          assert(text !== undefined, "expected a JSON request body")
          sent.push(JSON.parse(text))
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } })
          )
        })
      )
    ))
  )
  return { sent, layer }
}

describe("Generated GitHub client", () => {
  it.effect("RepoIssues encodes its variables and decodes issues, custom scalars and new enum values", () =>
    Effect.gen(function*() {
      const { IssuesGraphQLGroup, RepoIssues } = yield* importGitHub("issues.graphql.ts")
      const { layer, sent } = github({
        repository: {
          id: "R_kgDOAbc",
          nameWithOwner: "Effect-TS/effect",
          issues: {
            totalCount: 2,
            pageInfo: { hasNextPage: true, endCursor: "Y3Vyc29yOjI=" },
            nodes: [
              {
                number: 4182,
                title: "Heredoc stdin swallows trailing flags",
                state: "OPEN",
                stateReason: null,
                createdAt: "2026-09-30T12:00:00Z",
                url: "https://github.com/Effect-TS/effect/issues/4182",
                isPinned: true
              },
              {
                number: 4100,
                title: "Old bug",
                state: "CLOSED",
                stateReason: "RESOLVED_BY_BOT",
                createdAt: "2026-08-01T08:30:00Z",
                url: "https://github.com/Effect-TS/effect/issues/4100",
                isPinned: null
              }
            ]
          }
        }
      })
      const client: UntypedClient = yield* GraphQLClient.make<never>(IssuesGraphQLGroup).pipe(Effect.provide(layer))
      const result = yield* client.RepoIssues({
        owner: "Effect-TS",
        name: "effect",
        states: ["OPEN", "CLOSED"],
        orderBy: { field: "CREATED_AT", direction: "DESC" }
      })

      assert.deepStrictEqual(sent, [{
        query: RepoIssues.document,
        operationName: "RepoIssues",
        variables: {
          owner: "Effect-TS",
          name: "effect",
          states: ["OPEN", "CLOSED"],
          orderBy: { field: "CREATED_AT", direction: "DESC" }
        }
      }])

      const repository = result.repository
      assert(repository !== null)
      assert.strictEqual(repository.nameWithOwner, "Effect-TS/effect")
      assert.deepStrictEqual(repository.issues.pageInfo, { hasNextPage: true, endCursor: "Y3Vyc29yOjI=" })
      const [open, closed] = repository.issues.nodes ?? []
      assert(open != null && closed != null)
      assert.strictEqual(open.number, 4182)
      assert.strictEqual(open.isPinned, true)
      assert.isTrue(DateTime.isDateTime(open.createdAt))
      assert.strictEqual(DateTime.formatIso(open.createdAt), "2026-09-30T12:00:00.000Z")
      assert.instanceOf(open.url, URL)
      assert.strictEqual(open.url.pathname, "/Effect-TS/effect/issues/4182")
      // A state reason added to the schema after generation still decodes.
      assert.strictEqual(closed.stateReason, "RESOLVED_BY_BOT")
      assert.isNull(closed.isPinned)
    }))
})
