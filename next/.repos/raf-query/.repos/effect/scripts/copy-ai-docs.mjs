import * as Fs from "node:fs"
import * as Glob from "glob"
import * as Path from "node:path"

const source = "LLMS.md"
const aiDocsSource = "ai-docs"
const packageFiles = ["AGENTS.md", "CLAUDE.md", "ai-docs/**/*"]

const includeAiDocs = (source) => {
  const [root] = Path.relative(aiDocsSource, source).split(Path.sep)
  return root !== "dist" && root !== "node_modules"
}

for (const packageJsonPath of Glob.globSync("packages/{*,*/*}/package.json")) {
  const packageJson = JSON.parse(Fs.readFileSync(packageJsonPath, "utf8"))
  if (packageJson.private) {
    continue
  }

  const packageDirectory = Path.dirname(packageJsonPath)
  for (const file of packageFiles) {
    if (!packageJson.files?.includes(file)) {
      throw new Error(`${packageJsonPath} must include ${file} in its files list`)
    }
  }

  Fs.copyFileSync(source, Path.join(packageDirectory, "AGENTS.md"))
  Fs.copyFileSync(source, Path.join(packageDirectory, "CLAUDE.md"))

  const aiDocsTarget = Path.join(packageDirectory, aiDocsSource)
  Fs.rmSync(aiDocsTarget, { recursive: true, force: true })
  Fs.cpSync(aiDocsSource, aiDocsTarget, { recursive: true, filter: includeAiDocs })
}
