import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as RpcServer from "effect/rpc/RpcServer"
import { RpcLayer } from "./rpc-schemas.ts"

const MainLayer = RpcLayer.pipe(
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer)
)

Effect.runFork(Layer.launch(MainLayer))
