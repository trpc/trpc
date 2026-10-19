import { Effect } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import { TrpcError, type CodeError } from '../../internal/error.ts';
import { isJsonContentType } from '../../internal/protocol.ts';

/**
 * The OpenAPI handler's `csrf` option.
 * @since 0.1.0
 * @stability experimental
 */
export interface CsrfOptions {
  /**
   * Origins whose non-JSON bodies pass, such as `https://www.example.com`
   * posting HTML forms to `https://api.example.com`.
   * @example
   * ```ts
   * csrf: { trustedOrigins: ['https://www.example.com'] },
   * ```
   */
  readonly trustedOrigins?: ReadonlyArray<string>;
}

/** Methods a navigation or form can use without changing anything. */
const safeMethods: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** `Sec-Fetch-Site` values of requests the user's own page or browser made. */
const ownSites: ReadonlySet<string> = new Set(['same-origin', 'none']);

const toTrustedOrigin = (value: string): string => {
  const url = URL.parse(value);
  if (
    url === null ||
    url.origin === 'null' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `experimental_createOpenApiHandler: csrf.trustedOrigins takes origins like "https://app.example.com", not "${value}"`,
    );
  }
  return url.origin;
};

/**
 * Refuses requests another origin could send without a CORS preflight: a
 * method other than `GET`, `HEAD` or `OPTIONS` whose body isn't JSON (an
 * HTML form, a `no-cors` fetch or `sendBeacon`), from another origin.
 * `Sec-Fetch-Site` decides; without it (browsers before 2023), `Origin` is
 * compared with the request's host; with neither, the request isn't from a
 * browser and passes. Sibling subdomains count as other origins.
 * @internal
 */
export const makeCsrfGuard = (
  option: boolean | CsrfOptions | undefined,
): ((
  request: HttpServerRequest.HttpServerRequest,
  url: URL,
) => Effect.Effect<void, CodeError<'FORBIDDEN'>>) => {
  if (option === false) return () => Effect.void;
  const trusted: ReadonlySet<string> = new Set(
    (typeof option === 'object' ? (option.trustedOrigins ?? []) : []).map(
      toTrustedOrigin,
    ),
  );
  const fromOwnOrigin = (
    headers: HttpServerRequest.HttpServerRequest['headers'],
    url: URL,
  ): boolean => {
    const origin = headers['origin'];
    if (origin !== undefined && trusted.has(origin)) return true;
    const site = headers['sec-fetch-site'];
    if (site !== undefined) return ownSites.has(site);
    return origin === undefined || URL.parse(origin)?.host === url.host;
  };
  return (request, url) =>
    safeMethods.has(request.method) ||
    isJsonContentType(request.headers['content-type'] ?? null) ||
    fromOwnOrigin(request.headers, url)
      ? Effect.void
      : Effect.fail(
          new TrpcError.Forbidden({
            message: `Cross-origin ${request.method} requests must send content-type: application/json`,
          }),
        );
};
