import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import type * as Redacted from "effect/Redacted"

export interface GitHubRepository {
  readonly repository: string
  readonly token: Redacted.Redacted<string>
}

/**
 * A GitHub REST client for `repository`. Paths are relative to
 * `/repos/<owner>/<name>` and non-2xx responses are errors.
 */
export const makeClient = (
  repository: string,
  token: Redacted.Redacted<string>
): Effect.Effect<HttpClient.HttpClient, never, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    return client.pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.prependUrl(`https://api.github.com/repos/${repository}`),
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.accept("application/vnd.github+json"),
          HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
          HttpClientRequest.setHeader("user-agent", "effect-npm-promote")
        )
      ),
      HttpClient.filterStatusOk
    )
  })
