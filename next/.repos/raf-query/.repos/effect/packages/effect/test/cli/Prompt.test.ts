import { assert, describe, it } from "@effect/vitest"
import { Data, DateTime, Deferred, Effect, Fiber, FileSystem, Layer, Match, Path, Queue, Redacted } from "effect"
import { Prompt } from "effect/cli"
import * as MockTerminal from "./services/MockTerminal.ts"

const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer

const TestLayer = Layer.mergeAll(
  FileSystemLayer,
  PathLayer,
  TerminalLayer
)
const Action = Data.taggedEnum<Prompt.ActionDefinition>()

const escape = String.fromCharCode(27)
const bell = String.fromCharCode(7)

const stripAnsi = (text: string) => {
  let result = ""
  let skipping = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (skipping) {
      if ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z")) {
        skipping = false
      }
      continue
    }
    if (char === escape) {
      skipping = true
      continue
    }
    result += char
  }
  return result
}

const toFrames = (lines: ReadonlyArray<unknown>) =>
  lines
    .map((line) => stripAnsi(String(line)))
    .filter((line) => line.split(bell).join("").trim().length > 0)

const toRawFrames = (lines: ReadonlyArray<unknown>) =>
  lines
    .map((line) => String(line))
    .filter((line) => stripAnsi(line).split(bell).join("").trim().length > 0)

const findFrame = (frames: ReadonlyArray<string>, text: string) => frames.find((frame) => frame.includes(text))

describe("Prompt.Date", () => {
  it.effect("renders two-digit years, teen ordinals, and noon meridiem correctly", () =>
    Effect.gen(function*() {
      const initial = DateTime.toDateUtc(DateTime.makeZonedUnsafe(
        { year: 2024, month: 1, day: 11, hour: 12 },
        { timeZone: DateTime.zoneMakeLocal(), adjustForTimeZone: true }
      ))
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Date({ message: "When", initial, dateMask: "YY Do A" }))
      const output = (yield* MockTerminal.displayLines).map(String).join("\n")

      assert.include(output, "24 11th PM")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts a fresh typed buffer when Tab advances to the next field", () =>
    Effect.gen(function*() {
      const initial = new Date(2024, 0, 1, 12)
      yield* MockTerminal.inputText("1")
      yield* MockTerminal.inputKey("tab")
      yield* MockTerminal.inputText("5")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Date({ message: "When", initial, dateMask: "MM-DD" }))

      assert.deepStrictEqual(result, new Date(2024, 0, 5, 12))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts a fresh typed buffer when Tab wraps to the first field", () =>
    Effect.gen(function*() {
      const initial = new Date(2024, 0, 1, 12)
      yield* MockTerminal.inputKey("tab")
      yield* MockTerminal.inputText("1")
      yield* MockTerminal.inputKey("tab")
      yield* MockTerminal.inputText("5")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Date({ message: "When", initial, dateMask: "DD-MM" }))

      assert.deepStrictEqual(result, new Date(2024, 0, 5, 12))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("accumulates multiple digits while staying in the same field", () =>
    Effect.gen(function*() {
      const initial = new Date(2024, 0, 1, 12)
      yield* MockTerminal.inputText("15")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Date({ message: "When", initial, dateMask: "DD" }))

      assert.deepStrictEqual(result, new Date(2024, 0, 15, 12))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts a fresh typed buffer when Tab wraps a single editable field", () =>
    Effect.gen(function*() {
      const initial = new Date(2024, 0, 1, 12)
      yield* MockTerminal.inputText("1")
      yield* MockTerminal.inputKey("tab")
      yield* MockTerminal.inputText("5")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Date({ message: "When", initial, dateMask: "DD" }))

      assert.deepStrictEqual(result, new Date(2024, 0, 5, 12))
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.all", () => {
  it.effect("supports an empty record", () =>
    Effect.gen(function*() {
      const result = yield* Prompt.all({})
      assert.deepStrictEqual(result, {})
    }).pipe(Effect.provide(TestLayer)))

  it.effect("supports a non-array iterable", () =>
    Effect.gen(function*() {
      const result = yield* Prompt.all(new Set([Prompt.succeed(1)]))
      assert.deepStrictEqual(result, [1])
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Int", () => {
  it.effect("submits the default value", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Int({ message: "Count", default: 42 })

      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 42)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts from the default value so it can be edited", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Int({ message: "Count", default: 4 })

      yield* MockTerminal.inputText("2")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 42)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("clears the default value on ctrl-u", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Int({ message: "Count", default: 42 })

      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputText("7")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 7)
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Number", () => {
  it.effect("preserves a leading zero in the fractional part", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputText("0.05")
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(Prompt.Number({ message: "Rate" }))

      assert.strictEqual(value, 0.05)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders appended input without literal parsed", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Number({ message: "Rate" })

      yield* MockTerminal.inputText("12.5")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 12.5)

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const rendered = frames.join("\n")

      assert.isTrue(rendered.includes("12.5"))
      assert.isFalse(rendered.includes("parsed"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("clears the current input on ctrl-u", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Number({ message: "Rate" })

      yield* MockTerminal.inputText("12.5")
      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputText("7.25")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 7.25)
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.String", () => {
  it.effect("renders the default prompt theme", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.String({ message: "Name" }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.include(frames[0] ?? "", "? Name")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders the prompt theme from context", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.String({ message: "Name" })).pipe(
        Effect.provideService(
          Prompt.Theme,
          Prompt.makeTheme({
            prefix: "!",
            pointerSmall: ">",
            tick: "+",
            ellipsis: "~"
          })
        )
      )

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.include(frames[0] ?? "", "! Name >")
      assert.include(frames.at(-1) ?? "", "+ Name ~")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders theme colors from context with per-prompt overrides", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputText("A")
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.String({
        message: "Name",
        theme: { primaryColor: `${escape}[35m` }
      })).pipe(
        Effect.provideService(
          Prompt.Theme,
          Prompt.makeTheme({
            primaryColor: `${escape}[31m`,
            mutedColor: `${escape}[34m`,
            successColor: `${escape}[33m`,
            submittedColor: `${escape}[36m`
          })
        )
      )

      const output = toRawFrames(yield* MockTerminal.displayLines).join("\n")
      assert.include(output, `${escape}[35m?`)
      assert.include(output, `${escape}[34m›`)
      assert.include(output, `${escape}[33m✔`)
      assert.include(output, `${escape}[36mA`)
      assert.notInclude(output, `${escape}[31m?`)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders validation errors with the theme error color", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputText("bad")
      yield* MockTerminal.inputKey("enter")
      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputText("ok")
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.String({
        message: "Name",
        validate: (value) => value === "bad" ? Effect.fail("Try again") : Effect.succeed(value),
        theme: { errorColor: `${escape}[35m` }
      }))

      const output = toRawFrames(yield* MockTerminal.displayLines).join("\n")
      assert.include(output, `${escape}[35m›`)
      assert.include(output, `${escape}[35mbad`)
      assert.notInclude(output, `${escape}[31m›`)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("omits spacing for empty theme symbols", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.String({
        message: "Name",
        theme: { prefix: "", pointerSmall: "" }
      }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.strictEqual(frames[0], "Name")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts from the default value so it can be edited", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name",
        default: "Jane"
      })

      yield* MockTerminal.inputText(" Doe")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "Jane Doe")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("clears the current input on ctrl-u", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name",
        default: "Jane"
      })

      yield* MockTerminal.inputText(" Doe")
      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputText("John")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "John")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("moves the cursor to the beginning on ctrl-a", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name",
        default: "Jane"
      })

      yield* MockTerminal.inputText(" Doe")
      yield* MockTerminal.inputKey("a", { ctrl: true })
      yield* MockTerminal.inputText("Dr. ")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "Dr. Jane Doe")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("moves the cursor to the end on ctrl-e", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name"
      })

      yield* MockTerminal.inputText("Jane")
      yield* MockTerminal.inputKey("left")
      yield* MockTerminal.inputKey("left")
      yield* MockTerminal.inputKey("e", { ctrl: true })
      yield* MockTerminal.inputText(" Doe")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "Jane Doe")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not insert characters for unsupported ctrl key combinations", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name"
      })

      yield* MockTerminal.inputText("Ja")
      yield* MockTerminal.inputKey("l", { ctrl: true })
      yield* MockTerminal.inputText("ne")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "Jane")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not render or submit the cleared default value", () =>
    Effect.gen(function*() {
      const prompt = Prompt.String({
        message: "Name",
        default: "Jane"
      })

      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const lastFrame = frames.at(-1)

      assert.isTrue(lastFrame !== undefined)
      assert.isFalse(lastFrame?.includes("Jane"))
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Select", () => {
  it.effect("renders only the choice list when message is omitted", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Select({
        choices: [
          { title: "First", value: "first" },
          { title: "Second", value: "second" }
        ]
      }))

      assert.strictEqual(result, "second")
      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      assert.deepStrictEqual(frames, [
        "❯ First \n  Second ",
        "  First \n❯ Second ",
        "✔ Second\n"
      ])
      assert.isTrue(toRawFrames(output)[1]?.startsWith(`${escape}[2K${escape}[1A${escape}[2K${escape}[G`))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps the header when message is empty", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Select({ message: "", choices: [{ title: "First", value: "first" }] }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.strictEqual(frames[0]?.split("\n")[0], "?  › ")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders a per-prompt theme across redraws", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.Select({
        message: "Pick item",
        theme: {
          prefix: "!",
          pointer: ">",
          descriptionSeparator: ": "
        },
        choices: [
          { title: "First", value: "first", description: "one" },
          { title: "Second", value: "second", description: "two" }
        ]
      }))

      assert.strictEqual(result, "second")
      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.strictEqual(frames.filter((frame) => frame.includes("! Pick item")).length, 2)
      assert.isTrue(frames.some((frame) => frame.includes("> Second : two")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders selection colors from the prompt theme", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Select({
        message: "Pick item",
        theme: {
          primaryColor: `${escape}[35m`,
          mutedColor: `${escape}[34m`,
          successColor: `${escape}[33m`,
          submittedColor: `${escape}[36m`
        },
        choices: [{ title: "First", value: "first", description: "one" }]
      }))

      const output = toRawFrames(yield* MockTerminal.displayLines).join("\n")
      assert.include(output, `${escape}[35m❯`)
      assert.include(output, `${escape}[34m- one`)
      assert.include(output, `${escape}[33m✔`)
      assert.include(output, `${escape}[36mFirst`)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps title and description separated when the theme separator is empty", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Select({
        message: "Pick item",
        theme: {
          descriptionSeparator: "",
          mutedColor: `${escape}[34m`
        },
        choices: [{ title: "First", value: "first", description: "one" }]
      }))

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const rawFrames = toRawFrames(output)
      assert.isTrue(frames.some((frame) => frame.includes("First one")))
      assert.isFalse(frames.some((frame) => frame.includes("Firstone")))
      assert.isTrue(rawFrames.some((frame) => frame.includes(`${escape}[34mone${escape}[0m`)))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("aligns choices when paging arrows have different widths", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Select({
        message: "Pick item",
        maxPerPage: 2,
        theme: { arrowUp: "", arrowDown: "vvv" },
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Gamma", value: "gamma" }
        ]
      }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("❯   Alpha") && frame.includes("vvv Beta")))
      assert.isTrue(frames.some((frame) => frame.includes("    Beta") && frame.includes("❯   Gamma")))
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Password", () => {
  it.effect("renders the password mask from the prompt theme", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputText("abc")
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Password({ message: "Password" })).pipe(
        Effect.provideService(Prompt.Theme, Prompt.makeTheme({ passwordMask: "•" }))
      )

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("•••")))
      assert.isFalse(frames.some((frame) => frame.includes("***")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps cursor movement aligned with a multi-character password mask", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputText("abc")
      yield* MockTerminal.inputKey("left")
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Password({
        message: "Password",
        theme: { passwordMask: "**" }
      }))

      const frames = toRawFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("******") && frame.endsWith(`${escape}[2D`)))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("starts from the default value so it can be edited", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Password({
        message: "Password",
        default: "secret"
      })

      yield* MockTerminal.inputText("123")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(Redacted.value(result), "secret123")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not submit the cleared default value", () =>
    Effect.gen(function*() {
      const prompt = Prompt.Password({
        message: "Password",
        default: "secret"
      })

      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(Redacted.value(result), "")
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Toggle", () => {
  it.effect("renders the separator from the prompt theme", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Toggle({
        message: "Enabled",
        theme: { toggleSeparator: "|" }
      }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("on | off")))
      assert.isFalse(frames.some((frame) => frame.includes("on / off")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps labels separated when the theme separator is empty", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(Prompt.Toggle({
        message: "Enabled",
        theme: { toggleSeparator: "" }
      }))

      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("on off")))
      assert.isFalse(frames.some((frame) => frame.includes("onoff")))
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.AutoComplete", () => {
  it.effect("filters choices as you type", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick fruit",
        choices: [
          { title: "Apple", value: "apple" },
          { title: "Banana", value: "banana" },
          { title: "Cherry", value: "cherry" }
        ]
      })

      yield* MockTerminal.inputText("ban")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "banana")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: ban]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("Banana"))
      assert.isFalse(filteredFrame?.includes("Apple"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("removes the last character on backspace", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick item",
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Delta", value: "delta" }
        ]
      })

      yield* MockTerminal.inputText("al")
      yield* MockTerminal.inputKey("backspace")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "alpha")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const narrowedFrame = findFrame(frames, "[filter: al]")
      const expandedFrame = findFrame(frames, "[filter: a]")

      assert.isTrue(narrowedFrame !== undefined)
      assert.isTrue(expandedFrame !== undefined)
      assert.isFalse(narrowedFrame?.includes("Beta"))
      assert.isTrue(expandedFrame?.includes("Beta"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("clears the filter input on ctrl-u", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick item",
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Delta", value: "delta" }
        ]
      })

      yield* MockTerminal.inputText("al")
      yield* MockTerminal.inputKey("u", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "alpha")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const narrowedFrame = findFrame(frames, "[filter: al]")
      const clearedFrame = findFrame(frames, "[filter: type to filter]")

      assert.isTrue(narrowedFrame !== undefined)
      assert.isTrue(clearedFrame !== undefined)
      assert.isFalse(narrowedFrame?.includes("Beta"))
      assert.isTrue(clearedFrame?.includes("Beta"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders empty message and beeps on submit with no matches", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick pet",
        choices: [
          { title: "Cat", value: "cat" },
          { title: "Dog", value: "dog" }
        ]
      })

      yield* MockTerminal.inputText("zzz")
      yield* MockTerminal.inputKey("enter")
      for (let i = 0; i < 3; i++) {
        yield* MockTerminal.inputKey("backspace")
      }
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "cat")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)

      assert.isTrue(output.some((line) => String(line).includes("\x07")))
      assert.isTrue(findFrame(frames, "No matches") !== undefined)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("beeps when submitting a disabled choice", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick mode",
        choices: [
          { title: "Slow", value: "slow", disabled: true },
          { title: "Fast", value: "fast" }
        ]
      })

      yield* MockTerminal.inputKey("enter")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "fast")

      const output = yield* MockTerminal.displayLines
      assert.isTrue(output.some((line) => String(line).includes("\x07")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders empty message with no choices", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick option",
        choices: []
      })

      yield* MockTerminal.inputKey("c", { ctrl: true })
      const exit = yield* Prompt.run(prompt).pipe(Effect.exit)
      assert.isTrue(exit._tag === "Failure")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)

      assert.isTrue(findFrame(frames, "No matches") !== undefined)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("keeps `j` and `k` in the filter query instead of moving the cursor", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick a branch",
        choices: [
          { title: "feat/jira-fetch-tool", value: "feat/jira-fetch-tool" },
          { title: "main", value: "main" },
          { title: "feat/worktree-tool", value: "feat/worktree-tool" }
        ]
      })

      yield* MockTerminal.inputText("jira")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "feat/jira-fetch-tool")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: jira]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("feat/jira-fetch-tool"))
      assert.isFalse(filteredFrame?.includes("main"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("filters a query that merely contains a `k`", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick a branch",
        choices: [
          { title: "main", value: "main" },
          { title: "feat/jira-fetch-tool", value: "feat/jira-fetch-tool" },
          { title: "feat/worktree-tool", value: "feat/worktree-tool" }
        ]
      })

      yield* MockTerminal.inputText("worktree")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "feat/worktree-tool")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: worktree]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("feat/worktree-tool"))
      assert.isFalse(filteredFrame?.includes("feat/jira-fetch-tool"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("moves the cursor with ctrl-n and ctrl-p", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick item",
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Delta", value: "delta" }
        ]
      })

      yield* MockTerminal.inputKey("n", { ctrl: true })
      yield* MockTerminal.inputKey("n", { ctrl: true })
      yield* MockTerminal.inputKey("p", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "beta")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("moves the cursor up with ctrl-k", () =>
    Effect.gen(function*() {
      const prompt = Prompt.AutoComplete({
        message: "Pick item",
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Delta", value: "delta" }
        ]
      })

      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("k", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "beta")
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.File", () => {
  const FilePromptLayer = Layer.mergeAll(
    FileSystem.layerNoop({
      exists: () => Effect.succeed(true),
      readDirectory: (directory) =>
        Effect.succeed(
          directory === "/workspace"
            ? ["alpha.txt", "banana.txt", "basket.txt"]
            : []
        ),
      stat: (path) =>
        Effect.succeed(
          path.endsWith(".txt")
            ? ({ type: "File" } as any)
            : ({ type: "Directory" } as any)
        )
    }),
    PathLayer,
    TerminalLayer
  )

  it.effect("starts from the default value so it can be submitted", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        default: "/workspace/banana.txt"
      })

      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/banana.txt")
    }).pipe(Effect.provide(FilePromptLayer)))

  it.effect("filters files as you type", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputText("ban")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/banana.txt")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: ban]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("banana.txt"))
      assert.isFalse(filteredFrame?.includes("alpha.txt"))
      assert.isFalse(filteredFrame?.includes("basket.txt"))
    }).pipe(Effect.provide(FilePromptLayer)))

  it.effect("removes the last character on backspace", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputText("ban")
      yield* MockTerminal.inputKey("backspace")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/banana.txt")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const narrowedFrame = findFrame(frames, "[filter: ban]")
      const expandedFrame = findFrame(frames, "[filter: ba]")

      assert.isTrue(narrowedFrame !== undefined)
      assert.isTrue(expandedFrame !== undefined)
      assert.isFalse(narrowedFrame?.includes("basket.txt"))
      assert.isTrue(expandedFrame?.includes("basket.txt"))
    }).pipe(Effect.provide(FilePromptLayer)))

  const JkFilePromptLayer = Layer.mergeAll(
    FileSystem.layerNoop({
      exists: () => Effect.succeed(true),
      readDirectory: (directory) =>
        Effect.succeed(
          directory === "/workspace"
            ? ["jest.config.ts", "package.json", "readme.md"]
            : []
        ),
      stat: () => Effect.succeed({ type: "File" } as any)
    }),
    PathLayer,
    TerminalLayer
  )

  it.effect("keeps `j` in the filter query instead of moving the cursor", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputText("jest")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/jest.config.ts")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: jest]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("jest.config.ts"))
      assert.isFalse(filteredFrame?.includes("readme.md"))
    }).pipe(Effect.provide(JkFilePromptLayer)))

  it.effect("keeps `k` in the filter query instead of moving the cursor", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputText("package")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/package.json")

      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      const filteredFrame = findFrame(frames, "[filter: package]")

      assert.isTrue(filteredFrame !== undefined)
      assert.isTrue(filteredFrame?.includes("package.json"))
      assert.isFalse(filteredFrame?.includes("readme.md"))
    }).pipe(Effect.provide(JkFilePromptLayer)))

  it.effect("moves the cursor with ctrl-n and ctrl-p", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputKey("n", { ctrl: true })
      yield* MockTerminal.inputKey("n", { ctrl: true })
      yield* MockTerminal.inputKey("p", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/alpha.txt")
    }).pipe(Effect.provide(FilePromptLayer)))

  it.effect("moves the cursor up with ctrl-k", () =>
    Effect.gen(function*() {
      const prompt = Prompt.File({
        message: "Pick file",
        startingPath: "/workspace"
      })

      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("k", { ctrl: true })
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "/workspace/alpha.txt")
    }).pipe(Effect.provide(FilePromptLayer)))
})

describe("Prompt.MultiSelect", () => {
  it.effect("renders only the choice list when message is omitted", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.MultiSelect({
        choices: [
          { title: "First", value: "first" },
          { title: "Second", value: "second" }
        ]
      }))

      assert.deepStrictEqual(result, ["first", "second"])
      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      assert.deepStrictEqual(frames, [
        "  Select All\n  Inverse Selection\n  ☐ First \n  ☐ Second ",
        "  Select None\n  Inverse Selection\n  ☒ First \n  ☒ Second ",
        "✔ First, Second\n"
      ])
      const clearChoices = `${escape}[2K${escape}[1A`.repeat(3) + `${escape}[2K${escape}[G`
      assert.isTrue(toRawFrames(output)[1]?.startsWith(clearChoices))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("clears validation errors without a message", () =>
    Effect.gen(function*() {
      yield* MockTerminal.inputKey("enter")
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(Prompt.MultiSelect({
        min: 1,
        choices: [
          { title: "First", value: "first" },
          { title: "Second", value: "second" }
        ]
      }))

      assert.deepStrictEqual(result, ["first", "second"])
      const output = yield* MockTerminal.displayLines
      const frames = toFrames(output)
      assert.isTrue(frames[1]?.endsWith("\n❯ At least 1 are required"))
      assert.strictEqual(frames.at(-1), "✔ First, Second\n")

      const clearError = `${escape}[1B${escape}[2K${escape}[1A${escape}[2K${escape}[G`
      const clearChoices = `${escape}[2K${escape}[1A`.repeat(3) + `${escape}[2K${escape}[G`
      const rawFrames = toRawFrames(output)
      assert.isTrue(rawFrames[2]?.startsWith(clearError + clearChoices))
      assert.isTrue(rawFrames[3]?.startsWith(clearError + clearChoices))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("renders paging and checkbox symbols from the prompt theme", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        maxPerPage: 3,
        theme: {
          arrowDown: "v",
          checkboxOn: "[x]",
          checkboxOff: "[ ]"
        },
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" }
        ]
      })
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(prompt)

      assert.deepStrictEqual(value, ["alpha"])
      const frames = toFrames(yield* MockTerminal.displayLines)
      assert.isTrue(frames.some((frame) => frame.includes("v [ ] Alpha")))
      assert.isTrue(frames.some((frame) => frame.includes("[x] Alpha")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("aligns choices when checkbox symbols have different widths", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        theme: { checkboxOn: "[x]", checkboxOff: "" },
        choices: [
          { title: "Alpha", value: "alpha", selected: true },
          { title: "Beta", value: "beta" }
        ]
      })
      yield* MockTerminal.inputKey("enter")

      yield* Prompt.run(prompt)

      const frame = toFrames(yield* MockTerminal.displayLines).find((frame) =>
        frame.includes("[x] Alpha") && frame.includes("Beta")
      )
      assert.isTrue(frame !== undefined)
      const alpha = frame?.split("\n").find((line) => line.includes("Alpha")) ?? ""
      const beta = frame?.split("\n").find((line) => line.includes("Beta")) ?? ""
      assert.strictEqual(alpha.indexOf("Alpha"), beta.indexOf("Beta"))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not allow a disabled multi-select choice to be selected", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        choices: [{ title: "Unavailable", value: "unavailable", disabled: true }]
      })
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(prompt)

      assert.deepStrictEqual(value, [])
      const output = yield* MockTerminal.displayLines
      assert.isTrue(output.some((line) => String(line).includes("\x07")))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not select disabled choices when selecting all", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        choices: [
          { title: "Available", value: "available" },
          { title: "Unavailable", value: "unavailable", disabled: true }
        ]
      })
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(prompt)

      assert.deepStrictEqual(value, ["available"])
      const output = yield* MockTerminal.displayLines
      assert.isTrue(findFrame(toFrames(output), "Select None") !== undefined)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("does not select disabled choices when inverting the selection", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        choices: [
          { title: "Available", value: "available" },
          { title: "Unavailable", value: "unavailable", disabled: true }
        ]
      })
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("space")
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(prompt)

      assert.deepStrictEqual(value, ["available"])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("ignores disabled preselected choices when validating and submitting", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        choices: [
          { title: "Available", value: "available", selected: true },
          { title: "Unavailable", value: "unavailable", disabled: true, selected: true }
        ],
        max: 1
      })
      yield* MockTerminal.inputKey("enter")

      const value = yield* Prompt.run(prompt)

      assert.deepStrictEqual(value, ["available"])
      const output = yield* MockTerminal.displayLines
      const initialFrame = findFrame(toFrames(output), "Unavailable")
      assert.isTrue(initialFrame?.includes("☐ Unavailable"))
      const rawInitialFrame = findFrame(toRawFrames(output), "Unavailable")
      assert.isTrue(rawInitialFrame?.includes(`${escape}[9m${escape}[90mUnavailable`))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("underlines the active label", () =>
    Effect.gen(function*() {
      const prompt = Prompt.MultiSelect({
        message: "Pick items",
        choices: [
          { title: "Alpha", value: "alpha" },
          { title: "Beta", value: "beta" },
          { title: "Gamma", value: "gamma" }
        ]
      })

      const fiber = yield* Prompt.run(prompt).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* MockTerminal.inputKey("down")
      yield* Effect.yieldNow

      const output = yield* MockTerminal.displayLines
      const frames = toRawFrames(output)
      const highlightedFrame = [...frames].reverse().find((frame) => frame.includes("Beta"))

      assert.isTrue(highlightedFrame !== undefined)
      assert.isTrue(highlightedFrame?.includes(`${escape}[4m${escape}[96mBeta${escape}[0m`))

      yield* MockTerminal.inputKey("enter")

      const result = yield* Fiber.join(fiber)
      assert.deepStrictEqual(result, [])
    }).pipe(Effect.provide(TestLayer)))
})

describe("Prompt.Custom", () => {
  for (const transition of ["NextFrame", "Submit"] as const) {
    it.effect(`keeps the previous frame visible while rendering ${transition}`, () =>
      Effect.gen(function*() {
        const rendering = yield* Deferred.make<void>()
        const resume = yield* Deferred.make<void>()
        const calls: Array<string> = []
        const clear = `${escape}[2K\r`
        const prompt = Prompt.Custom<number, number>(0, {
          render: (state, action) =>
            Effect.gen(function*() {
              calls.push(`render ${state} ${action._tag}`)
              if (action._tag === transition && (state > 0 || action._tag === "Submit")) {
                yield* Deferred.succeed(rendering, undefined)
                yield* Deferred.await(resume)
              }
              return action._tag === "Submit" ? `Done ${state}` : action._tag === "Beep" ? bell : `Frame ${state}`
            }),
          clear: (state, action) =>
            Effect.sync(() => {
              calls.push(`clear ${state} ${action._tag}`)
              return clear
            }),
          process: (input, state) =>
            Effect.succeed(
              input.key.name === "q"
                ? Action.Submit({ value: 42 })
                : input.key.name === "b"
                ? Action.Beep()
                : Action.NextFrame({ state: state + 1 })
            )
        })

        if (transition === "NextFrame") {
          yield* MockTerminal.inputKey("enter")
          yield* MockTerminal.inputKey("b")
        }
        yield* MockTerminal.inputKey("q")
        const fiber = yield* Prompt.run(prompt).pipe(Effect.forkChild)
        yield* Deferred.await(rendering)

        assert.deepStrictEqual(yield* MockTerminal.displayLines, ["Frame 0"])
        assert.deepStrictEqual(calls, [
          "render 0 NextFrame",
          `clear 0 ${transition}`,
          `render ${transition === "NextFrame" ? 1 : 0} ${transition}`
        ])

        yield* Deferred.succeed(resume, undefined)
        assert.strictEqual(yield* Fiber.join(fiber), 42)
        assert.deepStrictEqual(
          yield* MockTerminal.displayLines,
          transition === "NextFrame"
            ? ["Frame 0", `${clear}Frame 1`, bell, `${clear}Done 1`, `${escape}[?25h`]
            : ["Frame 0", `${clear}Done 0`, `${escape}[?25h`]
        )
      }).pipe(Effect.provide(TestLayer)))
  }

  it.effect("receive handles events from external dequeue", () =>
    Effect.gen(function*() {
      const eventQueue = yield* Queue.make<string>()

      const prompt = Prompt.Custom(
        { count: 0 },
        Queue.asDequeue(eventQueue),
        {
          render: (state) => Effect.succeed(`Count: ${state.count}`),
          process: (input, state) =>
            Match.value(input).pipe(
              Match.tag("Input", () => Effect.succeed(Action.Submit({ value: state.count }))),
              Match.tag("Event", ({ value }) =>
                Effect.succeed(
                  Action.NextFrame({ state: { count: state.count + (value === "tick" ? 1 : 0) } })
                )),
              Match.exhaustive
            ),
          clear: () => Effect.succeed("")
        }
      )

      const fiber = yield* Prompt.run(prompt).pipe(Effect.forkChild)

      // Give the prompt loop time to start and block on the race
      yield* Effect.yieldNow

      // Push two events
      yield* Queue.offer(eventQueue, "tick")
      yield* Effect.yieldNow
      yield* Queue.offer(eventQueue, "tock")
      yield* Effect.yieldNow
      yield* Queue.offer(eventQueue, "tick")
      yield* Effect.yieldNow

      // Submit via keypress
      yield* MockTerminal.inputKey("enter")

      const result = yield* Fiber.join(fiber)
      assert.strictEqual(result, 2)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("falls back to process when no events are pending", () =>
    Effect.gen(function*() {
      const eventQueue = yield* Queue.make<string>()

      const prompt = Prompt.Custom(
        { keys: 0 },
        Queue.asDequeue(eventQueue),
        {
          render: (state) => Effect.succeed(`Keys: ${state.keys}`),
          process: (input, state) =>
            Match.value(input).pipe(
              Match.tag("Input", () => {
                const next = state.keys + 1
                return next >= 3
                  ? Effect.succeed(Action.Submit({ value: next }))
                  : Effect.succeed(Action.NextFrame({ state: { keys: next } }))
              }),
              Match.tag("Event", () => Effect.succeed(Action.NextFrame({ state }))),
              Match.exhaustive
            ),
          clear: () => Effect.succeed("")
        }
      )

      yield* MockTerminal.inputKey("a")
      yield* MockTerminal.inputKey("b")
      yield* MockTerminal.inputKey("c")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, 3)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("Input variant exposes the input field with UserInput", () =>
    Effect.gen(function*() {
      const eventQueue = yield* Queue.make<string>()

      const prompt = Prompt.Custom(
        { captured: "" },
        Queue.asDequeue(eventQueue),
        {
          render: (state) => Effect.succeed(`Captured: ${state.captured}`),
          process: (input, state) =>
            Match.value(input).pipe(
              Match.tag("Input", ({ input: userInput }) => {
                const key = userInput.key.name
                return key === "enter"
                  ? Effect.succeed(Action.Submit({ value: state.captured }))
                  : Effect.succeed(Action.NextFrame({ state: { captured: state.captured + key } }))
              }),
              Match.tag("Event", () => Effect.succeed(Action.NextFrame({ state }))),
              Match.exhaustive
            ),
          clear: () => Effect.succeed("")
        }
      )

      yield* MockTerminal.inputKey("x")
      yield* MockTerminal.inputKey("y")
      yield* MockTerminal.inputKey("enter")

      const result = yield* Prompt.run(prompt)
      assert.strictEqual(result, "xy")
    }).pipe(Effect.provide(TestLayer)))
})
