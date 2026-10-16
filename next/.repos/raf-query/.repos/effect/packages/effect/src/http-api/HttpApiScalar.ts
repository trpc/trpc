/**
 * Scalar documentation UI for declarative `HttpApi` contracts.
 *
 * Use this module to mount a browser-based API reference on an `HttpRouter`
 * without writing or storing a separate OpenAPI file. The route renders an HTML
 * page containing the OpenAPI document produced from the supplied `HttpApi` and
 * boots Scalar in the browser.
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
import * as internal from "./internal/httpApiScalar.ts"
import * as OpenApi from "./OpenApi.ts"

/**
 * Theme preset identifier accepted by the Scalar API reference UI.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ScalarThemeId =
  | "alternate"
  | "default"
  | "moon"
  | "purple"
  | "solarized"
  | "bluePlanet"
  | "saturn"
  | "kepler"
  | "mars"
  | "deepSpace"
  | "laserwave"
  | "none"

/**
 * Configuration passed to the embedded Scalar API reference UI.
 *
 * **Details**
 *
 * This configuration follows Scalar's API reference configuration:
 * https://github.com/scalar/scalar/blob/main/documentation/configuration.md
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ScalarConfig = {
  /** A string to use one of the color presets */
  theme?: ScalarThemeId
  /** The layout to use for the references */
  layout?: "modern" | "classic"
  /** URL to a request proxy for the API client */
  proxyUrl?: string
  /** Browser JavaScript function expression used by Scalar for documents and test requests */
  customFetch?: string
  /** Whether to show the sidebar */
  showSidebar?: boolean
  /**
   * Whether to show models in the sidebar, search, and content.
   *
   * @default false
   */
  hideModels?: boolean
  /**
   * Whether to show the "Test Request" button.
   *
   * @default false
   */
  hideTestRequestButton?: boolean
  /**
   * Whether to show the sidebar search bar.
   *
   * @default false
   */
  hideSearch?: boolean
  /** Whether dark mode is on or off initially (light mode) */
  darkMode?: boolean
  /** forceDarkModeState makes it always this state no matter what */
  forceDarkModeState?: "dark" | "light"
  /** Whether to show the dark mode toggle */
  hideDarkModeToggle?: boolean
  /**
   * Path to a favicon image.
   *
   * @default undefined
   */
  favicon?: string
  /** Custom CSS to be added to the page */
  customCss?: string
  /**
   * Origin used when the OpenAPI document contains relative server URLs and is
   * rendered during SSR.
   *
   * **Details**
   *
   * Browsers can derive the origin from `window.location.origin`; server
   * rendering needs this value supplied explicitly.
   *
   * @default undefined
   */
  baseServerURL?: string
  /**
   * Whether Scalar loads its default Inter and JetBrains Mono fonts.
   *
   * **Details**
   *
   * Set this to `false` when supplying custom fonts.
   *
   * @default true
   */
  withDefaultFonts?: boolean
  /**
   * Whether all tags are open by default instead of only the tag matching the
   * current URL.
   *
   * @default false
   */
  defaultOpenAllTags?: boolean
  /**
   * Whether to display the operation ID in the operation reference.
   *
   * @default false
   */
  showOperationId?: boolean
}

type ScalarSource =
  | {
    readonly _tag: "Cdn"
    readonly version?: string | undefined
  }
  | {
    readonly _tag: "Inline"
    readonly source: string
  }

const makeHandler = <Id extends string, Groups extends HttpApiGroup.Constraint>(options: {
  readonly api: HttpApi.HttpApi<Id, Groups>
  readonly source: ScalarSource
  readonly scalar: ScalarConfig | undefined
}) => {
  const makeResponse = Function.memoize((api: HttpApi.HttpApi<Id, Groups>) => {
    const spec = OpenApi.fromApi(api)
    const { customFetch, ...scalar } = options.scalar ?? {}
    const scalarConfig = {
      _integration: "html",
      ...scalar
    }
    const scalarScript = options.source._tag === "Cdn"
      ? `<script src="${
        Html.escapeAttribute(
          `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${
            encodeURIComponent(options.source.version ?? "latest")
          }/dist/browser/standalone.min.js`
        )
      }" crossorigin></script>`
      : `<script>${options.source.source}</script>`
    return HttpServerResponse.html(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${Html.escape(spec.info.title)}</title>
    ${
      !spec.info.description
        ? ""
        : `<meta name="description" content="${Html.escapeAttribute(spec.info.description)}"/>`
    }
    ${
      !spec.info.description
        ? ""
        : `<meta name="og:description" content="${Html.escapeAttribute(spec.info.description)}"/>`
    }
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="api-reference-container"></div>
    ${scalarScript}
    <script>
      window.Scalar.createApiReference(document.getElementById('api-reference-container'), {
        ...${Html.escapeJson(scalarConfig)},
        content: ${Html.escapeJson(spec)}${
      customFetch === undefined ? "" : `,
        customFetch: ${customFetch}`
    }
      })
    </script>
  </body>
</html>`)
  })
  return Effect.sync(() => makeResponse(options.api))
}

/**
 * Mounts a Scalar API reference page for an `HttpApi` using the bundled Scalar script.
 *
 * **Details**
 *
 * The route serves the OpenAPI specification generated from the API at the
 * configured path, defaulting to `/docs`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly path?: `/${string}` | undefined
    readonly scalar?: ScalarConfig
  } | undefined
): Layer.Layer<never, never, HttpRouter.HttpRouter> =>
  HttpRouter.use(Effect.fnUntraced(function*(router) {
    const handler = makeHandler({
      api,
      source: {
        _tag: "Inline",
        source: internal.javascript
      },
      scalar: options?.scalar
    })
    yield* router.add("GET", options?.path ?? "/docs", handler)
  }))

/**
 * Mounts a Scalar API reference page for an `HttpApi` that loads Scalar from jsDelivr.
 *
 * **Details**
 *
 * The route serves the OpenAPI specification generated from the API at the
 * configured path, defaulting to `/docs`; `version` selects the Scalar package
 * version loaded from the CDN.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerCdn = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly path?: `/${string}` | undefined
    readonly scalar?: ScalarConfig
    readonly version?: string | undefined
  } | undefined
): Layer.Layer<never, never, HttpRouter.HttpRouter> =>
  HttpRouter.use(Effect.fnUntraced(function*(router) {
    const handler = makeHandler({
      api,
      source: {
        _tag: "Cdn",
        version: options?.version
      },
      scalar: options?.scalar
    })
    yield* router.add("GET", options?.path ?? "/docs", handler)
  }))
