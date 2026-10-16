import { Context, Effect, Schema, SchemaGetter, Stream } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { describe, expect, it } from "tstyche"

class Decoder extends Context.Service<Decoder, { readonly value: number }>()("test/ToolkitDecoder") {}

const parameter = Schema.String.pipe(Schema.decodeTo(Schema.Number, {
  decode: SchemaGetter.transformEffect(() => Effect.map(Decoder, (decoder) => decoder.value)),
  encode: SchemaGetter.transform(String)
}))

const toolkit = Toolkit.make(Tool.make("Decode", {
  parameters: Schema.Struct({ n: parameter }),
  success: Schema.Number
}))

describe("Toolkit", () => {
  it("requires parameter decoder services on the outer handle Effect", () => {
    const handle = Effect.gen(function*() {
      const handlers = yield* toolkit
      return yield* handlers.handle("Decode", { n: "1" })
    }).pipe(Effect.provide(toolkit.toLayer({ Decode: ({ n }) => Effect.succeed(n) })))

    expect<[Decoder] extends [Effect.Services<typeof handle>] ? true : false>().type.toBe<true>()
    // Providing the service only to the returned Stream cannot discharge the
    // requirement of decoding before that Stream exists.
    const streamOnly = handle.pipe(
      Effect.flatMap((stream) => Stream.runCollect(stream).pipe(Effect.provideService(Decoder, { value: 1 })))
    )
    expect<[Decoder] extends [Effect.Services<typeof streamOnly>] ? true : false>().type.toBe<true>()
  })
})
