import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError, Redacted, Schema, Stdio } from "effect"
import { Primitive } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"
import { TestConsole } from "effect/testing"
import * as MockTerminal from "./services/MockTerminal.ts"

const ConsoleLayer = TestConsole.layer
const FileSystemLayer = FileSystem.layerNoop({})
const PathLayer = Path.layer
const TerminalLayer = MockTerminal.layer
const StdioLayer = Stdio.layerTest({})
const ChildProcessSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Not implemented"))
)

const TestLayer = Layer.mergeAll(
  ConsoleLayer,
  FileSystemLayer,
  PathLayer,
  TerminalLayer,
  StdioLayer,
  ChildProcessSpawnerLayer
)

// Helper functions to reduce repetition
const expectValidValues = <A>(
  primitive: Primitive.Primitive<A>,
  cases: Array<[string, A]>
) =>
  Effect.gen(function*() {
    for (const [input, expected] of cases) {
      const result = yield* primitive.parse(input)
      assert.strictEqual(result, expected)
    }
  })

const expectInvalidValues = <A>(
  primitive: Primitive.Primitive<A>,
  inputs: ReadonlyArray<string>,
  messages: ReadonlyArray<string>
) =>
  Effect.gen(function*() {
    for (let i = 0; i < inputs.length; i++) {
      const error = yield* Effect.flip(primitive.parse(inputs[i]))
      assert.strictEqual(error, messages[i])
    }
  })

const expectValidDates = (
  primitive: Primitive.Primitive<Date>,
  cases: Array<[string, (date: Date) => void]>
) =>
  Effect.gen(function*() {
    for (const [input, validator] of cases) {
      const result = yield* primitive.parse(input)
      assert.isTrue(result instanceof Date)
      validator(result)
    }
  }) as Effect.Effect<void, string, never>

describe("Primitive", () => {
  describe("Boolean", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse true values correctly", () =>
        expectValidValues(Primitive.Boolean, [
          ["true", true],
          ["1", true],
          ["y", true],
          ["yes", true],
          ["on", true]
        ]))

      it.effect("should parse false values correctly", () =>
        expectValidValues(Primitive.Boolean, [
          ["false", false],
          ["0", false],
          ["n", false],
          ["no", false],
          ["off", false]
        ]))

      it.effect("should fail for invalid values", () =>
        expectInvalidValues(
          Primitive.Boolean,
          ["invalid"],
          [`Expected "true" | "yes" | "on" | "1" | "y" | "false" | "no" | "off" | "0" | "n"`]
        ))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Boolean._tag, "Boolean")
      })
    })
  })

  describe("Finite", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse valid finite numbers", () =>
        expectValidValues(Primitive.Finite, [
          ["42", 42],
          ["3.14", 3.14],
          ["-42.5", -42.5],
          ["0", 0],
          ["1e3", 1000]
        ]))

      it.effect("should fail for invalid values", () =>
        expectInvalidValues(Primitive.Finite, ["not-a-number"], [
          `Expected a string representing a finite number`
        ]))

      it.effect("should reject non-finite numbers and overflow", () =>
        Effect.gen(function*() {
          for (const input of ["NaN", "Infinity", "-Infinity", "1e309"]) {
            const error = yield* Effect.flip(Primitive.Finite.parse(input))
            assert.include(error, "finite number")
          }
        }))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Finite._tag, "Finite")
      })
    })
  })

  describe("Date", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse valid date values", () =>
        expectValidDates(Primitive.Date, [
          // ISO date
          [
            "2024-01-15",
            (date) => {
              assert.strictEqual(date.toISOString().slice(0, 10), "2024-01-15")
            }
          ],
          // Full ISO datetime
          [
            "2024-01-15T12:30:45.123Z",
            (date) => {
              assert.strictEqual(date.toISOString(), "2024-01-15T12:30:45.123Z")
            }
          ],
          // With timezone offset
          [
            "2024-01-15T12:30:45+02:00",
            (date) => {
              assert.strictEqual(date.getUTCHours(), 10)
              assert.strictEqual(date.getUTCMinutes(), 30)
            }
          ]
        ]))

      it.effect("should fail for invalid values", () =>
        expectInvalidValues(Primitive.Date, ["not-a-date"], [`Expected a valid Date`]))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Date._tag, "Date")
      })
    })
  })

  describe("Int", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse valid integer values", () =>
        expectValidValues(Primitive.Int, [
          ["42", 42],
          ["-123", -123],
          ["0", 0],
          ["9007199254740991", 9007199254740991],
          ["1e3", 1000]
        ]))

      it.effect("should fail for invalid values", () =>
        expectInvalidValues(
          Primitive.Int,
          ["3.14", "not-a-number"],
          [`Expected an integer`, `Expected a string representing a finite number`]
        ))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Int._tag, "Int")
      })
    })
  })

  describe("String", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse string values", () =>
        expectValidValues(Primitive.String, [
          ["hello", "hello"],
          ["", ""],
          [" spaces ", " spaces "],
          ["123", "123"],
          ["special!@#$%", "special!@#$%"]
        ]))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.String._tag, "String")
      })
    })
  })

  describe("Choice", () => {
    const colorChoice = Primitive.Choice([
      ["red", "RED"],
      ["green", "GREEN"],
      ["blue", "BLUE"]
    ])

    it.layer(TestLayer)((it) => {
      it.effect("should parse valid choices", () =>
        expectValidValues(colorChoice, [
          ["red", "RED"],
          ["green", "GREEN"],
          ["blue", "BLUE"]
        ]))

      it.effect("should fail for invalid choices", () =>
        expectInvalidValues(
          colorChoice,
          ["yellow", "purple", ""],
          [
            `"red" | "green" | "blue"`,
            `"red" | "green" | "blue"`,
            `"red" | "green" | "blue"`
          ]
        ))

      it("should have correct _tag", () => {
        assert.strictEqual(colorChoice._tag, "Choice")
      })

      const numberChoice = Primitive.Choice([
        ["one", 1],
        ["two", 2],
        ["three", 3]
      ])

      it.effect("should work with different value types", () =>
        expectValidValues(numberChoice, [
          ["one", 1],
          ["two", 2],
          ["three", 3]
        ]))
    })
  })

  describe("Path", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should resolve paths without requiring existence", () =>
        Effect.gen(function*() {
          const pathPrimitive = Primitive.Path("either")
          const result1 = yield* pathPrimitive.parse("./test.txt")
          const result2 = yield* pathPrimitive.parse("/absolute/path")
          const result3 = yield* pathPrimitive.parse("relative/path")

          // Results should be absolute paths
          assert.isTrue(result1.includes("test.txt"))
          assert.isTrue(result2 === "/absolute/path")
          assert.isTrue(result3.includes("relative/path"))
        }))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Path("either")._tag, "Path")
      })

      it.effect("should fail when a required file path does not exist", () =>
        Effect.gen(function*() {
          const filePath = Primitive.Path("file", true)

          // Test non-existent file - should fail validation
          const error = yield* Effect.flip(
            filePath.parse("/non/existent/file.txt")
          )

          assert.strictEqual(error, "Path does not exist: /non/existent/file.txt")
        }).pipe(
          Effect.provide(
            FileSystem.layerNoop({
              stat: (path) =>
                Effect.fail(
                  PlatformError.badArgument({
                    module: "",
                    method: "",
                    description: `The specified path ${path} does not exist`
                  })
                )
            })
          )
        ))

      it.effect("should fail when a required directory path does not exist", () =>
        Effect.gen(function*() {
          const dirPath = Primitive.Path("directory", true)

          // Test non-existent directory - should fail validation
          const error = yield* Effect.flip(
            dirPath.parse("/non/existent/directory")
          )

          assert.strictEqual(error, "Path does not exist: /non/existent/directory")
        }).pipe(
          Effect.provide(
            FileSystem.layerNoop({
              stat: (path) =>
                Effect.fail(
                  PlatformError.badArgument({
                    module: "",
                    method: "",
                    description: `The specified path ${path} does not exist`
                  })
                )
            })
          )
        ))
    })
  })

  describe("Redacted", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should parse and redact values", () =>
        Effect.gen(function*() {
          const result = yield* Primitive.Redacted.parse("secret123")
          // Check if it's a Redacted value
          assert.isTrue(Redacted.isRedacted(result))
          // The toString method should return a redacted representation
          assert.strictEqual(String(result), "<redacted>")
        }))

      it("should have correct _tag", () => {
        assert.strictEqual(Primitive.Redacted._tag, "Redacted")
      })

      it.effect("should handle empty strings", () =>
        Effect.gen(function*() {
          const result = yield* Primitive.Redacted.parse("")
          assert.isTrue(Redacted.isRedacted(result))
        }))
    })
  })

  describe("KeyValuePair", () => {
    it.layer(TestLayer)((it) => {
      it.effect("should preserve '=' in URL query parameters", () =>
        Effect.gen(function*() {
          const url = yield* Primitive.KeyValuePair.parse(
            "DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require"
          )
          assert.deepStrictEqual(url, {
            DATABASE_URL: "postgres://user:pass@host:5432/db?sslmode=require"
          })
        }))

      it.effect("should preserve trailing '=' in padded values", () =>
        Effect.gen(function*() {
          const padded = yield* Primitive.KeyValuePair.parse("TOKEN=YWJjZA==")
          assert.deepStrictEqual(padded, { TOKEN: "YWJjZA==" })
        }))

      it.effect("should fail when the input is malformed", () =>
        expectInvalidValues(
          Primitive.KeyValuePair,
          ["invalid", "=value", "key="],
          [
            "Invalid key=value format. Expected format: key=value, got: invalid",
            "Invalid key=value format. Both key and value must be non-empty. Got: =value",
            "Invalid key=value format. Both key and value must be non-empty. Got: key="
          ]
        ))
    })
  })

  it.effect("file constructors preserve text, parsed content, and schema decoding", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* Primitive.FileText.parse("/config.json"), "{\"enabled\":true}")
      assert.deepStrictEqual(yield* Primitive.FileParse().parse("/config.json"), { enabled: true })
      assert.deepStrictEqual(
        yield* Primitive.FileSchema(Schema.Struct({ enabled: Schema.Boolean })).parse("/config.json"),
        { enabled: true }
      )
      const error = yield* Effect.flip(Primitive.FileSchema(Schema.String).parse("/config.json"))
      assert.include(error, "string")
    }).pipe(
      Effect.provide(FileSystem.layerNoop({
        exists: () => Effect.succeed(true),
        stat: () => Effect.succeed({ type: "File" } as FileSystem.File.Info),
        readFileString: () => Effect.succeed("{\"enabled\":true}")
      })),
      Effect.provide(TestLayer)
    ))

  it("Never has the matching primitive tag", () => {
    assert.strictEqual(Primitive.Never._tag, "Never")
  })

  it.effect("Never remains an always-failing sentinel", () =>
    expectInvalidValues(Primitive.Never, ["value"], ["This option does not accept values"]).pipe(
      Effect.provide(TestLayer)
    ))
})
