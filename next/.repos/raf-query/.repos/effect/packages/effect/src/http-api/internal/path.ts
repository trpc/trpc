import type * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"

const emptyParamNames: ReadonlySet<string> = new Set()

/**
 * @internal
 */
export function getParamNames(schema: Schema.Constraint | undefined): ReadonlySet<string> | undefined {
  if (schema === undefined) return emptyParamNames
  const ast = SchemaAST.getLastEncoding(schema.ast)
  return SchemaAST.isObjects(ast) && ast.indexSignatures.length === 0
    ? new Set(ast.propertySignatures.map((ps) => String(ps.name)))
    : undefined
}

/**
 * @internal
 */
export function toRouterPath(path: string, schema: Schema.Constraint | undefined): string {
  // Preserve undeclared params for raw RouteContext consumers.
  if (schema === undefined || !path.includes(":")) return path
  const paramNames = getParamNames(schema)
  if (paramNames === undefined) return path

  let out = ""
  let depth = 0
  let regexStart = -1
  for (let i = 0; i < path.length; i++) {
    const char = path[i]
    if (depth > 0 || i === regexStart) {
      out += char
      if (char === "\\") out += path[++i] ?? ""
      else if (char === "(") depth++
      else if (char === ")") depth--
      continue
    }
    if (char !== ":") {
      out += char
      continue
    }
    if (path[i + 1] === ":") {
      out += "::"
      i++
      continue
    }

    const param = /^:(\w+)/.exec(path.slice(i))
    if (param !== null && paramNames.has(param[1])) {
      out += param[0]
      i += param[0].length - 1
      const next = path[i + 1]
      if (next === "(") regexStart = i + 1
      // FindMyWay needs a regex to end the parameter name here.
      else if (next !== undefined && !"/.-?".includes(next)) out += "(.*?)"
    } else {
      out += "::"
    }
  }
  return out
}
