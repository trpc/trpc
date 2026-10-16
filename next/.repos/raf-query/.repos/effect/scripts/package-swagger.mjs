/* oxlint-disable no-undef */
import * as Fs from "fs/promises"

const jsBundle = await fetch(
  "https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"
).then((res) => res.text())
const jsPreset = await fetch(
  "https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"
).then((res) => res.text())
const css = await fetch(
  "https://unpkg.com/swagger-ui-dist/swagger-ui.css"
).then((res) => res.text())

const source = `/* oxlint-disable no-undef */

/** @internal */
export const javascript = ${JSON.stringify(`${jsBundle}\n${jsPreset}`)}

/** @internal */
export const css = ${JSON.stringify(css)}
`

await Fs.writeFile("packages/effect/src/http-api/internal/httpApiSwagger.ts", source)
