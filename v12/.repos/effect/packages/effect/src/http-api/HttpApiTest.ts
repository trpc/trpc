/**
 * Tests `HttpApi` implementations through an in-memory generated client.
 *
 * The helpers use the same request encoding, routing, response encoding, and
 * client decoding as the normal `HttpApiBuilder` and `HttpApiClient` pipeline,
 * but they do not start an HTTP server. This is useful for focused handler
 * tests, schema round trips, middleware behavior, and typed client calls.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import type { FileSystem } from "../FileSystem.ts"
import type { Generator } from "../http/Etag.ts"
import * as HttpClient from "../http/HttpClient.ts"
import * as HttpEffect from "../http/HttpEffect.ts"
import type { HttpPlatform } from "../http/HttpPlatform.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerRequest from "../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import { CurrentRequestState, RequestState } from "../http/internal/requestState.ts"
import * as Layer from "../Layer.ts"
import type { Path } from "../Path.ts"
import * as Scope from "../Scope.ts"
import type * as HttpApi from "./HttpApi.ts"
import type { GroupService, HandlerRuntime } from "./HttpApiBuilder.ts"
import * as HttpApiBuilder from "./HttpApiBuilder.ts"
import * as HttpApiClient from "./HttpApiClient.ts"
import type * as HttpApiEndpoint from "./HttpApiEndpoint.ts"
import type * as HttpApiGroup from "./HttpApiGroup.ts"

/**
 * Creates an in-memory client for testing selected groups of an `HttpApi`.
 *
 * **Details**
 *
 * Handlers for the selected groups are taken from the environment; unselected
 * groups are wired with placeholder handlers that fail if called.
 *
 * Each call runs its handler in a request scope that is a child of the
 * `Scope` the client was created in. A streaming response keeps that scope
 * open until its body ends, and a body that is never read is closed with the
 * owning `Scope`.
 *
 * A `Stream` payload reaches the handler unbuffered: each element is pulled
 * from the caller's stream as the handler reads it. If the caller's stream
 * fails, reading the request body fails with it. Client aborts and socket
 * behavior such as draining unread bodies, closing the connection, or
 * answering with `499` are not emulated.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const groups = Effect.fnUntraced(function*<
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  const Identifiers extends ReadonlyArray<HttpApiGroup.Identifier<Groups>>,
  SelectedGroups extends HttpApiGroup.Constraint = HttpApiGroup.WithIdentifier<Groups, Identifiers[number]>
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  groupIdentifiers: Identifiers,
  options?: {
    readonly baseUrl?: string | URL | undefined
  }
): Effect.fn.Return<
  HttpApiClient.Client<Groups>,
  never,
  | HttpApiGroup.ToService<ApiId, SelectedGroups>
  | HttpApiGroup.MiddlewareClient<Groups>
  | HttpApiEndpoint.Middleware<HttpApiGroup.Endpoints<Groups>>
  | FileSystem
  | Generator
  | HttpPlatform
  | Path
  | Scope.Scope
> {
  let context = yield* Effect.context<HttpApiGroup.ToService<ApiId, SelectedGroups>>()

  const groups = api.groups as unknown as Record<string, HttpApiGroup.Top>
  for (const identifier in groups) {
    const group = groups[identifier]
    if (groupIdentifiers.includes(identifier as any)) {
      continue
    }
    const handlers = new Map<string, HandlerRuntime>()
    const routes: Array<HttpRouter.Route<any, any>> = []
    for (const endpointIdentifier in group.endpoints) {
      const endpoint = group.endpoints[endpointIdentifier]
      const handler: HandlerRuntime = {
        endpoint: endpoint as any,
        handler: () => Effect.die(new Error(`Unhandled endpoint: ${endpointIdentifier}`)),
        isRaw: false,
        uninterruptible: false
      }
      handlers.set(endpointIdentifier, handler)
      routes.push(HttpApiBuilder.handlerToRoute(api, group as any, handler, context))
    }
    const service: GroupService = { handlers, routes }
    context = Context.add(context, group as any, service)
  }

  const layer: Layer.Layer<
    never,
    never,
    | FileSystem
    | Generator
    | HttpPlatform
    | HttpRouter.HttpRouter
    | Path
  > = HttpApiBuilder.layer(api).pipe(
    Layer.provide(Layer.succeedContext(context))
  ) as any
  const handler = yield* HttpRouter.toHttpEffect(layer)
  const scope = yield* Effect.scope
  const httpClient = HttpClient.make((request) => {
    const requestScope = Scope.forkUnsafe(scope)
    const serverRequest = HttpServerRequest.fromClientRequest(request)
    const state = new RequestState()
    let transferred = false
    return handler.pipe(
      Effect.flatMap((response) => {
        const preResponse = state.preResponseHandler
        return preResponse === undefined ? Effect.succeed(response) : preResponse(serverRequest, response)
      }),
      Effect.map((response) => {
        const transfer = HttpEffect.scopeTransferToStream(response)
        transferred = transfer !== response
        return HttpServerResponse.toClientResponse(transfer, { request })
      }),
      Effect.provideService(HttpServerRequest.HttpServerRequest, serverRequest),
      Effect.provideService(CurrentRequestState, state),
      Effect.provideService(Scope.Scope, requestScope),
      Effect.orDie,
      Effect.onExit((exit) => transferred && Exit.isSuccess(exit) ? Effect.void : Scope.close(requestScope, exit))
    )
  })

  return yield* HttpApiClient.makeWith(api, {
    httpClient,
    baseUrl: options?.baseUrl ?? "http://localhost:3000"
  })
})
