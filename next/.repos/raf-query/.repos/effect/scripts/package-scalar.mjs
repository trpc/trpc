/* oxlint-disable no-undef */
import * as Fs from "fs/promises"

const jsBundle = await fetch(
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/browser/standalone.min.js"
).then((res) => res.text())

const source = `/* oxlint-disable no-undef */

/** @internal */
export const javascript = ${JSON.stringify(`${jsBundle}`)}
`

await Fs.writeFile("packages/effect/src/http-api/internal/httpApiScalar.ts", source)
