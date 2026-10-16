import type { CreateRule, ESTree, Visitor } from "@oxlint/plugins"

const SCHEMA_SOURCES = new Set(["effect", "effect/Schema"])
const SCHEMA_NAMESPACE_SOURCES = new Set(["effect/Schema"])

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow instance members in Schema.Opaque classes" }
  },
  create(context) {
    // Track identifiers that point to Schema or Opaque imported from Schema.
    // Local names that refer to the Schema module (Schema or namespace import).
    // Example: `import { Schema } from "effect"` or `import * as S from "effect/Schema"`.
    const schemaIdentifiers = new Set<string>()
    // Local names that refer to Opaque imported directly from the Schema module.
    // Example: `import { Opaque as MyOpaque } from "effect/Schema"`.
    const opaqueIdentifiers = new Set<string>()

    // Match `class X extends Schema.Opaque(...)` or `class X extends Opaque(...)` when
    // the identifiers are tied to the Schema module via imports.
    function isSchemaOpaqueExtension(node: ESTree.Class): boolean {
      const sc = node.superClass
      if (!sc || sc.type !== "CallExpression") return false
      const inner = sc.callee
      if (!inner || inner.type !== "CallExpression") return false
      return isOpaqueCallee(inner.callee)
    }

    // Validate the outer `Opaque` call, allowing either `Opaque` or `<SchemaNamespace>.Opaque`.
    function isOpaqueCallee(node: ESTree.Expression | null | undefined): boolean {
      if (!node) return false
      if (node.type === "Identifier") return opaqueIdentifiers.has(node.name)
      if (node.type !== "MemberExpression") return false
      if (node.property?.type !== "Identifier" || node.property.name !== "Opaque") return false
      return isSchemaObject(node.object)
    }

    // Ensure `<SchemaNamespace>.Opaque` is actually Schema (imported from Schema module).
    function isSchemaObject(node: ESTree.Expression | null | undefined): boolean {
      if (!node) return false
      if (node.type === "Identifier") return schemaIdentifiers.has(node.name)
      return false
    }

    function checkClass(node: ESTree.Class) {
      if (!isSchemaOpaqueExtension(node)) return
      for (const element of node.body.body) {
        if (element.type === "PropertyDefinition" && !element.static) {
          context.report({
            node: element,
            message: "Classes extending Schema.Opaque must not have instance members"
          })
        } else if (element.type === "MethodDefinition" && !element.static) {
          context.report({
            node: element,
            message: "Classes extending Schema.Opaque must not have instance members"
          })
        }
      }
    }

    return {
      // Record identifiers for Schema/Opaque imports so we don't match unrelated modules.
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === "type") return
        const source = node.source.value
        if (typeof source !== "string" || !SCHEMA_SOURCES.has(source)) return

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            if (SCHEMA_NAMESPACE_SOURCES.has(source)) {
              schemaIdentifiers.add(specifier.local.name)
            }
          } else if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
            if (specifier.imported.type !== "Identifier") continue
            const importedName = specifier.imported.name
            if (importedName === "Schema") {
              schemaIdentifiers.add(specifier.local.name)
            } else if (importedName === "Opaque") {
              opaqueIdentifiers.add(specifier.local.name)
            }
          }
        }
      },
      ClassDeclaration: checkClass,
      ClassExpression: checkClass
    } as Visitor
  }
}

export default rule
