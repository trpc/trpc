import { Context, Effect } from "effect"
import { Argument, Command, Flag, GlobalFlag } from "effect/cli"
import { describe, expect, it } from "tstyche"

describe("Command", () => {
  describe("withSubcommands", () => {
    it("unions errors and requirements across multiple subcommands", () => {
      class _ServiceA extends Context.Service<_ServiceA, string>()("ServiceA") {}
      class _ServiceB extends Context.Service<_ServiceB, string>()("ServiceB") {}
      class _ServiceC extends Context.Service<_ServiceC, string>()("ServiceC") {}

      const childA = Command.make("child-a", {}, () => Effect.void as Effect.Effect<void, "err-a", _ServiceA>)
      const childB = Command.make("child-b", {}, () => Effect.void as Effect.Effect<void, "err-b", _ServiceB>)
      const childC = Command.make("child-c", {}, () => Effect.void as Effect.Effect<void, "err-c", _ServiceC>)

      const root = Command.make("root").pipe(
        Command.withSubcommands([childA, childB, childC])
      )

      expect(root).type.toBe<
        Command.Command<"root", {}, {}, "err-a" | "err-b" | "err-c", _ServiceA | _ServiceB | _ServiceC>
      >()
    })
  })

  describe("withSharedFlags", () => {
    it("adds shared flags to command input and parent context", () => {
      const root = Command.make("root", {
        workspace: Flag.String("workspace")
      }).pipe(
        Command.withSharedFlags({
          verbose: Flag.Boolean("verbose")
        }),
        Command.withHandler((config) => {
          expect(config).type.toBe<{ readonly workspace: string; readonly verbose: boolean }>()
          return Effect.void
        })
      )

      expect(root).type.toBe<
        Command.Command<
          "root",
          { readonly workspace: string; readonly verbose: boolean },
          { readonly verbose: boolean },
          never,
          never
        >
      >()
    })

    it("does not expose local config through yield* parent", () => {
      const root = Command.make("root", {
        workspace: Flag.String("workspace")
      }).pipe(
        Command.withSharedFlags({
          verbose: Flag.Boolean("verbose")
        })
      )

      const child = Command.make("child", {}, () =>
        Effect.gen(function*() {
          const parent = yield* root
          expect(parent).type.toBe<{ readonly verbose: boolean }>()
          expect(parent).type.not.toHaveProperty("workspace")
          return
        }))

      root.pipe(Command.withSubcommands([child]))
    })

    it("widens input after withSubcommands for input-based combinators", () => {
      const root = Command.make("root", {
        local: Flag.String("local")
      }).pipe(
        Command.withSharedFlags({
          verbose: Flag.Boolean("verbose")
        })
      )

      const child = Command.make("child")

      root.pipe(
        Command.withSubcommands([child]),
        Command.provideEffectDiscard((input) => {
          expect(input).type.toBe<
            | { readonly local: string; readonly verbose: boolean }
            | { readonly verbose: boolean }
          >()
          expect(input.verbose).type.toBe<boolean>()
          expect(input).type.not.toHaveProperty("local")
          return Effect.void
        })
      )
    })

    it("accepts only flags", () => {
      Command.make("root").pipe(
        // @ts-expect-error Type 'Argument<string>' is not assignable
        Command.withSharedFlags({ file: Argument.String("file") })
      )
    })
  })

  describe("withGlobalFlags", () => {
    it("strips setting context from mixed global flags", () => {
      const VerboseAction = GlobalFlag.Action({
        flag: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
        run: () => Effect.void
      })
      const Format = GlobalFlag.Setting("format")({
        flag: Flag.String("format").pipe(Flag.withDefault("text"))
      })

      const command = Command.make("example", {}, () =>
        Effect.gen(function*() {
          yield* Format
        })).pipe(
          Command.withGlobalFlags([VerboseAction, Format])
        )

      expect(command).type.toBe<Command.Command<"example", {}, {}, never, never>>()
    })

    it("strips setting context in data-first form", () => {
      const VerboseAction = GlobalFlag.Action({
        flag: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
        run: () => Effect.void
      })
      const Format = GlobalFlag.Setting("format")({
        flag: Flag.String("format").pipe(Flag.withDefault("text"))
      })

      const command = Command.withGlobalFlags(
        Command.make("example", {}, () =>
          Effect.gen(function*() {
            yield* Format
          })),
        [VerboseAction, Format]
      )

      expect(command).type.toBe<Command.Command<"example", {}, {}, never, never>>()
    })
  })

  describe("built-in global flags", () => {
    it("strips built-in setting context from Command.make handlers", () => {
      const command = Command.make("example", {}, () =>
        Effect.gen(function*() {
          yield* GlobalFlag.LogLevel
        }))

      expect(command).type.toBe<Command.Command<"example", {}, {}, never, never>>()
    })

    it("strips built-in setting context from Command.withHandler handlers", () => {
      const command = Command.make("example").pipe(
        Command.withHandler(() =>
          Effect.gen(function*() {
            yield* GlobalFlag.LogLevel
          })
        )
      )

      expect(command).type.toBe<Command.Command<"example", {}, {}, never, never>>()
    })
  })
})
