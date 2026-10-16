import type { StandardHandlerInterceptor, StandardHandlerInterceptorOptions, StandardHandlerOptions, StandardHandlerPlugin } from '../adapters/standard'
import type { Context } from '../context'
import { ORPCError } from '@orpc/client'
import { toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'

/**
 * Adds Cross-Site Request Forgery (CSRF) protection that makes the safe `GET` method as
 * secure as unsafe ones such as `POST`. It rejects `GET` requests arriving as top-level
 * navigations initiated cross-site or from outside the browser, the only context where
 * another site can make a browser attach `SameSite=Lax` cookies to a safe-method request.
 * Requests matching no procedure stay unmatched, so they can fall through to whatever
 * serves the rest of the site.
 *
 * @remarks
 * **Note**: Requests browsers send without `SameSite=Lax` cookies, such as cross-site `fetch`
 * and `<img>`, pass through, so procedures stay reachable from other sites. This safeguard
 * requires authentication cookies explicitly marked `SameSite=Lax` or `SameSite=Strict`,
 * since browsers may attach other cookies to the requests that pass.
 *
 * @see {@link https://orpc.dev/docs/plugins/get-method-csrf-protection | GET Method CSRF Protection Plugin}
 */
export class GetMethodCsrfProtectionHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~get-method-csrf-protection'

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    /**
     * Batch sub-requests are judged individually here, which is safe: navigations cannot
     * carry the custom `orpc-batch` header, and the batch plugin's default `mapSubrequest`
     * keeps the transport headers authoritative over client-authored sub-request headers.
     */
    const interceptor: StandardHandlerInterceptor<T> = (interceptorOptions) => {
      if (this.isAllowed(interceptorOptions)) {
        return interceptorOptions.next()
      }

      throw new ORPCError('FORBIDDEN', { message: 'Request blocked by CSRF protection.' })
    }

    return {
      ...options,
      interceptors: [interceptor, ...toArray(options.interceptors)],
    }
  }

  private isAllowed({ request }: StandardHandlerInterceptorOptions<T>): boolean {
    // Navigations can only use `GET` or `POST` per the HTML spec, and `POST` is unsafe, so
    // `GET` is the only method `SameSite=Lax` cookies ride cross-site.
    if (request.method !== 'GET') {
      return true
    }

    const site = flattenStandardHeader(request.headers['sec-fetch-site'])?.toLowerCase()

    // Absent for non-browser clients, browsers too old to send Fetch Metadata, and any browser
    // over plain HTTP, where the headers are never appended. Nothing to judge in those cases.
    // Same-site origins are trusted, matching the `SameSite` cookie model where the site is
    // the trust boundary.
    if (site === undefined || site === 'same-origin' || site === 'same-site') {
      return true
    }

    // Cross-site, and on browser-initiated requests such as email links, `Lax` cookies ride
    // only top-level navigations: mode `navigate` targeting dest `document`. Embedded
    // navigations such as `<iframe>` pass, since they are not top-level. Browsers send both
    // headers together, so a stripped one blocks the request rather than bypassing the check.
    const mode = flattenStandardHeader(request.headers['sec-fetch-mode'])?.toLowerCase()
    const dest = flattenStandardHeader(request.headers['sec-fetch-dest'])?.toLowerCase()

    if (mode === undefined || dest === undefined) {
      return false
    }

    return mode !== 'navigate' || dest !== 'document'
  }
}
