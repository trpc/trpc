import * as Fs from "node:fs"

const { version } = JSON.parse(Fs.readFileSync("packages/effect/package.json", "utf8"))

Fs.writeFileSync(
  "packages/effect/src/internal/version.ts",
  `/** @internal */\nexport const version = ${JSON.stringify(version)}\n`
)
