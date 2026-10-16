import type { ParseOptions, SetCookie, StringifyOptions } from 'cookie'
import { parseCookie, stringifySetCookie } from 'cookie'

export interface SetCookieOptions extends Omit<SetCookie, 'name' | 'value'>, StringifyOptions {
  /**
   * Specifies the value for the [`Path` `Set-Cookie` attribute](https://tools.ietf.org/html/rfc6265#section-5.2.4).
   *
   * @default '/'
   */
  path?: string
}

/**
 * Sets a cookie in the response headers.
 *
 * Does nothing if `headers` is `undefined`.
 *
 * @example
 * ```ts
 * const headers = new Headers()
 *
 * setCookie(headers, 'sessionId', 'abc123', { httpOnly: true, maxAge: 3600 })
 *
 * expect(headers.get('Set-Cookie')).toBe('sessionId=abc123; Max-Age=3600; Path=/; HttpOnly')
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/cookie | Cookie Helpers}
 */
export function setCookie(
  headers: Headers | undefined,
  name: string,
  value: string,
  options: SetCookieOptions = {},
): void {
  if (headers === undefined) {
    return
  }

  const cookieString = stringifySetCookie({
    // Force path to '/' by default so the cookie is available across the
    // entire app, not just under the directory of the request that set it
    // (which is what browsers do per RFC 6265 §5.1.4 when Path is omitted).
    path: '/',
    ...options,
    name, // prioritize
    value, // prioritize
  }, options)

  headers.append('Set-Cookie', cookieString)
}

export interface GetCookieOptions extends ParseOptions {}

/**
 * Gets a cookie value from request headers
 *
 * Returns `undefined` if the cookie is not found or headers are `undefined`.
 *
 * @example
 * ```ts
 * const headers = new Headers({ 'Cookie': 'sessionId=abc123; theme=dark' })
 *
 * const sessionId = getCookie(headers, 'sessionId')
 *
 * expect(sessionId).toEqual('abc123')
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/cookie | Cookie Helpers}
 */
export function getCookie(
  headers: Headers | undefined,
  name: string,
  options: GetCookieOptions = {},
): string | undefined {
  if (headers === undefined) {
    return undefined
  }

  const cookieHeader = headers.get('cookie')

  if (cookieHeader === null) {
    return undefined
  }

  return parseCookie(cookieHeader, options)[name]
}

/**
 * Deletes a cookie by marking it expired.
 *
 * @see {@link https://orpc.dev/docs/helpers/cookie | Cookie Helpers}
 */
export function deleteCookie(
  headers: Headers | undefined,
  name: string,
  options: Omit<SetCookieOptions, 'maxAge'> = {},
): void {
  return setCookie(headers, name, '', {
    ...options,
    maxAge: 0, // prioritize
  })
}
