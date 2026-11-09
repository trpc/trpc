import * as Fs from "node:fs"

const source = ".agents/AGENTS.md"
const target = "AGENTS.md"

try {
  Fs.lstatSync(target)
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error
  }
  Fs.symlinkSync(source, target)
}
