import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as PlatformError from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

const MockExecutorLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(Effect.fnUntraced(function*(command) {
    // For piped commands, flatten to get the first command info
    let cmd = command
    while (cmd._tag === "PipedCommand") {
      cmd = cmd.left
    }
    const executable = cmd._tag === "StandardCommand"
      ? cmd.command
      : "templated"
    const output = new TextEncoder().encode(`mock output for ${executable}`)
    let isReferenced = true
    const reref = Effect.sync(() => {
      if (!isReferenced) {
        isReferenced = true
      }
    })
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(12345),
      stdin: Sink.forEach<Uint8Array, void, never, never>((_chunk) => Effect.void),
      stdout: Stream.fromIterable([output]),
      stderr: Stream.fromIterable([new TextEncoder().encode("")]),
      all: Stream.fromIterable([output]),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.sync(() => {
        if (isReferenced) {
          isReferenced = false
        }
        return reref
      })
    })
  }))
)

describe("ChildProcess", () => {
  describe("make", () => {
    it("template literal form should create a standard command", () => {
      const cmd = ChildProcess.make`echo hello`
      assert(ChildProcess.isStandardCommand(cmd))
      assert.strictEqual(cmd.command, "echo")
      assert.deepStrictEqual(cmd.args, ["hello"])
    })

    it("preserves astral Unicode escapes in template arguments", () => {
      const cmd = ChildProcess.make`echo \u{1F600} tail`
      assert(ChildProcess.isStandardCommand(cmd))
      assert.deepStrictEqual(cmd.args, ["😀", "tail"])
    })

    it("array form should create a standard command", () => {
      const cmd = ChildProcess.make("node", ["--version"])
      assert.strictEqual(cmd._tag, "StandardCommand")
      assert.isTrue(ChildProcess.isStandardCommand(cmd))
      assert.strictEqual(cmd.command, "node")
      assert.deepStrictEqual(cmd.args, ["--version"])
    })

    it("options form should pass options to templated command", () => {
      const cmd = ChildProcess.make({ cwd: "/tmp" })`ls -la`
      assert(ChildProcess.isStandardCommand(cmd))
      assert.strictEqual(cmd.options.cwd, "/tmp")
    })

    it("array form with options should work", () => {
      const cmd = ChildProcess.make("git", ["status"], { cwd: "/app" })
      assert.strictEqual(cmd._tag, "StandardCommand")
      assert.strictEqual(cmd.command, "git")
      assert.deepStrictEqual(cmd.args, ["status"])
      assert.strictEqual(cmd.options.cwd, "/app")
    })
  })

  describe("spawn", () => {
    it.effect("should spawn a templated command", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make`echo hello`
        const handle = yield* cmd
        assert.strictEqual(handle.pid, ChildProcessSpawner.ProcessId(12345))
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("should spawn a standard command", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make("node", ["--version"])
        const handle = yield* cmd
        assert.strictEqual(handle.pid, ChildProcessSpawner.ProcessId(12345))
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("should return a process handle", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make`long-running-process`
        const handle = yield* cmd
        assert.strictEqual(handle.pid, ChildProcessSpawner.ProcessId(12345))
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("collects stdout through Stream APIs", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make("cat", ["file.txt"])
        const handle = yield* cmd
        const chunks = yield* Stream.runCollect(handle.stdout)
        assert.isTrue(chunks.length > 0)
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("should allow waiting for exit code", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make`echo test`
        const handle = yield* cmd
        const exitCode = yield* handle.exitCode
        assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0))
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("should unref a process and return a reref effect", () =>
      Effect.gen(function*() {
        const cmd = ChildProcess.make`echo test`
        const handle = yield* cmd
        const reref = yield* handle.unref
        assert.isDefined(reref)
        yield* reref
      }).pipe(Effect.provide(MockExecutorLayer)))

    it.effect("should allow restoring the reference within acquireRelease", () =>
      Effect.gen(function*() {
        const handle = yield* ChildProcess.make`echo test`
        // @effect-diagnostics-next-line floatingEffect:off
        yield* Effect.acquireRelease(handle.unref, (reref) => Effect.ignore(reref))
      }).pipe(Effect.provide(MockExecutorLayer)))
  })

  describe("pipeTo", () => {
    it("should create a piped command", () => {
      const pipeline = ChildProcess.make`cat file.txt`.pipe(
        ChildProcess.pipeTo(ChildProcess.make`grep pattern`),
        ChildProcess.pipeTo(ChildProcess.make`wc -l`)
      )
      assert.strictEqual(pipeline._tag, "PipedCommand")
    })

    it.effect("should allow spawning a pipeline", () =>
      Effect.gen(function*() {
        const pipeline = ChildProcess.make`cat file.txt`.pipe(
          ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
        )
        const handle = yield* pipeline
        assert.strictEqual(handle.pid, ChildProcessSpawner.ProcessId(12345))
      }).pipe(Effect.provide(MockExecutorLayer)))
  })

  describe("setCwd", () => {
    it("should set cwd on standard commands", () => {
      const standard = ChildProcess.make("ls", ["-la"], { env: { TEST: "1" } })
      const updatedStandard = ChildProcess.setCwd(standard, "/tmp")
      assert(updatedStandard._tag === "StandardCommand")
      assert.strictEqual(updatedStandard.options.cwd, "/tmp")
      assert.deepStrictEqual(updatedStandard.options.env, { TEST: "1" })
    })

    it("should set cwd on all commands in a pipeline", () => {
      const pipeline = ChildProcess.make`cat file`.pipe(
        ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
      )
      const updated = ChildProcess.setCwd(pipeline, "/tmp")
      assert.strictEqual(updated._tag, "PipedCommand")
      if (updated._tag === "PipedCommand") {
        const left = updated.left
        const right = updated.right
        assert(left._tag === "StandardCommand")
        assert.strictEqual(left.options.cwd, "/tmp")
        assert(right._tag === "StandardCommand")
        assert.strictEqual(right.options.cwd, "/tmp")
      }
    })
  })

  describe("prefix", () => {
    it("should prefix a standard command and preserve options", () => {
      const command = ChildProcess.make("echo", ["hello"], { cwd: "/tmp", env: { TEST: "1" } })
      const prefixed = command.pipe(ChildProcess.prefix`time`)
      assert(prefixed._tag === "StandardCommand")
      assert.strictEqual(prefixed.command, "time")
      assert.deepStrictEqual(prefixed.args, ["echo", "hello"])
      assert.strictEqual(prefixed.options.cwd, "/tmp")
      assert.deepStrictEqual(prefixed.options.env, { TEST: "1" })
    })

    it("should prefix the leftmost command in a pipeline", () => {
      const pipeline = ChildProcess.make`cat file`.pipe(
        ChildProcess.pipeTo(ChildProcess.make`grep pattern`),
        ChildProcess.pipeTo(ChildProcess.make`wc -l`, { from: "stderr" })
      )

      const prefixed = pipeline.pipe(ChildProcess.prefix`time`)
      assert(prefixed._tag === "PipedCommand")
      assert.strictEqual(prefixed.options.from, "stderr")

      const left = prefixed.left
      assert(left._tag === "PipedCommand")

      const leftmost = left.left
      assert(leftmost._tag === "StandardCommand")
      assert.strictEqual(leftmost.command, "time")
      assert.deepStrictEqual(leftmost.args, ["cat", "file"])

      const middle = left.right
      assert(middle._tag === "StandardCommand")
      assert.strictEqual(middle.command, "grep")
      assert.deepStrictEqual(middle.args, ["pattern"])

      const right = prefixed.right
      assert(right._tag === "StandardCommand")
      assert.strictEqual(right.command, "wc")
      assert.deepStrictEqual(right.args, ["-l"])
    })
  })

  describe("guards", () => {
    it("isCommand should detect commands", () => {
      const cmd = ChildProcess.make`echo hello`
      assert.isTrue(ChildProcess.isCommand(cmd))
      assert.isFalse(ChildProcess.isCommand({ _tag: "Other" }))
      assert.isFalse(ChildProcess.isCommand(null))
    })

    it("isStandardCommand should detect standard commands", () => {
      const standard = ChildProcess.make("echo", ["hello"])
      const templated = ChildProcess.make`echo hello`
      const piped = ChildProcess.make`cat file`.pipe(
        ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
      )
      assert.isTrue(ChildProcess.isStandardCommand(standard))
      assert.isTrue(ChildProcess.isStandardCommand(templated))
      assert.isFalse(ChildProcess.isStandardCommand(piped))
    })

    it("isPipedCommand should detect piped commands", () => {
      const single = ChildProcess.make`echo hello`
      const piped = ChildProcess.make`cat file`.pipe(
        ChildProcess.pipeTo(ChildProcess.make`grep pattern`)
      )
      assert.isFalse(ChildProcess.isPipedCommand(single))
      assert.isTrue(ChildProcess.isPipedCommand(piped))
    })
  })

  describe("additionalFds", () => {
    describe("parseFdName", () => {
      it("should parse valid fd names", () => {
        assert.strictEqual(ChildProcess.parseFdName("fd3"), 3)
        assert.strictEqual(ChildProcess.parseFdName("fd4"), 4)
        assert.strictEqual(ChildProcess.parseFdName("fd10"), 10)
        assert.strictEqual(ChildProcess.parseFdName("fd100"), 100)
      })

      it("should reject invalid fd names", () => {
        assert.isUndefined(ChildProcess.parseFdName("stdin"))
        assert.isUndefined(ChildProcess.parseFdName("stdout"))
        assert.isUndefined(ChildProcess.parseFdName("stderr"))
        assert.isUndefined(ChildProcess.parseFdName("fd0"))
        assert.isUndefined(ChildProcess.parseFdName("fd1"))
        assert.isUndefined(ChildProcess.parseFdName("fd2"))
        assert.isUndefined(ChildProcess.parseFdName("invalid"))
        assert.isUndefined(ChildProcess.parseFdName("fd"))
        assert.isUndefined(ChildProcess.parseFdName(""))
      })
    })

    describe("fdName", () => {
      it("should create fd names from numbers", () => {
        assert.strictEqual(ChildProcess.fdName(3), "fd3")
        assert.strictEqual(ChildProcess.fdName(4), "fd4")
        assert.strictEqual(ChildProcess.fdName(10), "fd10")
      })
    })

    describe("command options", () => {
      it("should accept additionalFds option with output fd", () => {
        const cmd = ChildProcess.make("my-program", [], {
          additionalFds: { fd3: { type: "output" } }
        })
        assert.strictEqual(cmd._tag, "StandardCommand")
        assert.isDefined(cmd.options.additionalFds)
        assert.strictEqual(cmd.options.additionalFds!.fd3.type, "output")
      })

      it("should accept additionalFds option with input fd", () => {
        const cmd = ChildProcess.make("my-program", [], {
          additionalFds: { fd3: { type: "input" } }
        })
        assert.strictEqual(cmd._tag, "StandardCommand")
        assert.isDefined(cmd.options.additionalFds)
        assert.strictEqual(cmd.options.additionalFds!.fd3.type, "input")
      })

      it("should accept multiple additional fds", () => {
        const cmd = ChildProcess.make("my-program", [], {
          additionalFds: {
            fd3: { type: "output" },
            fd4: { type: "input" },
            fd5: { type: "output" }
          }
        })
        assert.strictEqual(cmd._tag, "StandardCommand")
        assert.isDefined(cmd.options.additionalFds)
        assert.strictEqual(cmd.options.additionalFds!.fd3.type, "output")
        assert.strictEqual(cmd.options.additionalFds!.fd4.type, "input")
        assert.strictEqual(cmd.options.additionalFds!.fd5.type, "output")
      })

      it("should accept additionalFds with streams", () => {
        const inputStream = Stream.fromIterable([new TextEncoder().encode("test")])
        const cmd = ChildProcess.make("my-program", [], {
          additionalFds: { fd3: { type: "input", stream: inputStream } }
        })
        assert.strictEqual(cmd._tag, "StandardCommand")
        assert.isDefined(cmd.options.additionalFds)
        assert.strictEqual(cmd.options.additionalFds!.fd3.type, "input")
        assert.propertyVal(cmd.options.additionalFds!.fd3, "stream", inputStream)
      })

      it("should accept additionalFds with sinks", () => {
        const outputSink: Sink.Sink<
          Uint8Array<ArrayBufferLike>,
          Uint8Array<ArrayBufferLike>,
          never,
          PlatformError.PlatformError
        > = Sink.succeed(new Uint8Array())
        const cmd = ChildProcess.make("my-program", [], {
          additionalFds: { fd3: { type: "output", sink: outputSink } }
        })
        assert.strictEqual(cmd._tag, "StandardCommand")
        assert.isDefined(cmd.options.additionalFds)
        assert.strictEqual(cmd.options.additionalFds!.fd3.type, "output")
        assert.propertyVal(cmd.options.additionalFds!.fd3, "sink", outputSink)
      })
    })

    describe("ChildProcessHandle additionalFds", () => {
      it.effect("should have additionalFds accessor on handle", () =>
        Effect.gen(function*() {
          const cmd = ChildProcess.make`echo hello`
          const handle = yield* cmd
          assert.isDefined(handle.getInputFd)
          assert.isDefined(handle.getOutputFd)
        }).pipe(Effect.provide(MockExecutorLayer)))
    })
  })
})
