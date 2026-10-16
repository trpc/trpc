/**
 * @since 4.0.0
 */

import { RolldownMagicString } from "rolldown"
import { type ESTree, parseSync } from "rolldown/utils"

const markerPattern = /^ => (.+)$/
const helper = "__effect_doctest_assert_"
const statementTypes = new Set([
  "ClassDeclaration",
  "ExportAllDeclaration",
  "ExportDefaultDeclaration",
  "ExportNamedDeclaration",
  "FunctionDeclaration",
  "ImportDeclaration",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSExportAssignment",
  "TSImportEqualsDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSNamespaceExportDeclaration",
  "TSTypeAliasDeclaration",
  "VariableDeclaration"
])

interface Node {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: unknown
}

interface Candidate {
  readonly node: Node
  readonly parent: Node | undefined
  readonly depth: number
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null &&
  "type" in value && typeof value.type === "string" &&
  "start" in value && typeof value.start === "number" &&
  "end" in value && typeof value.end === "number"

const isStatement = (node: Node): boolean => node.type.endsWith("Statement") || statementTypes.has(node.type)

const collect = (program: ESTree.Program): { readonly candidates: Array<Candidate>; readonly names: Set<string> } => {
  const candidates: Array<Candidate> = []
  const names = new Set<string>()

  const visit = (node: Node, parent: Node | undefined, depth: number): void => {
    if (isStatement(node)) candidates.push({ node, parent, depth })
    if (node.type === "Identifier" && typeof node.name === "string") names.add(node.name)

    for (const value of Object.values(node)) {
      if (isNode(value)) {
        visit(value, node, depth + 1)
      } else if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child)) visit(child, node, depth + 1)
        }
      }
    }
  }

  visit(program as unknown as Node, undefined, 0)
  return { candidates, names }
}

const location = (source: string, offset: number, file: string, line: number): string => {
  let localLine = 1
  let column = 1
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === 10) {
      localLine++
      column = 1
    } else {
      column++
    }
  }
  return `${file}:${line + localLine}:${column}`
}

const fail = (source: string, offset: number, file: string, line: number, message: string): never => {
  throw new Error(`${location(source, offset, file, line)} ${message}`)
}

const isUnbracedControlFlow = (parent: Node | undefined): boolean =>
  parent !== undefined && new Set([
    "DoWhileStatement",
    "ForInStatement",
    "ForOfStatement",
    "ForStatement",
    "IfStatement",
    "LabeledStatement",
    "WhileStatement",
    "WithStatement"
  ]).has(parent.type)

const assertionTarget = (
  source: string,
  candidates: ReadonlyArray<Candidate>,
  comment: { readonly start: number },
  file: string,
  line: number
): Candidate => {
  const target = candidates
    .filter(({ node }) => node.end <= comment.start && /^[ \t]*$/.test(source.slice(node.end, comment.start)))
    .sort((left, right) => right.node.end - left.node.end || right.depth - left.depth)[0]

  if (target === undefined) {
    return fail(source, comment.start, file, line, "doctest assertion must trail a complete statement on the same line")
  }
  if (isUnbracedControlFlow(target.parent)) {
    return fail(source, comment.start, file, line, "doctest assertions in control flow require an explicit block")
  }
  return target
}

const parseExpected = (expected: string, source: string, offset: number, file: string, line: number): void => {
  const parsed = parseSync(`${file}?doctest-expected`, `const __expected = (${expected})`, { lang: "ts" })
  const error = parsed.errors[0]
  if (error !== undefined) {
    fail(source, offset, file, line, `invalid doctest expected expression: ${error.message}`)
  }
}

/**
 * Transforms trailing doctest assertion comments into executable assertions.
 *
 * **Details**
 *
 * An assertion may trail an expression statement or a single initialized
 * `const` identifier. Expected values are TypeScript expressions evaluated in
 * the same lexical scope.
 *
 * @category testing
 * @since 4.0.0
 */
export const transform = (source: string, file: string, line: number): string => {
  if (!source.includes("// =>")) return source

  const parsed = parseSync(file, source, { lang: "ts" })
  const parseError = parsed.errors[0]
  if (parseError !== undefined) {
    fail(source, parseError.labels[0]?.start ?? 0, file, line, `invalid doctest source: ${parseError.message}`)
  }

  const markers = parsed.comments.flatMap((comment) => {
    if (comment.type !== "Line") return []
    const match = markerPattern.exec(comment.value)
    return match === null ? [] : [{ comment, expected: match[1].trim() }]
  })
  if (markers.length === 0) return source

  const { candidates, names } = collect(parsed.program)
  let index = 0
  while (names.has(`${helper}${index}`)) index++
  const alias = `${helper}${index}`
  const output = new RolldownMagicString(source)

  for (const { comment, expected } of markers) {
    parseExpected(expected, source, comment.start, file, line)
    const { node, parent } = assertionTarget(source, candidates, comment, file, line)

    if (node.type === "ExpressionStatement") {
      if (node.directive !== null) {
        fail(source, comment.start, file, line, "doctest assertions cannot target directives")
      }
      const expression = isNode(node.expression)
        ? node.expression
        : fail(source, comment.start, file, line, "doctest assertion has no expression")
      output.overwrite(
        expression.start,
        comment.end,
        `${alias}(${source.slice(expression.start, expression.end)}, ${expected});`
      )
      continue
    }

    if (node.type === "VariableDeclaration" && parent?.type !== "ExportNamedDeclaration") {
      const declarations = node.declarations
      const declaration = Array.isArray(declarations) && declarations.length === 1 ? declarations[0] : undefined
      const id = isNode(declaration) && isNode(declaration.id) ? declaration.id : undefined
      if (
        node.kind === "const" && node.declare === false && isNode(declaration?.init) &&
        id?.type === "Identifier" && typeof id.name === "string"
      ) {
        const indentation = source.slice(source.lastIndexOf("\n", node.start - 1) + 1, node.start)
        output.overwrite(node.end, comment.end, `\n${indentation}${alias}(${id.name}, ${expected});`)
        continue
      }
    }

    fail(
      source,
      comment.start,
      file,
      line,
      "doctest assertions can only target expression statements or a single initialized const identifier"
    )
  }

  output.append(`\n\nimport { assertEquals as ${alias} } from "@effect/doctest/Runtime"`)
  return output.toString()
}
