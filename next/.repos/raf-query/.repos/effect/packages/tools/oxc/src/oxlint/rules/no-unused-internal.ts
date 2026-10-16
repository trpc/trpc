import type { CreateRule, ESTree, Visitor } from "@oxlint/plugins"
import * as fs from "node:fs"
import * as path from "node:path"
import ts from "typescript"

interface InternalExport {
  readonly fileName: string
  readonly declaration: ts.Node
  readonly name: string
  readonly range: readonly [number, number]
  used: boolean
}

interface Diagnostic {
  readonly fileName: string
  readonly range: readonly [number, number]
  readonly message: string
}

interface Analysis {
  readonly diagnosticsByFile: ReadonlyMap<string, ReadonlyArray<Diagnostic>>
}

interface ImportBinding {
  readonly fileName: string
  readonly importedName: string
}

interface FileInfo {
  readonly fileName: string
  readonly sourceFile: ts.SourceFile
  readonly imports: Map<string, ImportBinding>
  readonly namespaceImports: Map<string, string>
  readonly internalExports: Map<string, Array<InternalExport>>
  readonly publicDeclarations: Array<ts.Node>
}

const cache = new Map<string, Analysis>()
const sourceExtensions = new Set([".ts"])

function getCwd(context: { readonly cwd?: string; getCwd?: () => string }): string {
  return context.cwd ?? context.getCwd?.() ?? process.cwd()
}

function normalizePathName(filename: string): string {
  return path.resolve(filename).split(path.sep).join("/")
}

function rangeNode(range: readonly [number, number]): ESTree.Node {
  return { range: [range[0], range[1]] } as ESTree.Node
}

function isSourceFile(fileName: string): boolean {
  return sourceExtensions.has(path.extname(fileName)) && !fileName.endsWith(".d.ts")
}

function findSourceFiles(cwd: string): Array<string> {
  const packagesDir = path.join(cwd, "packages")
  if (!fs.existsSync(packagesDir)) return []

  const files: Array<string> = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "dist" && entry.name !== "build" && entry.name !== "node_modules") {
          visit(entryPath)
        }
      } else if (entry.isFile() && isSourceFile(entryPath) && normalizePathName(entryPath).includes("/src/")) {
        files.push(entryPath)
      }
    }
  }

  visit(packagesDir)
  return files
}

function findWorkspacePackages(cwd: string): Map<string, string> {
  const packagesDir = path.join(cwd, "packages")
  const packages = new Map<string, string>()
  if (!fs.existsSync(packagesDir)) return packages

  const visit = (directory: string) => {
    const packageJson = path.join(directory, "package.json")
    if (fs.existsSync(packageJson)) {
      try {
        const json = JSON.parse(fs.readFileSync(packageJson, "utf8")) as { readonly name?: unknown }
        if (typeof json.name === "string") {
          packages.set(json.name, directory)
        }
      } catch {
        // Ignore malformed package metadata; TypeScript will report that elsewhere.
      }
      return
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build") {
        visit(path.join(directory, entry.name))
      }
    }
  }

  visit(packagesDir)
  return packages
}

function resolveSourceFile(basePath: string): string | undefined {
  const candidates = path.extname(basePath) === ".ts"
    ? [basePath]
    : [basePath, `${basePath}.ts`, path.join(basePath, "index.ts")]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && isSourceFile(candidate)) {
      return normalizePathName(candidate)
    }
  }
  return undefined
}

function resolveModule(
  source: string,
  containingFile: string,
  workspacePackages: ReadonlyMap<string, string>
): string | undefined {
  if (source.startsWith("./") || source.startsWith("../")) {
    return resolveSourceFile(path.resolve(path.dirname(containingFile), source))
  }

  let packageName: string | undefined
  for (const name of workspacePackages.keys()) {
    if (source === name || source.startsWith(`${name}/`)) {
      if (packageName === undefined || name.length > packageName.length) {
        packageName = name
      }
    }
  }
  if (packageName === undefined) return undefined

  const packageRoot = workspacePackages.get(packageName)
  if (packageRoot === undefined) return undefined

  if (source === packageName) {
    return resolveSourceFile(path.join(packageRoot, "src", "index.ts"))
  }

  const subpath = source.slice(packageName.length + 1)
  return resolveSourceFile(path.join(packageRoot, "src", subpath))
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
}

function hasExportModifier(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword)
}

function hasPrivateOrProtectedModifier(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.PrivateKeyword) || hasModifier(node, ts.SyntaxKind.ProtectedKeyword)
}

function hasInternalJSDoc(node: ts.Node): boolean {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.getText() === "internal")
}

function hasInternalApiJSDoc(node: ts.Node): boolean {
  if (hasInternalJSDoc(node)) return true
  if (ts.isVariableDeclaration(node)) {
    return hasInternalJSDoc(node.parent.parent)
  }
  if (ts.isBindingElement(node) && ts.isVariableDeclaration(node.parent.parent)) {
    return hasInternalJSDoc(node.parent.parent.parent)
  }
  return false
}

function isInternalPath(fileName: string): boolean {
  return /\/src\/(?:.*\/)?internal\//.test(normalizePathName(fileName))
}

function collectBindingNames(name: ts.BindingName, out: Array<ts.Identifier>) {
  if (ts.isIdentifier(name)) {
    out.push(name)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingNames(element.name, out)
    }
  }
}

function getTopLevelDeclarationNameNodes(node: ts.Node): Array<ts.Identifier> {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return [node.name]
  }

  if (ts.isVariableStatement(node)) {
    const names: Array<ts.Identifier> = []
    for (const declaration of node.declarationList.declarations) {
      collectBindingNames(declaration.name, names)
    }
    return names
  }

  return []
}

function getDeclarationForName(node: ts.Node, name: ts.Identifier): ts.Node {
  if (!ts.isVariableStatement(node)) return node

  let result: ts.Node = node
  const visit = (current: ts.Node) => {
    if (ts.isVariableDeclaration(current) || ts.isBindingElement(current)) {
      const names: Array<ts.Identifier> = []
      collectBindingNames(current.name, names)
      if (names.includes(name)) {
        result = current
        return
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node.declarationList)
  return result
}

function isImportOrExportBinding(identifier: ts.Identifier): boolean {
  const parent = identifier.parent
  return (ts.isImportSpecifier(parent) && (parent.name === identifier || parent.propertyName === identifier)) ||
    (ts.isImportClause(parent) && parent.name === identifier) ||
    (ts.isNamespaceImport(parent) && parent.name === identifier) ||
    (ts.isExportSpecifier(parent) && (parent.name === identifier || parent.propertyName === identifier))
}

function isDeclarationName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent
  return (ts.isVariableDeclaration(parent) && parent.name === identifier) ||
    (ts.isBindingElement(parent) && parent.name === identifier) ||
    (ts.isParameter(parent) && parent.name === identifier) ||
    (ts.isFunctionDeclaration(parent) && parent.name === identifier) ||
    (ts.isClassDeclaration(parent) && parent.name === identifier) ||
    (ts.isInterfaceDeclaration(parent) && parent.name === identifier) ||
    (ts.isTypeAliasDeclaration(parent) && parent.name === identifier) ||
    (ts.isEnumDeclaration(parent) && parent.name === identifier) ||
    (ts.isEnumMember(parent) && parent.name === identifier) ||
    (ts.isModuleDeclaration(parent) && parent.name === identifier)
}

function isNonReferenceName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent
  return isImportOrExportBinding(identifier) ||
    isDeclarationName(identifier) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isPropertyDeclaration(parent) && parent.name === identifier) ||
    (ts.isPropertySignature(parent) && parent.name === identifier) ||
    (ts.isMethodDeclaration(parent) && parent.name === identifier) ||
    (ts.isMethodSignature(parent) && parent.name === identifier) ||
    (ts.isGetAccessorDeclaration(parent) && parent.name === identifier) ||
    (ts.isSetAccessorDeclaration(parent) && parent.name === identifier)
}

function isInside(node: ts.Node, container: ts.Node): boolean {
  if (node.getSourceFile() !== container.getSourceFile()) return false
  return node.getStart() >= container.getStart() && node.getEnd() <= container.getEnd()
}

function getExports(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileName: string | undefined,
  exportName: string
): ReadonlyArray<InternalExport> {
  if (fileName === undefined) return []
  return fileInfos.get(fileName)?.internalExports.get(exportName) ?? []
}

function getReExportedInternals(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  workspacePackages: ReadonlyMap<string, string>,
  specifier: ts.ExportSpecifier
): ReadonlyArray<InternalExport> {
  const exportDeclaration = specifier.parent.parent
  const importedName = (specifier.propertyName ?? specifier.name).text
  if (
    exportDeclaration.moduleSpecifier !== undefined &&
    ts.isStringLiteral(exportDeclaration.moduleSpecifier)
  ) {
    const importedFile = resolveModule(
      exportDeclaration.moduleSpecifier.text,
      fileInfo.sourceFile.fileName,
      workspacePackages
    )
    return getExports(fileInfos, importedFile, importedName)
  }

  const imported = fileInfo.imports.get(importedName)
  return [
    ...(fileInfo.internalExports.get(importedName) ?? []),
    ...getExports(fileInfos, imported?.fileName, imported?.importedName ?? "")
  ]
}

function markUsed(exports: ReadonlyArray<InternalExport>, node: ts.Node) {
  for (const internal of exports) {
    if (!isInside(node, internal.declaration)) {
      internal.used = true
    }
  }
}

function addFileDiagnostic(
  diagnosticsByFile: Map<string, Array<Diagnostic>>,
  diagnostic: Diagnostic
) {
  const normalized = normalizePathName(diagnostic.fileName)
  const diagnostics = diagnosticsByFile.get(normalized) ?? []
  diagnostics.push(diagnostic)
  diagnosticsByFile.set(normalized, diagnostics)
}

function addInternalExport(fileInfo: FileInfo, internal: InternalExport) {
  const exports = fileInfo.internalExports.get(internal.name) ?? []
  exports.push(internal)
  fileInfo.internalExports.set(internal.name, exports)
}

function collectFileInfo(
  sourceFile: ts.SourceFile,
  workspacePackages: ReadonlyMap<string, string>
): FileInfo {
  const fileInfo: FileInfo = {
    fileName: normalizePathName(sourceFile.fileName),
    sourceFile,
    imports: new Map(),
    namespaceImports: new Map(),
    internalExports: new Map(),
    publicDeclarations: []
  }
  const publicDeclarationSet = new Set<ts.Node>()
  const isInternalFile = isInternalPath(sourceFile.fileName)

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const importedFile = resolveModule(statement.moduleSpecifier.text, sourceFile.fileName, workspacePackages)
      const importClause = statement.importClause
      if (importedFile === undefined || importClause === undefined) continue

      if (importClause.name !== undefined) {
        fileInfo.imports.set(importClause.name.text, { fileName: importedFile, importedName: "default" })
      }

      const namedBindings = importClause.namedBindings
      if (namedBindings === undefined) continue
      if (ts.isNamespaceImport(namedBindings)) {
        fileInfo.namespaceImports.set(namedBindings.name.text, importedFile)
      } else {
        for (const specifier of namedBindings.elements) {
          const importedName = (specifier.propertyName ?? specifier.name).text
          fileInfo.imports.set(specifier.name.text, { fileName: importedFile, importedName })
        }
      }
      continue
    }

    if (
      !isInternalFile &&
      ts.isExportDeclaration(statement) &&
      !hasInternalApiJSDoc(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      fileInfo.publicDeclarations.push(statement)
      continue
    }

    if (!hasExportModifier(statement)) continue

    const names = getTopLevelDeclarationNameNodes(statement)
    if (names.length === 0) continue

    const statementIsInternal = hasInternalApiJSDoc(statement)
    for (const name of names) {
      const declaration = getDeclarationForName(statement, name)
      const declarationIsInternal = statementIsInternal || hasInternalApiJSDoc(declaration)
      if (declarationIsInternal) {
        addInternalExport(fileInfo, {
          fileName: sourceFile.fileName,
          declaration,
          name: name.text,
          range: [name.getStart(sourceFile), name.getEnd()],
          used: false
        })
      } else if (!isInternalFile && !publicDeclarationSet.has(statement)) {
        fileInfo.publicDeclarations.push(statement)
        publicDeclarationSet.add(statement)
      }
    }
  }

  return fileInfo
}

function markNamespaceReference(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  namespace: ts.Identifier,
  name: ts.Identifier
) {
  const importedFile = fileInfo.namespaceImports.get(namespace.text)
  markUsed(getExports(fileInfos, importedFile, name.text), name)
}

function scanUsage(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  workspacePackages: ReadonlyMap<string, string>
) {
  const visit = (node: ts.Node) => {
    if (ts.isExportSpecifier(node)) {
      markUsed(getReExportedInternals(fileInfos, fileInfo, workspacePackages, node), node)
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
      markNamespaceReference(fileInfos, fileInfo, node.expression, node.name)
    } else if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
      markNamespaceReference(fileInfos, fileInfo, node.left, node.right)
    } else if (ts.isIdentifier(node) && !isNonReferenceName(node)) {
      markUsed(fileInfo.internalExports.get(node.text) ?? [], node)
      const imported = fileInfo.imports.get(node.text)
      markUsed(getExports(fileInfos, imported?.fileName, imported?.importedName ?? ""), node)
    }
    ts.forEachChild(node, visit)
  }
  visit(fileInfo.sourceFile)
}

function findInternalReferences(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  node: ts.Node
) {
  const visit = (current: ts.Node) => {
    if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression)) {
      const importedFile = fileInfo.namespaceImports.get(current.expression.text)
      for (const internal of getExports(fileInfos, importedFile, current.name.text)) {
        diagnostics.push({
          fileName: fileInfo.fileName,
          range: [current.name.getStart(), current.name.getEnd()],
          message: `Do not reference @internal export "${internal.name}" in a public exported type signature`
        })
      }
    } else if (ts.isQualifiedName(current) && ts.isIdentifier(current.left)) {
      const importedFile = fileInfo.namespaceImports.get(current.left.text)
      for (const internal of getExports(fileInfos, importedFile, current.right.text)) {
        diagnostics.push({
          fileName: fileInfo.fileName,
          range: [current.right.getStart(), current.right.getEnd()],
          message: `Do not reference @internal export "${internal.name}" in a public exported type signature`
        })
      }
    } else if (ts.isIdentifier(current) && !isNonReferenceName(current)) {
      const localExports = fileInfo.internalExports.get(current.text) ?? []
      const imported = fileInfo.imports.get(current.text)
      const importedExports = getExports(fileInfos, imported?.fileName, imported?.importedName ?? "")

      for (const internal of [...localExports, ...importedExports]) {
        diagnostics.push({
          fileName: fileInfo.fileName,
          range: [current.getStart(), current.getEnd()],
          message: `Do not reference @internal export "${internal.name}" in a public exported type signature`
        })
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
}

function scanTypeParameters(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
) {
  if (typeParameters === undefined) return
  for (const typeParameter of typeParameters) {
    if (typeParameter.constraint !== undefined) {
      findInternalReferences(fileInfos, fileInfo, diagnostics, typeParameter.constraint)
    }
    if (typeParameter.default !== undefined) {
      findInternalReferences(fileInfos, fileInfo, diagnostics, typeParameter.default)
    }
  }
}

function scanParameterTypes(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  parameters: ts.NodeArray<ts.ParameterDeclaration>
) {
  for (const parameter of parameters) {
    if (parameter.type !== undefined) {
      findInternalReferences(fileInfos, fileInfo, diagnostics, parameter.type)
    }
  }
}

function scanFunctionLikeSignature(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  node: ts.SignatureDeclarationBase
) {
  scanTypeParameters(fileInfos, fileInfo, diagnostics, node.typeParameters)
  scanParameterTypes(fileInfos, fileInfo, diagnostics, node.parameters)
  if (node.type !== undefined) {
    findInternalReferences(fileInfos, fileInfo, diagnostics, node.type)
  }
}

function scanClassMemberSignature(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  member: ts.ClassElement
) {
  if (hasInternalJSDoc(member)) return
  if (hasPrivateOrProtectedModifier(member)) return
  if (
    ts.isMethodDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)
  ) {
    scanFunctionLikeSignature(fileInfos, fileInfo, diagnostics, member)
  } else if (ts.isPropertyDeclaration(member) && member.type !== undefined) {
    findInternalReferences(fileInfos, fileInfo, diagnostics, member.type)
  }
}

function scanInterfaceMemberSignature(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  member: ts.TypeElement
) {
  if (hasInternalJSDoc(member)) return
  if (
    ts.isMethodSignature(member) || ts.isCallSignatureDeclaration(member) || ts.isConstructSignatureDeclaration(member)
  ) {
    scanFunctionLikeSignature(fileInfos, fileInfo, diagnostics, member)
  } else if (ts.isPropertySignature(member) && member.type !== undefined) {
    findInternalReferences(fileInfos, fileInfo, diagnostics, member.type)
  } else if (ts.isIndexSignatureDeclaration(member)) {
    scanFunctionLikeSignature(fileInfos, fileInfo, diagnostics, member)
  }
}

function scanPublicSignature(
  fileInfos: ReadonlyMap<string, FileInfo>,
  fileInfo: FileInfo,
  diagnostics: Array<Diagnostic>,
  node: ts.Node,
  workspacePackages: ReadonlyMap<string, string>
) {
  if (ts.isFunctionDeclaration(node)) {
    scanFunctionLikeSignature(fileInfos, fileInfo, diagnostics, node)
  } else if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (declaration.type !== undefined) {
        findInternalReferences(fileInfos, fileInfo, diagnostics, declaration.type)
      }
    }
  } else if (ts.isTypeAliasDeclaration(node)) {
    scanTypeParameters(fileInfos, fileInfo, diagnostics, node.typeParameters)
    findInternalReferences(fileInfos, fileInfo, diagnostics, node.type)
  } else if (ts.isInterfaceDeclaration(node)) {
    scanTypeParameters(fileInfos, fileInfo, diagnostics, node.typeParameters)
    for (const heritage of node.heritageClauses ?? []) {
      for (const type of heritage.types) {
        findInternalReferences(fileInfos, fileInfo, diagnostics, type)
      }
    }
    for (const member of node.members) {
      scanInterfaceMemberSignature(fileInfos, fileInfo, diagnostics, member)
    }
  } else if (ts.isClassDeclaration(node)) {
    scanTypeParameters(fileInfos, fileInfo, diagnostics, node.typeParameters)
    for (const heritage of node.heritageClauses ?? []) {
      for (const type of heritage.types) {
        findInternalReferences(fileInfos, fileInfo, diagnostics, type)
      }
    }
    for (const member of node.members) {
      scanClassMemberSignature(fileInfos, fileInfo, diagnostics, member)
    }
  } else if (
    ts.isExportDeclaration(node) &&
    node.exportClause !== undefined &&
    ts.isNamedExports(node.exportClause)
  ) {
    for (const specifier of node.exportClause.elements) {
      for (const internal of getReExportedInternals(fileInfos, fileInfo, workspacePackages, specifier)) {
        const name = specifier.propertyName ?? specifier.name
        diagnostics.push({
          fileName: fileInfo.fileName,
          range: [name.getStart(), name.getEnd()],
          message: `Do not re-export @internal export "${internal.name}" from a public module`
        })
      }
    }
  }
}

function analyze(cwd: string): Analysis {
  const normalizedCwd = normalizePathName(cwd)
  const cached = cache.get(normalizedCwd)
  if (cached !== undefined) return cached

  const workspacePackages = findWorkspacePackages(cwd)
  const fileInfos = new Map<string, FileInfo>()
  for (const fileName of findSourceFiles(cwd)) {
    const sourceFile = ts.createSourceFile(fileName, fs.readFileSync(fileName, "utf8"), ts.ScriptTarget.Latest, true)
    const fileInfo = collectFileInfo(sourceFile, workspacePackages)
    fileInfos.set(fileInfo.fileName, fileInfo)
  }

  for (const fileInfo of fileInfos.values()) {
    scanUsage(fileInfos, fileInfo, workspacePackages)
  }

  const diagnosticsByFile = new Map<string, Array<Diagnostic>>()

  for (const fileInfo of fileInfos.values()) {
    const diagnostics: Array<Diagnostic> = []
    for (const declaration of fileInfo.publicDeclarations) {
      scanPublicSignature(fileInfos, fileInfo, diagnostics, declaration, workspacePackages)
    }
    for (const diagnostic of diagnostics) {
      addFileDiagnostic(diagnosticsByFile, diagnostic)
    }

    for (const exportsForName of fileInfo.internalExports.values()) {
      for (const internal of exportsForName) {
        if (!internal.used) {
          addFileDiagnostic(diagnosticsByFile, {
            fileName: internal.fileName,
            range: internal.range,
            message: `@internal export "${internal.name}" is not used by production sources`
          })
        }
      }
    }
  }

  for (const diagnostics of diagnosticsByFile.values()) {
    diagnostics.sort((self, that) => self.range[0] - that.range[0])
  }

  const analysis = { diagnosticsByFile }
  cache.set(normalizedCwd, analysis)
  return analysis
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow unused @internal exports, public re-exports, and references from public type signatures"
    }
  },
  create(context) {
    const analysis = analyze(getCwd(context))
    const diagnostics = analysis.diagnosticsByFile.get(normalizePathName(context.filename)) ?? []

    return {
      Program() {
        for (const diagnostic of diagnostics) {
          context.report({
            node: rangeNode(diagnostic.range),
            message: diagnostic.message
          })
        }
      }
    } as Visitor
  }
}

export default rule
