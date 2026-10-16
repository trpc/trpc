import * as Source from "@effect/doctest/Source"
import { assert, describe, it } from "@effect/vitest"

describe("Source", () => {
  describe("JSDoc", () => {
    it("extracts marked TypeScript fences in source order", () => {
      const source = [
        "/**",
        " * First example.",
        " * ```ts import.meta.vitest name=first",
        " * const first = 1",
        " * ```",
        " */",
        "const first = 1",
        "/**",
        " * ~~~typescript import.meta.vitest name='second example'",
        " * const second = 2",
        " * ~~~",
        " */",
        "const second = 2"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source), [
        { source: "const first = 1", line: 3, name: "first" },
        { source: "const second = 2", line: 9, name: "second example" }
      ])
    })

    it("ignores fences outside JSDoc comments", () => {
      const source = [
        "```ts import.meta.vitest",
        "const outside = true",
        "```",
        "/**",
        " * ```ts import.meta.vitest",
        " * const inside = true",
        " * ```",
        " */"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source), [
        { source: "const inside = true", line: 5, name: undefined }
      ])
    })

    it("ignores unmarked and non-TypeScript fences", () => {
      const source = [
        "/**",
        " * ```ts",
        " * const unmarked = true",
        " * ```",
        " * ```js import.meta.vitest",
        " * const javascript = true",
        " * ```",
        " */"
      ].join("\n")

      assert.isEmpty(Source.extract(source))
    })

    it("preserves assertion comments in snippet source", () => {
      const source = [
        "/**",
        " * ```ts import.meta.vitest",
        " * const value = 1 // => 1",
        " * ```",
        " */"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source), [{
        source: "const value = 1 // => 1",
        line: 2,
        name: undefined
      }])
    })

    it("extracts inline output and ignores explanatory comments", () => {
      const source = [
        "/**",
        " * ```ts import.meta.vitest",
        " * // Explain the output to the reader.",
        " * const value = 0 // ordinary inline comment",
        " * console.log(1) // > 1",
        " * ```",
        " */"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source), [{
        source: [
          "// Explain the output to the reader.",
          "const value = 0 // ordinary inline comment",
          "console.log(1) // > 1"
        ].join("\n"),
        line: 2,
        name: undefined
      }])
    })
  })

  describe("Markdown", () => {
    it("extracts only marked TypeScript fences", () => {
      const source = [
        "# Examples",
        "",
        "```ts",
        "const ignored = true",
        "```",
        "",
        "~~~typescript import.meta.vitest name=example",
        "const value = 1",
        "~~~"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source, "markdown"), [
        { source: "const value = 1", line: 7, name: "example" }
      ])
    })
  })

  describe("MDX", () => {
    it("extracts marked TypeScript fences from mdx content", () => {
      const source = [
        "import { SomeComponent } from './component'",
        "",
        "## Example",
        "",
        "<SomeComponent />",
        "",
        "```ts import.meta.vitest",
        "const result = 42",
        "```"
      ].join("\n")

      assert.deepStrictEqual(Source.extract(source, "markdown"), [
        { source: "const result = 42", line: 7, name: undefined }
      ])
    })
  })
})
