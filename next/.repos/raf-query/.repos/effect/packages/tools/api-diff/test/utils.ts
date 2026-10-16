import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

export const writeFixturePackage = Effect.fnUntraced(function*(
  repoRoot: string,
  files: Readonly<Record<string, string>>,
  exports: Readonly<Record<string, unknown>> = {
    ".": "./index.js",
    "./*": "./*.js",
    "./internal/*": null
  }
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.join(repoRoot, "packages", "sample", "dist")
  yield* fs.makeDirectory(root, { recursive: true })
  yield* fs.writeFileString(
    path.join(root, "package.json"),
    `${
      JSON.stringify(
        {
          name: "@fixture/sample",
          version: "1.0.0",
          exports
        },
        null,
        2
      )
    }\n`
  )
  for (const [name, source] of Object.entries(files)) {
    const location = path.join(root, name)
    yield* fs.makeDirectory(path.dirname(location), { recursive: true })
    yield* fs.writeFileString(location, source)
  }
})
