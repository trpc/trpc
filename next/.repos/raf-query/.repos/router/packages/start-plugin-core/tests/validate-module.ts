import { stripVTControlCharacters } from 'node:util'
import { parseSync, transformWithOxc } from 'vite'

/**
 * Validates generated code the way a browser or bundler sees it, without using
 * the compiler's own parser: erase TypeScript (keeping every value import) and
 * parse the result as a JavaScript module with semantic checks. This rejects
 * syntax errors, nameless function/class declarations, duplicate bindings
 * (including an import redeclared by a local declaration) and exports of
 * undeclared bindings.
 *
 * @returns the error messages; an empty array means the module is valid.
 */
export async function getModuleErrors(
  code: string,
  filename = 'module.tsx',
): Promise<Array<string>> {
  let javascript: string
  try {
    const result = await transformWithOxc(code, filename, {
      jsx: 'preserve',
      typescript: { onlyRemoveTypeImports: true },
    })
    javascript = result.code
  } catch (error) {
    return [stripVTControlCharacters((error as Error).message)]
  }
  const { errors } = parseSync('module.jsx', javascript, {
    sourceType: 'module',
    showSemanticErrors: true,
  })
  return errors.map((error) => error.message)
}

/** Matches a declaration of `name` in generated code, however it is printed. */
export function declarationOf(name: string): RegExp {
  return new RegExp(String.raw`\b(?:const|let|var|function|class)\s+${name}\b`)
}
