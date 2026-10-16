import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { roots } from "./cases.ts"

const directory = mkdtempSync(fileURLToPath(new URL("./.aot-", import.meta.url)))
try {
  const file = join(directory, "generated.mjs")
  execFileSync(process.execPath, [fileURLToPath(new URL("./generate.mts", import.meta.url)), file])
  const generated = await import(pathToFileURL(file).href)
  generated.install(roots)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

export { isExtraValid, isInvalid, isValid, parseExtraValid, parseInvalid, parseValid } from "./cases.ts"
