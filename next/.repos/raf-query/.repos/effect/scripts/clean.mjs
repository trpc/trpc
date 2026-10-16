import * as Glob from "glob"
import * as Fs from "node:fs"

const dirs = [".", ...Glob.sync("packages/*/"), ...Glob.sync("packages/sql/*/"), ...Glob.sync("packages/tools/*/"), ...Glob.sync("packages/ai/*/"), ...Glob.sync("packages/atom/*/"), ...Glob.sync("packages/platform/*/")]
dirs.forEach((pkg) => {
  const files = [".tsbuildinfo", "tsconfig.tsbuildinfo", "tsconfig.fixtures.tsbuildinfo", "tsconfig.src.tsbuildinfo", "docs", "build", "dist", "coverage"]
  if (pkg !== ".") {
    files.push("AGENTS.md", "CLAUDE.md", "ai-docs")
  }

  files.forEach((file) => {
    if (pkg === "." && file === "docs") {
      return
    }

    Fs.rmSync(`${pkg}/${file}`, { recursive: true, force: true }, () => {})
  })
})

Glob.sync("docs/*/").forEach((dir) => {
  Fs.rmSync(dir, { recursive: true, force: true }, () => {})
})
