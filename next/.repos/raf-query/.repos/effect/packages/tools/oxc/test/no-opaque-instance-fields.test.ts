import rule from "@effect/oxc/oxlint/rules/no-opaque-instance-fields"
import { describe, expect, it } from "vitest"
import { createTestContext, runRule } from "./utils.ts"

function runRuleWithNodes(nodes: Array<{ visitor: string; node: unknown }>) {
  const { context, errors } = createTestContext()
  const visitors = rule.create(context as never)
  for (const { visitor, node } of nodes) {
    const handler = visitors[visitor as keyof typeof visitors]
    if (handler) {
      ;(handler as (node: unknown) => void)(node)
    }
  }
  return errors
}

describe("no-opaque-instance-fields", () => {
  const createOpaqueClass = (
    callee: { type: string; name?: string; object?: unknown; property?: unknown },
    members: Array<{ type: string; static: boolean }>
  ) => ({
    type: "ClassDeclaration",
    superClass: {
      type: "CallExpression",
      callee: {
        type: "CallExpression",
        callee
      }
    },
    body: {
      body: members
    }
  })

  const createSchemaOpaqueClass = (members: Array<{ type: string; static: boolean }>) =>
    createOpaqueClass({
      type: "MemberExpression",
      object: { type: "Identifier", name: "Schema" },
      property: { type: "Identifier", name: "Opaque" }
    }, members)

  const createSchemaImport = () => ({
    type: "ImportDeclaration",
    source: { type: "Literal", value: "effect" },
    specifiers: [{
      type: "ImportSpecifier",
      imported: { type: "Identifier", name: "Schema" },
      local: { type: "Identifier", name: "Schema" },
      importKind: "value"
    }],
    importKind: "value"
  })

  const createOpaqueImport = (localName = "Opaque") => ({
    type: "ImportDeclaration",
    source: { type: "Literal", value: "effect/Schema" },
    specifiers: [{
      type: "ImportSpecifier",
      imported: { type: "Identifier", name: "Opaque" },
      local: { type: "Identifier", name: localName },
      importKind: "value"
    }],
    importKind: "value"
  })

  const createSchemaNamespaceImport = (localName = "S") => ({
    type: "ImportDeclaration",
    source: { type: "Literal", value: "effect/Schema" },
    specifiers: [{
      type: "ImportNamespaceSpecifier",
      local: { type: "Identifier", name: localName }
    }],
    importKind: "value"
  })

  const createOtherOpaqueImport = (localName = "Opaque") => ({
    type: "ImportDeclaration",
    source: { type: "Literal", value: "other" },
    specifiers: [{
      type: "ImportSpecifier",
      imported: { type: "Identifier", name: "Opaque" },
      local: { type: "Identifier", name: localName },
      importKind: "value"
    }],
    importKind: "value"
  })

  const createOtherNamespaceImport = (localName = "S") => ({
    type: "ImportDeclaration",
    source: { type: "Literal", value: "other" },
    specifiers: [{
      type: "ImportNamespaceSpecifier",
      local: { type: "Identifier", name: localName }
    }],
    importKind: "value"
  })

  const createRegularClass = (members: Array<{ type: string; static: boolean }>) => ({
    type: "ClassDeclaration",
    superClass: {
      type: "Identifier",
      name: "SomeClass"
    },
    body: {
      body: members
    }
  })

  it("should not report for class without instance fields", () => {
    const node = createSchemaOpaqueClass([])
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(0)
  })

  it("should not report for static fields in Schema.Opaque class", () => {
    const node = createSchemaOpaqueClass([
      { type: "PropertyDefinition", static: true }
    ])
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(0)
  })

  it("should report for instance fields in Schema.Opaque class", () => {
    const node = createSchemaOpaqueClass([
      { type: "PropertyDefinition", static: false }
    ])
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("Classes extending Schema.Opaque must not have instance members")
  })

  it("should not report when Schema.Opaque has no Schema import", () => {
    const node = createSchemaOpaqueClass([
      { type: "PropertyDefinition", static: false }
    ])
    const errors = runRule(rule, "ClassDeclaration", node)
    expect(errors).toHaveLength(0)
  })

  it("should report for instance fields in Opaque class", () => {
    const node = createOpaqueClass(
      { type: "Identifier", name: "Opaque" },
      [{ type: "PropertyDefinition", static: false }]
    )
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createOpaqueImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(1)
  })

  it("should report for instance fields in aliased Opaque class", () => {
    const node = createOpaqueClass(
      {
        type: "MemberExpression",
        object: { type: "Identifier", name: "S" },
        property: { type: "Identifier", name: "Opaque" }
      },
      [{ type: "PropertyDefinition", static: false }]
    )
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaNamespaceImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(1)
  })

  it("should not report for Opaque import from other module", () => {
    const node = createOpaqueClass(
      { type: "Identifier", name: "Opaque" },
      [{ type: "PropertyDefinition", static: false }]
    )
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createOtherOpaqueImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(0)
  })

  it("should not report for namespace Opaque from other module", () => {
    const node = createOpaqueClass(
      {
        type: "MemberExpression",
        object: { type: "Identifier", name: "S" },
        property: { type: "Identifier", name: "Opaque" }
      },
      [{ type: "PropertyDefinition", static: false }]
    )
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createOtherNamespaceImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(0)
  })

  it("should report for multiple instance fields", () => {
    const node = createSchemaOpaqueClass([
      { type: "PropertyDefinition", static: false },
      { type: "PropertyDefinition", static: true },
      { type: "PropertyDefinition", static: false }
    ])
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(2)
  })

  it("should report for instance methods", () => {
    const node = createSchemaOpaqueClass([
      { type: "MethodDefinition", static: false }
    ])
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassDeclaration", node }
    ])
    expect(errors).toHaveLength(1)
  })

  it("should not report for non-Schema.Opaque classes", () => {
    const node = createRegularClass([
      { type: "PropertyDefinition", static: false }
    ])
    const errors = runRule(rule, "ClassDeclaration", node)
    expect(errors).toHaveLength(0)
  })

  it("should work with ClassExpression", () => {
    const node = {
      ...createSchemaOpaqueClass([
        { type: "PropertyDefinition", static: false }
      ]),
      type: "ClassExpression"
    }
    const errors = runRuleWithNodes([
      { visitor: "ImportDeclaration", node: createSchemaImport() },
      { visitor: "ClassExpression", node }
    ])
    expect(errors).toHaveLength(1)
  })

  it("should not report for class without superClass", () => {
    const node = {
      type: "ClassDeclaration",
      body: {
        body: [{ type: "PropertyDefinition", static: false }]
      }
    }
    const errors = runRule(rule, "ClassDeclaration", node)
    expect(errors).toHaveLength(0)
  })

  it("should not report for class with non-CallExpression superClass", () => {
    const node = {
      type: "ClassDeclaration",
      superClass: {
        type: "Identifier",
        name: "BaseClass"
      },
      body: {
        body: [{ type: "PropertyDefinition", static: false }]
      }
    }
    const errors = runRule(rule, "ClassDeclaration", node)
    expect(errors).toHaveLength(0)
  })
})
