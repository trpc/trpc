# Event log server

`@effect/eventlog-server` runs `EventLogServerEncrypted` with
`SqlEventLogServerEncrypted` storage on SQLite. The server only stores
encrypted entries; clients encrypt and decrypt them. Each push to `main` publishes
it as `ghcr.io/effect-ts/eventlog-server`.

```sh
docker run -p 8080:8080 -v eventlog:/data ghcr.io/effect-ts/eventlog-server
```

Clients connect with `EventLogRemote.layerEncrypted` over a websocket at `/`
using `RpcSerialization.layerSchemaBinary()`:

```ts
import { NodeSocket } from "@effect/platform-node"
import { Layer } from "effect"
import { EventLogRemote } from "effect/eventlog"
import { RpcClient, RpcSerialization } from "effect/rpc"

const RemoteLive = EventLogRemote.layerEncrypted.pipe(
  Layer.provide(RpcClient.layerProtocolSocket()),
  Layer.provide(NodeSocket.layerWebSocket("ws://localhost:8080/")),
  Layer.provide(RpcSerialization.layerSchemaBinary())
)
```

`GET /health` responds with `204` once the server is listening.

| Variable        | Default             |
| --------------- | ------------------- |
| `PORT`          | `8080`              |
| `DATABASE_PATH` | `/data/eventlog.db` |

To build the image or run the server from a checkout, from the repository root:

```sh
docker build -f packages/tools/eventlog-server/Dockerfile .
DATABASE_PATH=eventlog.db node packages/tools/eventlog-server/src/main.ts
```
