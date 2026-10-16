import * as BrowserWorker from "@effect/platform-browser/BrowserWorker"
import { describe } from "@effect/vitest"
import * as Layer from "effect/Layer"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcServer from "effect/rpc/RpcServer"
import { e2eSuite, UsersClient } from "./fixtures/rpc-e2e.ts"

describe("RpcWorker", () => {
  const WorkerClient = UsersClient.layer.pipe(
    Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
    Layer.provide(BrowserWorker.layer(() => new Worker(new URL("./fixtures/rpc-worker.ts", import.meta.url)))),
    Layer.merge(
      Layer.succeed(RpcServer.Protocol)({
        supportsAck: true
      } as any)
    )
  )
  e2eSuite("e2e worker", WorkerClient, false)
})
