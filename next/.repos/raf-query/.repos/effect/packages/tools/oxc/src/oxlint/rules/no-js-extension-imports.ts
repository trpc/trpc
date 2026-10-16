import type { CreateRule, ESTree, Fixer, Visitor } from "@oxlint/plugins"

const jsExtensions = [".js", ".jsx", ".mjs", ".cjs"]
const extensionMap: Record<string, string> = {
  ".js": ".ts",
  ".jsx": ".tsx",
  ".mjs": ".mts",
  ".cjs": ".cts"
}

function isRelativeImport(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../")
}

function getJsExtension(source: string): string | undefined {
  for (const ext of jsExtensions) {
    if (source.endsWith(ext)) {
      return ext
    }
  }
  return undefined
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow .js, .jsx, .mjs and .cjs extensions in relative imports, use .ts, .tsx, .mts or .cts instead"
    },
    fixable: "code"
  },
  create(context) {
    function checkSource(source: ESTree.StringLiteral) {
      const value = source.value
      if (!isRelativeImport(value)) return

      const ext = getJsExtension(value)
      if (!ext) return

      const tsExt = extensionMap[ext]
      const fixedSource = value.slice(0, -ext.length) + tsExt

      context.report({
        node: source,
        message: `Use "${tsExt}" extension instead of "${ext}" for relative imports`,
        fix: (fixer: Fixer) => fixer.replaceTextRange(source.range, JSON.stringify(fixedSource))
      })
    }

    function handleImportDeclaration(node: ESTree.ImportDeclaration) {
      checkSource(node.source)
    }

    function handleExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
      checkSource(node.source)
    }

    function handleExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
      if (node.source) {
        checkSource(node.source)
      }
    }

    return {
      ImportDeclaration: handleImportDeclaration,
      ExportAllDeclaration: handleExportAllDeclaration,
      ExportNamedDeclaration: handleExportNamedDeclaration
    } as Visitor
  }
}

export default rule
