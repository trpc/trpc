import type * as McpProtocol from "effect/ai/McpProtocol"
import type * as McpSchema from "effect/ai/McpSchema"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Ref from "effect/Ref"
import * as RpcClient from "effect/rpc/RpcClient"
import type * as RpcClientError from "effect/rpc/RpcClientError"
import type * as RpcGroup from "effect/rpc/RpcGroup"
import type * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as Schema from "effect/Schema"

export type ReverseMethod = "roots/list" | "sampling/createMessage" | "elicitation/create"

export interface RecordedRequest {
  readonly id: string | number
  readonly method: ReverseMethod
  readonly payload: unknown
}

export type Handler = (
  request: RecordedRequest
) => Effect.Effect<unknown, typeof McpSchema.McpError.Type>

export interface McpTestPeerOptions {
  readonly capabilities?: typeof McpSchema.ClientCapabilities.Type | undefined
  readonly clientInfo?: typeof McpSchema.Implementation.Type | undefined
  readonly handlers?: Partial<Record<ReverseMethod, Handler>> | undefined
}

export interface McpTestPeer {
  readonly wireClient: RpcClient.RpcClient<
    RpcGroup.Rpcs<typeof McpSchema.ServerRequestRpcs>,
    RpcClientError.RpcClientError
  >
  readonly reverseClient: McpSchema.McpReverseClient
  readonly requests: Effect.Effect<ReadonlyArray<RecordedRequest>>
  readonly takeRequest: Effect.Effect<RecordedRequest>
}

const isReverseMethod = (method: string): method is ReverseMethod =>
  ["roots/list", "sampling/createMessage", "elicitation/create"].includes(method)

export const makeMcpTestPeer = Effect.fn("McpTestPeer.make")(function*(
  protocol: McpProtocol.ProtocolAdapter,
  options: McpTestPeerOptions = {}
) {
  const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
  const inbox = yield* Queue.unbounded<RecordedRequest>()
  const handlers = options.handlers ?? {}

  const rpcProtocol = yield* RpcClient.Protocol.make((writeResponse) =>
    Effect.succeed({
      send: (clientId, message) => {
        if (message._tag !== "Request" || !isReverseMethod(message.tag)) {
          return Effect.void
        }
        const request: RecordedRequest = {
          id: message.id,
          method: message.tag,
          payload: message.payload
        }
        return Effect.gen(function*() {
          yield* Ref.update(requests, (current) => [...current, request])
          yield* Queue.offer(inbox, request)

          const handler = handlers[request.method]
          const result = yield* Effect.exit(
            handler === undefined
              ? Effect.fail({
                code: -32601,
                message: `No test peer handler for ${request.method}`
              })
              : handler(request)
          )

          if (Exit.isSuccess(result)) {
            return yield* writeResponse(clientId, {
              _tag: "Exit",
              requestId: request.id,
              exit: {
                _tag: "Success",
                value: result.value
              }
            })
          }

          const failure = Cause.findErrorOption(result.cause)
          if (Option.isSome(failure)) {
            return yield* writeResponse(clientId, {
              _tag: "Exit",
              requestId: request.id,
              exit: {
                _tag: "Failure",
                cause: [{
                  _tag: "Fail",
                  error: failure.value
                }]
              }
            })
          }

          return yield* Effect.die(Cause.squash(result.cause))
        })
      },
      supportsAck: true,
      supportsTransferables: false,
      codecFor: Schema.toCodecJson as RpcSerialization.CodecFor
    })
  )

  const wireClient = yield* RpcClient.make(
    protocol.serverRequestRpcs as unknown as typeof McpSchema.ServerRequestRpcs
  ).pipe(
    Effect.provideService(RpcClient.Protocol, rpcProtocol)
  )
  const reverseClient = yield* protocol.makeReverseClient({
    protocolVersion: protocol.protocolVersion,
    clientCapabilities: options.capabilities ?? {},
    clientInfo: options.clientInfo ?? { name: "McpTestPeer", version: "1.0.0" }
  }).pipe(Effect.provideService(RpcClient.Protocol, rpcProtocol))

  return {
    wireClient,
    reverseClient,
    requests: Ref.get(requests),
    takeRequest: Queue.take(inbox)
  } satisfies McpTestPeer
})
