/**
 * Socket read/write cost against raw `node:net`, `ws` and in-memory baselines.
 *
 * Two workloads run against plain Node servers, so only the client transport
 * differs between tasks:
 *
 * - `stream`: the client requests a fixed payload and reads it back, measuring
 *   the read path under a burst of large frames.
 * - `ping-pong`: the client writes a small frame and waits for the echo,
 *   measuring per-message cost on both paths.
 *
 * The `node:net` and `ws` transports go over loopback, which is dominated by
 * syscalls: a CPU profile of the ping-pong run is roughly 20% idle and 35%
 * kernel writes, so anything smaller than a microsecond is invisible there.
 * The `duplex` transport is a cross-wired `PassThrough` pair with no kernel in
 * the path, which is where allocation-level changes to the Socket layer show
 * up. Its raw baseline is the same duplex read with `data` events.
 *
 * Run with `pnpm --dir packages/platform/node-shared benchmark:socket`.
 */
import * as NodeSocket from "@effect/platform-node-shared/NodeSocket"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import { once } from "node:events"
import * as Net from "node:net"
import { Duplex } from "node:stream"
import { Bench } from "tinybench"
import { WebSocket, WebSocketServer } from "ws"

const streamFrameSize = 64 * 1024
const streamFrameCount = 16
const streamBytes = streamFrameSize * streamFrameCount

const pingPongCount = 256
const pingPongSize = 64

const streamFrame = new Uint8Array(streamFrameSize).fill(7)
const streamFrames: NonEmptyReadonlyArray<Uint8Array> = [
  streamFrame,
  ...Array.from({ length: streamFrameCount - 1 }, () => streamFrame)
]
const request: NonEmptyReadonlyArray<Uint8Array> = [new Uint8Array([1])]
const ping: NonEmptyReadonlyArray<Uint8Array> = [new Uint8Array(pingPongSize).fill(3)]

// Servers are plain Node so that only the client transport is measured.

const startNetServer = async (onConnection: (conn: Net.Socket) => void): Promise<Net.Server> => {
  const server = Net.createServer((conn) => {
    conn.on("error", () => {})
    conn.setNoDelay(true)
    onConnection(conn)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return server
}

const startWebSocketServer = async (onConnection: (ws: WebSocket) => void): Promise<WebSocketServer> => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 })
  await once(server, "listening")
  server.on("connection", (ws) => {
    ws.on("error", () => {})
    onConnection(ws)
  })
  return server
}

const portOf = (server: Net.Server | WebSocketServer) => (server.address() as Net.AddressInfo).port

const netEchoServer = await startNetServer((conn) => {
  conn.pipe(conn)
})
const netStreamServer = await startNetServer((conn) => {
  conn.on("data", () => {
    conn.cork()
    for (const frame of streamFrames) conn.write(frame)
    conn.uncork()
  })
})
const wsEchoServer = await startWebSocketServer((ws) => {
  ws.on("message", (data: Buffer) => ws.send(data))
})
const wsStreamServer = await startWebSocketServer((ws) => {
  ws.on("message", () => {
    for (const frame of streamFrames) ws.send(frame)
  })
})

// A duplex whose write side feeds the read side, so a client talks to itself
// with no kernel in the path. The read side is unbounded, so this measures the
// Socket layer rather than transport backpressure.
const loopbackDuplex = (respond: (chunk: Buffer, push: (data: Uint8Array) => void) => void): Duplex => {
  const duplex: Duplex = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, callback) {
      respond(chunk, (data) => {
        duplex.push(data)
      })
      callback()
    }
  })
  return duplex
}

const duplexEcho = (): Duplex => loopbackDuplex((chunk, push) => push(chunk))

const duplexStream = (): Duplex =>
  loopbackDuplex((_chunk, push) => {
    for (const frame of streamFrames) push(frame)
  })

/**
 * Tracks how many bytes have arrived so a read of `n` bytes resolves once the
 * cumulative total passes what earlier reads already claimed.
 */
const makeReadCounter = () => {
  let received = 0
  let consumed = 0
  let pending: { readonly target: number; readonly resolve: () => void } | undefined
  return {
    push(size: number) {
      received += size
      if (pending !== undefined && received >= pending.target) {
        const resolve = pending.resolve
        pending = undefined
        resolve()
      }
    },
    read(bytes: number): Promise<void> {
      consumed += bytes
      if (received >= consumed) return Promise.resolve()
      const target = consumed
      return new Promise<void>((resolve) => {
        pending = { target, resolve }
      })
    }
  }
}

interface RawClient {
  readonly write: (frames: NonEmptyReadonlyArray<Uint8Array>) => Promise<void>
  readonly read: (bytes: number) => Promise<void>
  readonly close: () => void
}

const rawNetClient = async (port: number): Promise<RawClient> => {
  const conn = Net.createConnection({ host: "127.0.0.1", port })
  await once(conn, "connect")
  conn.setNoDelay(true)
  const counter = makeReadCounter()
  conn.on("data", (chunk: Buffer) => counter.push(chunk.length))
  return {
    write(frames) {
      conn.cork()
      let flushed = true
      for (const frame of frames) flushed = conn.write(frame)
      conn.uncork()
      return flushed ? Promise.resolve() : once(conn, "drain").then(() => {})
    },
    read: counter.read,
    close: () => conn.destroy()
  }
}

const rawWebSocketClient = async (url: string): Promise<RawClient> => {
  const ws = new WebSocket(url)
  await once(ws, "open")
  const counter = makeReadCounter()
  ws.on("message", (data: Buffer) => counter.push(data.length))
  return {
    write(frames) {
      return new Promise<void>((resolve, reject) => {
        for (let i = 0; i < frames.length - 1; i++) ws.send(frames[i])
        ws.send(frames[frames.length - 1], (error) => error ? reject(error) : resolve())
      })
    },
    read: counter.read,
    close: () => ws.terminate()
  }
}

const rawDuplexClient = (conn: Duplex): RawClient => {
  const counter = makeReadCounter()
  conn.on("data", (chunk: Buffer) => counter.push(chunk.length))
  return {
    write(frames) {
      let flushed = true
      for (const frame of frames) flushed = conn.write(frame)
      return flushed ? Promise.resolve() : once(conn, "drain").then(() => {})
    },
    read: counter.read,
    close: () => conn.destroy()
  }
}

interface SocketClient {
  readonly write: (frames: NonEmptyReadonlyArray<Uint8Array>) => Effect.Effect<void>
  readonly read: (bytes: number) => Effect.Effect<void>
}

const socketClient = Effect.fnUntraced(function*(socket: Socket.Socket) {
  const writer = yield* socket.writer
  const pull = yield* Socket.readerBytes(socket)
  const read = Effect.orDie(pull)
  let received = 0
  let consumed = 0
  const drain: Effect.Effect<void> = Effect.flatMap(read, (frames) => {
    for (let i = 0; i < frames.length; i++) received += frames[i].length
    return received >= consumed ? Effect.void : drain
  })
  const client: SocketClient = {
    write: (frames) => Effect.orDie(writer.writeAll(frames)),
    read: (bytes) =>
      Effect.suspend(() => {
        consumed += bytes
        return received >= consumed ? Effect.void : drain
      })
  }
  return client
})

const scope = await Effect.runPromise(Scope.make())
const runScoped = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Scope.provide(effect, scope))

const duplexSocketClient = (open: () => Duplex) =>
  runScoped(Effect.flatMap(NodeSocket.fromDuplex(Effect.sync(open)), socketClient))

const netSocketClient = (port: number) =>
  runScoped(Effect.flatMap(NodeSocket.makeNet({ host: "127.0.0.1", port, noDelay: true }), socketClient))

const webSocketSocketClient = (url: string) =>
  runScoped(
    Effect.flatMap(Socket.makeWebSocket(url), socketClient).pipe(
      Effect.provideService(Socket.WebSocketConstructor, (url, options) => new WebSocket(url, options as any))
    )
  )

const netEchoPort = portOf(netEchoServer)
const netStreamPort = portOf(netStreamServer)
const wsEchoUrl = `ws://127.0.0.1:${portOf(wsEchoServer)}`
const wsStreamUrl = `ws://127.0.0.1:${portOf(wsStreamServer)}`

const rawClients = [
  await rawNetClient(netStreamPort),
  await rawWebSocketClient(wsStreamUrl),
  await rawNetClient(netEchoPort),
  await rawWebSocketClient(wsEchoUrl)
]
const [rawNetStream, rawWsStream, rawNetEcho, rawWsEcho] = rawClients

const rawDuplexStream = rawDuplexClient(duplexStream())
const rawDuplexEcho = rawDuplexClient(duplexEcho())
const socketDuplexStream = await duplexSocketClient(duplexStream)
const socketDuplexEcho = await duplexSocketClient(duplexEcho)

const socketNetStream = await netSocketClient(netStreamPort)
const socketWsStream = await webSocketSocketClient(wsStreamUrl)
const socketNetEcho = await netSocketClient(netEchoPort)
const socketWsEcho = await webSocketSocketClient(wsEchoUrl)

const rawStream = (client: RawClient) => async () => {
  await client.write(request)
  await client.read(streamBytes)
}

const rawPingPong = (client: RawClient) => async () => {
  for (let i = 0; i < pingPongCount; i++) {
    await client.write(ping)
    await client.read(pingPongSize)
  }
}

const socketStream = (client: SocketClient) => {
  const effect = Effect.flatMap(client.write(request), () => client.read(streamBytes))
  return () => Effect.runPromise(effect)
}

const socketPingPong = (client: SocketClient) => {
  // A plain counter loop rather than `Effect.repeat`, whose Schedule reads the
  // clock every iteration and would cost more than the round-trip it wraps.
  const round = Effect.flatMap(client.write(ping), () => client.read(pingPongSize))
  let remaining = 0
  const loop: Effect.Effect<void> = Effect.flatMap(round, () => --remaining > 0 ? loop : Effect.void)
  return () => {
    remaining = pingPongCount
    return Effect.runPromise(loop)
  }
}

const options = {
  iterations: 16,
  time: 2_000,
  warmupIterations: 8,
  warmupTime: 500,
  timestampProvider: "hrtimeNow" as const
}

const runSuite = async (
  name: string,
  shape: string,
  unit: string,
  unitsPerRun: number,
  bytesPerRun: number,
  tasks: ReadonlyArray<readonly [name: string, run: () => Promise<void>]>
) => {
  const bench = new Bench(options)
  for (const [taskName, run] of tasks) {
    bench.add(taskName, run)
  }
  await bench.run()
  console.log(`\n${name} (${shape})`)
  console.table(bench.table((task) => {
    const result = task.result
    if (result?.state !== "completed") {
      return { Transport: task.name, State: result?.state ?? "missing result" }
    }
    return {
      Transport: task.name,
      [`${unit}/s`]: Math.round(result.throughput.mean * unitsPerRun),
      "MiB/s": (result.throughput.mean * bytesPerRun / (1024 * 1024)).toFixed(1),
      [`Latency (µs/${unit})`]: (result.latency.mean * 1_000 / unitsPerRun).toFixed(2),
      RME: `${result.latency.rme.toFixed(2)}%`,
      Samples: result.latency.samplesCount
    }
  }))
}

await runSuite(
  "stream read",
  `${streamFrameCount} x ${streamFrameSize / 1024} KiB frames per run`,
  "frame",
  streamFrameCount,
  streamBytes,
  [
    ["node:net (raw)", rawStream(rawNetStream)],
    ["node:net (Socket)", socketStream(socketNetStream)],
    ["ws (raw)", rawStream(rawWsStream)],
    ["ws (Socket)", socketStream(socketWsStream)],
    ["duplex (raw)", rawStream(rawDuplexStream)],
    ["duplex (Socket)", socketStream(socketDuplexStream)]
  ]
)

await runSuite(
  "ping-pong",
  `${pingPongCount} sequential ${pingPongSize} B round-trips per run`,
  "round-trip",
  pingPongCount,
  pingPongCount * pingPongSize * 2,
  [
    ["node:net (raw)", rawPingPong(rawNetEcho)],
    ["node:net (Socket)", socketPingPong(socketNetEcho)],
    ["ws (raw)", rawPingPong(rawWsEcho)],
    ["ws (Socket)", socketPingPong(socketWsEcho)],
    ["duplex (raw)", rawPingPong(rawDuplexEcho)],
    ["duplex (Socket)", socketPingPong(socketDuplexEcho)]
  ]
)

for (const client of rawClients) client.close()
rawDuplexStream.close()
rawDuplexEcho.close()
await Effect.runPromise(Scope.close(scope, Exit.void))
netEchoServer.close()
netStreamServer.close()
wsEchoServer.close()
wsStreamServer.close()
