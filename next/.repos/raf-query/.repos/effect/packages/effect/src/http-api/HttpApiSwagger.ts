/**
 * Swagger documentation UI for declarative `HttpApi` contracts.
 *
 * This module mounts a browser-based Swagger UI route on an `HttpRouter`. The
 * page renders the OpenAPI document derived from the supplied `HttpApi`, so a
 * running application can expose interactive API documentation without writing a
 * separate OpenAPI file.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Function from "../Function.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import type * as Layer from "../Layer.ts"
import type * as HttpApi from "./HttpApi.ts"
import type * as HttpApiGroup from "./HttpApiGroup.ts"
import * as Html from "./internal/html.ts"
import * as internal from "./internal/httpApiSwagger.ts"
import * as OpenApi from "./OpenApi.ts"

const makeHandler = <Id extends string, Groups extends HttpApiGroup.Constraint>(options: {
  readonly api: HttpApi.HttpApi<Id, Groups>
}) => {
  const makeResponse = Function.memoize((api: HttpApi.HttpApi<Id, Groups>) => {
    const spec = OpenApi.fromApi(api)
    return HttpServerResponse.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${Html.escape(spec.info.title)} Documentation</title>
  <style>${internal.css}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script id="swagger-spec" type="application/json">
    ${Html.escapeJson(spec)}
  </script>
  <script>
    ${internal.javascript}
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        spec: JSON.parse(document.getElementById("swagger-spec").textContent),
        dom_id: "#swagger-ui",
      });
    };
  </script>
</body>
</html>`)
  })
  return Effect.sync(() => makeResponse(options.api))
}

/**
 * Mounts Swagger UI for an `HttpApi` at the configured path, defaulting to
 * `/docs`, using the OpenAPI specification generated from the API.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly path?: `/${string}` | undefined
  }
): Layer.Layer<never, never, HttpRouter.HttpRouter> =>
  HttpRouter.use(Effect.fnUntraced(function*(router) {
    const handler = makeHandler({ api })
    yield* router.add("GET", options?.path ?? "/docs", handler)
  }))
