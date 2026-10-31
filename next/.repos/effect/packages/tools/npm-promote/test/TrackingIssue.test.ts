import { render, upsert } from "@effect/npm-promote/TrackingIssue"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Redacted from "effect/Redacted"

interface Issue {
  readonly number: number
  title: string
  body: string
  state: "open" | "closed"
}

/**
 * Serves the GitHub issue endpoints used by the tracking issue from `issues`.
 */
const githubClient = (issues: Array<Issue>): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      const path = new URL(request.url).pathname.replace(/^\/repos\/Effect-TS\/effect/, "")
      const body = request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : {}
      const respond = (json: unknown) => HttpClientResponse.fromWeb(request, Response.json(json))
      if (request.method === "GET" && path === "/issues") {
        return respond(issues.filter((issue) => issue.state === "open").sort((a, b) => b.number - a.number))
      }
      if (request.method === "POST" && path === "/issues") {
        const issue: Issue = { number: Math.max(0, ...issues.map((issue) => issue.number)) + 1, state: "open", ...body }
        issues.push(issue)
        return respond(issue)
      }
      const match = /^\/issues\/(\d+)(\/comments)?$/.exec(path)
      const issue = issues.find((issue) => issue.number === Number(match?.[1]))
      if (issue === undefined) {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: 404 }))
      }
      if (request.method === "PATCH" && match?.[2] === undefined) {
        Object.assign(issue, body)
      }
      return respond(issue)
    })
  )

const content = render({
  version: "4.0.6",
  bump: { sha: "a".repeat(40), committedAt: new Date(0) },
  overdueAfterHours: 12,
  diagnoses: [{ _tag: "Missing", pkg: { name: "effect", version: "4.0.6" } }]
})

describe("TrackingIssue", () => {
  it.effect("keeps the oldest open tracking issue and closes duplicates", () =>
    Effect.gen(function*() {
      // Left behind by runs whose issue listing missed the open tracking issue.
      const issues: Array<Issue> = [9774, 9776, 9778].map((number) => ({ number, state: "open", ...content }))

      const result = yield* upsert({ repository: "Effect-TS/effect", token: Redacted.make("token") }, content).pipe(
        Effect.provideService(HttpClient.HttpClient, githubClient(issues))
      )

      assert.strictEqual(result.number, 9774)
      assert.deepStrictEqual(
        issues.filter((issue) => issue.state === "open").map((issue) => issue.number),
        [9774]
      )
    }))
})
