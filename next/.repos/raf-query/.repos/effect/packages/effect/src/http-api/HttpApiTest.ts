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
import type { FileSystem } from "../FileSystem.ts"
import type { Generator } from "../http/Etag.ts"
import * as HttpClient from "../http/HttpClient.ts"
import type { HttpPlatform } from "../http/HttpPlatform.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerRequest from "../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import * as preResponseHandler from "../http/internal/preResponseHandler.ts"
import * as Layer from "../Layer.ts"
import type { Path } from "../Path.ts"
import type { Scope } from "../Scope.ts"
import type * as HttpApi from "./HttpApi.ts"
import type { HandlerRuntime } from "./HttpApiBuilder.ts"
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
  | Scope
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
    context = Context.add(context, group as any, { handlers, routes })
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
  const httpClient = HttpClient.make(Effect.fnUntraced(function*(request) {
    const serverRequest = HttpServerRequest.fromClientRequest(request)
    const response = yield* handler.pipe(
      Effect.flatMap((response) => {
        const preResponse = preResponseHandler.requestPreResponseHandlers.get(serverRequest.source)
        return preResponse === undefined ? Effect.succeed(response) : preResponse(serverRequest, response)
      }),
      Effect.provideService(HttpServerRequest.HttpServerRequest, serverRequest),
      Effect.orDie
    )
    return HttpServerResponse.toClientResponse(response, { request })
  }, Effect.scoped))

  return yield* HttpApiClient.makeWith(api, {
    httpClient,
    baseUrl: options?.baseUrl ?? "http://localhost:3000"
  })
})
