#!/usr/bin/env node
import * as path from "node:path"
import { computeJSDocInputHash, extractJSDocsSync, loadJSDocConfig, readJSDocModel, writeJSDocModel } from "./Jsdocs.ts"

function reportDiagnostics(model: ReturnType<typeof extractJSDocsSync>, check: boolean) {
  const diagnostics = model.files.reduce((count, file) => count + file.diagnostics.length, 0)
  if (diagnostics > 0) {
    for (const file of model.files) {
      for (const diagnostic of file.diagnostics) {
        process.stderr.write(`${file.file}: ${diagnostic.message}\n`)
      }
    }
    if (check) process.exitCode = 1
  }
}

try {
  const cwd = process.cwd()
  const check = process.argv.includes("--check")
  const config = loadJSDocConfig(cwd)
  const inputHash = computeJSDocInputHash({ cwd, ...config })
  const cached = readJSDocModel(path.resolve(cwd, config.output))
  if (cached._tag === "Success" && cached.value.inputHash === inputHash) {
    process.stdout.write(`Skipped ${config.output}\n`)
    reportDiagnostics(cached.value, check)
  } else {
    const model = extractJSDocsSync({ cwd, ...config })
    writeJSDocModel(cwd, config.output, model)
    process.stdout.write(`Wrote ${config.output}\n`)
    reportDiagnostics(model, check)
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
