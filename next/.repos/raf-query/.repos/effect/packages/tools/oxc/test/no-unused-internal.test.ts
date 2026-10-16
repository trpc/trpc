import rule from "@effect/oxc/oxlint/rules/no-unused-internal"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { createTestContext } from "./utils.ts"

function writeFixture(files: Record<string, string>): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "no-unused-internal-rule-"))
  for (const [file, source] of Object.entries(files)) {
    const fileName = path.join(cwd, file)
    fs.mkdirSync(path.dirname(fileName), { recursive: true })
    fs.writeFileSync(fileName, source)
  }
  return cwd
}

function run(cwd: string, file: string) {
  const filename = path.join(cwd, file)
  const source = fs.readFileSync(filename, "utf8")
  const { context, errors } = createTestContext({ sourceCode: source, cwd, filename })
  const visitors = rule.create(context as never)
  visitors.Program?.({ type: "Program", range: [0, source.length] } as never)
  return errors.map((error) => error.message)
}

describe("no-unused-internal", () => {
  it("reports unused top-level @internal exports", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export const unused = 1
`
    })

    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([
      `@internal export "unused" is not used by production sources`
    ])
  })

  it("counts same-file references as usage", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export const used = 1

export const value = used
`
    })

    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })

  it("counts type-only references as usage", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export interface Internal {
  readonly value: string
}
`,
      "packages/foo/src/Consumer.ts": `import type { Internal } from "./Internal.ts"

type Local = Internal
`
    })

    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })

  it("reports @internal exports used in public exported type signatures", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export interface Internal {
  readonly value: string
}
`,
      "packages/foo/src/Public.ts": `import type { Internal } from "./Internal.ts"

export interface Public {
  readonly value: Internal
}
`
    })

    expect(run(cwd, "packages/foo/src/Public.ts")).toEqual([
      `Do not reference @internal export "Internal" in a public exported type signature`
    ])
    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })

  it("reports public re-exports of @internal exports", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export const internal = 1
`,
      "packages/foo/src/Public.ts": `export { internal } from "./Internal.ts"
`
    })

    expect(run(cwd, "packages/foo/src/Public.ts")).toEqual([
      `Do not re-export @internal export "internal" from a public module`
    ])
    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })

  it("ignores @internal class member type signatures", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export interface Internal {
  readonly value: string
}
`,
      "packages/foo/src/Public.ts": `import type { Internal } from "./Internal.ts"

export class Public {
  /** @internal */
  getInternal(): Internal {
    throw new Error("not implemented")
  }
}
`
    })

    expect(run(cwd, "packages/foo/src/Public.ts")).toEqual([])
    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })

  it("ignores public type signatures in internal directories", () => {
    const cwd = writeFixture({
      "packages/foo/src/Internal.ts": `/** @internal */
export interface Internal {
  readonly value: string
}
`,
      "packages/foo/src/internal/Consumer.ts": `import type { Internal } from "../Internal.ts"

export interface PublicInsideInternalDirectory {
  readonly value: Internal
}
`
    })

    expect(run(cwd, "packages/foo/src/internal/Consumer.ts")).toEqual([])
    expect(run(cwd, "packages/foo/src/Internal.ts")).toEqual([])
  })
})
