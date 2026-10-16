import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { fixture, roots } from "./cases.ts"
const directory = mkdtempSync(fileURLToPath(new URL("./.aot-", import.meta.url)))
try {
  const file = join(directory, "generated.mjs")
  execFileSync(process.execPath, [fileURLToPath(new URL("./generate.mts", import.meta.url)), file])
  const generated = await import(pathToFileURL(file).href)
  generated.install(roots)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
export const parseValid = () => fixture("parseValid")
export const parseExtra = () => fixture("parseExtra")
export const parseInvalid = () => fixture("parseInvalid")
export const isValid = () => fixture("isValid")
export const isInvalid = () => fixture("isInvalid")
export const encode = () => fixture("encode")
export const strict = () => fixture("strict")
export const nested = () => fixture("nested")
export const array = () => fixture("array")
export const arrayInvalid = () => fixture("arrayInvalid")
export const tuple = () => fixture("tuple")
export const record = () => fixture("record")
export const recordTransformedKeys = () => fixture("recordTransformedKeys")
export const union = () => fixture("union")
export const oneOf = () => fixture("oneOf")
export const transform = () => fixture("transform")
export const transformInvalid = () => fixture("transformInvalid")
export const rootTransform = () => fixture("rootTransform")
export const middleware = () => fixture("middleware")
export const recursive = () => fixture("recursive")
export const suspendRoot = () => fixture("suspendRoot")
export const declaration = () => fixture("declaration")
export const makeStruct = () => fixture("makeStruct")
export const makeArray = () => fixture("makeArray")
export const makeUnion = () => fixture("makeUnion")
