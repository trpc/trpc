import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as Config from "effect/Config"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"
import { createServer } from "node:http"

const SqlLive = SqliteClient.layerConfig({
  filename: Config.String("DATABASE_PATH").pipe(Config.withDefault("/data/eventlog.db"))
})

// Encrypted event log RPCs over a websocket at `/`. Event log messages carry
// binary fields, so they need a binary serialization.
const EventLogLive = EventLogServerEncrypted.layer.pipe(
  Layer.provide([
    RpcServer.layerProtocolWebsocket({ path: "/" }).pipe(
      Layer.provide(RpcSerialization.layerSchemaBinary())
    ),
    SqlEventLogServerEncrypted.layerStorageSubtle().pipe(
      Layer.provide(SqlLive)
    )
  ])
)

const HealthLive = HttpRouter.add("GET", "/health", HttpServerResponse.empty())

const ServerLive = HttpRouter.serve(Layer.mergeAll(EventLogLive, HealthLive)).pipe(
  Layer.provide(NodeHttpServer.layerConfig(createServer, {
    port: Config.Port("PORT").pipe(Config.withDefault(8080))
  }))
)

Layer.launch(ServerLive).pipe(NodeRuntime.runMain)
