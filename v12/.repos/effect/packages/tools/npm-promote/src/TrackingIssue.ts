import * as Effect from "effect/Effect"
import type * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Schema from "effect/Schema"
import { type GitHubRepository, makeClient } from "./GitHub.ts"
import type { Diagnosis } from "./NpmPromote.ts"
import { NpmPromoteError } from "./NpmPromoteError.ts"
import type { VersionBump } from "./Workspace.ts"

/**
 * Identifies the tracking issue among open issues opened by the workflow.
 */
const marker = "<!-- npm-promote:tracking-issue -->"

/**
 * The login of the identity behind the workflow's `GITHUB_TOKEN`.
 */
const creator = "github-actions[bot]"

const Issue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  body: Schema.optional(Schema.NullOr(Schema.String)),
  pull_request: Schema.optional(Schema.Unknown)
})

/**
 * Lists the open tracking issues, oldest first. The listing can miss an open
 * issue while GitHub is degraded, so a run may open a duplicate; the oldest
 * issue is the tracking issue and later ones are duplicates.
 */
const findOpen = (client: HttpClient.HttpClient) =>
  client.get("/issues", { urlParams: { state: "open", creator, per_page: "100" } }).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Issue))),
    Effect.map((issues) =>
      issues
        .filter((issue) => issue.pull_request === undefined && issue.body?.includes(marker) === true)
        .sort((a, b) => a.number - b.number)
    )
  )

const closeIssue = (
  client: HttpClient.HttpClient,
  number: number,
  options: { readonly comment: string; readonly reason: "completed" | "duplicate" }
) =>
  client.execute(
    HttpClientRequest.post(`/issues/${number}/comments`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ body: options.comment })
    )
  ).pipe(
    Effect.andThen(client.execute(
      HttpClientRequest.patch(`/issues/${number}`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ state: "closed", state_reason: options.reason })
      )
    ))
  )

const githubError = (message: string) => (cause: unknown) => new NpmPromoteError({ message, cause })

export interface OverdueRelease {
  readonly version: string
  readonly bump: VersionBump
  readonly overdueAfterHours: number
  readonly diagnoses: ReadonlyArray<Diagnosis>
}

export const render = (overdue: OverdueRelease): { readonly title: string; readonly body: string } => {
  const list = (tag: Diagnosis["_tag"]) =>
    overdue.diagnoses.filter((diagnosis) => diagnosis._tag === tag).map((diagnosis) =>
      diagnosis._tag === "Unknown" || diagnosis._tag === "PromotionFailed"
        ? `- \`${diagnosis.pkg.name}@${diagnosis.pkg.version}\`: ${diagnosis.reason}`
        : `- \`${diagnosis.pkg.name}@${diagnosis.pkg.version}\``
    )
  const sections = [
    {
      heading: "Promotion failed",
      note:
        "The version is visible, but `npm dist-tag add` failed. Check each package's trusted publisher configuration for `npm-promote.yml`, the workflow and environment match, expiry, and the \"Allow npm dist-tag\" permission.",
      items: list("PromotionFailed")
    },
    {
      heading: "Missing from npm",
      note: "The version document returns 404. `changeset publish` most likely failed for these packages.",
      items: list("Missing")
    },
    {
      heading: "Published but not visible yet",
      note: "The version document exists, but the abbreviated metadata used for promotion does not list it yet.",
      items: list("Published")
    },
    {
      heading: "Could not check",
      note: "The registry check failed, so these may be missing or only delayed.",
      items: list("Unknown")
    }
  ].filter((section) => section.items.length > 0)

  return {
    title: `npm promotion of ${overdue.version} is overdue`,
    body: [
      marker,
      `Version \`${overdue.version}\` landed on \`main\` in ${overdue.bump.sha} at ${overdue.bump.committedAt.toISOString()}, but \`latest\` has not moved to it after ${overdue.overdueAfterHours} hours.`,
      ...sections.map((section) => `### ${section.heading}\n\n${section.note}\n\n${section.items.join("\n")}`),
      "The promote workflow keeps retrying and closes this issue once promotion succeeds. Set the `NPM_PROMOTE_PAUSED` repository variable to `true` to stop promotion."
    ].join("\n\n")
  }
}

/**
 * Opens the tracking issue, or updates the open one when its content changed.
 * Any other open tracking issues are closed as duplicates of it.
 */
export const upsert = (
  github: GitHubRepository,
  content: { readonly title: string; readonly body: string }
): Effect.Effect<
  { readonly action: "created" | "updated" | "unchanged"; readonly number: number },
  NpmPromoteError,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const client = yield* makeClient(github.repository, github.token)
    const [issue, ...duplicates] = yield* findOpen(client)
    if (issue === undefined) {
      const created = yield* client.execute(
        HttpClientRequest.post("/issues").pipe(HttpClientRequest.bodyJsonUnsafe(content))
      ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Issue)))
      return { action: "created", number: created.number } as const
    }
    for (const duplicate of duplicates) {
      yield* closeIssue(client, duplicate.number, { comment: `Duplicate of #${issue.number}.`, reason: "duplicate" })
    }
    if (issue.title === content.title && issue.body === content.body) {
      return { action: "unchanged", number: issue.number } as const
    }
    yield* client.execute(
      HttpClientRequest.patch(`/issues/${issue.number}`).pipe(HttpClientRequest.bodyJsonUnsafe(content))
    )
    return { action: "updated", number: issue.number } as const
  }).pipe(Effect.mapError(githubError("Could not open or update the tracking issue")))

/**
 * Comments on and closes every open tracking issue. Returns the closed issue
 * numbers, oldest first.
 */
export const close = (
  github: GitHubRepository,
  comment: string
): Effect.Effect<ReadonlyArray<number>, NpmPromoteError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const client = yield* makeClient(github.repository, github.token)
    const issues = yield* findOpen(client)
    for (const issue of issues) {
      yield* closeIssue(client, issue.number, { comment, reason: "completed" })
    }
    return issues.map((issue) => issue.number)
  }).pipe(Effect.mapError(githubError("Could not close the tracking issue")))
