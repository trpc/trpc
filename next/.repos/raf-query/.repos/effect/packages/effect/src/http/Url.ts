/**
 * Parses and edits platform `URL` values.
 *
 * The HTTP modules use the standard `URL` object as their URL representation.
 * This module adds safe parsing and helpers that return updated copies when
 * changing credentials, host, path, protocol, query, or hash parts. Query
 * strings can also be read or updated through `UrlParams`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Data from "../Data.ts"
import { dual } from "../Function.ts"
import * as Redacted from "../Redacted.ts"
import * as Result from "../Result.ts"
import * as UrlParams from "./UrlParams.ts"

/**
 * Error returned when constructing a `URL` fails.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class UrlError extends Data.TaggedError("UrlError")<{
  readonly cause: unknown
}> {}

/**
 * Creates a `URL` safely by appending `UrlParams` and an optional hash to a URL string.
 *
 * **Details**
 *
 * Returns a `Result` that fails with `UrlError` if the URL cannot be constructed.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  url: string,
  params: UrlParams.UrlParams,
  hash: string | undefined
): Result.Result<URL, UrlError> =>
  Result.try({
    try: () => {
      const urlInstance = new URL(url, baseUrl())
      for (let i = 0; i < params.params.length; i++) {
        const [key, value] = params.params[i]
        if (value !== undefined) {
          urlInstance.searchParams.append(key, value)
        }
      }
      if (hash !== undefined) {
        urlInstance.hash = hash
      }
      return urlInstance
    },
    catch: (cause) => new UrlError({ cause })
  })

const baseUrl = (): string | undefined => {
  if (
    "location" in globalThis &&
    globalThis.location !== undefined &&
    globalThis.location.origin !== undefined &&
    globalThis.location.pathname !== undefined
  ) {
    return location.origin + location.pathname
  }
  return undefined
}

/**
 * Parses a URL string safely into a `URL` object, returning a `Result` type for
 * error handling.
 *
 * **Details**
 *
 * This function converts a string into a `URL` object, enabling safe URL
 * parsing with built-in error handling. If the string is invalid or fails to
 * parse, this function does not throw an error; instead, it wraps the error in
 * a `IllegalArgumentError` and returns it as the `Failure` value of an
 * `Result`. The `Success` value contains the successfully parsed `URL`.
 *
 * An optional `base` parameter can be provided to resolve relative URLs. If
 * specified, the function interprets the input `url` as relative to this
 * `base`. This is especially useful when dealing with URLs that might not be
 * fully qualified.
 *
 * **Example** (Parsing absolute and relative URLs)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Url } from "effect/http"
 *
 * // Parse an absolute URL
 * //
 * //      ┌─── Result<URL, IllegalArgumentError>
 * //      ▼
 * const parsed = Url.fromString("https://example.com/path")
 *
 * Result.map(parsed, (url) => url.toString()) // => Result.succeed("https://example.com/path")
 *
 * // Parse a relative URL with a base
 * const relativeParsed = Url.fromString("/relative-path", "https://example.com")
 *
 * Result.map(relativeParsed, (url) => url.toString()) // => Result.succeed("https://example.com/relative-path")
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromString: {
  (url: string, base?: string | URL | undefined): Result.Result<URL, Cause.IllegalArgumentError>
} = (url, base) =>
  Result.try({
    try: () => new URL(url, base),
    catch: () =>
      new Cause.IllegalArgumentError(`Invalid URL: "${url}"${base !== undefined ? ` with base "${base}"` : ""}`)
  })

/**
 * Updates a cloned `URL` with a callback, allowing multiple changes at once.
 *
 * **Example** (Mutating URL credentials)
 *
 * ```ts import.meta.vitest
 * import { Url } from "effect/http"
 *
 * const myUrl = new URL("https://example.com")
 *
 * const mutatedUrl = Url.mutate(myUrl, (url) => {
 *   url.username = "user"
 *   url.password = "pass"
 * })
 *
 * mutatedUrl.toString() // => "https://user:pass@example.com/"
 * ```
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const mutate: {
  (f: (url: URL) => void): (self: URL) => URL
  (self: URL, f: (url: URL) => void): URL
} = dual(2, (self: URL, f: (url: URL) => void) => {
  const copy = new URL(self)
  f(copy)
  return copy
})

/**
 * @internal
 */
const immutableURLSetter = <P extends keyof URL, A = never>(property: P): {
  (value: URL[P] | A): (url: URL) => URL
  (url: URL, value: URL[P] | A): URL
} =>
  dual(2, (url: URL, value: URL[P]) =>
    mutate(url, (url) => {
      url[property] = value
    }))

/**
 * Updates the hash fragment of the URL.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setHash: {
  (hash: string): (url: URL) => URL
  (url: URL, hash: string): URL
} = immutableURLSetter("hash")

/**
 * Updates the host (domain and port) of the URL.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setHost: {
  (host: string): (url: URL) => URL
  (url: URL, host: string): URL
} = immutableURLSetter("host")

/**
 * Updates the domain of the URL without modifying the port.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setHostname: {
  (hostname: string): (url: URL) => URL
  (url: URL, hostname: string): URL
} = immutableURLSetter("hostname")

/**
 * Replaces the entire URL string.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setHref: {
  (href: string): (url: URL) => URL
  (url: URL, href: string): URL
} = immutableURLSetter("href")

/**
 * Updates the password used for authentication.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setPassword: {
  (password: string | Redacted.Redacted): (url: URL) => URL
  (url: URL, password: string | Redacted.Redacted): URL
} = dual(2, (url: URL, password: string | Redacted.Redacted) =>
  mutate(url, (url) => {
    url.password = typeof password === "string"
      ? password :
      Redacted.value(password)
  }))

/**
 * Updates the path of the URL.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setPathname: {
  (pathname: string): (url: URL) => URL
  (url: URL, pathname: string): URL
} = immutableURLSetter("pathname")

/**
 * Updates the port of the URL.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setPort: {
  (port: string | number): (url: URL) => URL
  (url: URL, port: string | number): URL
} = immutableURLSetter("port")

/**
 * Updates the protocol (e.g., `http`, `https`).
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setProtocol: {
  (protocol: string): (url: URL) => URL
  (url: URL, protocol: string): URL
} = immutableURLSetter("protocol")

/**
 * Updates the query string of the URL.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setSearch: {
  (search: string): (url: URL) => URL
  (url: URL, search: string): URL
} = immutableURLSetter("search")

/**
 * Updates the username used for authentication.
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setUsername: {
  (username: string): (url: URL) => URL
  (url: URL, username: string): URL
} = immutableURLSetter("username")

/**
 * Updates the query parameters of a URL.
 *
 * **Details**
 *
 * This function allows you to set or replace the query parameters of a `URL`
 * object using the provided `UrlParams`. It creates a new `URL` object with the
 * updated parameters, leaving the original object unchanged.
 *
 * **Example** (Replacing query parameters)
 *
 * ```ts import.meta.vitest
 * import { Url, UrlParams } from "effect/http"
 *
 * const myUrl = new URL("https://example.com?foo=bar")
 *
 * // Write parameters
 * const updatedUrl = Url.setUrlParams(
 *   myUrl,
 *   UrlParams.fromInput([["key", "value"]])
 * )
 *
 * updatedUrl.toString() // => "https://example.com/?key=value"
 * ```
 *
 * @stability unstable
 * @category setters
 * @since 4.0.0
 */
export const setUrlParams: {
  (urlParams: UrlParams.Input): (url: URL) => URL
  (url: URL, urlParams: UrlParams.Input): URL
} = dual(2, (url: URL, urlParams: UrlParams.Input) =>
  mutate(url, (url) => {
    url.search = UrlParams.toString(UrlParams.fromInput(urlParams))
  }))

/**
 * Retrieves the query parameters from a URL.
 *
 * **Details**
 *
 * This function extracts the query parameters from a `URL` object and returns
 * them as `UrlParams`. The resulting structure can be easily manipulated or
 * inspected.
 *
 * **Example** (Reading query parameters)
 *
 * ```ts import.meta.vitest
 * import { Url, UrlParams } from "effect/http"
 *
 * const myUrl = new URL("https://example.com?foo=bar")
 *
 * // Read parameters
 * const params = Url.urlParams(myUrl)
 *
 * UrlParams.toString(params) // => "foo=bar"
 * ```
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const urlParams = (url: URL): UrlParams.UrlParams => UrlParams.fromInput(url.searchParams)

/**
 * Reads the query parameters of a URL, modifies them, and updates the URL.
 *
 * **Details**
 *
 * This function provides a functional way to interact with query parameters by
 * reading the current parameters, applying a transformation function, and then
 * writing the updated parameters back to the URL. It returns a new `URL` object
 * with the modified parameters, ensuring immutability.
 *
 * **Example** (Modifying query parameters)
 *
 * ```ts import.meta.vitest
 * import { Url, UrlParams } from "effect/http"
 *
 * const myUrl = new URL("https://example.com?foo=bar")
 *
 * const changedUrl = Url.modifyUrlParams(myUrl, UrlParams.append("key", "value"))
 *
 * changedUrl.toString() // => "https://example.com/?foo=bar&key=value"
 * ```
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const modifyUrlParams: {
  (f: (urlParams: UrlParams.UrlParams) => UrlParams.Input): (url: URL) => URL
  (url: URL, f: (urlParams: UrlParams.UrlParams) => UrlParams.Input): URL
} = dual(2, (url: URL, f: (urlParams: UrlParams.UrlParams) => UrlParams.Input) =>
  mutate(url, (url) => {
    const params = f(UrlParams.fromInput(url.searchParams))
    url.search = UrlParams.toString(params)
  }))
