import { assert, describe, it } from "@effect/vitest"
import * as Toml from "effect/encoding/Toml"

describe("Toml", () => {
  it("parses tables, dotted keys, arrays, and inline tables", () => {
    assert.deepStrictEqual(
      Toml.parse(`
title = "Effect"
ports = [8000, 8001]
database.connection.timeout = 30

[database]
enabled = true
credentials = { user = "root", roles = ["admin", "writer"] }
`),
      {
        title: "Effect",
        ports: [8000, 8001],
        database: {
          connection: { timeout: 30 },
          enabled: true,
          credentials: { user: "root", roles: ["admin", "writer"] }
        }
      }
    )
  })

  it("parses arrays of tables and date-time values", () => {
    assert.deepStrictEqual(
      Toml.parse(`
[[servers]]
name = "alpha"
started = 2026-08-05T01:02:03Z

[[servers]]
name = "beta"
started = 2026-08-05
`),
      {
        servers: [
          { name: "alpha", started: new Date("2026-08-05T01:02:03Z") },
          { name: "beta", started: "2026-08-05" }
        ]
      }
    )
  })

  it("parses child tables under distinct array entries", () => {
    assert.deepStrictEqual(
      Toml.parse(`
[[servers]]
[servers.tls]

[[servers]]
[servers.tls]
`),
      { servers: [{ tls: {} }, { tls: {} }] }
    )
  })

  it("parses multiline strings and numeric formats", () => {
    assert.deepStrictEqual(
      Toml.parse(`
message = """
hello \\
  world"""
hex = 0xDEAD_BEEF
fraction = 1_000.5
local = 2026-08-05 01:02:03
`),
      {
        message: "hello world",
        hex: 0xdeadbeef,
        fraction: 1000.5,
        local: "2026-08-05T01:02:03"
      }
    )
  })

  it("rejects duplicate keys", () => {
    assert.throws(() => Toml.parse("key = 1\nkey = 2\n"))
    assert.throws(() => Toml.parse("key = 1__000\n"))
  })
})
