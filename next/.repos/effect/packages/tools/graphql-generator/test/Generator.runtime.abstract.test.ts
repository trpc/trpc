/**
 * End-to-end checks for generated abstract types, run through a
 * `GraphQLClient` over a mock `GraphQLProtocol`: the GitHub timeline (`node`
 * on an interface, the `timelineItems` union and a fragment on the `Actor`
 * interface from another file), and the subscriptions set (a `Subscription`
 * root, a `@oneOf` input, nested interfaces, an enum and recursive input
 * objects).
 */
import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { GraphQLClient } from "effect/graphql"
import { GraphQLClientError } from "effect/graphql/GraphQLClientError"
import * as GraphQLProtocol from "effect/graphql/GraphQLProtocol"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { Messages, MessagesGraphQLGroup } from "./generated/subscriptions/messages.graphql.ts"
import { type Room, RoomEvents, RoomsGraphQLGroup } from "./generated/subscriptions/rooms.graphql.ts"
import type { MemberMatch } from "./generated/subscriptions/shared.graphql.ts"
import { importGitHub, type UntypedClient } from "./utils/generator.ts"

interface Sent {
  readonly query: string
  readonly operationName: string
  readonly variables: unknown
}

/**
 * A protocol that records each request and answers `execute` with `data` and
 * `subscribe` with one event per entry of `events`.
 */
const mock = (options: { readonly data?: unknown; readonly events?: ReadonlyArray<unknown> }) => {
  const sent: Array<Sent> = []
  const record = ({ operationName, query, variables }: GraphQLProtocol.GraphQLRequest) =>
    sent.push({ query, operationName, variables })
  const layer = Layer.succeed(GraphQLProtocol.GraphQLProtocol, {
    execute: (request) =>
      Effect.sync(() => {
        record(request)
        return { body: { data: options.data } }
      }),
    subscribe: (request) =>
      Stream.unwrap(Effect.sync(() => {
        record(request)
        return Stream.fromIterable((options.events ?? []).map((data) => ({ body: { data } })))
      }))
  })
  return { sent, layer }
}

const reasonTag = (error: unknown) => {
  assert.instanceOf(error, GraphQLClientError)
  return error.reason._tag
}

const at = "2026-10-08T10:00:00Z"

describe("Generated GitHub timeline client", () => {
  it.effect("IssueTimeline decodes the selected members, the other buckets and a fragment on an interface", () =>
    Effect.gen(function*() {
      const { IssueTimeline, TimelineGraphQLGroup } = yield* importGitHub("timeline.graphql.ts")
      const { layer, sent } = mock({
        data: {
          node: {
            __typename: "Issue",
            number: 4182,
            timelineItems: {
              nodes: [
                {
                  __typename: "IssueComment",
                  id: "IC_1",
                  body: "Ship it",
                  createdAt: at,
                  author: {
                    __typename: "User",
                    login: "tim-smart",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Tim"
                  }
                },
                {
                  __typename: "IssueComment",
                  id: "IC_2",
                  body: "Bumped",
                  createdAt: at,
                  author: {
                    __typename: "Bot",
                    login: "renovate",
                    avatarUrl: "https://avatars.githubusercontent.com/u/2"
                  }
                },
                { __typename: "LabeledEvent", createdAt: at, label: { name: "bug", color: "d73a4a" } },
                {
                  __typename: "ClosedEvent",
                  createdAt: at,
                  closer: { __typename: "Commit", oid: "7ff5048db5", pushedDate: null }
                },
                { __typename: "ClosedEvent", createdAt: at, closer: { __typename: "ProjectV2" } },
                { __typename: "MentionedEvent" },
                null
              ]
            }
          }
        }
      })
      const client: UntypedClient = yield* GraphQLClient.make<never>(TimelineGraphQLGroup).pipe(Effect.provide(layer))
      const result = yield* client.IssueTimeline({ id: "I_kwDOAbc" })

      assert.deepStrictEqual(sent, [{
        query: IssueTimeline.document,
        operationName: "IssueTimeline",
        variables: { id: "I_kwDOAbc" }
      }])

      const node = result.node
      assert(node !== null && node.__typename === "Issue")
      assert.strictEqual(node.number, 4182)
      const [comment, botComment, labeled, closedByCommit, closedByProject, mentioned, missing] =
        node.timelineItems.nodes ?? []

      assert(comment?.__typename === "IssueComment")
      assert.strictEqual(comment.body, "Ship it")
      assert.strictEqual(DateTime.formatIso(comment.createdAt), "2026-10-08T10:00:00.000Z")
      assert(comment.author?.__typename === "User")
      assert.strictEqual(comment.author.name, "Tim")
      assert.instanceOf(comment.author.avatarUrl, URL)

      assert(botComment?.__typename === "IssueComment")
      assert.strictEqual(botComment.author?.__typename, "Bot")
      assert.strictEqual(botComment.author?.login, "renovate")

      assert(labeled?.__typename === "LabeledEvent")
      assert.deepStrictEqual(labeled.label, { name: "bug", color: "d73a4a" })

      assert(closedByCommit?.__typename === "ClosedEvent")
      assert(closedByCommit.closer?.__typename === "Commit")
      assert.strictEqual(closedByCommit.closer.oid, "7ff5048db5")
      assert.isNull(closedByCommit.closer.pushedDate)

      assert(closedByProject?.__typename === "ClosedEvent")
      assert.deepStrictEqual(closedByProject.closer, { __typename: "ProjectV2" })

      // A timeline item type the query didn't select lands in the other bucket.
      assert.deepStrictEqual(mentioned, { __typename: "MentionedEvent" })
      assert.isNull(missing)
    }))

  it.effect("node types the query didn't select, including ones added later, land in the other bucket", () =>
    Effect.gen(function*() {
      const { TimelineGraphQLGroup } = yield* importGitHub("timeline.graphql.ts")
      for (const __typename of ["Repository", "AddedLaterNode"]) {
        const { layer } = mock({ data: { node: { __typename } } })
        const client: UntypedClient = yield* GraphQLClient.make<never>(TimelineGraphQLGroup).pipe(Effect.provide(layer))
        const result = yield* client.IssueTimeline({ id: "X" })
        assert.deepStrictEqual<unknown>(result, { node: { __typename } })
      }
    }))

  it.effect("a malformed selected member fails with a DecodeError instead of falling into the other bucket", () =>
    Effect.gen(function*() {
      const { TimelineGraphQLGroup } = yield* importGitHub("timeline.graphql.ts")
      const { layer } = mock({
        data: {
          node: {
            __typename: "Issue",
            number: 1,
            timelineItems: { nodes: [{ __typename: "IssueComment", id: 1 }] }
          }
        }
      })
      const client: UntypedClient = yield* GraphQLClient.make<never>(TimelineGraphQLGroup).pipe(Effect.provide(layer))
      const error = yield* client.IssueTimeline({ id: "X" }).pipe(Effect.flip)
      assert.strictEqual(reasonTag(error), "DecodeError")
    }))
})

describe("Generated subscriptions client", () => {
  it.effect("a @oneOf input with two keys fails with an EncodeError and nothing is sent", () =>
    Effect.gen(function*() {
      const { layer, sent } = mock({ data: { room: null } })
      const client = yield* GraphQLClient.make(RoomsGraphQLGroup).pipe(Effect.provide(layer))
      const both = { id: "R_1", slug: "general" } as unknown as Room.Variables["by"]
      const error = yield* client.Room({ by: both }).pipe(Effect.flip)
      assert.strictEqual(reasonTag(error), "EncodeError")
      assert.deepStrictEqual(sent, [])
    }))

  it.effect("Messages encodes a DateTime nested across the recursive inputs", () =>
    Effect.gen(function*() {
      const { layer, sent } = mock({ data: { messages: [] } })
      const client = yield* GraphQLClient.make(MessagesGraphQLGroup).pipe(Effect.provide(layer))
      yield* client.Messages({ filter: { or: [{ member: { posted: { postedAfter: DateTime.makeUnsafe(at) } } }] } })
      assert.deepStrictEqual(sent, [{
        query: Messages.document,
        operationName: "Messages",
        variables: { filter: { or: [{ member: { posted: { postedAfter: "2026-10-08T10:00:00.000Z" } } }] } }
      }])
    }))

  it.effect("a nested @oneOf input with two keys fails with an EncodeError and nothing is sent", () =>
    Effect.gen(function*() {
      const { layer, sent } = mock({ data: { messages: [] } })
      const client = yield* GraphQLClient.make(MessagesGraphQLGroup).pipe(Effect.provide(layer))
      const both = { id: "U_1", posted: {} } as unknown as MemberMatch
      const error = yield* client.Messages({ filter: { member: both } }).pipe(Effect.flip)
      assert.strictEqual(reasonTag(error), "EncodeError")
      assert.deepStrictEqual(sent, [])
    }))

  it.effect("RoomEvents streams events across the nested interfaces, with the other bucket for the rest", () =>
    Effect.gen(function*() {
      const owner = { name: "Ann", role: "OWNER" }
      const { layer, sent } = mock({
        events: [
          { events: { __typename: "MessagePosted", id: "E_1", at, member: owner, body: "hello" } },
          { events: { __typename: "MemberJoined", id: "E_2", at, member: { name: "Bo", role: "MODERATOR" } } },
          { events: { __typename: "RoomRenamed", id: "E_3", at, name: "random" } },
          { events: { __typename: "RoomArchived", id: "E_4", at } }
        ]
      })
      const client = yield* GraphQLClient.make(RoomsGraphQLGroup).pipe(Effect.provide(layer))
      const events = yield* Stream.runCollect(client.RoomEvents({ room: { id: "R_1" } }))

      assert.deepStrictEqual(sent, [{
        query: RoomEvents.document,
        operationName: "RoomEvents",
        variables: { room: { id: "R_1" } }
      }])

      const [posted, joined, renamed, archived] = events.map((event) => event.events)
      assert(posted?.__typename === "MessagePosted")
      assert.strictEqual(posted.body, "hello")
      assert.deepStrictEqual(posted.member, owner)
      // `member` comes from `... on MemberEvent`, an interface MemberJoined implements.
      assert(joined?.__typename === "MemberJoined")
      assert.strictEqual(joined.member.name, "Bo")
      // A role the server added later still decodes.
      assert.strictEqual(joined.member.role, "MODERATOR")
      assert(renamed?.__typename === "RoomRenamed")
      assert.strictEqual(renamed.name, "random")
      assert.deepStrictEqual<unknown>(archived, { __typename: "RoomArchived", id: "E_4", at })
    }))
})
