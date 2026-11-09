import * as Effect from "effect/Effect"
import type * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import type * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { type GitHubRepository, makeClient } from "./GitHub.ts"
import { NpmPromoteError } from "./NpmPromoteError.ts"

/**
 * The GitHub deployment environment that records website deploys requested
 * for a revision of this repository.
 */
const environment = "website-v4"

const Deployment = Schema.Struct({ id: Schema.Number })
const DeploymentStatus = Schema.Struct({ state: Schema.String })

/**
 * Whether a website deploy for `revision` was recorded. A recorded deployment
 * whose latest status is `success`, or `inactive` after a newer deploy
 * superseded it, counts.
 */
export const isDeployed = (
  github: GitHubRepository,
  revision: string
): Effect.Effect<boolean, NpmPromoteError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = yield* makeClient(github.repository, github.token)
    const deployments = yield* client.get("/deployments", {
      urlParams: { sha: revision, environment, per_page: "100" }
    }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Deployment))))
    for (const deployment of deployments) {
      const statuses = yield* client.get(`/deployments/${deployment.id}/statuses`, {
        urlParams: { per_page: "1" }
      }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(DeploymentStatus))))
      if (statuses[0]?.state === "success" || statuses[0]?.state === "inactive") {
        return true
      }
    }
    return false
  }).pipe(
    Effect.mapError((cause) =>
      new NpmPromoteError({ message: `Could not read the website deployments of ${revision}`, cause })
    )
  )

/**
 * Asks Effect-TS/website to publish the API reference for `revision`, the same
 * dispatch the release workflow used to send.
 */
const dispatch = (dispatchToken: Redacted.Redacted<string>, revision: string) =>
  Effect.flatMap(makeClient("Effect-TS/website", dispatchToken), (client) =>
    client.execute(
      HttpClientRequest.post("/dispatches").pipe(
        HttpClientRequest.bodyJsonUnsafe({
          event_type: "publish-api-reference",
          client_payload: { repository: "Effect-TS/effect", channel: "v4", revision }
        })
      )
    ))

/**
 * Records a deployment for `revision`, sends the website dispatch and marks the
 * deployment `success`, or `failure` when the dispatch failed.
 *
 * Delivery is at least once: if the run stops between the dispatch and the
 * status update, the next run dispatches again. The website reuses the
 * published API reference snapshot for a revision it already has, so a repeat
 * only redeploys the site.
 */
export const deploy = (
  github: GitHubRepository,
  dispatchToken: Redacted.Redacted<string>,
  revision: string
): Effect.Effect<void, NpmPromoteError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    if (!/^[a-f0-9]{40}$/.test(revision)) {
      return yield* new NpmPromoteError({ message: `Website deploys need a full commit SHA, got ${revision}` })
    }
    const client = yield* makeClient(github.repository, github.token)
    const deployment = yield* client.execute(
      HttpClientRequest.post("/deployments").pipe(HttpClientRequest.bodyJsonUnsafe({
        ref: revision,
        environment,
        auto_merge: false,
        required_contexts: [],
        description: "API reference publication requested from Effect-TS/website"
      }))
    ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Deployment)))
    const setStatus = (state: "success" | "failure") =>
      client.execute(
        HttpClientRequest.post(`/deployments/${deployment.id}/statuses`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ state })
        )
      )
    yield* dispatch(dispatchToken, revision).pipe(
      Effect.tapError(() => Effect.ignore(setStatus("failure")))
    )
    yield* setStatus("success")
  }).pipe(
    Effect.mapError((cause) =>
      Schema.is(NpmPromoteError)(cause)
        ? cause
        : new NpmPromoteError({ message: `Could not deploy the website for ${revision}`, cause })
    )
  )
