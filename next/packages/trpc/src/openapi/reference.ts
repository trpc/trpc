import { Effect, Option } from 'effect';
import {
  HttpServerRequest,
  HttpServerResponse,
  type HttpMiddleware,
} from 'effect/http';
import type { MaybePromise } from '../internal/types.ts';
import { loadRouter } from '../server/router.ts';
import {
  generateOpenApi,
  type GenerateOpenApiOptions,
  type OpenApiDocument,
} from './generate.ts';

/**
 * The options of {@link openApiReference}: the document comes from a router
 * (generated on the first request) or is given, e.g. from
 * `experimental_generateOpenApiFromTypes()` at build time.
 * @since 0.1.0
 * @stability stable
 */
export type OpenApiReferenceOptions = {
  /**
   * Where the docs UI is served.
   * @default '/api/docs'
   */
  path?: `/${string}`;
  /**
   * Where the document is served.
   * @default '/api/openapi.json'
   */
  specPath?: `/${string}`;
  /** @default 'scalar' */
  docsProvider?: 'scalar' | 'swagger';
  /**
   * The page title.
   * @default the document's `info.title`
   */
  title?: string;
} & (
  | {
      router: object;
      /** `servers` defaults to the request's origin. */
      specGenerateOptions: GenerateOpenApiOptions;
      document?: never;
    }
  | {
      /** Without `servers`, the request's origin is used. */
      document: OpenApiDocument | (() => MaybePromise<OpenApiDocument>);
      router?: never;
      specGenerateOptions?: never;
    }
);

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

function page(
  provider: 'scalar' | 'swagger',
  title: string,
  specUrl: string,
): string {
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>`;
  if (provider === 'swagger') {
    return `${head}<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({ url: ${JSON.stringify(specUrl).replace(/</g, '\\u003c')}, dom_id: '#swagger-ui' });</script></body></html>`;
  }
  return `${head}</head><body><script id="api-reference" data-url="${escapeHtml(specUrl)}"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
}

const urlOf = (request: HttpServerRequest.HttpServerRequest) =>
  request.source instanceof Request
    ? new URL(request.source.url)
    : Option.getOrUndefined(HttpServerRequest.toURL(request));

/**
 * Serves an API reference UI (Scalar by default, or Swagger UI, from a CDN)
 * and the OpenAPI document, as Effect HTTP middleware for
 * `createOpenApiHandler`, `createFetchHandler` or any `effect/http` app.
 * Other requests pass through.
 *
 * @example
 * ```ts
 * createOpenApiHandler({
 *   router: appRouter,
 *   middleware: [
 *     openApiReference({
 *       router: appRouter,
 *       specGenerateOptions: { info: { title: 'API', version: '1.0.0' } },
 *     }),
 *   ],
 * });
 * // GET /api/docs (UI), GET /api/openapi.json (document)
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function openApiReference(
  opts: OpenApiReferenceOptions,
): HttpMiddleware.HttpMiddleware {
  const docsPath = opts.path ?? '/api/docs';
  const specPath = opts.specPath ?? '/api/openapi.json';
  let cached: Promise<OpenApiDocument> | undefined;
  const load = (): Promise<OpenApiDocument> => {
    cached ??= (async () => {
      if (opts.document) {
        return typeof opts.document === 'function'
          ? opts.document()
          : opts.document;
      }
      return generateOpenApi(
        await loadRouter(opts.router as never),
        opts.specGenerateOptions!,
      );
    })();
    cached.catch(() => (cached = undefined));
    return cached;
  };
  const title = (): Effect.Effect<string> => {
    const known = opts.title ?? opts.specGenerateOptions?.info.title;
    return known === undefined
      ? Effect.map(Effect.promise(load), (doc) => doc.info.title)
      : Effect.succeed(known);
  };

  return ((
    app: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, unknown>,
  ) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      if (request.method !== 'GET') return app;
      const url = urlOf(request);
      if (url?.pathname === specPath) {
        return Effect.map(Effect.promise(load), (doc) =>
          HttpServerResponse.jsonUnsafe({
            ...doc,
            servers: doc.servers ?? [{ url: url.origin }],
          }),
        );
      }
      if (url?.pathname === docsPath) {
        return Effect.map(title(), (resolved) =>
          HttpServerResponse.text(
            page(opts.docsProvider ?? 'scalar', resolved, specPath),
            { contentType: 'text/html; charset=utf-8' },
          ),
        );
      }
      return app;
    })) as HttpMiddleware.HttpMiddleware;
}
