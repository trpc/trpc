import * as Headers from "../Headers.ts"
import type * as HttpBody from "../HttpBody.ts"

/**
 * @internal
 */
export const updateHeaders = (headers: Headers.Headers, body: HttpBody.HttpBody): Headers.Headers => {
  if (body._tag === "Empty" || body._tag === "FormData") {
    return Headers.remove(Headers.remove(headers, "content-type"), "content-length")
  }
  headers = body.contentType === undefined
    ? Headers.remove(headers, "content-type")
    : Headers.set(headers, "content-type", body.contentType)
  return body.contentLength === undefined
    ? Headers.remove(headers, "content-length")
    : Headers.set(headers, "content-length", body.contentLength.toString())
}

/**
 * @internal
 */
export const parseContentLength = (contentLength: string | null | undefined): number | undefined => {
  if (contentLength === null || contentLength === undefined || !/^\d+$/.test(contentLength)) {
    return undefined
  }
  const parsed = Number(contentLength)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
