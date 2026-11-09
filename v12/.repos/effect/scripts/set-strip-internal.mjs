import * as Fs from "node:fs"

const path = new URL("../tsconfig.base.json", import.meta.url)
const contents = Fs.readFileSync(path, "utf8")
const updated = contents.replace('"stripInternal": false', '"stripInternal": true')

if (contents === updated) {
  throw new Error("Could not enable stripInternal in tsconfig.base.json")
}

Fs.writeFileSync(path, updated)
