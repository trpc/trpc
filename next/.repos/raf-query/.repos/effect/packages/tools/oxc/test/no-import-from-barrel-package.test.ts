import rule from "@effect/oxc/oxlint/rules/no-import-from-barrel-package"
import { describe, expect, it } from "vitest"
import { runRule } from "./utils.ts"

describe("no-import-from-barrel-package", () => {
  const testOptions = {
    filename: "/test/file.ts",
    cwd: "/test",
    ruleOptions: [{ checkPatterns: ["^effect$"] }]
  }

  const createImportDeclaration = (
    source: string,
    specifiers: Array<unknown>,
    importKind?: "type" | "value"
  ) => {
    const base = {
      type: "ImportDeclaration" as const,
      source: { value: source },
      specifiers,
      range: [0, 50] as [number, number]
    }
    return importKind !== undefined ? { ...base, importKind } : base
  }

  const createNamedSpecifier = (
    name: string,
    local?: string,
    importKind?: "type" | "value"
  ) => {
    const base = {
      type: "ImportSpecifier" as const,
      imported: { type: "Identifier" as const, name },
      local: { name: local ?? name }
    }
    return importKind !== undefined ? { ...base, importKind } : base
  }

  it("should not report for imports from non-barrel packages", () => {
    const node = createImportDeclaration("effect/Effect", [
      createNamedSpecifier("Effect")
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(0)
  })

  it("should report for named imports from effect barrel", () => {
    const node = createImportDeclaration("effect", [
      createNamedSpecifier("Effect")
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe(
      `Use import * as Effect from "effect/Effect" instead`
    )
  })

  it("should report for multiple named imports from effect barrel", () => {
    const node = createImportDeclaration("effect", [
      createNamedSpecifier("Effect"),
      createNamedSpecifier("Option"),
      createNamedSpecifier("Either")
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(3)
  })

  it("should not report for type-only import declarations", () => {
    const node = createImportDeclaration(
      "effect",
      [createNamedSpecifier("Effect")],
      "type"
    )
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(0)
  })

  it("should not report for type imports within named specifiers", () => {
    const node = createImportDeclaration("effect", [
      createNamedSpecifier("Effect", "Effect", "type")
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(0)
  })

  it("should handle aliased imports", () => {
    const node = createImportDeclaration("effect", [
      createNamedSpecifier("Effect", "Eff")
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe(
      `Use import * as Eff from "effect/Effect" instead`
    )
  })

  it("should report for namespace imports from barrel", () => {
    const node = createImportDeclaration("effect", [
      {
        type: "ImportNamespaceSpecifier",
        local: { name: "Effect" }
      }
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe(
      `Do not use namespace import from barrel file "effect", import from specific modules instead`
    )
  })

  it("should not report for namespace imports from module paths", () => {
    const node = createImportDeclaration("effect/Effect", [
      {
        type: "ImportNamespaceSpecifier",
        local: { name: "Effect" }
      }
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(0)
  })

  it("should not report for default imports", () => {
    const node = createImportDeclaration("effect", [
      {
        type: "ImportDefaultSpecifier",
        local: { name: "Effect" }
      }
    ])
    const errors = runRule(rule, "ImportDeclaration", node, testOptions)
    expect(errors).toHaveLength(0)
  })

  describe("configuration", () => {
    it("should match regex patterns", () => {
      const node = createImportDeclaration("@myorg/utils", [
        createNamedSpecifier("helper")
      ])
      // No patterns configured - doesn't match
      const defaultErrors = runRule(rule, "ImportDeclaration", node, testOptions)
      expect(defaultErrors).toHaveLength(0)

      // Pattern matches @myorg/*
      const customErrors = runRule(rule, "ImportDeclaration", node, {
        ...testOptions,
        ruleOptions: [{ checkPatterns: ["^@myorg/"] }]
      })
      expect(customErrors).toHaveLength(1)
    })

    it("should match exact package with pattern", () => {
      const node = createImportDeclaration("lodash", [
        createNamedSpecifier("map")
      ])
      // No patterns - doesn't match
      const defaultErrors = runRule(rule, "ImportDeclaration", node, testOptions)
      expect(defaultErrors).toHaveLength(0)

      // Exact match pattern
      const customErrors = runRule(rule, "ImportDeclaration", node, {
        ...testOptions,
        ruleOptions: [{ checkPatterns: ["^lodash$"] }]
      })
      expect(customErrors).toHaveLength(1)
    })

    it("should disable relative index checking when configured", () => {
      const node = createImportDeclaration("./index.ts", [
        createNamedSpecifier("foo")
      ])
      // Default checks relative imports
      const defaultErrors = runRule(rule, "ImportDeclaration", node, testOptions)
      expect(defaultErrors).toHaveLength(1)

      // Disabled relative checking
      const customErrors = runRule(rule, "ImportDeclaration", node, {
        ...testOptions,
        ruleOptions: [{ checkRelativeIndexImports: false }]
      })
      expect(customErrors).toHaveLength(0)
    })
  })
})
