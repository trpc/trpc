import { Schema, Stream } from "effect"
import * as Ndjson from "effect/encoding/Ndjson"
import { describe, expect, it } from "tstyche"

describe("Ndjson", () => {
  it("decodeSchema accepts plain Uint8Array streams", () => {
    const stream = Stream.fail("FooBar") as Stream.Stream<Uint8Array, string>

    const decoded = stream.pipe(
      Stream.pipeThroughChannel(
        Ndjson.decodeSchema(Schema.Struct({ foo: Schema.String }))({
          ignoreEmptyLines: true
        })
      )
    )

    expect(decoded).type.toBe<
      Stream.Stream<
        { readonly foo: string },
        string | Schema.SchemaError | Ndjson.NdjsonError
      >
    >()
  })
})
