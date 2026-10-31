/**
 * Returns the original Web `Response` of a fetch-backed client response.
 * Wrappers forward it to the response they wrap.
 *
 * @internal
 */
export const WebSourceSymbol = "~effect/http/HttpClientResponse/WebSource"

/**
 * @internal
 */
export interface WebSource {
  readonly [WebSourceSymbol]: () => globalThis.Response | undefined
}

/**
 * @internal
 */
export const getWebSource = (self: object): globalThis.Response | undefined =>
  (self as Partial<WebSource>)[WebSourceSymbol]?.()
