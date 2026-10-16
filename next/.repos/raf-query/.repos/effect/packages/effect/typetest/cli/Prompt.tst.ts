import { Effect, Match, type Queue, type Terminal } from "effect"
import { Prompt } from "effect/cli"
import { describe, expect, it } from "tstyche"

declare const stringEvents: Queue.Dequeue<string, never>
declare const objectEvents: Queue.Dequeue<{ readonly tick: number }, never>

describe("Prompt", () => {
  it("allows select messages to be omitted but requires an autocomplete message", () => {
    const options = { choices: [{ title: "First", value: "first" }] }
    expect(Prompt.Select).type.toBeCallableWith(options)
    expect(Prompt.MultiSelect).type.toBeCallableWith(options)
    expect(Prompt.AutoComplete).type.not.toBeCallableWith(options)
  })

  it("numeric option types match their constructors", () => {
    const intOptions: Prompt.IntOptions = { message: "Count", min: 0, incrementBy: 2 }
    const numberOptions: Prompt.NumberOptions = { ...intOptions, precision: 3 }
    expect(Prompt.Int).type.toBeCallableWith(intOptions)
    expect(Prompt.Number).type.toBeCallableWith(numberOptions)
    expect<Parameters<typeof Prompt.Int>[0]>().type.toBe<Prompt.IntOptions>()
    expect<Parameters<typeof Prompt.Number>[0]>().type.toBe<Prompt.NumberOptions>()
    expect<Prompt.NumberOptions>().type.toBeAssignableTo<Prompt.IntOptions>()
  })

  it("TextOptions remains shared by text controls", () => {
    const options: Prompt.TextOptions = { message: "Value" }
    expect(Prompt.String).type.toBeCallableWith(options)
    expect(Prompt.Hidden).type.toBeCallableWith(options)
    expect(Prompt.Password).type.toBeCallableWith(options)
    expect<Prompt.ListOptions>().type.toBeAssignableTo<Prompt.TextOptions>()
  })

  describe("Theme", () => {
    it("supports context and per-prompt customization", () => {
      expect(Prompt.makeTheme({ prefix: "!", primaryColor: "primary" })).type.toBe<Prompt.Theme>()
      expect(Prompt.String).type.toBeCallableWith({
        message: "Name",
        theme: { prefix: "!", errorColor: "error" }
      })
    })

    it("does not expose the replaced prefix option", () => {
      expect(Prompt.String).type.not.toBeCallableWith({ message: "Name", prefix: "!" })
    })
  })

  describe("custom", () => {
    it("without events, process receives Terminal.UserInput", () => {
      Prompt.Custom(
        { count: 0 },
        {
          render: () => Effect.succeed(""),
          process: (input, _state) => {
            expect(input).type.toBe<Terminal.UserInput>()
            return Effect.succeed({ _tag: "Submit" as const, value: 42 })
          },
          clear: () => Effect.succeed("")
        }
      )
    })

    it("with events, process receives ProcessInput<A>", () => {
      Prompt.Custom(
        { count: 0 },
        stringEvents,
        {
          render: () => Effect.succeed(""),
          process: (input, _state) => {
            expect(input).type.toBe<Prompt.ProcessInput<string>>()
            return Effect.succeed({ _tag: "Submit" as const, value: 42 })
          },
          clear: () => Effect.succeed("")
        }
      )
    })

    it("ProcessInput is a discriminated union narrowed by _tag", () => {
      Prompt.Custom(
        { count: 0 },
        objectEvents,
        {
          render: () => Effect.succeed(""),
          process: (input, _state) => {
            if (input._tag === "Input") {
              expect(input.input).type.toBe<Terminal.UserInput>()
            } else {
              expect(input.value).type.toBe<{ readonly tick: number }>()
            }
            return Effect.succeed({ _tag: "Submit" as const, value: 0 })
          },
          clear: () => Effect.succeed("")
        }
      )
    })

    it("returns Prompt<Output>", () => {
      const prompt = Prompt.Custom(
        0,
        {
          render: () => Effect.succeed(""),
          process: ({ key }, state) =>
            Effect.succeed(
              key.name === "enter" ? { _tag: "Submit" as const, value: state } : { _tag: "Beep" as const }
            ),
          clear: () => Effect.succeed("")
        }
      )

      expect(prompt).type.toBe<Prompt.Prompt<number>>()
    })

    it("returns Prompt<Output> with events", () => {
      const prompt = Prompt.Custom(
        0,
        stringEvents,
        {
          render: () => Effect.succeed(""),
          process: (input, state) =>
            Effect.succeed(
              Match.value(input).pipe(
                Match.tag("Input", ({ input }) =>
                  input.key.name === "enter" ? { _tag: "Submit" as const, value: state } : { _tag: "Beep" as const }),
                Match.tag("Event", ({ value }) =>
                  value === "tick" ? { _tag: "NextFrame" as const, state: state + 1 } : { _tag: "Beep" as const }),
                Match.exhaustive
              )
            ),
          clear: () => Effect.succeed("")
        }
      )

      expect(prompt).type.toBe<Prompt.Prompt<number>>()
    })
  })
})
