import { assert, describe, it } from "@effect/vitest"
import * as Ini from "effect/encoding/Ini"

describe("Ini", () => {
  it("parses sections, arrays, and scalar values", () => {
    assert.deepStrictEqual(
      Ini.parse(`
enabled=true
missing=null
name=effect
tag[]=one
tag[]=two

[database.pool]
size=10
`),
      {
        enabled: true,
        missing: null,
        name: "effect",
        tag: ["one", "two"],
        database: {
          pool: {
            size: "10"
          }
        }
      }
    )
  })

  it("supports quoted values, comments, and escaped section dots", () => {
    assert.deepStrictEqual(
      Ini.parse(`
plain=value ; comment
quoted="value # retained"
[a\\.b]
key=yes
`),
      {
        plain: "value",
        quoted: "value # retained",
        "a.b": {
          key: "yes"
        }
      }
    )
  })
})
