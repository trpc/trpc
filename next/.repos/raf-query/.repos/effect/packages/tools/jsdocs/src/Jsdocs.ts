/*
AI prompt for writing Effect public API JSDoc:

This package owns Effect public API JSDoc parsing, extraction, and model generation.
*/

import * as Effect from "effect/Effect"
import { globSync } from "glob"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"

type ExportBucket = "value" | "type"
type DocScope = "module" | "declaration" | "namespace" | "namespace-declaration" | "member"

type Result<A, E> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly error: E }

interface SourceFileWithParseDiagnostics extends ts.SourceFile {
  readonly parseDiagnostics: ReadonlyArray<ts.Diagnostic>
}

/**
 * Result type returned by the JSDoc parser helpers.
 *
 * @category utility types
 * @since 4.0.0
 */
export type JSDocResult<A, E> = Result<A, E>

/**
 * Diagnostic emitted when a JSDoc block does not follow the standard shape.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocDiagnostic {
  readonly code: string
  readonly message: string
}

/**
 * Parse error containing all diagnostics collected for a JSDoc block or file.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocParseError {
  readonly diagnostics: ReadonlyArray<JSDocDiagnostic>
}

/**
 * Parsed `@see` tag text and any inline links it contains.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedSeeTag {
  readonly text: string
  readonly links: ReadonlyArray<ParsedInlineLink>
}

/**
 * TypeScript symbol target resolved for a parsed inline JSDoc link.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedInlineLinkSymbol {
  readonly file: string
  readonly range: readonly [number, number]
}

/**
 * Parsed inline JSDoc link target and optional display text.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedInlineLink {
  readonly raw: string
  readonly target: string
  readonly text: string | null
  readonly range?: readonly [number, number]
  readonly symbol?: ParsedInlineLinkSymbol
}

/**
 * Parsed JSDoc description sections.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedDescription {
  readonly short: string
  readonly whenToUse: string | null
  readonly details: string | null
  readonly gotchas: string | null
}

/**
 * Parsed example section from a JSDoc block.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedExample {
  readonly title: string
  readonly body: string | null
  readonly code: string
}

/**
 * Raw module-level JSDoc block collected from the top of a checked file.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedModuleJSDoc {
  readonly raw: string
  readonly range: readonly [number, number]
}

/**
 * Stability of a documented public API. Untagged APIs are stable.
 *
 * @category models
 * @since 4.0.0
 */
export type JSDocStability = "stable" | "unstable" | "experimental"

interface ParsedModuleTags {
  readonly since: string
  readonly stability: JSDocStability
  readonly deprecated: string | null
  readonly see: ReadonlyArray<ParsedSeeTag>
}

/**
 * Parsed tags required for a root public declaration.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedDeclarationTags {
  readonly category: string
  readonly since: string
  readonly stability: JSDocStability
  readonly deprecated: string | null
  readonly see: ReadonlyArray<ParsedSeeTag>
}

/**
 * Parsed tags allowed for namespace JSDoc.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedNamespaceTags {
  readonly category: string | null
  readonly since: string
  readonly stability: JSDocStability
  readonly deprecated: string | null
  readonly see: ReadonlyArray<ParsedSeeTag>
}

/**
 * Parsed tags allowed for documented members.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedMemberTags {
  readonly since: string | null
  readonly stability: JSDocStability
  readonly default: string | null
  readonly deprecated: string | null
  readonly see: ReadonlyArray<ParsedSeeTag>
}

/**
 * Parsed documented member within a declaration or another member.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedMember {
  readonly name: string
  readonly signature: string | null
  readonly range: readonly [number, number]
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ParsedMemberTags
  readonly members: ReadonlyArray<ParsedMember>
}

/**
 * Parsed root declaration exported from a checked file.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedRootDeclaration {
  readonly name: string
  readonly bucket: ExportBucket
  readonly signature: string | null
  readonly range: readonly [number, number]
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ParsedDeclarationTags
  readonly members: ReadonlyArray<ParsedMember>
}

/**
 * Parsed type declaration exported from inside a namespace.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedNamespaceDeclaration {
  readonly name: string
  readonly signature: string | null
  readonly range: readonly [number, number]
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ParsedNamespaceTags
  readonly members: ReadonlyArray<ParsedMember>
}

/**
 * Parsed namespace and its documented exported type declarations.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedNamespace {
  readonly name: string
  readonly signature: string | null
  readonly range: readonly [number, number]
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ParsedNamespaceTags
  readonly declarations: ReadonlyArray<ParsedNamespaceDeclaration>
  readonly namespaces: ReadonlyArray<ParsedNamespace>
}

/**
 * Parsed public JSDoc data collected from one checked file.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedJSDocFile {
  readonly moduleJSDoc?: ParsedModuleJSDoc
  readonly declarations: ReadonlyArray<ParsedRootDeclaration>
  readonly namespaces: ReadonlyArray<ParsedNamespace>
}

/**
 * Barrel import metadata for a public module included in the JSDoc dump.
 *
 * @category models
 * @since 4.0.0
 */
export type ParsedJSDocBarrelImport =
  | {
    readonly type: "namespace"
    readonly module: string
    readonly name: string
  }
  | {
    readonly type: "flat"
    readonly module: string
  }

/**
 * Import specifiers for a public module included in the JSDoc dump.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedJSDocImports {
  readonly module: string
  readonly barrel: ParsedJSDocBarrelImport | null
  readonly flatNames: ReadonlyArray<string>
}

/**
 * Kinds of public API records represented in a JSDoc model.
 *
 * @category models
 * @since 4.0.0
 */
export type JSDocApiKind = "root-declaration" | "namespace" | "namespace-declaration" | "member"

/**
 * Recommended import declaration and usage for an importable API.
 *
 * @category models
 * @since 4.0.0
 */
export type JSDocApiImportGuidance =
  | {
    readonly style: "namespace-barrel"
    readonly importDeclaration: string
    readonly usage: string
  }
  | {
    readonly style: "named-barrel"
    readonly importDeclaration: string
    readonly usage: string
  }
  | {
    readonly style: "named-module"
    readonly importDeclaration: string
    readonly usage: string
  }

/**
 * Resolution result for a link in an API's `@see` tags.
 *
 * @category models
 * @since 4.0.0
 */
export type JSDocApiSeeLinkResolution =
  | {
    readonly _tag: "Resolved"
    readonly apiId: string
    readonly apiFqn: string
  }
  | {
    readonly _tag: "Unresolved"
    readonly reason: "not-found" | "ambiguous"
    readonly candidates: ReadonlyArray<string>
  }

/**
 * Parsed `@see` link paired with its public API resolution.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocApiSeeLink extends ParsedInlineLink {
  readonly resolution: JSDocApiSeeLinkResolution
}

/**
 * Parsed `@see` tag and its resolved links.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocApiSeeTag {
  readonly text: string
  readonly links: ReadonlyArray<JSDocApiSeeLink>
}

/**
 * Standard tags attached to a public API record.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocApiTags {
  readonly category: string | null
  readonly since: string | null
  readonly stability: JSDocStability
  readonly deprecated: string | null
  readonly default: string | null
}

/**
 * One public API record in an extracted JSDoc model.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocApi {
  readonly id: string
  readonly kind: JSDocApiKind
  readonly moduleName: string
  readonly apiName: string
  readonly localName: string
  readonly signature: string | null
  readonly parentApiName: string | null
  readonly apiFqn: string
  readonly hasFqnCollision: boolean
  readonly bucket: ExportBucket | null
  readonly importable: boolean
  readonly namespacePath: ReadonlyArray<string>
  readonly memberPath: ReadonlyArray<string>
  readonly source: {
    readonly file: string
    readonly path: ReadonlyArray<string | number>
    readonly range: readonly [number, number]
  }
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: JSDocApiTags
  readonly see: ReadonlyArray<JSDocApiSeeTag>
  readonly importGuidance: JSDocApiImportGuidance | null
}

interface ParsedBarrelExports {
  readonly namespace: ReadonlyMap<string, string>
  readonly flat: ReadonlySet<string>
  readonly named: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * Parsed public JSDoc data paired with the normalized source file path.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedJSDocFileDumpEntry extends ParsedJSDocFile {
  readonly file: string
  readonly imports: ParsedJSDocImports
}

interface AstNode {
  readonly type: string
  readonly range: [number, number]
  readonly [key: string]: any
}

interface JSDocTag {
  readonly name: string
  value: string
  readonly line: number
}

interface JSDocBlock {
  readonly range: [number, number]
  readonly raw: string
  readonly lines: Array<string>
  readonly tags: Array<JSDocTag>
  readonly parsed?: ParsedCoreJSDoc
  readonly diagnostics: Array<JSDocDiagnostic>
  readonly internal: boolean
}

interface ParsedCoreJSDoc {
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ReadonlyArray<JSDocTag>
}

interface ProgramCacheEntry {
  readonly program?: ts.Program
  readonly error?: string
  reported: boolean
}

interface PackageMetadata {
  readonly root: string
  readonly sourceRoot: string
  readonly name: string
  readonly exports: unknown
}

interface PackageExportMatch {
  readonly key: string
  readonly value: unknown
  readonly star: string | null
  readonly specificity: number
  readonly prefixLength: number
}

interface ParsedConfigResult {
  readonly parsed?: ts.ParsedCommandLine
  readonly error?: string
}

const programCache = new Map<string, ProgramCacheEntry>()
const packageMetadataCache = new Map<string, Result<PackageMetadata, string>>()
const barrelExportCache = new Map<string, Result<ParsedBarrelExports, string>>()
const tagOrder = new Map([
  ["deprecated", 0],
  ["default", 1],
  ["see", 2],
  ["stability", 3],
  ["category", 4],
  ["since", 5]
])
const signatureTypeFormatFlags = ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType

const stableSemverRegex = /^\d+\.\d+\.\d+$/
const urlRegex = /^https?:\/\//

function diagnostic(code: string, message: string): JSDocDiagnostic {
  return { code, message }
}

function normalizePathName(filePath: string): string {
  return filePath.replaceAll(path.sep, "/")
}

function normalizePackagePath(filePath: string): string {
  return normalizePathName(filePath).replace(/^\.\//, "./")
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
}

function globToRegExp(glob: string): RegExp {
  let source = "^"
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    const next = glob[index + 1]
    if (char === "*") {
      if (next === "*") {
        source += ".*"
        index++
      } else {
        source += "[^/]*"
      }
    } else if (char === "?") {
      source += "[^/]"
    } else {
      source += escapeRegExp(char)
    }
  }
  return new RegExp(`${source}$`)
}

/**
 * Creates a predicate that checks whether a filename is included by the configured JSDoc globs.
 *
 * @category constructors
 * @since 4.0.0
 */
export function createJSDocFileMatcher(options: {
  readonly cwd: string
  readonly include?: ReadonlyArray<string>
  readonly exclude?: ReadonlyArray<string>
}): (filename: string) => boolean {
  const include = options.include?.map(globToRegExp)
  const exclude = options.exclude?.map(globToRegExp)
  return (filename) => {
    const normalizedFilename = normalizePathName(filename)
    const relativeFilename = normalizePathName(path.relative(options.cwd, filename))
    const matches = (regexp: RegExp) => regexp.test(normalizedFilename) || regexp.test(relativeFilename)
    if (include !== undefined && !include.some(matches)) {
      return false
    }
    if (exclude !== undefined && exclude.some(matches)) {
      return false
    }
    return true
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function findPackageRoot(filename: string): string | undefined {
  let directory = path.dirname(path.resolve(filename))
  while (true) {
    const packageJsonPath = path.join(directory, "package.json")
    if (fs.existsSync(packageJsonPath)) {
      return directory
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      return undefined
    }
    directory = parent
  }
}

function readPackageMetadata(root: string): Result<PackageMetadata, string> {
  const normalizedRoot = path.resolve(root)
  const cached = packageMetadataCache.get(normalizedRoot)
  if (cached !== undefined) {
    return cached
  }
  const packageJsonPath = path.join(normalizedRoot, "package.json")
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
  } catch (error) {
    const result = {
      _tag: "Failure",
      error: `unable to read package.json at ${packageJsonPath}: ${String(error)}`
    } as const
    packageMetadataCache.set(normalizedRoot, result)
    return result
  }
  if (!isRecord(parsed)) {
    const result = { _tag: "Failure", error: `package.json at ${packageJsonPath} must be an object` } as const
    packageMetadataCache.set(normalizedRoot, result)
    return result
  }
  if (typeof parsed.name !== "string" || parsed.name.length === 0) {
    const result = {
      _tag: "Failure",
      error: `package.json at ${packageJsonPath} must include a non-empty name`
    } as const
    packageMetadataCache.set(normalizedRoot, result)
    return result
  }
  if (parsed.exports === undefined) {
    const result = { _tag: "Failure", error: `package.json at ${packageJsonPath} must include exports` } as const
    packageMetadataCache.set(normalizedRoot, result)
    return result
  }
  const result = {
    _tag: "Success",
    value: {
      root: normalizedRoot,
      sourceRoot: path.join(normalizedRoot, "src"),
      name: parsed.name,
      exports: parsed.exports
    }
  } as const
  packageMetadataCache.set(normalizedRoot, result)
  return result
}

function parseBarrelExports(indexPath: string): Result<ParsedBarrelExports, string> {
  const normalizedIndexPath = path.resolve(indexPath)
  const cached = barrelExportCache.get(normalizedIndexPath)
  if (cached !== undefined) {
    return cached
  }
  let source: string
  try {
    source = fs.readFileSync(normalizedIndexPath, "utf8")
  } catch (error) {
    const result = {
      _tag: "Failure",
      error: `unable to read barrel file ${normalizedIndexPath}: ${String(error)}`
    } as const
    barrelExportCache.set(normalizedIndexPath, result)
    return result
  }
  const sourceFile = ts.createSourceFile(normalizedIndexPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const namespace = new Map<string, string>()
  const flat = new Set<string>()
  const named = new Map<string, Set<string>>()
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const moduleSpecifier = normalizePathName(statement.moduleSpecifier.text)
      if (statement.exportClause === undefined) {
        flat.add(moduleSpecifier)
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        namespace.set(moduleSpecifier, statement.exportClause.name.text)
      } else if (ts.isNamedExports(statement.exportClause)) {
        const names = named.get(moduleSpecifier) ?? new Set<string>()
        for (const specifier of statement.exportClause.elements) {
          names.add(specifier.name.text)
        }
        named.set(moduleSpecifier, names)
      }
    }
  }
  const result = { _tag: "Success", value: { namespace, flat, named } } as const
  barrelExportCache.set(normalizedIndexPath, result)
  return result
}

function getPackageExportMatch(exports: unknown, subpath: string): PackageExportMatch | undefined {
  if (!isRecord(exports)) {
    return subpath === "." ? { key: ".", value: exports, star: null, specificity: 1, prefixLength: 1 } : undefined
  }
  if (Object.hasOwn(exports, subpath)) {
    return {
      key: subpath,
      value: exports[subpath],
      star: null,
      specificity: Number.MAX_SAFE_INTEGER,
      prefixLength: subpath.length
    }
  }
  const matches: Array<PackageExportMatch> = []
  for (const [key, value] of Object.entries(exports)) {
    const starIndex = key.indexOf("*")
    if (!key.startsWith(".") || starIndex === -1) {
      continue
    }
    const prefix = key.slice(0, starIndex)
    const suffix = key.slice(starIndex + 1)
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) {
      continue
    }
    matches.push({
      key,
      value,
      star: subpath.slice(prefix.length, subpath.length - suffix.length),
      specificity: prefix.length + suffix.length,
      prefixLength: prefix.length
    })
  }
  return matches.sort((a, b) =>
    b.specificity - a.specificity || b.prefixLength - a.prefixLength || b.key.length - a.key.length
  )[0]
}

function packageExportTargetMatches(value: unknown, star: string | null, expectedTarget: string): boolean {
  if (typeof value === "string") {
    const target = normalizePackagePath(star === null ? value : value.replaceAll("*", star))
    return target === expectedTarget
  }
  if (value === null || value === undefined) {
    return false
  }
  if (Array.isArray(value)) {
    return value.some((item) => packageExportTargetMatches(item, star, expectedTarget))
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => packageExportTargetMatches(item, star, expectedTarget))
  }
  return false
}

function isPackageSubpathExported(
  packageExports: unknown,
  subpath: string,
  expectedTarget: string
): boolean {
  const match = getPackageExportMatch(packageExports, subpath)
  return match !== undefined && packageExportTargetMatches(match.value, match.star, expectedTarget)
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function packageSpecifier(packageName: string, subpath: string): string {
  return subpath === "" ? packageName : `${packageName}/${subpath}`
}

function resolveBarrelImport(
  metadata: PackageMetadata,
  filename: string
): Result<{ readonly barrel: ParsedJSDocBarrelImport | null; readonly flatNames: ReadonlyArray<string> }, string> {
  let directory = path.dirname(filename)
  while (isPathInside(metadata.sourceRoot, directory)) {
    const indexPath = path.join(directory, "index.ts")
    if (indexPath !== filename && fs.existsSync(indexPath)) {
      const expectedExport = `./${normalizePathName(path.relative(directory, filename))}`
      const parsed = parseBarrelExports(indexPath)
      if (parsed._tag === "Failure") {
        return parsed
      }
      const barrelSubpath = normalizePathName(path.relative(metadata.sourceRoot, directory))
      const exportSubpath = barrelSubpath === "" ? "." : `./${barrelSubpath}`
      const exportTarget = barrelSubpath === "" ? "./src/index.ts" : `./src/${barrelSubpath}/index.ts`
      if (isPackageSubpathExported(metadata.exports, exportSubpath, exportTarget)) {
        const moduleSpecifier = packageSpecifier(metadata.name, barrelSubpath)
        const flatNames = Array.from(parsed.value.named.get(expectedExport) ?? [])
        const namespace = parsed.value.namespace.get(expectedExport)
        if (namespace !== undefined) {
          return {
            _tag: "Success",
            value: { barrel: { type: "namespace", module: moduleSpecifier, name: namespace }, flatNames }
          }
        }
        if (parsed.value.flat.has(expectedExport)) {
          return {
            _tag: "Success",
            value: { barrel: { type: "flat", module: moduleSpecifier }, flatNames }
          }
        }
        if (flatNames.length > 0) {
          return {
            _tag: "Success",
            value: { barrel: { type: "flat", module: moduleSpecifier }, flatNames }
          }
        }
      }
    }
    if (directory === metadata.sourceRoot) {
      break
    }
    directory = path.dirname(directory)
  }
  return { _tag: "Success", value: { barrel: null, flatNames: [] } }
}

function resolveJSDocImports(
  cwd: string,
  filename: string
): Result<ParsedJSDocImports, string> {
  const absoluteFilename = path.resolve(filename)
  const packageRoot = findPackageRoot(absoluteFilename)
  const relativeFilename = normalizePathName(path.relative(cwd, absoluteFilename))
  if (packageRoot === undefined) {
    return { _tag: "Failure", error: `no package.json found for ${relativeFilename}` }
  }
  const metadata = readPackageMetadata(packageRoot)
  if (metadata._tag === "Failure") {
    return metadata
  }
  const relativeToSourceRoot = normalizePathName(path.relative(metadata.value.sourceRoot, absoluteFilename))
  if (!isPathInside(metadata.value.sourceRoot, absoluteFilename)) {
    return {
      _tag: "Failure",
      error: `${relativeFilename} is not under ${normalizePathName(path.relative(cwd, metadata.value.sourceRoot))}`
    }
  }
  if (path.basename(absoluteFilename) === "index.ts") {
    return {
      _tag: "Failure",
      error: `${relativeFilename} is a barrel file; exclude it from jsdocs`
    }
  }
  if (path.extname(absoluteFilename) !== ".ts" || absoluteFilename.endsWith(".d.ts")) {
    return {
      _tag: "Failure",
      error: `${relativeFilename} is not a TypeScript source module`
    }
  }
  const moduleSubpath = relativeToSourceRoot.slice(0, -".ts".length)
  const moduleExportSubpath = `./${moduleSubpath}`
  const moduleExportTarget = `./src/${relativeToSourceRoot}`
  if (!isPackageSubpathExported(metadata.value.exports, moduleExportSubpath, moduleExportTarget)) {
    return {
      _tag: "Failure",
      error: `package.json exports do not expose ${
        packageSpecifier(metadata.value.name, moduleSubpath)
      } for ${relativeFilename}`
    }
  }
  const barrel = resolveBarrelImport(metadata.value, absoluteFilename)
  if (barrel._tag === "Failure") {
    return barrel
  }
  return {
    _tag: "Success",
    value: {
      module: packageSpecifier(metadata.value.name, moduleSubpath),
      barrel: barrel.value.barrel,
      flatNames: barrel.value.flatNames
    }
  }
}

/**
 * Reads source text from an Oxlint-compatible rule context.
 *
 * @category getters
 * @since 4.0.0
 */
export function getSourceText(context: {
  readonly sourceCode: { readonly text?: string; getText(node?: unknown): string }
}): string {
  return context.sourceCode.text ?? context.sourceCode.getText()
}

/**
 * Resolves the working directory from an Oxlint-compatible rule context.
 *
 * @category getters
 * @since 4.0.0
 */
export function getCwd(context: { readonly cwd?: string; getCwd?: () => string }): string {
  return context.cwd ?? context.getCwd?.() ?? process.cwd()
}

function skipWhitespace(source: string, end: number): number {
  while (end > 0 && /\s/.test(source[end - 1])) {
    end--
  }
  return end
}

function isSkippableDirectiveComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith("// @ts-expect-error") ||
    trimmed.startsWith("// @ts-ignore") ||
    trimmed.startsWith("// @effect-diagnostics") ||
    trimmed.startsWith("// eslint-disable-next-line") ||
    trimmed.startsWith("// oxlint-disable-next-line")
}

function skipDirectiveComments(source: string, end: number): number {
  while (end > 0) {
    const lineStart = source.lastIndexOf("\n", end - 1) + 1
    if (!isSkippableDirectiveComment(source.slice(lineStart, end))) {
      return end
    }
    end = skipWhitespace(source, lineStart)
  }
  return end
}

/**
 * Finds the JSDoc block immediately preceding an AST node.
 *
 * @category parsing
 * @since 4.0.0
 */
export function findLeadingJSDoc(
  source: string,
  node: AstNode,
  ignoredRange?: [number, number]
): JSDocBlock | undefined {
  const end = skipDirectiveComments(source, skipWhitespace(source, node.range[0]))
  if (!source.slice(0, end).endsWith("*/")) {
    return undefined
  }

  const start = source.lastIndexOf("/*", end)
  if (start === -1 || source[start + 2] !== "*") {
    return undefined
  }
  const range: [number, number] = [start, end]
  if (ignoredRange !== undefined && range[0] === ignoredRange[0] && range[1] === ignoredRange[1]) {
    return undefined
  }
  return parseJSDocBlock(source.slice(start, end), range)
}

/**
 * Parses one raw JSDoc block into the standard description, example, and tag structure.
 *
 * **Details**
 *
 * The block must have one short description paragraph, optional `When to use`, `Details`, and `Gotchas` sections in that order, then any example sections before tags. Example titles must be unique after trimming and lowercasing, each example must contain exactly one non-empty TypeScript code fence, and boundaries between sections, examples, and tags must use exactly one blank line.
 *
 * **Example** (Parsing a block)
 *
 * ```ts import.meta.vitest
 * import { parseJSDoc } from "@effect/jsdocs"
 *
 * const rawBlock = [
 *   "/" + "**",
 *   " * A value.",
 *   " *",
 *   " * @category models",
 *   " * @since 4.0.0",
 *   " *" + "/"
 * ].join("\n")
 * const result = parseJSDoc(rawBlock)
 *
 * result._tag // => "Success"
 * ```
 *
 * @category parsing
 * @since 4.0.0
 */
export function parseJSDoc(raw: string): Result<ParsedCoreJSDoc, JSDocParseError> {
  const block = parseJSDocBlock(raw, [0, raw.length])
  if (block.internal) {
    return { _tag: "Failure", error: { diagnostics: [diagnostic("internal", "Internal JSDoc blocks are ignored")] } }
  }
  if (block.diagnostics.length > 0 || block.parsed === undefined) {
    return { _tag: "Failure", error: { diagnostics: block.diagnostics } }
  }
  return { _tag: "Success", value: block.parsed }
}

function parseLooseJSDocBlock(raw: string, range: [number, number]): JSDocBlock {
  const body = raw.replace(/^\/\*\*/, "").replace(/\*\/$/, "")
  const rawLines = body.split(/\r\n|\r|\n/)
  const lines = rawLines.map((line) => line.replace(/^\s*\* ?/, "").trimEnd())
  const normalized = trimStructuralBlankLines(lines)
  const tags = parseTags(normalized)
  const internal = tags.some((tag) => tag.name === "internal")
  return { range, raw, lines: normalized, tags, diagnostics: [], internal }
}

function parseJSDocBlock(raw: string, range: [number, number]): JSDocBlock {
  const base = parseLooseJSDocBlock(raw, range)
  const { lines: normalized, tags, internal } = base
  if (internal) {
    return base
  }
  const result = parseCoreJSDoc(normalized, tags)
  const block: JSDocBlock = {
    ...base,
    range,
    raw,
    lines: normalized,
    tags,
    diagnostics: result._tag === "Failure" ? Array.from(result.error.diagnostics) : [],
    internal
  }
  return result._tag === "Success" ? { ...block, parsed: result.value } : block
}

function trimStructuralBlankLines(lines: Array<string>): Array<string> {
  let start = 0
  let end = lines.length
  if (lines[start]?.trim() === "") {
    start++
  }
  if (end > start && lines[end - 1]?.trim() === "") {
    end--
  }
  return lines.slice(start, end)
}

function parseTags(lines: Array<string>): Array<JSDocTag> {
  const tags: Array<JSDocTag> = []
  let current: JSDocTag | undefined
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (trimmed.startsWith("```")) {
      inFence = !inFence
      current = undefined
      continue
    }
    if (inFence) {
      continue
    }

    const match = /^@([A-Za-z][\w-]*)(?:\s+(.*))?$/.exec(trimmed)
    if (match) {
      current = { name: match[1], value: match[2]?.trim() ?? "", line: index }
      tags.push(current)
      continue
    }

    if (current !== undefined && trimmed !== "") {
      current.value = current.value === "" ? trimmed : `${current.value}\n${trimmed}`
    } else if (trimmed === "") {
      current = undefined
    }
  }

  return tags
}

function parseCoreJSDoc(lines: Array<string>, tags: Array<JSDocTag>): Result<ParsedCoreJSDoc, JSDocParseError> {
  const diagnostics: Array<JSDocDiagnostic> = []
  const firstTagLine = tags[0]?.line ?? lines.length
  const content = lines.slice(0, firstTagLine)

  if (lines.length === 0) {
    diagnostics.push(diagnostic("missing-description", "JSDoc must include a short description"))
  }
  if (content.at(-1)?.trim() === "" && tags.length > 0) {
    // exactly one blank before tags is validated by ensuring the last content line is blank and the previous is not blank
    if (content.length < 2 || content[content.length - 2]?.trim() === "") {
      diagnostics.push(
        diagnostic("invalid-spacing", "JSDoc tags must be separated from description content by exactly one blank line")
      )
    }
  } else if (tags.length > 0 && content.length > 0) {
    diagnostics.push(
      diagnostic("invalid-spacing", "JSDoc tags must be separated from description content by exactly one blank line")
    )
  }

  if (content[0]?.trim() === "") {
    diagnostics.push(diagnostic("leading-blank", "JSDoc must not start with a blank line"))
  }
  const contentWithoutTagBlank = tags.length > 0 && content.at(-1)?.trim() === "" ? content.slice(0, -1) : content
  if (contentWithoutTagBlank.at(-1)?.trim() === "") {
    diagnostics.push(diagnostic("trailing-blank", "JSDoc description must not end with a blank line"))
  }

  const parsedContent = parseDescriptionContent(contentWithoutTagBlank)
  diagnostics.push(...parsedContent.diagnostics)

  if (diagnostics.length > 0 || parsedContent.value === undefined) {
    return { _tag: "Failure", error: { diagnostics: uniqueDiagnostics(diagnostics) } }
  }
  return {
    _tag: "Success",
    value: {
      description: parsedContent.value.description,
      examples: parsedContent.value.examples,
      tags
    }
  }
}

function uniqueDiagnostics(
  diagnostics: ReadonlyArray<JSDocDiagnostic>
): ReadonlyArray<JSDocDiagnostic> {
  const seen = new Set<string>()
  return diagnostics.filter((item) => {
    const key = `${item.code}:${item.message}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const standardHeadings = ["**When to use**", "**Details**", "**Gotchas**"] as const

type StandardHeading = typeof standardHeadings[number]

const whenToUsePrefixes = ["Use to", "Use when", "Use as", "Use with"] as const

interface ParsedContentResult {
  readonly value?: {
    readonly description: ParsedDescription
    readonly examples: ReadonlyArray<ParsedExample>
  }
  readonly diagnostics: ReadonlyArray<JSDocDiagnostic>
}

function parseDescriptionContent(lines: Array<string>): ParsedContentResult {
  const diagnostics: Array<JSDocDiagnostic> = []
  const sections: Record<StandardHeading, string | null> = {
    "**When to use**": null,
    "**Details**": null,
    "**Gotchas**": null
  }
  const examples: Array<ParsedExample> = []
  const exampleTitles = new Set<string>()
  let index = 0
  let currentSectionOrder = -1
  let examplesStarted = false

  while (index < lines.length && lines[index].trim() !== "" && !isHeadingLine(lines[index])) {
    if (isForbiddenMarkdownHeading(lines[index], false)) {
      diagnostics.push(diagnostic("invalid-heading", "Markdown headings are not allowed in JSDoc descriptions"))
    }
    index++
  }

  const shortLines = lines.slice(0, index)
  if (shortLines.length === 0 || joinBody(shortLines).trim() === "") {
    diagnostics.push(diagnostic("missing-description", "JSDoc must include a short description"))
  }
  if (index < lines.length && lines[index].trim() === "") {
    const next = lines[index + 1]
    if (next !== undefined && !isHeadingLine(next)) {
      diagnostics.push(diagnostic("multiple-description-paragraphs", "JSDoc short description must be one paragraph"))
    }
  }

  while (index < lines.length) {
    if (lines[index].trim() !== "") {
      diagnostics.push(diagnostic("invalid-spacing", "JSDoc sections must be separated by exactly one blank line"))
      break
    }
    if (lines[index + 1]?.trim() === "") {
      diagnostics.push(diagnostic("invalid-spacing", "JSDoc sections must be separated by exactly one blank line"))
      while (lines[index + 1]?.trim() === "") index++
    }
    index++
    if (index >= lines.length) {
      break
    }

    const line = lines[index].trim()
    if (line.startsWith("**Example**")) {
      examplesStarted = true
      const parsed = parseExample(lines, index)
      diagnostics.push(...parsed.diagnostics)
      if (parsed.example !== undefined) {
        const key = parsed.example.title.trim().toLowerCase()
        if (exampleTitles.has(key)) {
          diagnostics.push(diagnostic("duplicate-example", `Duplicate example title: ${parsed.example.title.trim()}`))
        }
        exampleTitles.add(key)
        examples.push(parsed.example)
      }
      index = parsed.nextIndex
      continue
    }

    const heading = standardHeadings.find((candidate) => candidate === line)
    if (heading !== undefined) {
      if (examplesStarted) {
        diagnostics.push(diagnostic("section-after-example", `${heading} must appear before examples`))
      }
      const order = standardHeadings.indexOf(heading)
      if (order <= currentSectionOrder) {
        diagnostics.push(diagnostic("section-out-of-order", `${heading} is out of order or duplicated`))
      }
      currentSectionOrder = Math.max(currentSectionOrder, order)
      if (sections[heading] !== null) {
        diagnostics.push(diagnostic("duplicate-section", `${heading} may appear at most once`))
      }
      const parsed = parseSection(lines, index)
      diagnostics.push(...parsed.diagnostics)
      sections[heading] = parsed.body
      index = parsed.nextIndex
      continue
    }

    if (isNearMissHeading(line)) {
      diagnostics.push(diagnostic("invalid-heading", `Invalid JSDoc section heading: ${line}`))
      index++
      continue
    }
    if (isBoldOnlyLine(line)) {
      diagnostics.push(diagnostic("unknown-heading", `Unknown JSDoc section heading: ${line}`))
      index++
      continue
    }
    if (isForbiddenMarkdownHeading(line, false)) {
      diagnostics.push(diagnostic("invalid-heading", "Markdown headings are not allowed in JSDoc descriptions"))
      index++
      continue
    }
    diagnostics.push(
      diagnostic("invalid-description", "JSDoc description content must appear under a standard section heading")
    )
    index++
  }

  const whenToUse = sections["**When to use**"]
  if (whenToUse !== null && !hasWhenToUsePrefix(whenToUse)) {
    diagnostics.push(
      diagnostic(
        "when-to-use-format",
        `**When to use** must start with one of: ${whenToUsePrefixes.map((prefix) => `\`${prefix}\``).join(", ")}`
      )
    )
  }

  if (diagnostics.length > 0) {
    return { diagnostics }
  }
  return {
    value: {
      description: {
        short: joinBody(shortLines),
        whenToUse: sections["**When to use**"],
        details: sections["**Details**"],
        gotchas: sections["**Gotchas**"]
      },
      examples
    },
    diagnostics
  }
}

function hasWhenToUsePrefix(text: string): boolean {
  const trimmed = text.trimStart()
  return whenToUsePrefixes.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `))
}

function parseSection(lines: Array<string>, headingIndex: number): {
  readonly body: string | null
  readonly nextIndex: number
  readonly diagnostics: ReadonlyArray<JSDocDiagnostic>
} {
  const diagnostics: Array<JSDocDiagnostic> = []
  if (lines[headingIndex + 1]?.trim() !== "") {
    diagnostics.push(
      diagnostic("invalid-spacing", `${lines[headingIndex].trim()} must be followed by exactly one blank line`)
    )
  }
  let index = headingIndex + 2
  const bodyStart = index
  let inFence = false
  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (trimmed.startsWith("```")) {
      if (isTypeScriptFence(trimmed)) {
        diagnostics.push(diagnostic("loose-ts-fence", "TypeScript examples must use **Example** (Title) sections"))
      }
      inFence = !inFence
    }
    if (!inFence && trimmed === "" && isHeadingLine(lines[index + 1])) {
      break
    }
    if (!inFence && trimmed !== "" && isForbiddenMarkdownHeading(trimmed, false)) {
      diagnostics.push(diagnostic("invalid-heading", "Markdown headings are not allowed in JSDoc descriptions"))
    }
    if (
      !inFence && isBoldOnlyLine(trimmed) && !standardHeadings.includes(trimmed as StandardHeading) &&
      !trimmed.startsWith("**Example**")
    ) {
      diagnostics.push(diagnostic("unknown-heading", `Unknown JSDoc section heading: ${trimmed}`))
    }
    index++
  }
  const bodyLines = lines.slice(bodyStart, index)
  if (joinBody(bodyLines).trim() === "") {
    diagnostics.push(diagnostic("empty-section", `${lines[headingIndex].trim()} must have a non-empty body`))
  }
  if (bodyLines.at(-1)?.trim() === "") {
    diagnostics.push(diagnostic("invalid-spacing", "Section bodies must not end with extra blank lines"))
  }
  return { body: joinBody(bodyLines), nextIndex: index, diagnostics }
}

const isTypeScriptFence = (line: string): boolean => /^```ts(?:\s.*)?$/.test(line)

function parseExample(lines: Array<string>, headingIndex: number): {
  readonly example?: ParsedExample
  readonly nextIndex: number
  readonly diagnostics: ReadonlyArray<JSDocDiagnostic>
} {
  const diagnostics: Array<JSDocDiagnostic> = []
  const heading = lines[headingIndex].trim()
  const match = /^\*\*Example\*\* \((.+)\)$/.exec(heading)
  if (!match || match[1].trim() === "") {
    diagnostics.push(diagnostic("malformed-example", "TypeScript examples must use **Example** (Title)"))
  }
  if (lines[headingIndex + 1]?.trim() !== "") {
    diagnostics.push(diagnostic("invalid-spacing", "Example headings must be followed by exactly one blank line"))
  }

  let index = headingIndex + 2
  const bodyStart = index
  let fenceIndex = -1
  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (isTypeScriptFence(trimmed)) {
      fenceIndex = index
      break
    }
    if (trimmed.startsWith("```")) {
      diagnostics.push(diagnostic("malformed-example", "Examples may only contain one TypeScript code fence"))
    }
    if (trimmed === "" && isHeadingLine(lines[index + 1])) {
      break
    }
    if (trimmed.startsWith("@")) {
      break
    }
    index++
  }

  if (fenceIndex === -1) {
    diagnostics.push(diagnostic("malformed-example", "Examples must include a non-empty ```ts fence"))
    return { nextIndex: index, diagnostics }
  }

  const bodyLines = lines.slice(bodyStart, fenceIndex)
  const nonEmptyBody = joinBody(bodyLines).trim() !== ""
  if (nonEmptyBody && bodyLines.at(-1)?.trim() !== "") {
    diagnostics.push(
      diagnostic("invalid-spacing", "Example prose must be separated from code by exactly one blank line")
    )
  }
  const prose = nonEmptyBody ? joinBody(bodyLines.slice(0, bodyLines.at(-1)?.trim() === "" ? -1 : undefined)) : null

  index = fenceIndex + 1
  const codeStart = index
  while (index < lines.length && lines[index].trim() !== "```") {
    if (isTypeScriptFence(lines[index].trim())) {
      diagnostics.push(diagnostic("malformed-example", "Examples must contain exactly one TypeScript code fence"))
    }
    index++
  }
  const codeLines = lines.slice(codeStart, index)
  if (index >= lines.length) {
    diagnostics.push(diagnostic("malformed-example", "Examples must close the TypeScript code fence"))
  }
  if (joinBody(codeLines).trim() === "") {
    diagnostics.push(diagnostic("malformed-example", "Examples must include non-empty TypeScript code"))
  }
  index++
  if (index < lines.length && lines[index].trim() !== "" && !lines[index].trim().startsWith("@")) {
    diagnostics.push(
      diagnostic("invalid-spacing", "Examples must be separated from following content by exactly one blank line")
    )
  }

  const result = { nextIndex: index, diagnostics }
  return match
    ? { ...result, example: { title: match[1].trim(), body: prose, code: joinBody(codeLines) } }
    : result
}

function parseModuleExamples(block: JSDocBlock): {
  readonly examples: ReadonlyArray<ParsedExample>
  readonly diagnostics: ReadonlyArray<JSDocDiagnostic>
} {
  const diagnostics: Array<JSDocDiagnostic> = []
  const examples: Array<ParsedExample> = []
  const exampleTitles = new Set<string>()
  const firstTagLine = block.tags[0]?.line ?? block.lines.length
  const lines = block.lines.slice(0, firstTagLine)
  let index = 0
  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (trimmed.startsWith("**Example**")) {
      const parsed = parseExample(lines, index)
      diagnostics.push(...parsed.diagnostics)
      if (parsed.example !== undefined) {
        const key = parsed.example.title.trim().toLowerCase()
        if (exampleTitles.has(key)) {
          diagnostics.push(diagnostic("duplicate-example", `Duplicate example title: ${parsed.example.title.trim()}`))
        }
        exampleTitles.add(key)
        examples.push(parsed.example)
      }
      index = Math.max(parsed.nextIndex, index + 1)
      continue
    }
    if (trimmed.startsWith("```")) {
      diagnostics.push(
        diagnostic("loose-ts-fence", "Code fences in module JSDoc must use **Example** (Title) sections")
      )
      index++
      while (index < lines.length && !lines[index].trim().startsWith("```")) index++
      if (index < lines.length) index++
      continue
    }
    index++
  }
  return { examples, diagnostics }
}

function joinBody(lines: ReadonlyArray<string>): string {
  let start = 0
  let end = lines.length
  while (start < end && lines[start]?.trim() === "") start++
  while (end > start && lines[end - 1]?.trim() === "") end--
  return lines.slice(start, end).join("\n")
}

function isHeadingLine(line: string | undefined): boolean {
  if (line === undefined) return false
  const trimmed = line.trim()
  return standardHeadings.includes(trimmed as StandardHeading) || trimmed.startsWith("**Example**") ||
    isNearMissHeading(trimmed) || isBoldOnlyLine(trimmed) || isForbiddenMarkdownHeading(trimmed, false)
}

function isNearMissHeading(line: string): boolean {
  return /^\*\*(When to use|When To Use|Details|Gotchas).*\*\*/.test(line) &&
    !standardHeadings.includes(line as StandardHeading)
}

function isBoldOnlyLine(line: string): boolean {
  return /^\*\*[^*]+\*\*(?:\s*)$/.test(line)
}

function isForbiddenMarkdownHeading(line: string, inFence: boolean): boolean {
  return !inFence && /^#{1,6}\s+/.test(line.trim())
}

function parseSeeTag(value: string): ParsedSeeTag {
  return { text: value, links: extractParsedInlineLinks(value) }
}

function extractParsedInlineLinks(source: string): ReadonlyArray<ParsedInlineLink> {
  const links: Array<ParsedInlineLink> = []
  let index = source.indexOf("{@link")
  while (index !== -1) {
    if (!isInlineLinkStart(source, index)) {
      index = source.indexOf("{@link", index + 1)
      continue
    }
    const end = source.indexOf("}", index + "{@link".length)
    if (end === -1) {
      break
    }
    const raw = source.slice(index, end + 1)
    const content = raw.slice("{@link".length, -1).trim()
    const pipeIndex = content.indexOf("|")
    const beforeLabel = pipeIndex === -1 ? content : content.slice(0, pipeIndex).trim()
    const target = beforeLabel.split(/\s+/)[0] ?? ""
    const text = pipeIndex === -1
      ? beforeLabel.slice(target.length).trim() || null
      : content.slice(pipeIndex + 1).trim() || null
    links.push({ raw, target, text })
    index = source.indexOf("{@link", end + 1)
  }
  return links
}

function buildTags(
  scope: DocScope,
  tags: ReadonlyArray<JSDocTag>
): Result<ParsedModuleTags | ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags, JSDocParseError> {
  const diagnostics: Array<JSDocDiagnostic> = []
  const allowed = scope === "declaration"
    ? new Set(["deprecated", "see", "stability", "category", "since"])
    : scope === "member"
    ? new Set(["deprecated", "default", "see", "stability", "since"])
    : scope === "module"
    ? new Set(["deprecated", "see", "stability", "since"])
    : new Set(["deprecated", "see", "stability", "category", "since"])
  let previousOrder = -1
  const values = new Map<string, Array<string>>()

  for (const tag of tags) {
    if (tag.name === "internal") {
      continue
    }
    if (tag.name === "example") {
      diagnostics.push(
        diagnostic("forbidden-tag", "@example is not allowed; use a canonical **Example** (Title) section")
      )
      continue
    }
    if (!allowed.has(tag.name)) {
      diagnostics.push(
        diagnostic(
          "forbidden-tag",
          `@${tag.name} is not allowed in ${scope === "namespace-declaration" ? "namespace" : scope} JSDoc`
        )
      )
      continue
    }
    const order = tagOrder.get(tag.name) ?? previousOrder
    if (order < previousOrder) {
      diagnostics.push(diagnostic("tag-out-of-order", `@${tag.name} is out of order in JSDoc`))
    }
    previousOrder = Math.max(previousOrder, order)
    values.set(tag.name, [...values.get(tag.name) ?? [], tag.value.trim()])
  }

  const singletonTags = scope === "member"
    ? ["deprecated", "default", "stability", "since"]
    : ["deprecated", "stability", "category", "since"]
  for (const tag of singletonTags) {
    if ((values.get(tag)?.length ?? 0) > 1) {
      diagnostics.push(diagnostic("duplicate-tag", `JSDoc blocks may contain at most one @${tag} tag`))
    }
  }

  const see = values.get("see") ?? []
  for (const value of see) {
    if (value === "") {
      diagnostics.push(diagnostic("empty-tag", "@see must include a value"))
    }
  }
  const deprecated = values.get("deprecated")?.[0] ?? null
  const stability = values.get("stability")?.[0]
  if (stability !== undefined && stability !== "unstable" && stability !== "experimental") {
    diagnostics.push(diagnostic("invalid-stability", "@stability must have the value unstable or experimental"))
  }
  const resolvedStability: JSDocStability = stability === "unstable" || stability === "experimental"
    ? stability
    : "stable"
  if (deprecated === "") diagnostics.push(diagnostic("empty-tag", "@deprecated must include a message"))
  const since = values.get("since")?.[0] ?? null
  if ((scope === "declaration" || scope === "namespace" || scope === "namespace-declaration") && since === null) {
    diagnostics.push(
      diagnostic(
        "missing-tag",
        scope === "declaration" ? "Public JSDoc must include @since" : "Namespace JSDoc must include @since"
      )
    )
  }
  if (scope === "module" && since === null) {
    diagnostics.push(diagnostic("missing-tag", "Module JSDoc must include @since"))
  }
  if (since !== null && !stableSemverRegex.test(since)) {
    diagnostics.push(diagnostic("invalid-since", "@since must be a stable semver version like 1.2.3"))
  }

  if (scope === "declaration") {
    const category = values.get("category")?.[0] ?? null
    if (category === null) diagnostics.push(diagnostic("missing-tag", "Public JSDoc must include @category"))
    if (category === "") diagnostics.push(diagnostic("empty-tag", "@category must include a value"))
    if (diagnostics.length > 0 || category === null || since === null) {
      return { _tag: "Failure", error: { diagnostics } }
    }
    return {
      _tag: "Success",
      value: { category, since, stability: resolvedStability, deprecated, see: see.map(parseSeeTag) }
    }
  }

  if (scope === "member") {
    const defaultValue = values.get("default")?.[0] ?? null
    if (defaultValue === "") diagnostics.push(diagnostic("empty-tag", "@default must include a value"))
    if (diagnostics.length > 0) return { _tag: "Failure", error: { diagnostics } }
    return {
      _tag: "Success",
      value: { since, stability: resolvedStability, default: defaultValue, deprecated, see: see.map(parseSeeTag) }
    }
  }

  if (scope === "module") {
    if (diagnostics.length > 0 || since === null) return { _tag: "Failure", error: { diagnostics } }
    return { _tag: "Success", value: { since, stability: resolvedStability, deprecated, see: see.map(parseSeeTag) } }
  }

  const category = values.get("category")?.[0] ?? null
  if (category === "") diagnostics.push(diagnostic("empty-tag", "@category must include a value"))
  if (diagnostics.length > 0 || since === null) return { _tag: "Failure", error: { diagnostics } }
  return {
    _tag: "Success",
    value: { category, since, stability: resolvedStability, deprecated, see: see.map(parseSeeTag) }
  }
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
}

function parseTsConfig(tsconfigPath: string): ParsedConfigResult {
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (config.error !== undefined) {
    return { error: `Unable to read TypeScript config ${tsconfigPath}: ${formatDiagnostic(config.error)}` }
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(tsconfigPath))
  if (parsed.errors.length > 0) {
    return {
      error: `Unable to parse TypeScript config ${tsconfigPath}: ${parsed.errors.map(formatDiagnostic).join("; ")}`
    }
  }
  return { parsed }
}

function collectTsConfigFiles(tsconfigPath: string, seen: Set<string>, fileNames: Set<string>): ParsedConfigResult {
  if (seen.has(tsconfigPath)) return {}
  seen.add(tsconfigPath)
  const result = parseTsConfig(tsconfigPath)
  if (result.error !== undefined || result.parsed === undefined) return result
  for (const fileName of result.parsed.fileNames) fileNames.add(fileName)
  for (const reference of result.parsed.projectReferences ?? []) {
    const referenceResult = collectTsConfigFiles(ts.resolveProjectReferencePath(reference), seen, fileNames)
    if (referenceResult.error !== undefined) return referenceResult
  }
  return result
}

/**
 * Loads and caches the TypeScript program for a project configuration.
 *
 * @category constructors
 * @since 4.0.0
 */
export function getProgram(tsconfigPath: string): ProgramCacheEntry {
  const cached = programCache.get(tsconfigPath)
  if (cached !== undefined) return cached
  const fileNames = new Set<string>()
  const result = collectTsConfigFiles(tsconfigPath, new Set(), fileNames)
  if (result.error !== undefined || result.parsed === undefined) {
    const entry = { error: result.error ?? `Unable to parse TypeScript config ${tsconfigPath}`, reported: false }
    programCache.set(tsconfigPath, entry)
    return entry
  }
  const program = ts.createProgram(Array.from(fileNames), result.parsed.options)
  const entry = { program, reported: false }
  programCache.set(tsconfigPath, entry)
  return entry
}

function resolveJSDocLinkSymbol(
  link: ts.JSDocLink,
  checker: ts.TypeChecker
): ts.Symbol | undefined {
  return link.name === undefined ? undefined : checker.getSymbolAtLocation(link.name)
}

function isInlineLinkStart(source: string, index: number): boolean {
  if (!source.startsWith("{@link", index)) return false
  const next = source[index + "{@link".length]
  return next === undefined || /\s|}/.test(next)
}

function hasInlineLink(block: JSDocBlock): boolean {
  return block.lines.some((line) => {
    let index = line.indexOf("{@link")
    while (index !== -1) {
      if (isInlineLinkStart(line, index)) return true
      index = line.indexOf("{@link", index + 1)
    }
    return false
  })
}

function extractInlineLinkTarget(linkText: string): string {
  const content = linkText.slice("{@link".length, linkText.endsWith("}") ? -1 : undefined).trim()
  const pipeIndex = content.indexOf("|")
  const beforeLabel = pipeIndex === -1 ? content : content.slice(0, pipeIndex).trim()
  return beforeLabel.split(/\s+/)[0] ?? ""
}

function malformedInlineLinks(block: JSDocBlock): Array<string> {
  const source = block.lines.join("\n")
  const malformed: Array<string> = []
  let index = source.indexOf("{@link")
  while (index !== -1) {
    if (!isInlineLinkStart(source, index)) {
      index = source.indexOf("{@link", index + 1)
      continue
    }
    const end = source.indexOf("}", index + "{@link".length)
    const text = end === -1 ? source.slice(index).split(/\r?\n/, 1)[0] : source.slice(index, end + 1)
    if (end === -1 || extractInlineLinkTarget(text) === "") malformed.push(text)
    index = source.indexOf("{@link", end === -1 ? index + 1 : end + 1)
  }
  return malformed
}

function collectJSDocLinks(sourceFile: ts.SourceFile, block: JSDocBlock): Array<ts.JSDocLink> {
  const links: Array<ts.JSDocLink> = []
  function inspectJSDoc(node: ts.Node) {
    for (const jsdoc of (node as { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc ?? []) {
      if (jsdoc.pos !== block.range[0] || jsdoc.end !== block.range[1]) continue
      ts.forEachChild(jsdoc, function visit(child) {
        if (ts.isJSDocLink(child)) links.push(child)
        ts.forEachChild(child, visit)
      })
    }
  }
  function visit(node: ts.Node) {
    inspectJSDoc(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return links
}

function collectJSDocSeeLinks(sourceFile: ts.SourceFile, block: JSDocBlock): Array<ts.JSDocLink> {
  const links: Array<ts.JSDocLink> = []
  function inspectJSDoc(node: ts.Node) {
    for (const jsdoc of (node as { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc ?? []) {
      if (jsdoc.pos !== block.range[0] || jsdoc.end !== block.range[1]) continue
      ts.forEachChild(jsdoc, function visit(child) {
        if (ts.isJSDocSeeTag(child)) {
          ts.forEachChild(child, function visitSeeTag(seeTagChild) {
            if (ts.isJSDocLink(seeTagChild)) links.push(seeTagChild)
            ts.forEachChild(seeTagChild, visitSeeTag)
          })
          return
        }
        ts.forEachChild(child, visit)
      })
    }
  }
  function visit(node: ts.Node) {
    inspectJSDoc(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return links
}

function resolvedSymbolTarget(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol)
}

function isLocalSourceFile(cwd: string, sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile) return false
  const relative = path.relative(cwd, sourceFile.fileName)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function symbolDeclarations(symbol: ts.Symbol, checker: ts.TypeChecker): ReadonlyArray<ts.Declaration> {
  const target = resolvedSymbolTarget(symbol, checker)
  const declarations = new Set<ts.Declaration>()
  if (target.valueDeclaration !== undefined) declarations.add(target.valueDeclaration)
  for (const declaration of target.declarations ?? []) declarations.add(declaration)
  return Array.from(declarations)
}

function symbolHasPublicJSDoc(symbol: ts.Symbol, checker: ts.TypeChecker): boolean {
  return symbolDeclarations(symbol, checker).some((declaration) => {
    const block = getNodeJSDoc(declaration)
    return block !== undefined && !block.internal && block.parsed !== undefined
  })
}

function isMemberDeclaration(declaration: ts.Declaration): boolean {
  return ts.isPropertySignature(declaration) || ts.isMethodSignature(declaration) ||
    ts.isPropertyDeclaration(declaration) || ts.isMethodDeclaration(declaration) ||
    ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration)
}

function undocumentedSeeLinkTarget(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  cwd: string
): ts.Declaration | undefined {
  const localDeclarations = symbolDeclarations(symbol, checker).filter((declaration) =>
    isMemberDeclaration(declaration) && isLocalSourceFile(cwd, declaration.getSourceFile())
  )
  if (localDeclarations.length === 0 || symbolHasPublicJSDoc(symbol, checker)) return undefined
  return localDeclarations[0]
}

function inlineLinkSymbol(
  symbol: ts.Symbol,
  cwd: string,
  checker: ts.TypeChecker
): ParsedInlineLinkSymbol | undefined {
  const target = resolvedSymbolTarget(symbol, checker)
  const declaration = target.valueDeclaration ?? target.declarations?.[0]
  if (declaration === undefined) return undefined
  return {
    file: normalizeFile(cwd, declaration.getSourceFile().fileName),
    range: nodeRange(declaration)
  }
}

function attachSeeLinkSymbolsFromSourceFile<
  T extends ParsedModuleTags | ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags
>(
  tags: T,
  sourceFile: ts.SourceFile,
  block: JSDocBlock,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): T {
  const resolved = new Map<
    string,
    Array<{ readonly range: readonly [number, number]; readonly symbol?: ParsedInlineLinkSymbol }>
  >()
  for (const link of collectJSDocLinks(sourceFile, block)) {
    const text = link.getText(sourceFile)
    const target = extractInlineLinkTarget(text)
    if (target === "" || urlRegex.test(target)) continue
    const symbol = resolveJSDocLinkSymbol(link, linkContext.checker)
    const info = symbol === undefined ? undefined : inlineLinkSymbol(symbol, linkContext.cwd, linkContext.checker)
    const items = resolved.get(text) ?? []
    items.push(info === undefined ? { range: [link.pos, link.end] } : { range: [link.pos, link.end], symbol: info })
    resolved.set(text, items)
  }
  return {
    ...tags,
    see: tags.see.map((tag) => ({
      ...tag,
      links: tag.links.map((link) => {
        const items = resolved.get(link.raw)
        const info = items?.shift()
        if (info === undefined) return link
        return info.symbol === undefined
          ? { ...link, range: info.range }
          : { ...link, range: info.range, symbol: info.symbol }
      })
    }))
  }
}

function attachSeeLinkSymbols<T extends ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags>(
  tags: T,
  node: ts.Node,
  block: JSDocBlock,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): T {
  return attachSeeLinkSymbolsFromSourceFile(tags, node.getSourceFile(), block, linkContext)
}

/**
 * JSDoc diagnostic paired with its source range.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocModelDiagnostic extends JSDocDiagnostic {
  readonly range: readonly [number, number]
}

/**
 * Parsed JSDoc and diagnostics for one source file in a model.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocModelFile extends ParsedJSDocFile {
  readonly file: string
  readonly hash: string
  readonly diagnostics: ReadonlyArray<JSDocModelDiagnostic>
  readonly imports?: ParsedJSDocImports
}

/**
 * Versioned output of a repository JSDoc extraction.
 *
 * @category models
 * @since 4.0.0
 */
export interface JSDocModel {
  readonly version: 3
  readonly generatedBy: "@effect/jsdocs"
  readonly generatedAt: string
  readonly inputHash?: string
  readonly files: ReadonlyArray<JSDocModelFile>
  readonly apis: ReadonlyArray<JSDocApi>
}

/**
 * File selection and output configuration for JSDoc extraction.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface JSDocConfig {
  readonly tsconfig: string
  readonly include: ReadonlyArray<string>
  readonly exclude?: ReadonlyArray<string>
  readonly output: string
}

/**
 * JSDoc extraction configuration with an optional working directory.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface ExtractJSDocsOptions extends JSDocConfig {
  readonly cwd?: string
}

function addInputFile(files: Set<string>, filename: string) {
  const normalized = path.resolve(filename)
  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    files.add(normalized)
  }
}

/**
 * Computes the cache key for the configured JSDoc extraction inputs.
 *
 * @category hashing
 * @since 4.0.0
 */
export function computeJSDocInputHash(options: ExtractJSDocsOptions): string {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const hash = crypto.createHash("sha256")
  const files = new Set<string>()

  hash.update(JSON.stringify({
    tsconfig: options.tsconfig,
    include: options.include,
    exclude: options.exclude ?? [],
    output: options.output
  }))

  addInputFile(files, path.join(cwd, "jsdocs.config.json"))
  addInputFile(files, path.resolve(cwd, options.tsconfig))

  for (
    const filename of globSync([...options.include], {
      cwd,
      absolute: true,
      nodir: true,
      ignore: ["**/node_modules/**"]
    })
  ) {
    addInputFile(files, filename)
  }

  for (
    const filename of globSync([
      "package.json",
      "packages/**/package.json",
      "tsconfig*.json",
      "packages/**/tsconfig*.json"
    ], {
      cwd,
      absolute: true,
      nodir: true,
      ignore: ["**/node_modules/**"]
    })
  ) {
    addInputFile(files, filename)
  }

  for (const filename of Array.from(files).sort()) {
    hash.update("\0")
    hash.update(normalizeFile(cwd, filename))
    hash.update("\0")
    hash.update(hashSource(fs.readFileSync(filename, "utf8")))
  }

  return hash.digest("hex")
}

function isIdentifierName(value: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(value)
}

function renderInlineLinks(text: string): string {
  return text.replace(/\{@link\s+([^}]+)\}/g, (_match, content: string) => {
    const pipeIndex = content.indexOf("|")
    const beforeLabel = pipeIndex === -1 ? content.trim() : content.slice(0, pipeIndex).trim()
    const target = beforeLabel.split(/\s+/)[0] ?? ""
    const label = pipeIndex === -1
      ? beforeLabel.slice(target.length).trim() || target
      : content.slice(pipeIndex + 1).trim() || target
    return `\`${label.replace(/:var$/, "")}\``
  })
}

function renderDescription(description: ParsedDescription): ParsedDescription {
  return {
    short: renderInlineLinks(description.short),
    whenToUse: description.whenToUse === null ? null : renderInlineLinks(description.whenToUse),
    details: description.details === null ? null : renderInlineLinks(description.details),
    gotchas: description.gotchas === null ? null : renderInlineLinks(description.gotchas)
  }
}

function renderExamples(examples: ReadonlyArray<ParsedExample>): ReadonlyArray<ParsedExample> {
  return examples.map((example) => ({
    ...example,
    body: example.body === null ? null : renderInlineLinks(example.body)
  }))
}

function apiTags(
  tags: ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags
): JSDocApiTags {
  return {
    category: "category" in tags ? tags.category : null,
    since: tags.since,
    stability: tags.stability,
    deprecated: tags.deprecated,
    default: "default" in tags ? tags.default : null
  }
}

function unresolvedSeeTag(tag: ParsedSeeTag): JSDocApiSeeTag {
  return {
    text: renderInlineLinks(tag.text),
    links: tag.links.map((link) => ({
      ...link,
      resolution: { _tag: "Unresolved", reason: "not-found", candidates: [] }
    }))
  }
}

function unresolvedSee(tags: ReadonlyArray<ParsedSeeTag>): ReadonlyArray<JSDocApiSeeTag> {
  return tags.map(unresolvedSeeTag)
}

function apiId(kind: JSDocApiKind, bucket: ExportBucket | null, apiFqn: string): string {
  return `${kind}:${bucket ?? "none"}:${apiFqn}`
}

function importGuidance(
  imports: ParsedJSDocImports,
  kind: JSDocApiKind,
  bucket: ExportBucket | null,
  apiName: string
): JSDocApiImportGuidance | null {
  if (kind !== "root-declaration" || bucket !== "value" || !isIdentifierName(apiName)) {
    return null
  }
  if (imports.flatNames.includes(apiName) && imports.barrel !== null) {
    return {
      style: "named-barrel",
      importDeclaration: `import { ${apiName} } from "${imports.barrel.module}"`,
      usage: apiName
    }
  }
  if (imports.barrel?.type === "namespace") {
    if (!isIdentifierName(imports.barrel.name)) return null
    return {
      style: "namespace-barrel",
      importDeclaration: `import { ${imports.barrel.name} } from "${imports.barrel.module}"`,
      usage: `${imports.barrel.name}.${apiName}`
    }
  }
  if (imports.barrel?.type === "flat") {
    return {
      style: "named-barrel",
      importDeclaration: `import { ${apiName} } from "${imports.barrel.module}"`,
      usage: apiName
    }
  }
  return {
    style: "named-module",
    importDeclaration: `import { ${apiName} } from "${imports.module}"`,
    usage: apiName
  }
}

function makeApi(input: {
  readonly file: JSDocModelFile
  readonly imports: ParsedJSDocImports
  readonly kind: JSDocApiKind
  readonly bucket: ExportBucket | null
  readonly apiName: string
  readonly localName: string
  readonly signature: string | null
  readonly parentApiName: string | null
  readonly namespacePath: ReadonlyArray<string>
  readonly memberPath: ReadonlyArray<string>
  readonly sourcePath: ReadonlyArray<string | number>
  readonly sourceRange: readonly [number, number]
  readonly description: ParsedDescription
  readonly examples: ReadonlyArray<ParsedExample>
  readonly tags: ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags
}): JSDocApi {
  const apiFqn = `${input.imports.module}.${input.apiName}`
  return {
    id: apiId(input.kind, input.bucket, apiFqn),
    kind: input.kind,
    moduleName: input.imports.module,
    apiName: input.apiName,
    localName: input.localName,
    signature: input.signature,
    parentApiName: input.parentApiName,
    apiFqn,
    hasFqnCollision: false,
    bucket: input.bucket,
    importable: input.kind === "root-declaration",
    namespacePath: input.namespacePath,
    memberPath: input.memberPath,
    source: {
      file: input.file.file,
      path: input.sourcePath,
      range: input.sourceRange
    },
    description: renderDescription(input.description),
    examples: renderExamples(input.examples),
    tags: apiTags(input.tags),
    see: unresolvedSee(input.tags.see),
    importGuidance: importGuidance(input.imports, input.kind, input.bucket, input.apiName)
  }
}

function buildJSDocApis(files: ReadonlyArray<JSDocModelFile>): ReadonlyArray<JSDocApi> {
  const apis: Array<JSDocApi> = []
  const addMembers = (
    file: JSDocModelFile,
    imports: ParsedJSDocImports,
    members: ReadonlyArray<ParsedMember>,
    parentApiName: string,
    namespacePath: ReadonlyArray<string>,
    memberPath: ReadonlyArray<string>,
    sourcePath: ReadonlyArray<string | number>
  ) => {
    members.forEach((member, index) => {
      const nextMemberPath = [...memberPath, member.name]
      const apiName = `${parentApiName}.${nextMemberPath.join(".")}`
      apis.push(makeApi({
        file,
        imports,
        kind: "member",
        bucket: null,
        apiName,
        localName: member.name,
        signature: member.signature,
        parentApiName,
        namespacePath,
        memberPath: nextMemberPath,
        sourcePath: [...sourcePath, "members", index],
        sourceRange: member.range,
        description: member.description,
        examples: member.examples,
        tags: member.tags
      }))
      addMembers(file, imports, member.members, parentApiName, namespacePath, nextMemberPath, [
        ...sourcePath,
        "members",
        index
      ])
    })
  }
  const addNamespaces = (
    file: JSDocModelFile,
    imports: ParsedJSDocImports,
    namespaces: ReadonlyArray<ParsedNamespace>,
    namespacePath: ReadonlyArray<string>,
    sourcePath: ReadonlyArray<string | number>
  ) => {
    namespaces.forEach((namespace, index) => {
      const nextNamespacePath = [...namespacePath, namespace.name]
      const namespaceApiName = nextNamespacePath.join(".")
      apis.push(makeApi({
        file,
        imports,
        kind: "namespace",
        bucket: null,
        apiName: namespaceApiName,
        localName: namespace.name,
        signature: namespace.signature,
        parentApiName: namespacePath.length === 0 ? null : namespacePath.join("."),
        namespacePath: nextNamespacePath,
        memberPath: [],
        sourcePath: [...sourcePath, index],
        sourceRange: namespace.range,
        description: namespace.description,
        examples: namespace.examples,
        tags: namespace.tags
      }))
      namespace.declarations.forEach((declaration, declarationIndex) => {
        const apiName = `${namespaceApiName}.${declaration.name}`
        apis.push(makeApi({
          file,
          imports,
          kind: "namespace-declaration",
          bucket: "type",
          apiName,
          localName: declaration.name,
          signature: declaration.signature,
          parentApiName: namespaceApiName,
          namespacePath: nextNamespacePath,
          memberPath: [],
          sourcePath: [...sourcePath, index, "declarations", declarationIndex],
          sourceRange: declaration.range,
          description: declaration.description,
          examples: declaration.examples,
          tags: declaration.tags
        }))
        addMembers(file, imports, declaration.members, apiName, nextNamespacePath, [], [
          ...sourcePath,
          index,
          "declarations",
          declarationIndex
        ])
      })
      addNamespaces(file, imports, namespace.namespaces, nextNamespacePath, [...sourcePath, index, "namespaces"])
    })
  }
  for (const file of files) {
    if (file.imports === undefined) continue
    const imports = file.imports
    file.declarations.forEach((declaration, index) => {
      apis.push(makeApi({
        file,
        imports,
        kind: "root-declaration",
        bucket: declaration.bucket,
        apiName: declaration.name,
        localName: declaration.name,
        signature: declaration.signature,
        parentApiName: null,
        namespacePath: [],
        memberPath: [],
        sourcePath: ["declarations", index],
        sourceRange: declaration.range,
        description: declaration.description,
        examples: declaration.examples,
        tags: declaration.tags
      }))
      addMembers(file, imports, declaration.members, declaration.name, [], [], ["declarations", index])
    })
    addNamespaces(file, imports, file.namespaces, [], ["namespaces"])
  }
  return resolveJSDocApiSeeLinks(markFqnCollisions(apis))
}

function markFqnCollisions(apis: ReadonlyArray<JSDocApi>): ReadonlyArray<JSDocApi> {
  const counts = new Map<string, number>()
  for (const api of apis) counts.set(api.apiFqn, (counts.get(api.apiFqn) ?? 0) + 1)
  return apis.map((api) => ({ ...api, hasFqnCollision: (counts.get(api.apiFqn) ?? 0) > 1 }))
}

function normalizeSeeTarget(target: string): ReadonlyArray<string> {
  const withoutKind = target.replace(/:[A-Za-z]+$/, "")
  const out = [withoutKind]
  if (withoutKind.endsWith("_")) out.push(withoutKind.slice(0, -1))
  return Array.from(new Set(out.filter((item) => item.length > 0)))
}

function sourceRangeKey(file: string, range: readonly [number, number]): string {
  return `${file}:${range[0]}:${range[1]}`
}

function rangeContains(outer: readonly [number, number], inner: readonly [number, number]): boolean {
  return outer[0] <= inner[0] && inner[1] <= outer[1]
}

function rangeOverlaps(self: readonly [number, number], that: readonly [number, number]): boolean {
  return self[0] <= that[1] && that[0] <= self[1]
}

function rangeWidth(range: readonly [number, number]): number {
  return range[1] - range[0]
}

function seeTargetNames(link: ParsedInlineLink): ReadonlySet<string> {
  const names = new Set<string>()
  const add = (target: string) => {
    for (const normalized of normalizeSeeTarget(target)) {
      const parts = normalized.split(".").filter((part) => part.length > 0)
      for (const part of parts) names.add(part)
      if (parts.length > 0) names.add(parts.join("."))
    }
  }
  add(link.target)
  if (link.text !== null) add(link.text)
  return names
}

function apiMatchesSeeTarget(api: JSDocApi, names: ReadonlySet<string>): boolean {
  if (names.size === 0) return true
  if (names.has(api.localName) || names.has(api.apiName)) return true
  for (const name of names) {
    if (api.apiName.endsWith(`.${name}`)) return true
  }
  return false
}

function createJSDocApiSeeLinkResolver(apis: ReadonlyArray<JSDocApi>) {
  const byModuleAndName = new Map<string, JSDocApi>()
  const byLocalName = new Map<string, Array<JSDocApi>>()
  const bySourceRange = new Map<string, JSDocApi>()
  const bySourceFile = new Map<string, Array<JSDocApi>>()
  for (const api of apis) {
    byModuleAndName.set(`${api.moduleName}:${api.apiName}`, api)
    bySourceRange.set(sourceRangeKey(api.source.file, api.source.range), api)
    const sourceApis = bySourceFile.get(api.source.file) ?? []
    sourceApis.push(api)
    bySourceFile.set(api.source.file, sourceApis)
    for (const name of new Set([api.apiName, api.localName])) {
      const existing = byLocalName.get(name) ?? []
      existing.push(api)
      byLocalName.set(name, existing)
    }
  }
  const resolveSymbol = (link: ParsedInlineLink): JSDocApiSeeLinkResolution | undefined => {
    if (link.symbol === undefined) return undefined
    const symbol = link.symbol
    const exact = bySourceRange.get(sourceRangeKey(symbol.file, symbol.range))
    if (exact !== undefined) return { _tag: "Resolved", apiId: exact.id, apiFqn: exact.apiFqn }
    const names = seeTargetNames(link)
    const candidates = (bySourceFile.get(symbol.file) ?? []).filter((api) =>
      apiMatchesSeeTarget(api, names) &&
      (rangeContains(symbol.range, api.source.range) ||
        rangeContains(api.source.range, symbol.range) ||
        rangeOverlaps(symbol.range, api.source.range))
    ).sort((self, that) => rangeWidth(self.source.range) - rangeWidth(that.source.range))
    const unique = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values())
    if (unique.length === 1) return { _tag: "Resolved", apiId: unique[0].id, apiFqn: unique[0].apiFqn }
    if (unique.length > 1) {
      return { _tag: "Unresolved", reason: "ambiguous", candidates: unique.map((candidate) => candidate.id) }
    }
    const sameFileByName = (bySourceFile.get(symbol.file) ?? []).filter((api) => apiMatchesSeeTarget(api, names))
    const uniqueByName = Array.from(new Map(sameFileByName.map((candidate) => [candidate.id, candidate])).values())
    if (uniqueByName.length === 1) {
      return { _tag: "Resolved", apiId: uniqueByName[0].id, apiFqn: uniqueByName[0].apiFqn }
    }
    if (uniqueByName.length > 1) {
      return { _tag: "Unresolved", reason: "ambiguous", candidates: uniqueByName.map((candidate) => candidate.id) }
    }
    return undefined
  }
  return (
    context: { readonly moduleName: string; readonly namespacePath: ReadonlyArray<string> },
    link: ParsedInlineLink
  ): JSDocApiSeeLinkResolution => {
    const symbolResolution = resolveSymbol(link)
    if (symbolResolution !== undefined) return symbolResolution
    const targets = new Set<string>()
    for (const target of normalizeSeeTarget(link.target)) targets.add(target)
    if (link.text !== null) {
      for (const target of normalizeSeeTarget(link.text)) targets.add(target)
    }
    for (const target of targets) {
      const sameModule = byModuleAndName.get(`${context.moduleName}:${target}`)
      if (sameModule !== undefined) return { _tag: "Resolved", apiId: sameModule.id, apiFqn: sameModule.apiFqn }
      if (!target.includes(".") && context.namespacePath.length > 0) {
        const sameNamespace = byModuleAndName.get(
          `${context.moduleName}:${[...context.namespacePath, target].join(".")}`
        )
        if (sameNamespace !== undefined) {
          return { _tag: "Resolved", apiId: sameNamespace.id, apiFqn: sameNamespace.apiFqn }
        }
      }
    }
    const candidates = Array.from(targets).flatMap((target) => byLocalName.get(target) ?? [])
    const unique = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values())
    if (unique.length === 1) return { _tag: "Resolved", apiId: unique[0].id, apiFqn: unique[0].apiFqn }
    if (unique.length > 1) {
      return { _tag: "Unresolved", reason: "ambiguous", candidates: unique.map((candidate) => candidate.id) }
    }
    return { _tag: "Unresolved", reason: "not-found", candidates: [] }
  }
}

function resolveJSDocApiSeeLinks(apis: ReadonlyArray<JSDocApi>): ReadonlyArray<JSDocApi> {
  const resolve = createJSDocApiSeeLinkResolver(apis)
  return apis.map((api) => ({
    ...api,
    see: api.see.map((tag) => ({
      ...tag,
      links: tag.links.map((link) => ({ ...link, resolution: resolve(api, link) }))
    }))
  }))
}

function sameDiagnostic(self: JSDocModelDiagnostic, that: JSDocModelDiagnostic): boolean {
  return self.code === that.code && self.message === that.message &&
    self.range[0] === that.range[0] && self.range[1] === that.range[1]
}

function unresolvedPublicSeeDiagnostic(link: JSDocApiSeeLink): JSDocModelDiagnostic | undefined {
  if (link.resolution._tag === "Resolved" || link.range === undefined) return undefined
  const message = link.resolution.reason === "ambiguous"
    ? `@see link ${link.raw} is ambiguous; it must resolve to exactly one public JSDoc API. Candidates: ${
      link.resolution.candidates.join(", ")
    }`
    : `@see link ${link.raw} does not resolve to a public JSDoc API. Check that the target is exported and has valid public JSDoc.`
  return { ...diagnostic("public-see-target", message), range: link.range }
}

function appendPublicSeeDiagnostics(
  files: ReadonlyArray<JSDocModelFile>,
  apis: ReadonlyArray<JSDocApi>
): { readonly files: ReadonlyArray<JSDocModelFile>; readonly added: boolean } {
  const diagnosticsByFile = new Map(files.map((file) => [file.file, [...file.diagnostics]]))
  let added = false
  for (const api of apis) {
    const diagnostics = diagnosticsByFile.get(api.source.file)
    if (diagnostics === undefined) continue
    for (const tag of api.see) {
      for (const link of tag.links) {
        const item = unresolvedPublicSeeDiagnostic(link)
        if (item === undefined || diagnostics.some((diagnostic) => sameDiagnostic(diagnostic, item))) continue
        diagnostics.push(item)
        added = true
      }
    }
  }
  if (!added) return { files, added }
  return {
    added,
    files: files.map((file) => ({
      ...file,
      diagnostics: diagnosticsByFile.get(file.file) ?? file.diagnostics
    }))
  }
}

function moduleSeeTags(
  file: JSDocModelFile,
  sourceFile: ts.SourceFile,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): ReadonlyArray<JSDocApiSeeTag> {
  if (file.moduleJSDoc === undefined) return []
  const block = parseLooseJSDocBlock(file.moduleJSDoc.raw, [file.moduleJSDoc.range[0], file.moduleJSDoc.range[1]])
  if (block.internal) return []
  const tags = buildTags("module", block.tags)
  const moduleTags: ParsedModuleTags = tags._tag === "Success"
    ? tags.value as ParsedModuleTags
    : {
      since: "0.0.0",
      stability: "stable",
      deprecated: null,
      see: block.tags.filter((tag) => tag.name === "see" && tag.value.trim() !== "").map((tag) =>
        parseSeeTag(tag.value.trim())
      )
    }
  const withSymbols = attachSeeLinkSymbolsFromSourceFile(moduleTags, sourceFile, block, linkContext)
  return unresolvedSee(withSymbols.see)
}

function appendModulePublicSeeDiagnostics(
  files: ReadonlyArray<JSDocModelFile>,
  apis: ReadonlyArray<JSDocApi>,
  context: {
    readonly sourceFilesByFile: ReadonlyMap<string, ts.SourceFile>
    readonly checker: ts.TypeChecker
    readonly entry: ProgramCacheEntry
    readonly cwd: string
  }
): { readonly files: ReadonlyArray<JSDocModelFile>; readonly added: boolean } {
  const diagnosticsByFile = new Map(files.map((file) => [file.file, [...file.diagnostics]]))
  const resolve = createJSDocApiSeeLinkResolver(apis)
  let added = false
  for (const file of files) {
    if (file.imports === undefined || file.moduleJSDoc === undefined) continue
    const sourceFile = context.sourceFilesByFile.get(file.file)
    const diagnostics = diagnosticsByFile.get(file.file)
    if (sourceFile === undefined || diagnostics === undefined) continue
    for (const tag of moduleSeeTags(file, sourceFile, context)) {
      for (const link of tag.links) {
        const item = unresolvedPublicSeeDiagnostic({
          ...link,
          resolution: resolve({ moduleName: file.imports.module, namespacePath: [] }, link)
        })
        if (item === undefined || diagnostics.some((diagnostic) => sameDiagnostic(diagnostic, item))) continue
        diagnostics.push(item)
        added = true
      }
    }
  }
  if (!added) return { files, added }
  return {
    added,
    files: files.map((file) => ({
      ...file,
      diagnostics: diagnosticsByFile.get(file.file) ?? file.diagnostics
    }))
  }
}

function buildJSDocApisWithPublicSeeDiagnostics(
  files: ReadonlyArray<JSDocModelFile>,
  context?: {
    readonly sourceFilesByFile: ReadonlyMap<string, ts.SourceFile>
    readonly checker: ts.TypeChecker
    readonly entry: ProgramCacheEntry
    readonly cwd: string
  }
): {
  readonly files: ReadonlyArray<JSDocModelFile>
  readonly apis: ReadonlyArray<JSDocApi>
} {
  let current = files
  for (let index = 0; index < 5; index++) {
    const apis = buildJSDocApis(current)
    const publicSee = appendPublicSeeDiagnostics(current, apis)
    const moduleSee = context === undefined
      ? { files: publicSee.files, added: false }
      : appendModulePublicSeeDiagnostics(publicSee.files, apis, context)
    const next = { files: moduleSee.files, added: publicSee.added || moduleSee.added }
    if (!next.added) return { files: current, apis }
    current = next.files
  }
  return { files: current, apis: buildJSDocApis(current) }
}

interface ExampleImportPolicy {
  readonly allowedNamedBySource: ReadonlyMap<string, ReadonlySet<string>>
  readonly namespaceModuleBySource: ReadonlyMap<string, { readonly barrelModule: string; readonly name: string }>
  readonly flatModuleBySource: ReadonlyMap<
    string,
    { readonly barrelModule: string; readonly names: ReadonlySet<string> }
  >
  readonly namedModuleBySource: ReadonlyMap<string, ReadonlySet<string>>
}

function createExampleImportPolicy(files: ReadonlyArray<JSDocModelFile>): ExampleImportPolicy {
  const allowedNamed = new Map<string, Set<string>>()
  const namespaceModuleBySource = new Map<string, { readonly barrelModule: string; readonly name: string }>()
  const flatModuleBySource = new Map<string, { readonly barrelModule: string; readonly names: ReadonlySet<string> }>()
  const namedModuleBySource = new Map<string, ReadonlySet<string>>()
  const addAllowed = (source: string, name: string) => {
    const names = allowedNamed.get(source) ?? new Set<string>()
    names.add(name)
    allowedNamed.set(source, names)
  }
  for (const file of files) {
    if (file.imports === undefined) continue
    const rootValues = file.declarations.filter((declaration) =>
      declaration.bucket === "value" && isIdentifierName(declaration.name)
    ).map((declaration) => declaration.name)
    if (file.imports.barrel?.type === "namespace") {
      addAllowed(file.imports.barrel.module, file.imports.barrel.name)
      for (const name of file.imports.flatNames) addAllowed(file.imports.barrel.module, name)
      namespaceModuleBySource.set(file.imports.module, {
        barrelModule: file.imports.barrel.module,
        name: file.imports.barrel.name
      })
      continue
    }
    if (file.imports.barrel?.type === "flat") {
      for (const name of new Set([...rootValues, ...file.imports.flatNames])) {
        addAllowed(file.imports.barrel.module, name)
      }
      flatModuleBySource.set(file.imports.module, {
        barrelModule: file.imports.barrel.module,
        names: new Set([...rootValues, ...file.imports.flatNames])
      })
      continue
    }
    for (const name of rootValues) addAllowed(file.imports.module, name)
    namedModuleBySource.set(file.imports.module, new Set(rootValues))
  }
  return { allowedNamedBySource: allowedNamed, namespaceModuleBySource, flatModuleBySource, namedModuleBySource }
}

function importSpecifierName(specifier: ts.ImportSpecifier): string {
  return specifier.propertyName?.text ?? specifier.name.text
}

function validateExampleImports(
  code: string,
  policy: ExampleImportPolicy
): ReadonlyArray<JSDocDiagnostic> {
  const diagnostics: Array<JSDocDiagnostic> = []
  const sourceFile = ts.createSourceFile("example.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue
    if (statement.importClause?.isTypeOnly) continue
    const source = statement.moduleSpecifier.text
    const namedAllowed = policy.allowedNamedBySource.get(source)
    const namespaceModule = policy.namespaceModuleBySource.get(source)
    const flatModule = policy.flatModuleBySource.get(source)
    const namedModule = policy.namedModuleBySource.get(source)
    const clause = statement.importClause
    if (clause === undefined) continue
    if (namespaceModule !== undefined) {
      diagnostics.push(diagnostic(
        "example-import-style",
        `JSDoc examples should use \`import { ${namespaceModule.name} } from "${namespaceModule.barrelModule}"\` instead of importing from "${source}"`
      ))
      continue
    }
    if (flatModule !== undefined) {
      diagnostics.push(diagnostic(
        "example-import-style",
        `JSDoc examples should import ${
          Array.from(flatModule.names).map((name) => `\`${name}\``).join(", ")
        } from "${flatModule.barrelModule}" instead of "${source}"`
      ))
      continue
    }
    if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
      if (namedAllowed !== undefined || namedModule !== undefined) {
        diagnostics.push(diagnostic("example-import-style", `JSDoc examples should use named imports from "${source}"`))
      }
      continue
    }
    if (clause.name !== undefined && (namedAllowed !== undefined || namedModule !== undefined)) {
      diagnostics.push(
        diagnostic("example-import-style", `JSDoc examples should not use default imports from "${source}"`)
      )
    }
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && namedAllowed !== undefined) {
      for (const specifier of clause.namedBindings.elements) {
        if (specifier.isTypeOnly) continue
        const imported = importSpecifierName(specifier)
        if (!namedAllowed.has(imported)) {
          diagnostics.push(diagnostic(
            "example-import-style",
            `JSDoc example import \`${imported}\` from "${source}" is not a canonical public API import`
          ))
        }
      }
    }
  }
  return diagnostics
}

function appendExampleImportDiagnostics(files: ReadonlyArray<JSDocModelFile>): ReadonlyArray<JSDocModelFile> {
  const policy = createExampleImportPolicy(files)
  const checkExamples = (
    examples: ReadonlyArray<ParsedExample>,
    range: readonly [number, number] = [0, 0] as const
  ): ReadonlyArray<JSDocModelDiagnostic> =>
    examples.flatMap((example) => validateExampleImports(example.code, policy).map((item) => ({ ...item, range })))
  const checkModuleExamples = (moduleJSDoc: ParsedModuleJSDoc | undefined): ReadonlyArray<JSDocModelDiagnostic> => {
    if (moduleJSDoc === undefined) return []
    const block = parseLooseJSDocBlock(moduleJSDoc.raw, [moduleJSDoc.range[0], moduleJSDoc.range[1]])
    if (block.internal) return []
    return checkExamples(parseModuleExamples(block).examples, moduleJSDoc.range)
  }
  const checkMembers = (members: ReadonlyArray<ParsedMember>): ReadonlyArray<JSDocModelDiagnostic> =>
    members.flatMap((member) => [
      ...checkExamples(member.examples),
      ...checkMembers(member.members)
    ])
  const checkNamespaces = (namespaces: ReadonlyArray<ParsedNamespace>): ReadonlyArray<JSDocModelDiagnostic> =>
    namespaces.flatMap((namespace) => [
      ...checkExamples(namespace.examples),
      ...namespace.declarations.flatMap((declaration) => [
        ...checkExamples(declaration.examples),
        ...checkMembers(declaration.members)
      ]),
      ...checkNamespaces(namespace.namespaces)
    ])
  return files.map((file) => {
    const diagnostics = [
      ...file.diagnostics,
      ...checkModuleExamples(file.moduleJSDoc),
      ...file.declarations.flatMap((declaration) => [
        ...checkExamples(declaration.examples),
        ...checkMembers(declaration.members)
      ]),
      ...checkNamespaces(file.namespaces)
    ]
    return diagnostics.length === file.diagnostics.length
      ? file
      : { ...file, diagnostics: uniqueModelDiagnostics(diagnostics) }
  })
}

function uniqueModelDiagnostics(
  diagnostics: ReadonlyArray<JSDocModelDiagnostic>
): ReadonlyArray<JSDocModelDiagnostic> {
  const seen = new Set<string>()
  return diagnostics.filter((item) => {
    const key = `${item.code}:${item.message}:${item.range[0]}:${item.range[1]}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function nodeRange(node: ts.Node): [number, number] {
  return [node.getStart(), node.getEnd()]
}

function normalizeFile(cwd: string, filename: string): string {
  return normalizePathName(path.relative(cwd, filename))
}

function hashSource(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex")
}

function getNodeJSDoc(node: ts.Node): JSDocBlock | undefined {
  const jsDocs = (node as { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc
  const jsDoc = jsDocs?.[jsDocs.length - 1]
  if (jsDoc === undefined) return undefined
  const source = node.getSourceFile().text
  return parseJSDocBlock(source.slice(jsDoc.pos, jsDoc.end), [jsDoc.pos, jsDoc.end])
}

function addModelDiagnostics(
  out: Array<JSDocModelDiagnostic>,
  range: [number, number],
  diagnostics: ReadonlyArray<JSDocDiagnostic>
) {
  for (const item of diagnostics) out.push({ ...item, range })
}

function addJSDocLinkDiagnostics(
  sourceFile: ts.SourceFile,
  block: JSDocBlock,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
) {
  if (!hasInlineLink(block)) return
  for (const link of malformedInlineLinks(block)) {
    diagnostics.push({ ...diagnostic("malformed-link", `Malformed JSDoc inline link: ${link}`), range: block.range })
  }
  for (const link of collectJSDocLinks(sourceFile, block)) {
    const text = link.getText(sourceFile)
    const target = extractInlineLinkTarget(text)
    if (target === "") continue
    if (urlRegex.test(target)) {
      diagnostics.push({
        ...diagnostic("url-link", `JSDoc inline link must target a TypeScript symbol: ${text}`),
        range: [link.pos, link.end]
      })
    } else if (resolveJSDocLinkSymbol(link, linkContext.checker) === undefined) {
      diagnostics.push({
        ...diagnostic("unresolved-link", `Unresolved JSDoc inline link: ${text}`),
        range: [link.pos, link.end]
      })
    }
  }
  for (const link of collectJSDocSeeLinks(sourceFile, block)) {
    const text = link.getText(sourceFile)
    const target = extractInlineLinkTarget(text)
    if (target === "" || urlRegex.test(target)) continue
    const symbol = resolveJSDocLinkSymbol(link, linkContext.checker)
    if (symbol === undefined) continue
    if (undocumentedSeeLinkTarget(symbol, linkContext.checker, linkContext.cwd) !== undefined) {
      diagnostics.push({
        ...diagnostic("undocumented-see-target", `@see link target must have public JSDoc: ${text}`),
        range: [link.pos, link.end]
      })
    }
  }
}

function parseDocumentedTs(
  node: ts.Node,
  scope: DocScope,
  diagnostics: Array<JSDocModelDiagnostic>,
  required = true,
  linkContext?: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
) {
  const block = getNodeJSDoc(node)
  if (block?.internal) return undefined
  if (block === undefined) {
    if (required) {
      diagnostics.push({
        ...diagnostic("missing-jsdoc", scope === "member" ? "Member JSDoc is required" : "Public JSDoc is required"),
        range: nodeRange(node)
      })
    }
    return undefined
  }
  addModelDiagnostics(diagnostics, block.range, block.diagnostics)
  if (block.parsed === undefined) return undefined
  const tags = buildTags(scope, block.parsed.tags)
  if (tags._tag === "Failure") {
    addModelDiagnostics(diagnostics, block.range, tags.error.diagnostics)
    return undefined
  }
  const parsedTags = tags.value as ParsedDeclarationTags | ParsedNamespaceTags | ParsedMemberTags
  if (linkContext !== undefined) addJSDocLinkDiagnostics(node.getSourceFile(), block, diagnostics, linkContext)
  return {
    core: block.parsed,
    tags: linkContext === undefined ? parsedTags : attachSeeLinkSymbols(parsedTags, node, block, linkContext)
  }
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false)
}

function declarationName(node: ts.Node): string | undefined {
  if (
    (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) || ts.isModuleDeclaration(node)) && node.name !== undefined
  ) return node.name.text
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((declaration) => {
      if (ts.isIdentifier(declaration.name)) return declaration.name.text
      if (ts.isObjectBindingPattern(declaration.name)) {
        return declaration.name.elements.map((element) =>
          element.propertyName?.getText(element.getSourceFile()) ?? element.name.getText(element.getSourceFile())
        ).join(", ")
      }
      return ""
    }).filter(Boolean).join(", ")
  }
  return undefined
}

function publicDeclarationRange(node: ts.Node, name: string): readonly [number, number] {
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations.find((item) =>
      ts.isIdentifier(item.name) && item.name.text === name
    )
    if (declaration !== undefined) return nodeRange(declaration)
  }
  return nodeRange(node)
}

function bucketOfTs(node: ts.Node): ExportBucket | undefined {
  if (ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return "value"
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return "type"
  return undefined
}

function normalizeSignature(cwd: string, text: string): string | null {
  const normalizedCwd = normalizePathName(cwd)
  const signature = text.replaceAll(normalizedCwd, ".").replaceAll(cwd, ".").replace(/\r\n?/g, "\n").replace(
    /[ \t]+$/gm,
    ""
  ).trim()
  return signature === "" ? null : signature
}

function displaySignature(text: string): string {
  return text.replace(/import\((?:"[^"]+"|'[^']+')\)\.([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)/g, "$1")
}

function parseableSignature(cwd: string, text: string): string | null {
  const signature = normalizeSignature(cwd, displaySignature(text))
  if (signature === null) return null
  const source = ts.createSourceFile(
    "signature.ts",
    signature,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  ) as SourceFileWithParseDiagnostics
  return source.parseDiagnostics.length === 0 ? signature : null
}

function signatureLocalName(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9_$]/g, "_")
  return `_${sanitized === "" ? "api" : sanitized}`
}

function signatureExportName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

function signatureAlias(name: string, text: string): string {
  const localName = signatureLocalName(name)
  return `declare const ${localName}: ${text}
export { ${localName} as ${signatureExportName(name)} }`
}

function signatureParameterDeclaration(parameter: ts.Symbol): ts.ParameterDeclaration | undefined {
  const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0]
  return declaration !== undefined && ts.isParameter(declaration) ? declaration : undefined
}

function signatureParameterName(parameter: ts.Symbol): string {
  const declaration = signatureParameterDeclaration(parameter)
  if (declaration !== undefined && ts.isIdentifier(declaration.name)) return declaration.name.text
  return parameter.getName()
}

function signatureFunctionThisKind(type: ts.Type, checker: ts.TypeChecker, location: ts.Node): string {
  const thisParameter = checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0]?.thisParameter
  if (thisParameter === undefined) return "none"
  const thisType = checker.typeToString(
    checker.getTypeOfSymbolAtLocation(thisParameter, location),
    location,
    signatureTypeFormatFlags
  )
  return thisType === "unassigned" ? "unassigned" : "self"
}

function isSignatureFunctionKind(kind: string): boolean {
  return kind.startsWith("body:") || kind.startsWith("function:")
}

function signatureTransformCountKind(count: number): string {
  if (count <= 3) return String(count)
  if (count <= 7) return "4"
  if (count <= 15) return "8"
  return "16"
}

function signatureParameterKind(
  parameter: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  location: ts.Node
): string {
  if (parameter === undefined) return "none"
  const declaration = signatureParameterDeclaration(parameter)
  if (declaration?.dotDotDotToken !== undefined) return "rest"
  const name = signatureParameterName(parameter).replace(/_$/, "").toLowerCase()
  const type = checker.getTypeOfSymbolAtLocation(parameter, declaration ?? location)
  if (name === "self" || name === "that") return "self"
  if (name === "body") return `body:${signatureFunctionThisKind(type, checker, location)}`
  if (name === "name" || name === "spanname") return "name"
  if (name.includes("refinement")) return "refinement"
  if (name.includes("predicate")) return "predicate"
  if (name === "options" || name === "option" || name === "opts" || name === "config" || name === "args") {
    return "options"
  }
  if (name === "f" || name === "fn" || name === "callback") {
    return `function:${signatureFunctionThisKind(type, checker, location)}`
  }
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
    return `function:${signatureFunctionThisKind(type, checker, location)}`
  }
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) return "primitive:string"
  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) return "primitive:number"
  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) return "primitive:boolean"
  if ((type.flags & ts.TypeFlags.BigIntLike) !== 0) return "primitive:bigint"
  if ((type.flags & ts.TypeFlags.ESSymbolLike) !== 0) return "primitive:symbol"
  if ((type.flags & ts.TypeFlags.Object) !== 0 || checker.getPropertiesOfType(type).length > 0) return "object"
  return "other"
}

function signatureTailKind(signature: ts.Signature, checker: ts.TypeChecker, location: ts.Node): string {
  if (signature.parameters.length <= 1) return "none"
  const firstKind = signatureParameterKind(signature.parameters[0], checker, location)
  const tailKinds = signature.parameters.slice(1).map((parameter) =>
    signatureParameterKind(parameter, checker, location)
  )
  if (firstKind === "options") {
    const hasTransformTail = tailKinds.length > 1 && tailKinds.slice(1).every(isSignatureFunctionKind)
    return `${tailKinds[0]}:${hasTransformTail ? "transform" : "none"}`
  }
  if (tailKinds.every(isSignatureFunctionKind)) {
    return firstKind.startsWith("body:")
      ? "transform"
      : `transform:${signatureTransformCountKind(tailKinds.length)}`
  }
  return tailKinds[0]
}

function signatureShapeKey(signature: ts.Signature, checker: ts.TypeChecker, location: ts.Node): string {
  const hasRest = signature.parameters.some((parameter) =>
    signatureParameterDeclaration(parameter)?.dotDotDotToken !== undefined
  )
  const returnType = checker.getReturnTypeOfSignature(signature)
  const returnMode = checker.getSignaturesOfType(returnType, ts.SignatureKind.Call).length > 0 ? "curried" : "direct"
  return [
    hasRest ? "rest" : "fixed",
    signatureParameterKind(signature.parameters[0], checker, location),
    signatureTailKind(signature, checker, location),
    returnMode
  ].join(":")
}

function representativeSignatures(
  signatures: ReadonlyArray<ts.Signature>,
  checker: ts.TypeChecker,
  location: ts.Node
): ReadonlyArray<ts.Signature> {
  const seen = new Set<string>()
  const out: Array<ts.Signature> = []
  for (const signature of signatures) {
    const key = signatureShapeKey(signature, checker, location)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(signature)
  }
  return out
}

function functionSignature(
  name: string,
  symbol: ts.Symbol,
  location: ts.Node,
  checker: ts.TypeChecker,
  cwd: string
): string | null {
  const target = resolvedSymbolTarget(symbol, checker)
  const type = checker.getTypeOfSymbolAtLocation(target, location)
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call)
  if (signatures.length === 0) return null
  const callSignatures: Array<string> = []
  for (const signature of representativeSignatures(signatures, checker, location)) {
    const text = normalizeSignature(
      cwd,
      checker.signatureToString(signature, location, signatureTypeFormatFlags, ts.SignatureKind.Call)
    )
    if (text === null) return null
    callSignatures.push(text)
  }
  const declaration = parseableSignature(
    cwd,
    callSignatures.map((text) => `declare function ${name}${text}`).join("\n")
  )
  if (declaration !== null) return declaration
  const callSignatureAlias = parseableSignature(
    cwd,
    signatureAlias(
      name,
      `{
${callSignatures.map((text) => `  ${text};`).join("\n")}
}`
    )
  )
  if (callSignatureAlias !== null) return callSignatureAlias
  const typeText = normalizeSignature(cwd, checker.typeToString(type, location, signatureTypeFormatFlags))
  if (typeText === null) return null
  return parseableSignature(cwd, `declare const ${name}: ${typeText}`) ??
    parseableSignature(cwd, signatureAlias(name, typeText))
}

function symbolSignature(
  name: string,
  bucket: ExportBucket,
  symbol: ts.Symbol,
  location: ts.Node,
  checker: ts.TypeChecker,
  cwd: string
): string | null {
  if (bucket !== "value") return null
  const target = resolvedSymbolTarget(symbol, checker)
  const type = checker.getTypeOfSymbolAtLocation(target, location)
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length === 0) return null
  return functionSignature(name, symbol, location, checker, cwd)
}

function declarationSignature(
  name: string,
  bucket: ExportBucket,
  node: ts.Node,
  checker: ts.TypeChecker,
  cwd: string
): string | null {
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations.find((item) =>
      ts.isIdentifier(item.name) && item.name.text === name
    )
    if (declaration === undefined) return null
    const symbol = checker.getSymbolAtLocation(declaration.name)
    return symbol === undefined ? null : symbolSignature(name, bucket, symbol, declaration.name, checker, cwd)
  }
  const nameNode = ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ? node.name
    : undefined
  if (nameNode === undefined) return null
  const symbol = checker.getSymbolAtLocation(nameNode)
  return symbol === undefined ? null : symbolSignature(name, bucket, symbol, nameNode, checker, cwd)
}

function exportSpecifierSignature(
  name: string,
  bucket: ExportBucket,
  specifier: ts.ExportSpecifier,
  checker: ts.TypeChecker,
  cwd: string
): string | null {
  const symbol = checker.getSymbolAtLocation(specifier.name) ??
    (specifier.propertyName === undefined ? undefined : checker.getSymbolAtLocation(specifier.propertyName))
  return symbol === undefined ? null : symbolSignature(name, bucket, symbol, specifier.name, checker, cwd)
}

function parseMembersFromTsType(
  type: ts.TypeNode | undefined,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): Array<ParsedMember> {
  if (!type) return []
  if (ts.isTypeLiteralNode(type)) return parseTsMembers(type.members, diagnostics, linkContext)
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    return type.types.flatMap((item) => parseMembersFromTsType(item, diagnostics, linkContext))
  }
  if (ts.isParenthesizedTypeNode(type) || ts.isTypeOperatorNode(type)) {
    return parseMembersFromTsType(type.type, diagnostics, linkContext)
  }
  if (ts.isArrayTypeNode(type)) return parseMembersFromTsType(type.elementType, diagnostics, linkContext)
  if (ts.isConditionalTypeNode(type)) {
    return [
      ...parseMembersFromTsType(type.checkType, diagnostics, linkContext),
      ...parseMembersFromTsType(type.extendsType, diagnostics, linkContext),
      ...parseMembersFromTsType(type.trueType, diagnostics, linkContext),
      ...parseMembersFromTsType(type.falseType, diagnostics, linkContext)
    ]
  }
  if (ts.isTypeReferenceNode(type)) {
    return type.typeArguments?.flatMap((item) => parseMembersFromTsType(item, diagnostics, linkContext)) ?? []
  }
  if (ts.isMappedTypeNode(type)) return parseMembersFromTsType(type.type, diagnostics, linkContext)
  if (ts.isIndexedAccessTypeNode(type)) {
    return [
      ...parseMembersFromTsType(type.objectType, diagnostics, linkContext),
      ...parseMembersFromTsType(type.indexType, diagnostics, linkContext)
    ]
  }
  if (ts.isFunctionTypeNode(type) || ts.isConstructorTypeNode(type)) {
    return parseMembersFromTsType(type.type, diagnostics, linkContext)
  }
  return []
}

function memberName(member: ts.TypeElement | ts.ClassElement): string {
  if (
    ts.isPropertySignature(member) || ts.isMethodSignature(member) || ts.isPropertyDeclaration(member) ||
    ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)
  ) {
    const name = member.name
    if (ts.isComputedPropertyName(name)) return name.expression.getText(member.getSourceFile())
    return name.getText(member.getSourceFile()).replace(/^[']|[']$/g, "")
  }
  return ""
}

function memberType(member: ts.TypeElement | ts.ClassElement): ts.TypeNode | undefined {
  if (
    ts.isPropertySignature(member) || ts.isMethodSignature(member) || ts.isPropertyDeclaration(member) ||
    ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)
  ) return member.type
  return undefined
}

function parseTsMembers(
  members: ts.NodeArray<ts.TypeElement | ts.ClassElement>,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): Array<ParsedMember> {
  const out: Array<ParsedMember> = []
  for (const member of members) {
    if (
      ts.isCallSignatureDeclaration(member) || ts.isConstructSignatureDeclaration(member) ||
      ts.isIndexSignatureDeclaration(member) || member.kind === ts.SyntaxKind.Constructor
    ) continue
    const documented = parseDocumentedTs(member, "member", diagnostics, false, linkContext)
    if (documented === undefined) continue
    const name = memberName(member)
    if (name === "") continue
    const nested = parseMembersFromTsType(memberType(member), diagnostics, linkContext)
    out.push({
      name,
      signature: null,
      range: nodeRange(member),
      description: documented.core.description,
      examples: documented.core.examples,
      tags: documented.tags as ParsedMemberTags,
      members: nested
    })
  }
  return out
}

function parseDeclarationMembersTs(
  node: ts.Node,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): Array<ParsedMember> {
  if (ts.isInterfaceDeclaration(node)) return parseTsMembers(node.members, diagnostics, linkContext)
  if (ts.isClassDeclaration(node)) return parseTsMembers(node.members, diagnostics, linkContext)
  if (ts.isTypeAliasDeclaration(node)) return parseMembersFromTsType(node.type, diagnostics, linkContext)
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.flatMap((d) => parseMembersFromTsType(d.type, diagnostics, linkContext))
  }
  if (ts.isFunctionDeclaration(node)) return parseMembersFromTsType(node.type, diagnostics, linkContext)
  return []
}

function hasDeclareModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ?? false)
}

function parseNamespaceTs(
  node: ts.ModuleDeclaration,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string },
  isInsideDeclare = false
): ParsedNamespace | undefined {
  if (!ts.isIdentifier(node.name)) return undefined
  if (!isInsideDeclare && !hasDeclareModifier(node)) {
    diagnostics.push({
      ...diagnostic("namespace-declare", "Namespaces must be declared with declare namespace"),
      range: nodeRange(node)
    })
    return undefined
  }
  const documented = parseDocumentedTs(node, "namespace", diagnostics, true, linkContext)
  if (documented === undefined) return undefined
  const declarations: Array<ParsedNamespaceDeclaration> = []
  const namespaces: Array<ParsedNamespace> = []
  if (node.body !== undefined && ts.isModuleBlock(node.body)) {
    for (const statement of node.body.statements) {
      if (!hasExportModifier(statement)) continue
      if (ts.isModuleDeclaration(statement)) {
        const nested = parseNamespaceTs(statement, diagnostics, linkContext, true)
        if (nested !== undefined) namespaces.push(nested)
        continue
      }
      if (ts.isEnumDeclaration(statement)) {
        diagnostics.push({ ...diagnostic("enum", "Enums are not allowed"), range: nodeRange(statement) })
        continue
      }
      const bucket = bucketOfTs(statement)
      if (bucket !== "type") {
        diagnostics.push({
          ...diagnostic("namespace-value", "Namespace exports must be type declarations"),
          range: nodeRange(statement)
        })
        continue
      }
      const nestedDocumented = parseDocumentedTs(statement, "namespace-declaration", diagnostics, true, linkContext)
      if (nestedDocumented === undefined) continue
      const name = declarationName(statement)
      if (name === undefined || name.length === 0) {
        diagnostics.push({
          ...diagnostic("missing-name", "Namespace declaration name could not be determined"),
          range: nodeRange(statement)
        })
        continue
      }
      declarations.push({
        name,
        signature: null,
        range: publicDeclarationRange(statement, name),
        description: nestedDocumented.core.description,
        examples: nestedDocumented.core.examples,
        tags: nestedDocumented.tags as ParsedNamespaceTags,
        members: parseDeclarationMembersTs(statement, diagnostics, linkContext)
      })
    }
  }
  return {
    name: node.name.text,
    signature: null,
    range: nodeRange(node),
    description: documented.core.description,
    examples: documented.core.examples,
    tags: documented.tags as ParsedNamespaceTags,
    declarations,
    namespaces
  }
}

function skipLeadingIgnoredTrivia(source: string): number {
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index++
    if (!source.startsWith("//", index)) return index
    const lineEnd = source.indexOf("\n", index)
    const end = lineEnd === -1 ? source.length : lineEnd + 1
    if (!isSkippableDirectiveComment(source.slice(index, end))) return index
    index = end
  }
  return index
}

function sourceFileTopLevelJSDoc(sourceFile: ts.SourceFile): ParsedModuleJSDoc | undefined {
  const source = sourceFile.text
  const start = skipLeadingIgnoredTrivia(source)
  if (!source.startsWith("/**", start)) return undefined
  const end = source.indexOf("*/", start + 3)
  if (end === -1) return undefined
  const range = [start, end + 2] as const
  const firstStatement = sourceFile.statements[0]
  if (firstStatement !== undefined) {
    const jsDocs = (firstStatement as { readonly jsDoc?: ReadonlyArray<ts.JSDoc> }).jsDoc ?? []
    if (
      jsDocs.some((jsDoc) => jsDoc.pos === range[0] && jsDoc.end === range[1]) &&
      !ts.isImportDeclaration(firstStatement) &&
      !ts.isImportEqualsDeclaration(firstStatement)
    ) return undefined
  }
  return { raw: source.slice(range[0], range[1]), range }
}

function parseModuleJSDocTs(
  sourceFile: ts.SourceFile,
  moduleJSDoc: ParsedModuleJSDoc,
  diagnostics: Array<JSDocModelDiagnostic>,
  linkContext: { readonly checker: ts.TypeChecker; readonly entry: ProgramCacheEntry; readonly cwd: string }
): ParsedModuleJSDoc | undefined {
  const block = parseLooseJSDocBlock(moduleJSDoc.raw, [moduleJSDoc.range[0], moduleJSDoc.range[1]])
  if (block.internal) return undefined
  const tags = buildTags("module", block.tags)
  if (tags._tag === "Failure") addModelDiagnostics(diagnostics, block.range, tags.error.diagnostics)
  const examples = parseModuleExamples(block)
  addModelDiagnostics(diagnostics, block.range, examples.diagnostics)
  addJSDocLinkDiagnostics(sourceFile, block, diagnostics, linkContext)
  return moduleJSDoc
}

function parseSourceFileDocs(
  cwd: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  entry: ProgramCacheEntry
): { readonly parsed: ParsedJSDocFile; readonly diagnostics: ReadonlyArray<JSDocModelDiagnostic> } {
  const diagnostics: Array<JSDocModelDiagnostic> = []
  const declarations: Array<ParsedRootDeclaration> = []
  const namespaces: Array<ParsedNamespace> = []
  const linkContext = { checker, entry, cwd }
  const checkedFunctionOverloads = new Set<string>()
  const moduleJSDoc = sourceFileTopLevelJSDoc(sourceFile)
  const parsedModuleJSDoc = moduleJSDoc === undefined
    ? undefined
    : parseModuleJSDocTs(sourceFile, moduleJSDoc, diagnostics, linkContext)

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) continue
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined) continue
      if (ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length === 0) {
        diagnostics.push({
          ...diagnostic("empty-export", "Empty export declarations are not allowed"),
          range: nodeRange(statement)
        })
      }
      if (ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          const documented = parseDocumentedTs(specifier, "declaration", diagnostics, true, linkContext)
          if (documented === undefined) continue
          declarations.push({
            name: specifier.name.text,
            bucket: statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value",
            signature: exportSpecifierSignature(
              specifier.name.text,
              statement.isTypeOnly || specifier.isTypeOnly ? "type" : "value",
              specifier,
              checker,
              cwd
            ),
            range: nodeRange(specifier),
            description: documented.core.description,
            examples: documented.core.examples,
            tags: documented.tags as ParsedDeclarationTags,
            members: []
          })
        }
      }
      continue
    }
    if (!hasExportModifier(statement) || hasDefaultModifier(statement)) continue
    if (ts.isModuleDeclaration(statement)) {
      const namespace = parseNamespaceTs(statement, diagnostics, linkContext)
      if (namespace !== undefined) namespaces.push(namespace)
      continue
    }
    if (ts.isEnumDeclaration(statement)) {
      diagnostics.push({ ...diagnostic("enum", "Enums are not allowed"), range: nodeRange(statement) })
      continue
    }
    const bucket = bucketOfTs(statement)
    if (bucket === undefined) continue
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      const name = statement.name.text
      if (statement.body === undefined) {
        if (checkedFunctionOverloads.has(name)) continue
        checkedFunctionOverloads.add(name)
      } else if (checkedFunctionOverloads.has(name)) {
        continue
      }
    }
    const documented = parseDocumentedTs(statement, "declaration", diagnostics, true, linkContext)
    if (documented === undefined) continue
    const name = declarationName(statement)
    if (name === undefined || name.length === 0) {
      diagnostics.push({
        ...diagnostic("missing-name", "Root declaration name could not be determined"),
        range: nodeRange(statement)
      })
      continue
    }
    declarations.push({
      name,
      bucket,
      signature: declarationSignature(name, bucket, statement, checker, cwd),
      range: publicDeclarationRange(statement, name),
      description: documented.core.description,
      examples: documented.core.examples,
      tags: documented.tags as ParsedDeclarationTags,
      members: parseDeclarationMembersTs(statement, diagnostics, linkContext)
    })
  }
  return {
    parsed: {
      ...(parsedModuleJSDoc === undefined ? {} : { moduleJSDoc: parsedModuleJSDoc }),
      declarations,
      namespaces
    },
    diagnostics: uniqueDiagnostics(diagnostics) as Array<JSDocModelDiagnostic>
  }
}

/**
 * Loads a JSDoc extraction configuration from JSON.
 *
 * @category configuration
 * @since 4.0.0
 */
export function loadJSDocConfig(cwd = process.cwd(), configPath = "jsdocs.config.json"): JSDocConfig {
  const absolute = path.resolve(cwd, configPath)
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as JSDocConfig
  return parsed
}

/**
 * Extracts a complete JSDoc model synchronously.
 *
 * @category extraction
 * @since 4.0.0
 */
export function extractJSDocsSync(options: ExtractJSDocsOptions): JSDocModel {
  // Share caches within an extraction, not across source snapshots.
  programCache.clear()
  packageMetadataCache.clear()
  barrelExportCache.clear()
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const tsconfigPath = path.resolve(cwd, options.tsconfig)
  const entry = getProgram(tsconfigPath)
  if (entry.error !== undefined || entry.program === undefined) {
    throw new Error(entry.error ?? `Unable to read ${tsconfigPath}`)
  }
  const program = entry.program
  const checker = program.getTypeChecker()
  const sourceByPath = new Map(program.getSourceFiles().map((file) => [path.resolve(file.fileName), file]))
  const sourceFilesByFile = new Map(program.getSourceFiles().map((file) => [normalizeFile(cwd, file.fileName), file]))
  const files = globSync([...options.include], {
    cwd,
    absolute: true,
    nodir: true,
    ignore: [...options.exclude ?? []]
  }).sort()
  const modelFiles: Array<JSDocModelFile> = []
  for (const filename of files) {
    const source = fs.readFileSync(filename, "utf8")
    const file = normalizeFile(cwd, filename)
    const hash = hashSource(source)
    const sourceFile = sourceByPath.get(path.resolve(filename))
    if (sourceFile === undefined) {
      modelFiles.push({
        file,
        hash,
        diagnostics: [{ ...diagnostic("tsconfig", `${file} is not included in ${options.tsconfig}`), range: [0, 0] }],
        declarations: [],
        namespaces: []
      })
      continue
    }
    const result = parseSourceFileDocs(cwd, sourceFile, checker, entry)
    if (
      result.diagnostics.length === 0 && result.parsed.declarations.length === 0 &&
      result.parsed.namespaces.length === 0 && result.parsed.moduleJSDoc === undefined
    ) continue
    const fileDiagnostics = [...result.diagnostics]
    let importsValue: ParsedJSDocImports | undefined
    if (
      result.parsed.declarations.length > 0 || result.parsed.namespaces.length > 0 ||
      result.parsed.moduleJSDoc !== undefined
    ) {
      const imports = resolveJSDocImports(cwd, filename)
      if (imports._tag === "Success") importsValue = imports.value
      else {
        fileDiagnostics.push({
          ...diagnostic(
            "imports",
            `Unable to resolve jsdocs imports: ${imports.error}. Add the missing barrel/package export or exclude this file from jsdocs.`
          ),
          range: [0, 0]
        })
      }
    }
    modelFiles.push({
      file,
      hash,
      diagnostics: fileDiagnostics,
      ...(importsValue === undefined ? {} : { imports: importsValue }),
      ...result.parsed
    })
  }
  const filesWithExampleDiagnostics = appendExampleImportDiagnostics(modelFiles)
  const withPublicSeeDiagnostics = buildJSDocApisWithPublicSeeDiagnostics(filesWithExampleDiagnostics, {
    sourceFilesByFile,
    checker,
    entry,
    cwd
  })
  return {
    version: 3,
    generatedBy: "@effect/jsdocs",
    generatedAt: new Date().toISOString(),
    inputHash: computeJSDocInputHash(options),
    files: withPublicSeeDiagnostics.files,
    apis: withPublicSeeDiagnostics.apis
  }
}

/**
 * Extracts a complete JSDoc model in `Effect`.
 *
 * @category extraction
 * @since 4.0.0
 */
export const extractJSDocs = (options: ExtractJSDocsOptions): Effect.Effect<JSDocModel> =>
  Effect.sync(() => extractJSDocsSync(options))

/**
 * Writes a JSDoc model as formatted JSON.
 *
 * @category persistence
 * @since 4.0.0
 */
export function writeJSDocModel(cwd: string, output: string, model: JSDocModel) {
  const filename = path.resolve(cwd, output)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, `${JSON.stringify(model, null, 2)}\n`)
}

/**
 * Reads and validates the outer structure of a persisted JSDoc model.
 *
 * @category persistence
 * @since 4.0.0
 */
export function readJSDocModel(filename: string): Result<JSDocModel, string> {
  if (!fs.existsSync(filename)) return { _tag: "Failure", error: "missing" }
  try {
    const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as JSDocModel
    if (parsed.version !== 3) return { _tag: "Failure", error: "Unsupported jsdocs model version" }
    if (!Array.isArray(parsed.files)) return { _tag: "Failure", error: "Invalid jsdocs model: files must be an array" }
    if (!Array.isArray(parsed.apis)) return { _tag: "Failure", error: "Invalid jsdocs model: apis must be an array" }
    return { _tag: "Success", value: parsed }
  } catch (error) {
    return { _tag: "Failure", error: `Invalid jsdocs model: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Computes the content hash stored for a source file in a JSDoc model.
 *
 * @category hashing
 * @since 4.0.0
 */
export function sourceHash(source: string): string {
  return hashSource(source)
}
