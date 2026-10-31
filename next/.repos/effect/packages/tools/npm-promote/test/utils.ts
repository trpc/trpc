import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"

export interface Published {
  readonly latest: string
  readonly versions: ReadonlyArray<string>
  /** The `latest` a stale CDN copy of the abbreviated metadata still shows. */
  readonly cachedLatest?: string
  /** A status the live dist-tags endpoint fails with instead of answering. */
  readonly liveTagsStatus?: number
  /** A status the abbreviated metadata endpoint fails with instead of answering. */
  readonly metadataStatus?: number
}

/**
 * Serves abbreviated metadata documents and the live dist-tags endpoint for
 * the given packages. Unknown packages return 404.
 */
export const registryClient = (registry: Record<string, Published>): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url)
      const distTags = /^\/-\/package\/(.+)\/dist-tags$/.exec(url.pathname)
      const name = decodeURIComponent(distTags === null ? url.pathname.slice(1) : distTags[1])
      const published = registry[name]
      if (distTags === null && request.headers.accept !== "application/vnd.npm.install-v1+json") {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: 406 }))
      }
      if (published === undefined) {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: 404 }))
      }
      if (distTags !== null) {
        if (published.liveTagsStatus !== undefined) {
          return HttpClientResponse.fromWeb(request, new Response(null, { status: published.liveTagsStatus }))
        }
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ latest: published.latest, staging: published.versions.at(-1) })
        )
      }
      if (published.metadataStatus !== undefined) {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: published.metadataStatus }))
      }
      return HttpClientResponse.fromWeb(
        request,
        Response.json({
          name,
          "dist-tags": { latest: published.cachedLatest ?? published.latest, staging: published.versions.at(-1) },
          versions: Object.fromEntries(published.versions.map((version) => [version, { name, version }]))
        })
      )
    })
  )
