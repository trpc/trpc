import type { MigrationAnnotation } from "@effect/api-diff/Annotations"
import {
  extractImportMapSections,
  markdownSafetyIssues,
  renderMigrationDocument,
  renderMissingAnnotations
} from "@effect/api-diff/MigrationDoc"
import type { ApiChange, ApiDiff } from "@effect/api-diff/Model"
import { assert, describe, it } from "@effect/vitest"

const change = (change: Partial<ApiChange> & Pick<ApiChange, "classification">): ApiChange => ({
  id: `change-${change.classification}-${change.baseApiId ?? change.headApiId}`,
  confidence: 1,
  authoritative: true,
  ...change
})

const diff: ApiDiff = {
  version: 1,
  base: { ref: "v3", sha: "a".repeat(40) },
  head: { ref: "main", sha: "b".repeat(40) },
  changes: [
    change({
      classification: "parameter-removed",
      baseApiId: "effect/Zeta#changed#value",
      headApiId: "effect/Zeta#changed#value",
      before: "declare const changed: (value: string) => string",
      after: "declare const changed: () => string"
    }),
    change({
      classification: "api-renamed",
      baseApiId: "effect/Alpha#oldName#value",
      headApiId: "effect/Alpha#newName#value"
    }),
    change({ classification: "api-removed", baseApiId: "effect/Alpha#oldName#value" }),
    change({
      classification: "api-removed",
      baseApiId: "effect/Beta#removed#value",
      before: "declare const removed: string"
    }),
    change({
      classification: "api-moved",
      baseApiId: "effect/Legacy#keptName#value",
      headApiId: "effect/Current#keptName#value"
    }),
    change({ classification: "api-removed", baseApiId: "effect/Legacy#keptName#value" }),
    change({ classification: "documentation-changed", baseApiId: "effect/Zeta#documented#value" }),
    change({
      classification: "parameter-added",
      baseApiId: "effect/Zeta#optional#value",
      headApiId: "effect/Zeta#optional#value",
      delta: {
        before: [],
        after: [{ name: "options", type: { kind: "primitive", name: "string" }, optional: true, rest: false }]
      }
    }),
    change({ classification: "api-added", headApiId: "effect/Zeta#added#value" })
  ]
}

const annotations = new Map<string, MigrationAnnotation>([
  ["effect/Alpha#oldName", {
    replacement: "Alpha.newName",
    note: "Use the renamed function."
  }]
])

describe("migration document", () => {
  it("renders the selected API changes deterministically", () => {
    const document = renderMigrationDocument(
      diff,
      annotations,
      "## Import Map\n\n```text\neffect/Alpha -> effect/Alpha\n```\n"
    )

    assert.strictEqual(
      document,
      [
        "<!-- dprint-ignore-file -->",
        "",
        "# v3 to v4 Migration Reference",
        "",
        `Base: \`v3\` (\`${"a".repeat(40)}\`)`,
        "",
        `Head: \`main\` (\`${"b".repeat(40)}\`)`,
        "",
        "This file is generated from the API diff and `migration/annotations/*.yaml`.",
        "",
        "## Import Map",
        "",
        "```text",
        "effect/Alpha -> effect/Alpha",
        "```",
        "",
        "## Removed Modules",
        "",
        "No modules were removed.",
        "",
        "## API Reference",
        "",
        "### `effect/Alpha`",
        "",
        "- `Alpha.oldName` -> `Alpha.newName`: Use the renamed function.",
        "",
        "### `effect/Beta`",
        "",
        "- `Beta.removed`: TODO: needs guidance",
        "",
        "### `effect/Zeta`",
        "",
        "- `Zeta.changed`: TODO: needs guidance",
        ""
      ].join("\n")
    )
    assert(!document.includes("keptName"))
    assert(!document.includes("documented"))
    assert(!document.includes("optional"))
    assert(!document.includes("added"))
  })

  it("lists unannotated ids grouped by module", () => {
    assert.strictEqual(
      renderMissingAnnotations(diff, annotations),
      "effect/Beta:\n  - effect/Beta#removed\neffect/Zeta:\n  - effect/Zeta#changed\n"
    )
  })

  it("renders guidance and examples for detailed changes", () => {
    const document = renderMigrationDocument(
      diff,
      new Map([...annotations, ["effect/Zeta#changed", {
        replacement: "Zeta.changed()",
        note: "Call the zero-argument form.",
        example: "Zeta.changed()"
      }]]),
      "## Import Map\n"
    )

    assert(document.includes("**Replacement:** `Zeta.changed()`"))
    assert(document.includes("Call the zero-argument form."))
    assert(document.includes("**Example**\n\n```ts\nZeta.changed()\n```"))
    assert(!document.includes("**Before**"))
    assert(!document.includes("**After**"))
  })

  it.each([
    { name: "plain", example: "const value = 1", fence: "```" },
    { name: "empty", example: "", fence: "```" },
    { name: "single backticks", example: "const value = `text`", fence: "```" },
    { name: "double backticks", example: "// ``literal``", fence: "```" },
    { name: "triple backticks", example: "/*\n```text\nliteral\n```\n*/", fence: "````" },
    { name: "four backticks", example: "/*\n````text\nliteral\n````\n*/", fence: "`````" },
    { name: "longest run last", example: "const value = `text`\n/*\n```\n`````\n*/", fence: "``````" },
    { name: "whitespace", example: "\n  const value = 1  \n\n", fence: "```" },
    { name: "many backtick runs", example: "// ` ".repeat(400_000), fence: "```" }
  ])("preserves example framing: $name", ({ example, fence }) => {
    const document = renderMigrationDocument(
      diff,
      new Map([...annotations, ["effect/Zeta#changed", {
        replacement: "Zeta.changed()",
        note: "Call the zero-argument form.",
        example
      }]]),
      "## Import Map\n"
    )

    assert.strictEqual(document.split("**Example**\n\n")[1], `${fence}ts\n${example}\n${fence}\n`)
    assert.deepStrictEqual(markdownSafetyIssues(document), [])
  })

  it.each([
    { name: "compact", example: undefined },
    { name: "detailed", example: "Zeta.changed()" }
  ])("renders replacements with many backtick runs in $name entries", ({ example }) => {
    const replacement = "// ` ".repeat(400_000)
    const document = renderMigrationDocument(
      diff,
      new Map([...annotations, ["effect/Zeta#changed", {
        replacement,
        note: "Use the replacement.",
        example
      }]]),
      "## Import Map\n"
    )

    assert(document.includes("``" + replacement + "``"))
    assert.deepStrictEqual(markdownSafetyIssues(document), [])
  })

  it("escapes annotation prose while preserving inline code and fenced examples", () => {
    const document = renderMigrationDocument(
      diff,
      new Map([...annotations, ["effect/Zeta#changed", {
        replacement: "Zeta.changed()",
        note: "Use ~effect/Zeta with Effect<A, E>, *literal*, snake_case, `Context.Context<R>`, and a bare ` marker.",
        example: "const marker = `~effect/Zeta<*>`"
      }]]),
      "## Import Map\n"
    )

    assert(document.includes(
      "Use \\~effect/Zeta with Effect\\<A, E\\>, \\*literal\\*, snake\\_case, `Context.Context<R>`, and a bare \\` marker."
    ))
    assert(document.includes("```ts\nconst marker = `~effect/Zeta<*>`\n```"))
    assert.deepStrictEqual(markdownSafetyIssues(document), [])
    assert.deepStrictEqual(markdownSafetyIssues("Unsafe ~~note and Effect<A>"), [
      "line 1: unescaped \"~\"",
      "line 1: unescaped \"~\"",
      "line 1: unescaped \"<\""
    ])
  })

  it("retains annotated removals that also have move suggestions", () => {
    const serviceDiff: ApiDiff = {
      ...diff,
      changes: [
        change({
          classification: "api-moved",
          baseApiId: "effect/Effect#Service#value",
          headApiId: "effect/Context#Service#value",
          authoritative: false
        }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Effect#Service#value",
          before: "declare const Service: unknown"
        })
      ]
    }
    const document = renderMigrationDocument(
      serviceDiff,
      new Map([["effect/Effect#Service", {
        replacement: "Context.Service",
        note: "Use the v4 service constructor."
      }]]),
      "## Import Map\n"
    )

    assert(document.includes("- `Effect.Service` -> `Context.Service`: Use the v4 service constructor."))
  })

  it("renders removed modules and omits unchanged APIs moved with them", () => {
    const moduleDiff: ApiDiff = {
      ...diff,
      changes: [
        change({ classification: "module-removed", delta: { from: "effect/Legacy", to: [] } }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Legacy#unchanged#value",
          before: "declare const unchanged: string"
        }),
        change({
          classification: "api-added",
          headApiId: "effect/Current#unchanged#value",
          after: "declare const unchanged: string"
        }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Legacy#changed#value",
          before: "declare const changed: string"
        }),
        change({
          classification: "api-added",
          headApiId: "effect/Current#changed#value",
          after: "declare const changed: number"
        })
      ]
    }
    const document = renderMigrationDocument(
      moduleDiff,
      new Map([["effect/Legacy#changed", {
        replacement: "Current.changed",
        note: "Use the changed API."
      }]]),
      "## Import Map\n\neffect/Legacy -> effect/Current\n"
    )

    assert(document.includes("## Removed Modules\n\n- `effect/Legacy` -> `effect/Current`"))
    assert(!document.includes("Legacy.unchanged"))
    assert(document.includes("- `Legacy.changed` -> `Current.changed`: Use the changed API."))
    assert.strictEqual(
      extractImportMapSections(document),
      "## Import Map\n\neffect/Legacy -> effect/Current\n"
    )
  })

  it.each(["LF", "CRLF", "mixed"])("preserves %s import-map replacement guidance", (ending) => {
    const moduleDiff: ApiDiff = {
      ...diff,
      changes: [
        change({ classification: "module-removed", delta: { from: "effect/Legacy", to: [] } }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Legacy#unchanged#value",
          before: "declare const unchanged: string"
        }),
        change({
          classification: "api-added",
          headApiId: "effect/Current#unchanged#value",
          after: "declare const unchanged: string"
        })
      ]
    }
    const eol = ending === "LF" ? "\n" : "\r\n"
    const authored = [
      "## Import Map",
      "",
      "```text",
      "effect/Legacy -> effect/Other",
      "effect/Legacy -> effect/Current (barrel: effect)",
      "effect/Legacy -> effect/Current",
      "```",
      "",
      "## No Counterpart Imports",
      "",
      "None."
    ].join(eol)
    const section = ending === "mixed" ? authored.replace("## Import Map\r\n", "## Import Map\n") : authored
    const importMap = extractImportMapSections(
      `# Existing reference${eol}${section}${eol}${eol}## Removed Modules${eol}Old guidance.`
    )
    const moduleAnnotations = new Map<string, MigrationAnnotation>()
    const document = renderMigrationDocument(moduleDiff, moduleAnnotations, importMap)

    assert.strictEqual(importMap, `${section}\n`)
    assert.strictEqual(extractImportMapSections(document), importMap)
    assert(document.includes("## Removed Modules\n\n- `effect/Legacy` -> `effect/Other`, `effect/Current`\n"))
    assert(!document.includes("Legacy.unchanged"))
    assert.strictEqual(
      renderMissingAnnotations(moduleDiff, moduleAnnotations, importMap),
      "All migration APIs and removed modules have guidance.\n"
    )
  })

  it("uses exact removed-module guidance for APIs without replacements", () => {
    const moduleDiff: ApiDiff = {
      ...diff,
      changes: [
        change({ classification: "module-removed", delta: { from: "effect/Legacy", to: [] } }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Legacy#removed#value",
          before: "declare const removed: string"
        }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Legacy#replaced#value",
          before: "declare const replaced: string"
        }),
        change({
          classification: "api-removed",
          baseApiId: "effect/LegacyExtra#removed#value",
          before: "declare const removed: string"
        }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Current#removed#value",
          before: "declare const removed: string"
        })
      ]
    }
    const moduleAnnotations = new Map<string, MigrationAnnotation>([
      ["effect/Legacy", {
        replacement: "none",
        note: "The module was removed."
      }],
      ["effect/Legacy#replaced", {
        replacement: "Current.replaced",
        note: "Use the replacement."
      }],
      ["effect/LegacyExtra#removed", {
        replacement: "none",
        note: "This similarly prefixed module still exists."
      }],
      ["effect/Current#removed", {
        replacement: "none",
        note: "This module still exists."
      }]
    ])
    const document = renderMigrationDocument(moduleDiff, moduleAnnotations, "## Import Map\n")

    assert(document.includes("- `effect/Legacy` -> `none`: The module was removed."))
    assert(!document.includes("Legacy.removed"))
    assert(document.includes("- `Legacy.replaced` -> `Current.replaced`: Use the replacement."))
    assert(document.includes("- `LegacyExtra.removed` -> `none`: This similarly prefixed module still exists."))
    assert(document.includes("- `Current.removed` -> `none`: This module still exists."))
    assert.strictEqual(
      renderMissingAnnotations(moduleDiff, moduleAnnotations),
      "All migration APIs and removed modules have guidance.\n"
    )
  })

  it("keeps removals from relocated modules and modules without module guidance", () => {
    const moduleDiff: ApiDiff = {
      ...diff,
      changes: [
        change({ classification: "module-removed", delta: { from: "effect/Relocated", to: [] } }),
        change({ classification: "module-removed", delta: { from: "effect/Unguided", to: [] } }),
        change({ classification: "api-removed", baseApiId: "effect/Relocated#removed#value" }),
        change({ classification: "api-removed", baseApiId: "effect/Unguided#removed#value" })
      ]
    }
    const moduleAnnotations = new Map<string, MigrationAnnotation>([
      ["effect/Relocated", {
        replacement: "effect/Current",
        note: "The module moved."
      }],
      ["effect/Relocated#removed", {
        replacement: "none",
        note: "This API was not moved."
      }],
      ["effect/Unguided#removed", {
        replacement: "none",
        note: "This API was removed."
      }]
    ])
    const document = renderMigrationDocument(moduleDiff, moduleAnnotations, "## Import Map\n")

    assert(document.includes("- `effect/Relocated` -> `effect/Current`: The module moved."))
    assert(document.includes("- `Relocated.removed` -> `none`: This API was not moved."))
    assert(document.includes("- `Unguided.removed` -> `none`: This API was removed."))
    assert.strictEqual(
      renderMissingAnnotations(moduleDiff, moduleAnnotations),
      "All migration APIs and removed modules have guidance.\n"
    )
  })

  it("uses per-API annotations for split modules and reports missing module guidance", () => {
    const moduleDiff: ApiDiff = {
      ...diff,
      changes: [
        change({ classification: "module-removed", delta: { from: "effect/Split", to: [] } }),
        change({ classification: "module-removed", delta: { from: "effect/Unknown", to: [] } }),
        change({
          classification: "api-removed",
          baseApiId: "effect/Split#removed#value",
          before: "declare const removed: string"
        })
      ]
    }
    const splitAnnotations = new Map([["effect/Split#removed", {
      replacement: "Current.removed",
      note: "Use the split replacement."
    }]])
    const document = renderMigrationDocument(moduleDiff, splitAnnotations, "## Import Map\n")

    assert(
      document.includes("- `effect/Split`: No single module replacement; follow the curated per-API guidance below.")
    )
    assert(document.includes("- `effect/Unknown`: TODO: needs module guidance"))
    assert.strictEqual(
      renderMissingAnnotations(moduleDiff, splitAnnotations),
      "Removed modules:\n  - effect/Unknown\n"
    )
  })
})
