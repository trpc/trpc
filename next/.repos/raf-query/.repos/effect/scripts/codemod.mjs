// @ts-check
// Runs the JSDoc placement codemod used before snapshot and release builds.
// The transformer keeps exported API docs attached to nested signature/type
// nodes that can otherwise lose their leading comments during doc generation.
import * as Glob from "glob"
import * as Jscodeshift from "jscodeshift/src/Runner.js"
import * as Path from "node:path"

// Look up files in all workspace packages including those nested in
// sub-packages (e.g. `packages/ai/openapi`).
const pattern = "packages/{*,*/*}/src/**/*.ts"

const paths = Glob.globSync(pattern, {
  ignore: ["**/internal/**"]
}).map((path) => Path.resolve(path))

const transformer = Path.resolve("scripts/codemods/jsdoc.ts")

Jscodeshift.run(transformer, paths, {
  babel: true,
  parser: "ts"
})
