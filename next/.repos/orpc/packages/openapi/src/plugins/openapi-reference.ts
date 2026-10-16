import type { Context } from '@orpc/server'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptorOptions } from '@orpc/server/standard'
import type { Promisable, Value } from '@orpc/shared'
import type { ApiReferenceConfiguration as ScalarProviderConfig } from '@scalar/api-reference'
import type { StandardUrl } from '@standard-server/core'
import type { SwaggerUIOptions } from 'swagger-ui'
import type { OpenAPIDocument, OpenAPIVersion } from '../types'
import { getTracer, matchesHttpPath, mergeHttpPath, stringifyJSON, toArray, value } from '@orpc/shared'

export type OpenAPIReferenceHandlerPluginProvider = 'scalar' | 'swagger'

export interface OpenAPIReferenceHandlerPluginScalarConfig extends Partial<ScalarProviderConfig> {
}

export interface OpenAPIReferenceHandlerPluginSwaggerConfig extends Partial<Omit<SwaggerUIOptions, 'dom_id' | 'presets' | 'plugins'>> {
  dom_id?: undefined | never

  /**
   * Paths to global variables holding the presets, resolved in the browser,
   * e.g. `'SwaggerUIBundle.presets.apis'`. Load custom presets through `docsHead`.
   *
   * @default ['SwaggerUIBundle.presets.apis']
   */
  presets?: undefined | string[]

  /**
   * Paths to global variables holding the plugins, resolved in the browser,
   * e.g. `'SwaggerUIBundle.plugins.DownloadUrl'`. Load custom plugins through `docsHead`.
   *
   * @default ['SwaggerUIBundle.plugins.DownloadUrl']
   */
  plugins?: undefined | string[]
}

export interface OpenAPIReferenceHandlerPluginOptions<T extends Context, TProvider extends OpenAPIReferenceHandlerPluginProvider> {
  /**
   * A static or dynamic OpenAPI document to serve.
   * Receives routing interceptor options when provided as a function.
   */
  spec: Value<Promisable<OpenAPIDocument<OpenAPIVersion>>, [StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Determines whether the docs UI and OpenAPI JSON are allowed to be served for a request.
   * When it resolves to `false`, the request falls through as unmatched,
   * as if the plugin were not installed. Useful for restricting access
   * to authenticated users.
   */
  allow?: Value<Promisable<boolean>, [StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * The URL path at which to serve the OpenAPI JSON.
   *
   * @default '/spec.json'
   */
  specPath?: StandardUrl

  /**
   * The UI provider to use for rendering the API reference.
   *
   * @default 'scalar'
   */
  provider?: TProvider

  /**
   * Provider-specific configuration passed directly to the chosen UI library.
   * Options differ depending on `provider`.
   */
  providerConfig?: undefined | (
    TProvider extends 'swagger'
      ? OpenAPIReferenceHandlerPluginSwaggerConfig
      : OpenAPIReferenceHandlerPluginScalarConfig
  )

  /**
   * URL for the provider's main script bundle.
   *
   * @default 'https://cdn.jsdelivr.net/npm/@scalar/api-reference' | 'https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js'
   */
  providerScriptUrl?: undefined | string

  /**
   * URL for the provider's stylesheet.
   *
   * @default undefined | 'https://unpkg.com/swagger-ui-dist/swagger-ui.css'
   */
  providerCssUrl?: undefined | string

  /**
   * The URL path at which to serve the API reference UI.
   *
   * @default '/'
   */
  docsPath?: StandardUrl

  /**
   * The document title for the API reference UI.
   *
   * @default spec.info.title
   */
  docsTitle?: Value<Promisable<string>, [StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Raw HTML to inject into the `<head>` of the API reference page.
   * Useful for custom stylesheets, meta tags, or scripts.
   *
   * @default ''
   */
  docsHead?: Value<Promisable<string>, [StandardHandlerRoutingInterceptorOptions<T>]>
}

/**
 * Serves API reference documentation powered by Scalar or Swagger UI,
 * and exposes the OpenAPI specification as JSON.
 *
 * @remarks
 * **Note**: By default, the API reference UI is served from `/` and the OpenAPI specification from `/spec.json`.
 *
 * @see {@link https://orpc.dev/docs/plugins/openapi-reference | OpenAPI Reference Plugin (Swagger/Scalar)}
 */
export class OpenAPIReferenceHandlerPlugin<
  T extends Context,
  TProvider extends OpenAPIReferenceHandlerPluginProvider,
> implements StandardHandlerPlugin<T> {
  name = '~openapi-reference'

  private readonly spec: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['spec']
  private readonly allow: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['allow']
  private readonly specPath: Exclude<OpenAPIReferenceHandlerPluginOptions<T, TProvider>['specPath'], undefined>
  private readonly provider: Exclude<OpenAPIReferenceHandlerPluginOptions<T, TProvider>['provider'], undefined>
  private readonly providerConfig: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['providerConfig']
  private readonly providerScriptUrl: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['providerScriptUrl']
  private readonly providerCssUrl: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['providerCssUrl']
  private readonly docsPath: Exclude<OpenAPIReferenceHandlerPluginOptions<T, TProvider>['docsPath'], undefined>
  private readonly docsTitle: OpenAPIReferenceHandlerPluginOptions<T, TProvider>['docsTitle']
  private readonly docsHead: Exclude<OpenAPIReferenceHandlerPluginOptions<T, TProvider>['docsHead'], undefined>

  constructor(options: OpenAPIReferenceHandlerPluginOptions<T, TProvider>) {
    this.spec = options.spec
    this.allow = options.allow
    this.specPath = options.specPath ?? '/spec.json'
    this.provider = options.provider ?? 'scalar' as TProvider
    this.providerConfig = options.providerConfig
    this.providerScriptUrl = options.providerScriptUrl
    this.providerCssUrl = options.providerCssUrl
    this.docsTitle = options.docsTitle
    this.docsPath = options.docsPath ?? '/'
    this.docsHead = options.docsHead ?? ''
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    return {
      ...options,
      routingInterceptors: [
        // Run after user-provided routing interceptors so they can capture the ui/spec responses
        ...toArray(options.routingInterceptors),
        async ({ next, ...routingInterceptorOptions }) => {
          const result = await next()

          if (result.matched || routingInterceptorOptions.request.method !== 'GET') {
            return result
          }

          const isSpecPath = matchesHttpPath(
            routingInterceptorOptions.request.url,
            routingInterceptorOptions.prefix ? mergeHttpPath(routingInterceptorOptions.prefix, this.specPath) : this.specPath,
          )

          const isDocsPath = matchesHttpPath(
            routingInterceptorOptions.request.url,
            routingInterceptorOptions.prefix ? mergeHttpPath(routingInterceptorOptions.prefix, this.docsPath) : this.docsPath,
          )

          if (!isSpecPath && !isDocsPath) {
            return result
          }

          if (await value(this.allow, routingInterceptorOptions) === false) {
            return result
          }

          const span = getTracer()?.getActiveSpan()
          const spec = await value(this.spec, routingInterceptorOptions)

          if (isSpecPath) {
            span?.updateName(`${routingInterceptorOptions.request.method} ${routingInterceptorOptions.request.url} (openapi spec)`)

            const specFile = new File([stringifyJSON(spec)], `${spec.info.title}.json`, {
              type: 'application/json',
            })
            return { matched: true, response: { status: 200, headers: {}, body: specFile } }
          }

          span?.updateName(`${routingInterceptorOptions.request.method} ${routingInterceptorOptions.request.url} (${this.provider} ui)`)

          const docsTitle = (await value(this.docsTitle, routingInterceptorOptions)) ?? spec.info.title
          const docsHead = await value(this.docsHead, routingInterceptorOptions)
          let html: string | undefined

          if (this.provider === 'swagger') {
            const scriptUrl = this.providerScriptUrl ?? 'https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js'
            const cssUrl = this.providerCssUrl ?? 'https://unpkg.com/swagger-ui-dist/swagger-ui.css'
            const config = {
              dom_id: '#app',
              spec,
              deepLinking: true,
              presets: ['SwaggerUIBundle.presets.apis'],
              plugins: ['SwaggerUIBundle.plugins.DownloadUrl'],
              ...this.providerConfig,
            }

            html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>${escapeHtmlEntities(docsTitle)}</title>
                <link rel="stylesheet" type="text/css" href="${escapeHtmlEntities(cssUrl)}" />
                ${docsHead}
            </head>
            <body>
                <div id="app"></div>

                <script src="${escapeHtmlEntities(scriptUrl)}"></script>

                <!-- IMPORTANT: assign to a variable first to prevent ), ( in values breaking the call expression. -->
                <!-- IMPORTANT: escapeJsonForHtml ensures <, > cannot terminate the </script> tag prematurely. -->
                <!-- IMPORTANT: resolve presets/plugins global paths at runtime, never unquote them in the JSON, which also holds the spec. -->
                <script>
                    const swaggerConfig = ${escapeJsonForHtml(config)}

                    window.onload = () => {
                        for (const key of ['presets', 'plugins']) {
                            swaggerConfig[key] &&= swaggerConfig[key].map(path => path.split('.').reduce((value, name) => value?.[name], window))
                        }

                        window.ui = SwaggerUIBundle(swaggerConfig)
                    }
                </script>
            </body>
            </html>
            `
          }

          else {
            const scriptUrl = this.providerScriptUrl ?? 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
            const cssUrl = this.providerCssUrl
            const config: ScalarProviderConfig = {
              content: stringifyJSON(spec),
              ...this.providerConfig as any,
            }

            html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>${escapeHtmlEntities(docsTitle)}</title>
                ${cssUrl ? `<link rel="stylesheet" type="text/css" href="${escapeHtmlEntities(cssUrl)}" />` : ''}
                ${docsHead}
            </head>
            <body>
                <div id="app"></div>
        
                <script src="${escapeHtmlEntities(scriptUrl)}"></script>
        
                <!-- IMPORTANT: assign to a variable first to prevent ), ( in values breaking the call expression. -->
                <!-- IMPORTANT: escapeJsonForHtml ensures <, > cannot terminate the </script> tag prematurely. -->
                <script>
                    const scalarConfig = ${escapeJsonForHtml(config)}

                    Scalar.createApiReference('#app', scalarConfig)
                </script>
            </body>
            </html>
            `
          }

          const htmlBlob = new Blob([html], {
            type: 'text/html',
          })

          return {
            matched: true,
            response: {
              status: 200,
              headers: {
                'content-disposition': [], // disable auto-gen header
              },
              body: htmlBlob,
            },
          }
        },
      ],
    }
  }
}

/** Escapes a string for safe embedding in an HTML attribute value. */
function escapeHtmlEntities(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Serialises a value to JSON safe for HTML embedding (attribute or <script>).
 * Uses Unicode escapes instead of HTML entities so JSON.parse reconstructs
 * the original values without corruption. Cannot be merged with `esc` —
 * HTML entities inside <script> are not decoded by the JS engine.
 */
function escapeJsonForHtml(obj: object) {
  return stringifyJSON(obj)
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F')
}
