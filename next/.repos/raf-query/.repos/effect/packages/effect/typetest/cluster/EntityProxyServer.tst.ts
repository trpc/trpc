import { Context, Effect, type Layer, Schema, SchemaGetter } from "effect"
import { Entity, EntityProxy, EntityProxyServer, type Sharding } from "effect/cluster"
import { HttpApi } from "effect/http-api"
import { Rpc } from "effect/rpc"
import { describe, expect, it } from "tstyche"

class PayloadEncoder extends Context.Service<PayloadEncoder, {}>()("PayloadEncoder") {}
class SuccessDecoder extends Context.Service<SuccessDecoder, {}>()("SuccessDecoder") {}
class ErrorDecoder extends Context.Service<ErrorDecoder, {}>()("ErrorDecoder") {}
class PayloadDecoder extends Context.Service<PayloadDecoder, {}>()("PayloadDecoder") {}

const payload = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transformEffect((value: string) => Effect.as(PayloadDecoder, value)),
  encode: SchemaGetter.transformEffect((value: string) => Effect.as(PayloadEncoder, value))
}))
const success = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transformEffect((value: string) => Effect.as(SuccessDecoder, value)),
  encode: SchemaGetter.passthrough()
}))
const error = Schema.String.pipe(Schema.decodeTo(Schema.String, {
  decode: SchemaGetter.transformEffect((value: string) => Effect.as(ErrorDecoder, value)),
  encode: SchemaGetter.passthrough()
}))

const entity = Entity.make("Asymmetric", [Rpc.make("Echo", { payload, success, error })])
const api = HttpApi.make("api").add(EntityProxy.toHttpApiGroup("entity", entity))
type ClientCodecs = PayloadEncoder | SuccessDecoder | ErrorDecoder

describe("EntityProxyServer", () => {
  it("retains client codec services in RPC handler layer requirements", () => {
    const layer = EntityProxyServer.layerRpcHandlers(entity)

    expect<Layer.Services<typeof layer>>().type.toBe<Sharding.Sharding | PayloadDecoder | ClientCodecs>()
  })

  it("retains client codec services in HTTP handler layer requirements", () => {
    const layer = EntityProxyServer.layerHttpApi(api, "entity", entity)

    expect<Layer.Services<typeof layer>>().type.toBe<Sharding.Sharding | PayloadDecoder | ClientCodecs>()
  })
})
