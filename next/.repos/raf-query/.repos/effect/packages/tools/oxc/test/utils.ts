import type { CreateRule, Fix, Fixer, Visitor } from "@oxlint/plugins"

export interface ReportedError {
  node: unknown
  message: string
  fix?: (fixer: Pick<Fixer, "replaceTextRange">) => Fix
}

export interface TestContextOptions {
  sourceCode?: string
  filename?: string
  cwd?: string
  ruleOptions?: Array<unknown>
}

export const createTestContext = (options: TestContextOptions = {}) => {
  const {
    sourceCode = "",
    filename = "/test/file.ts",
    cwd = "/test",
    ruleOptions = []
  } = options

  const errors: Array<ReportedError> = []
  const context = {
    id: "test/rule",
    filename,
    physicalFilename: filename,
    cwd,
    options: ruleOptions,
    getFilename: () => filename,
    getCwd: () => cwd,
    report(reportOptions: ReportedError) {
      errors.push(reportOptions)
    },
    sourceCode: {
      text: sourceCode,
      getText(node?: { range?: [number, number] } | null) {
        if (node?.range) {
          return sourceCode.slice(node.range[0], node.range[1])
        }
        return sourceCode
      }
    }
  }
  return { errors, context }
}

export const runRule = (
  rule: CreateRule,
  visitor: keyof Visitor,
  node: unknown,
  options: TestContextOptions = {}
): Array<ReportedError> => {
  const { context, errors } = createTestContext(options)
  const visitors = rule.create(context as never)
  const handler = visitors[visitor]
  if (handler) {
    ;(handler as (node: unknown) => void)(node)
  }
  return errors
}
