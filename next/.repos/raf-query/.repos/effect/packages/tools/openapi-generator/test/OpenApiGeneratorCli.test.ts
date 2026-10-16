import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Stdio, Stream } from "effect"
import { CliOutput } from "effect/cli"
import * as Exit from "effect/Exit"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { TestConsole } from "effect/testing"

const makeLayer = (args: ReadonlyArray<string>) =>
  Layer.mergeAll(
    TestConsole.layer,
    CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
    NodeServices.layer,
    Stdio.layerTest({ args: Effect.succeed(args) })
  )

const fixturePath = (fileName: string) => `${import.meta.dirname}/fixtures/${fileName}`
const cliProcessPath = `${import.meta.dirname}/../src/bin.ts`

type CliMainModule = {
  readonly run: Effect.Effect<void>
}

const runCli = Effect.fnUntraced(function*(args: ReadonlyArray<string>) {
  const module = (yield* Effect.promise(
    () => import(new URL("../src/main.ts", import.meta.url).href)
  )) as CliMainModule

  return yield* Effect.gen(function*() {
    const exit = yield* Effect.exit(module.run)
    const stdoutLines = yield* TestConsole.logLines
    const stderrLines = yield* TestConsole.errorLines
    const stdout = stdoutLines.length > 0 ? String(stdoutLines[stdoutLines.length - 1]) : ""
    const stderr = stderrLines.map(String).join("\n")
    return { exit, stdout, stderr } as const
  }).pipe(Effect.provide(makeLayer(args)))
})

const runCliProcess = Effect.fnUntraced(function*(args: ReadonlyArray<string>) {
  const handle = yield* ChildProcess.make("node", [cliProcessPath, ...args])
  return yield* Effect.all({
    exitCode: handle.exitCode,
    stdout: Stream.mkString(Stream.decodeText(handle.stdout)),
    stderr: Stream.mkString(Stream.decodeText(handle.stderr))
  }, { concurrency: "unbounded" })
})

describe("openapigen CLI", () => {
  it.effect("documents --format values and default in --help", () =>
    Effect.gen(function*() {
      const result = yield* runCli(["--help"])

      assert.isTrue(Exit.isSuccess(result.exit))
      assert.include(result.stdout, "--format")
      assert.include(result.stdout, "httpclient")
      assert.include(result.stdout, "httpclient-type-only")
      assert.include(result.stdout, "httpapi")
      assert.include(result.stdout, "default: httpclient")
      assert.strictEqual(result.stderr, "")
    }))

  it.effect("routes --format values and defaults to httpclient", () =>
    Effect.gen(function*() {
      const spec = fixturePath("cli-basic-spec.json")

      const defaultResult = yield* runCli(["--spec", spec, "--name", "CliClient"])
      const httpclientResult = yield* runCli([
        "--spec",
        spec,
        "--name",
        "CliClient",
        "--format",
        "httpclient"
      ])
      const typeOnlyResult = yield* runCli([
        "--spec",
        spec,
        "--name",
        "CliClient",
        "--format",
        "httpclient-type-only"
      ])
      const httpapiResult = yield* runCli([
        "--spec",
        spec,
        "--name",
        "CliClient",
        "--format",
        "httpapi"
      ])

      assert.isTrue(Exit.isSuccess(defaultResult.exit))
      assert.isTrue(Exit.isSuccess(httpclientResult.exit))
      assert.isTrue(Exit.isSuccess(typeOnlyResult.exit))
      assert.isTrue(Exit.isSuccess(httpapiResult.exit))

      assert.strictEqual(defaultResult.stderr, "")
      assert.strictEqual(httpclientResult.stderr, "")
      assert.strictEqual(typeOnlyResult.stderr, "")
      assert.strictEqual(httpapiResult.stderr, "")

      assert.strictEqual(defaultResult.stdout, httpclientResult.stdout)
      assert.include(httpclientResult.stdout, "import * as Schema from \"effect/Schema\"")
      assert.notInclude(typeOnlyResult.stdout, "import * as Schema from \"effect/Schema\"")
      assert.include(typeOnlyResult.stdout, "import type * as HttpClient from \"effect/http/HttpClient\"")
      assert.include(httpapiResult.stdout, "export class CliClient extends HttpApi.make(\"CliClient\")")
    }))

  it.effect("rejects legacy --type-only flag", () =>
    Effect.gen(function*() {
      const spec = fixturePath("cli-basic-spec.json")
      const result = yield* runCli(["--spec", spec, "--name", "CliClient", "--type-only"])

      assert.isTrue(Exit.isFailure(result.exit))
      assert.include(result.stdout, "USAGE")
      assert.include(result.stderr, "Unrecognized flag: --type-only")
    }))

  it.effect("writes warnings to stderr and keeps stdout as generated source", () =>
    Effect.gen(function*() {
      const spec = fixturePath("cli-warning-spec.json")
      const result = yield* runCli(["--spec", spec, "--name", "CliClient"])

      assert.isTrue(Exit.isSuccess(result.exit))
      assert.include(result.stdout, "export const make = (")
      assert.include(result.stderr, "WARNING [cookie-parameter-dropped]")
      assert.include(result.stderr, "cookie-parameter-dropped")
      assert.notInclude(result.stdout, "cookie-parameter-dropped")
      assert.notInclude(result.stderr, "export const make = (")
    }))

  it.effect("separates generated source and warnings when spawned as a child process", () =>
    Effect.gen(function*() {
      const spec = fixturePath("cli-warning-spec.json")
      const result = yield* runCliProcess(["--spec", spec, "--name", "CliClient"])

      assert.strictEqual(result.exitCode, ChildProcessSpawner.ExitCode(0))
      assert.include(result.stdout, "export const make = (")
      assert.notInclude(result.stdout, "WARNING [")
      assert.notInclude(result.stdout, "cookie-parameter-dropped")
      assert.include(
        result.stderr,
        "WARNING [cookie-parameter-dropped] GET /users/{id} (getUser): Cookie parameter \"session\" was dropped because non-security cookie parameters are not supported."
      )
      assert.notInclude(result.stderr, "export const make = (")
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)))
})
