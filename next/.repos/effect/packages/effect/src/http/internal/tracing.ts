import type * as Tracer from "../../Tracer.ts"
import * as Headers from "../Headers.ts"
import * as UrlParams from "../UrlParams.ts"

const defaultPorts: Record<string, number> = {
  "http:": 80,
  "https:": 443,
  "ws:": 80,
  "wss:": 443
}

/**
 * Records `url.*` and `server.*` attributes with URL redaction.
 *
 * @internal
 */
export const addUrlAttributes = (
  span: Tracer.Span,
  url: URL,
  redactedNames: ReadonlyArray<string | RegExp>
): void => {
  const query = UrlParams.redactUrl(url.search, redactedNames).slice(1)
  span.attribute("url.full", UrlParams.redactUrl(url.href, redactedNames))
  span.attribute("url.path", url.pathname)
  if (query !== "") {
    span.attribute("url.query", query)
  }
  span.attribute("url.scheme", url.protocol.slice(0, -1))
  if (url.hostname !== "") {
    // URL keeps IPv6 brackets in the hostname, but the semantic conventions do not.
    span.attribute("server.address", url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname)
    const port = url.port === "" ? defaultPorts[url.protocol] : Number(url.port)
    if (port !== undefined) {
      span.attribute("server.port", port)
    }
  }
}

/**
 * Adds the names of `Redacted` parameters to the redacted names.
 *
 * @internal
 */
export const redactedNames = (
  urlParams: UrlParams.UrlParams,
  redactedNames: ReadonlyArray<string | RegExp>
): ReadonlyArray<string | RegExp> => {
  const keys = urlParams.params.filter(([, value]) => typeof value !== "string").map(([key]) => key)
  return keys.length === 0
    ? redactedNames
    : [...redactedNames, ...new URLSearchParams(keys.map((key) => [key, ""])).keys()]
}

/** @internal */
export const addHeaderAttributes = (
  span: Tracer.Span,
  phase: "request" | "response",
  headers: Headers.Headers,
  filter: (headerName: string, phase: "request" | "response") => boolean,
  redactedNames: ReadonlyArray<string | RegExp>
): void => {
  for (const name in headers) {
    if (!filter(name, phase)) continue
    span.attribute(
      `http.${phase}.header.${name}`,
      Headers.isRedactedName(name, redactedNames) ? "<redacted>" : headers[name]
    )
  }
}
