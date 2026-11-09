import { cpSync, existsSync, mkdirSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import { runtimeperfDir, sanitize } from "./utils.mts"

export const materializeFixture = (targetRoot, fixture) => {
  const sourceDir = dirname(fixture.fixturePath)
  const name = sanitize(relative(runtimeperfDir, sourceDir))
  const targetDir = join(targetRoot, "packages", "effect", ".runtimeperf-compare", name)
  mkdirSync(dirname(targetDir), { recursive: true })
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true })
  }
  return join(targetDir, basename(fixture.fixturePath))
}
