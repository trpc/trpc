/**
 * DatagramSocket cost against raw `node:dgram` and an in-memory native handle.
 *
 * Tier (a): loopback against `node:dgram`. CPU counts this process only.
 * Native baselines match send completion and payload retention guarantees;
 * ingest compares paths that do not read the sender address. The `vs fastest`
 * column is informational, not a pass/fail gate.
 *
 * Fast ingest uses connected sender processes (default 3). Slow ingest sleeps
 * between pulls to measure batching and overflow. Request/reply compares raw
 * datagram replies with explicit addresses; writes target a sink process.
 *
 * Native sends use callbacks; the fastest baseline omits them. `write` also
 * compares the adapter's immediate lookup with Node's default.
 *
 * Tier (b): a fake backing socket pushes packets and completes sends
 * synchronously, isolating core overhead. Allocation is measured over 2^18
 * operations with `v8.getHeapStatistics().total_allocated_bytes`.
 * `loop overhead` measures an empty write-shaped Effect loop; pull loops
 * reuse one `flatMap` and cost less.
 *
 * Tier (b) baseline (node v26.7.0, Linux 6.18.48, Intel Xeon Platinum 8573C,
 * 64 B payloads, median of 3 runs; B/op is ±3 B). A later change fails if it
 * is more than 10% slower on the same machine:
 *
 * | Task                                 | ns/op | B/op |
 * | ------------------------------------ | ----- | ---- |
 * | queued pull, batch of 1              | 119.2 |  260 |
 * | queued pull, batch of 64             |  16.6 |   85 |
 * | parked pull, resumed inline          | 184.3 |  196 |
 * | parked pull, reading .address (IPv4) | 335.9 |  324 |
 * | parked pull, reading .address (IPv6) | 487.9 |  321 |
 * | accepted, 1024 per pull              |  22.7 |   96 |
 * | accepted, 65536 per pull             |  25.2 |   96 |
 * | dropping, full at 1024               |   6.4 |    0 |
 * | sliding, full at 1024                |   9.6 |    4 |
 * | sliding, full at 65536               |   9.9 |    2 |
 * | loop overhead                        |  87.3 |  114 |
 * | write, reply path                    | 151.1 |  494 |
 * | write, explicit InetAddress          | 153.1 |  493 |
 * | writeAll ×16                         |  25.8 |   54 |
 * | writeAll ×256                        |  18.1 |   18 |
 *
 * Environment variables: `DATAGRAM_BENCH_SENDERS` (default 3),
 * `DATAGRAM_BENCH_TIMEOUT` in milliseconds per run (default 10000), and
 * `DATAGRAM_BENCH_ONLY` to run only the workloads whose name contains it.
 *
 * Run with `pnpm --dir packages/platform/node-shared benchmark:datagram`.
 */
import * as NodeDatagramSocket from "@effect/platform-node-shared/NodeDatagramSocket"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as NetAddress from "effect/net/NetAddress"
import * as Scope from "effect/Scope"
import * as DatagramSocket from "effect/socket/DatagramSocket"
import { type ChildProcess, fork } from "node:child_process"
import * as Dgram from "node:dgram"
import { once } from "node:events"
import * as Os from "node:os"
import { fileURLToPath } from "node:url"
import * as V8 from "node:v8"
import { Bench } from "tinybench"

const senderCount = Number(process.env.DATAGRAM_BENCH_SENDERS ?? 3)
const runTimeout = Number(process.env.DATAGRAM_BENCH_TIMEOUT ?? 10_000)
const only = process.env.DATAGRAM_BENCH_ONLY
const selected = (workload: string) => only === undefined || workload.includes(only)
const payloadSizes = [64, 1400] as const
const host = "127.0.0.1"

// keeps values the benchmark reads from being optimized away
let blackhole: unknown

// Every destination is an IP literal, as in the adapter
const immediateLookup = (
  hostname: string,
  _options: unknown,
  callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
) => callback(null, hostname, 4)

const createSocket = (lookup = true): Dgram.Socket => {
  const socket = Dgram.createSocket(lookup ? { type: "udp4", lookup: immediateLookup as any } : { type: "udp4" })
  socket.on("error", () => {})
  return socket
}

const bindSocket = async (socket: Dgram.Socket): Promise<number> => {
  // with the immediate `lookup`, `'listening'` fires inside `bind`
  const listening = once(socket, "listening")
  socket.bind(0, host)
  await listening
  return socket.address().port
}

// -----------------------------------------------------------------------------
// peer processes: senders for ingest and a sink for writes
// -----------------------------------------------------------------------------

type PeerCommand =
  | { readonly type: "send"; readonly port: number; readonly size: number }
  | { readonly type: "stop" }
  | { readonly type: "sink" }

interface PeerReply {
  readonly type: "ready" | "sending" | "stopped" | "sink"
  readonly port?: number
}

const runPeer = () => {
  let sender: Dgram.Socket | undefined
  let sink: Dgram.Socket | undefined
  const reply = (message: PeerReply) => process.send!(message)
  process.on("message", (command: PeerCommand) => {
    switch (command.type) {
      case "send": {
        const socket = createSocket()
        const payload = new Uint8Array(command.size).fill(7)
        sender = socket
        socket.connect(command.port, host, () => {
          // bursts without callbacks, yielding so the stop command gets through
          const burst = () => {
            if (sender !== socket) return
            for (let i = 0; i < 64; i++) socket.send(payload)
            setImmediate(burst)
          }
          burst()
          reply({ type: "sending" })
        })
        return
      }
      case "stop": {
        const socket = sender
        sender = undefined
        if (socket === undefined) return reply({ type: "stopped" })
        return socket.close(() => reply({ type: "stopped" }))
      }
      case "sink": {
        sink = createSocket()
        return void bindSocket(sink).then((port) => reply({ type: "sink", port }))
      }
    }
  })
  process.on("disconnect", () => process.exit(0))
  // messages sent before this listener exists would be lost
  reply({ type: "ready" })
}

const request = (child: ChildProcess, command: PeerCommand, expected: PeerReply["type"]): Promise<PeerReply> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("message", onMessage)
      reject(new Error(`peer did not answer ${command.type} within ${runTimeout} ms`))
    }, runTimeout)
    const onMessage = (message: PeerReply) => {
      if (message.type !== expected) return
      clearTimeout(timer)
      child.off("message", onMessage)
      resolve(message)
    }
    child.on("message", onMessage)
    child.send(command)
  })

// -----------------------------------------------------------------------------
// harness, adapted from `Socket.ts`
// -----------------------------------------------------------------------------

const options = {
  iterations: 16,
  time: 2_000,
  warmupIterations: 8,
  warmupTime: 500,
  timestampProvider: "hrtimeNow" as const
}

/**
 * A benchmark task. `run` receives an `AbortSignal` that fires when the run
 * times out. `processed` counts units handled so far, for CPU per unit, and
 * `extra` adds columns once the task has run.
 */
interface BenchTask {
  readonly name: string
  readonly run: (signal: AbortSignal) => Promise<void>
  readonly setup?: () => Promise<void>
  readonly teardown?: () => Promise<void>
  readonly processed?: () => number
  readonly onPhase?: () => void
  readonly extra?: () => Record<string, string | number>
}

interface Comparison {
  // equivalent-guarantee baseline, and the fastest native baseline
  readonly baseline?: string
  readonly fastest?: string
  // the metric the comparison columns use
  readonly metric: "cpu" | "time"
  // what `processed` counts, when it isn't the suite's unit
  readonly cpuUnit?: string
}

interface TaskResult {
  readonly rate: number
  // wall time per unit in ns
  readonly time: number
  // CPU time per unit in ns, when measured
  readonly cpu: number | undefined
  readonly rme: number
}

type SuiteResults = Map<string, TaskResult>

const withTimeout = (label: string, run: (signal: AbortSignal) => Promise<void>) => () => {
  const controller = new AbortController()
  // a synchronous throw leaves no timer behind
  const running = run(controller.signal)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`${label} timed out after ${runTimeout} ms`))
    }, runTimeout)
  })
  return Promise.race([running, timeout]).finally(() => clearTimeout(timer))
}

const formatNs = (ns: number) => ns >= 10_000 ? `${(ns / 1000).toFixed(2)} µs` : `${ns.toFixed(1)} ns`
const formatDelta = (value: number, base: number) =>
  `${value >= base ? "+" : ""}${((value / base - 1) * 100).toFixed(1)}%`

const runSuite = async (
  name: string,
  shape: string,
  unit: string,
  unitsPerRun: number,
  bytesPerRun: number,
  tasks: ReadonlyArray<BenchTask>,
  comparison: Comparison
): Promise<SuiteResults> => {
  const bench = new Bench(options)
  const cpu = new Map<string, { usage: NodeJS.CpuUsage; start: number; perUnit?: number }>()
  for (const task of tasks) {
    bench.add(task.name, withTimeout(`${name}: ${task.name}`, task.run), {
      // tinybench would otherwise call the task before its setup to find out
      async: true,
      beforeAll: async (mode) => {
        await task.setup?.()
        if (mode !== "run") return
        task.onPhase?.()
        if (task.processed !== undefined) {
          cpu.set(task.name, { usage: process.cpuUsage(), start: task.processed() })
        }
      },
      afterAll: async (mode) => {
        const measured = cpu.get(task.name)
        if (mode === "run" && measured !== undefined && task.processed !== undefined) {
          const usage = process.cpuUsage(measured.usage)
          const units = task.processed() - measured.start
          measured.perUnit = (usage.user + usage.system) * 1000 / units
        }
        await task.teardown?.()
      }
    })
  }
  await bench.run()
  const results: SuiteResults = new Map()
  for (const task of bench.tasks) {
    const result = task.result
    if (result?.state !== "completed") continue
    results.set(task.name, {
      rate: result.throughput.mean * unitsPerRun,
      time: result.latency.mean * 1_000_000 / unitsPerRun,
      cpu: cpu.get(task.name)?.perUnit,
      rme: result.latency.rme
    })
  }
  const metricOf = (result: TaskResult | undefined) =>
    result === undefined ? undefined : comparison.metric === "cpu" ? result.cpu : result.time
  const baseline = comparison.baseline === undefined ? undefined : metricOf(results.get(comparison.baseline))
  const fastest = comparison.fastest === undefined ? undefined : metricOf(results.get(comparison.fastest))
  const byName = new Map(tasks.map((task) => [task.name, task]))
  console.log(`\n${name} (${shape})`)
  console.table(bench.table((task) => {
    const result = task.result
    if (result?.state !== "completed") {
      return {
        Task: task.name,
        State: result?.state ?? "missing result",
        ...(result?.state === "errored" ? { Error: String(result.error) } : {})
      }
    }
    const measured = results.get(task.name)!
    const metric = metricOf(measured)
    return {
      Task: task.name,
      [`${unit}/s`]: Math.round(measured.rate),
      "MiB/s": (measured.rate * bytesPerRun / unitsPerRun / (1024 * 1024)).toFixed(1),
      [`Time (ns/${unit})`]: measured.time.toFixed(1),
      ...(measured.cpu === undefined ? {} : { [`CPU (ns/${comparison.cpuUnit ?? unit})`]: measured.cpu.toFixed(1) }),
      ...(baseline === undefined || metric === undefined ? {} : { "vs native": formatDelta(metric, baseline) }),
      ...(fastest === undefined || metric === undefined ? {} : { "vs fastest": formatDelta(metric, fastest) }),
      ...byName.get(task.name)?.extra?.(),
      RME: `${result.latency.rme.toFixed(2)}%`,
      Samples: result.latency.samplesCount
    }
  }))
  return results
}

interface Check {
  readonly workload: string
  readonly check: string
  readonly value: string
  readonly limit: string
  readonly pass: boolean | undefined
}

const checks: Array<Check> = []

const check = (workload: string, name: string, value: string, limit: string, pass: boolean | undefined) => {
  checks.push({ workload, check: name, value, limit, pass })
  console.log(`  ${pass === undefined ? "INFO" : pass ? "PASS" : "FAIL"}  ${name}: ${value} (limit ${limit})`)
}

const percentile = (values: ReadonlyArray<number>, p: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

// -----------------------------------------------------------------------------
// DatagramSocket helpers
// -----------------------------------------------------------------------------

interface Opened {
  readonly reader: DatagramSocket.Reader
  readonly writer: DatagramSocket.Writer
  readonly close: () => Promise<void>
}

const openSocket = async (socket: DatagramSocket.DatagramSocket): Promise<Opened> => {
  const scope = Scope.makeUnsafe()
  const [reader, writer] = await Effect.runPromise(
    Scope.provide(Effect.all([socket.reader, socket.writer]), scope)
  )
  return { reader, writer, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
}

const openNode = async (receiveBuffer?: DatagramSocket.ReceiveBufferOptions) =>
  openSocket(await Effect.runPromise(NodeDatagramSocket.make({ bind: { address: host }, receiveBuffer })))

// A write-shaped loop: builds one effect per operation, like user code does
const repeatEach = <E>(make: () => Effect.Effect<void, E>) => {
  let remaining = 0
  const step = (): Effect.Effect<void, E> => Effect.flatMap(make(), () => --remaining > 0 ? step() : Effect.void)
  return (count: number, signal?: AbortSignal) => {
    remaining = count
    return Effect.runPromise(step(), { signal })
  }
}

// -----------------------------------------------------------------------------
// tier (a): ingest
// -----------------------------------------------------------------------------

const ingestPacketsPerRun = 4096
const slowBatchesPerRun = 8
const slowDelay = "5 millis"
const slowCapacity = 1024

const main = async () => {
  const peerFile = fileURLToPath(import.meta.url)
  const spawnPeer = async () => {
    const child = fork(peerFile, ["peer"], { stdio: ["ignore", "inherit", "inherit", "ipc"] })
    await new Promise<void>((resolve) => {
      const onMessage = (message: PeerReply) => {
        if (message.type !== "ready") return
        child.off("message", onMessage)
        resolve()
      }
      child.on("message", onMessage)
    })
    return child
  }
  const senders = await Promise.all(Array.from({ length: senderCount }, spawnPeer))
  const sinkPeer = await spawnPeer()
  const startSenders = (port: number, size: number) =>
    Promise.all(senders.map((child) => request(child, { type: "send", port, size }, "sending")))
  const stopSenders = () => Promise.all(senders.map((child) => request(child, { type: "stop" }, "stopped")))
  const sinkPort = (await request(sinkPeer, { type: "sink" }, "sink")).port!
  const sinkAddress = NetAddress.inetAddressFromIpStringUnsafe(host, sinkPort)

  console.log(
    `node ${process.version}, ${Os.type()} ${Os.release()}, ${
      Os.cpus()[0]?.model
    } (${Os.availableParallelism()} CPUs), ` +
      `${senderCount} sender processes`
  )

  const nativeIngest = (size: number): BenchTask => {
    let socket: Dgram.Socket | undefined
    let received = 0
    let target = Infinity
    let wake: (() => void) | undefined
    return {
      name: "native",
      setup: async () => {
        socket = createSocket()
        socket.on("message", () => {
          if (++received >= target) {
            target = Infinity
            wake!()
          }
        })
        await startSenders(await bindSocket(socket), size)
      },
      teardown: async () => {
        await stopSenders()
        socket!.close()
      },
      processed: () => received,
      run: () =>
        new Promise<void>((resolve) => {
          wake = resolve
          target = received + ingestPacketsPerRun
        })
    }
  }

  const effectIngest = (size: number, readAddress: boolean): BenchTask => {
    let opened: Opened | undefined
    let received = 0
    let batches = 0
    let target = 0
    let phaseReceived = 0
    let phaseBatches = 0
    let loop: Effect.Effect<void, DatagramSocket.DatagramSocketError> = Effect.void
    return {
      name: readAddress ? "DatagramSocket, reading .address" : "DatagramSocket",
      setup: async () => {
        opened = await openNode()
        loop = Effect.flatMap(opened.reader.pull, (batch) => {
          batches++
          received += batch.length
          if (readAddress) { for (let i = 0; i < batch.length; i++) blackhole = batch[i].address }
          return received >= target ? Effect.void : loop
        })
        await startSenders(opened.reader.address.port, size)
      },
      teardown: async () => {
        await stopSenders()
        await opened!.close()
      },
      processed: () => received,
      onPhase: () => {
        phaseReceived = received
        phaseBatches = batches
      },
      extra: () => ({
        "Batch (mean)": ((received - phaseReceived) / Math.max(1, batches - phaseBatches)).toFixed(2)
      }),
      run: (signal) => {
        target = received + ingestPacketsPerRun
        return Effect.runPromise(loop, { signal })
      }
    }
  }

  const slowIngest = (size: number, strategy: "dropping" | "sliding"): BenchTask => {
    let opened: Opened | undefined
    let received = 0
    let remaining = 0
    let droppedAtPhase = 0
    let receivedAtPhase = 0
    let phaseStart = 0
    let phaseEnd = 0
    let droppedAtEnd = 0
    let batchSizes: Array<number> = []
    let loop: Effect.Effect<void, DatagramSocket.DatagramSocketError> = Effect.void
    return {
      name: `DatagramSocket, ${strategy}`,
      setup: async () => {
        opened = await openNode({ capacity: slowCapacity, strategy })
        const delay = Effect.sleep(slowDelay)
        loop = Effect.flatMap(opened.reader.pull, (batch) => {
          received += batch.length
          batchSizes.push(batch.length)
          return --remaining > 0 ? Effect.flatMap(delay, () => loop) : Effect.void
        })
        await startSenders(opened.reader.address.port, size)
      },
      teardown: async () => {
        // the run phase tears down last, so these describe it
        phaseEnd = performance.now()
        droppedAtEnd = opened!.reader.dropped()
        await stopSenders()
        await opened!.close()
      },
      // packets that reached the queue, kept or dropped
      processed: () => received + (opened?.reader.dropped() ?? 0),
      onPhase: () => {
        batchSizes = []
        droppedAtPhase = opened!.reader.dropped()
        receivedAtPhase = received
        phaseStart = performance.now()
      },
      extra: () => {
        const seconds = (phaseEnd - phaseStart) / 1000
        return {
          "Batch p50": percentile(batchSizes, 0.5),
          "Batch max": Math.max(0, ...batchSizes),
          "Kept/s": Math.round((received - receivedAtPhase) / seconds),
          "Dropped/s": Math.round((droppedAtEnd - droppedAtPhase) / seconds)
        }
      },
      run: (signal) => {
        remaining = slowBatchesPerRun
        return Effect.runPromise(Effect.flatMap(Effect.sleep(slowDelay), () => loop), { signal })
      }
    }
  }

  // -----------------------------------------------------------------------------
  // tier (a): request/reply
  // -----------------------------------------------------------------------------

  const roundTripsPerRun = 256

  interface NativeClient {
    readonly port: number
    readonly roundTrips: (serverPort: number, count: number) => Promise<void>
    readonly close: () => void
  }

  const nativeClient = async (size: number, callback: boolean): Promise<NativeClient> => {
    const socket = createSocket()
    const payload = new Uint8Array(size).fill(3)
    const noop = callback ? () => {} : undefined
    let onReply = () => {}
    socket.on("message", () => onReply())
    const port = await bindSocket(socket)
    return {
      port,
      roundTrips: (serverPort, count) =>
        new Promise((resolve) => {
          let remaining = count
          onReply = () => {
            if (--remaining === 0) resolve()
            else socket.send(payload, serverPort, host, noop)
          }
          socket.send(payload, serverPort, host, noop)
        }),
      close: () => socket.close()
    }
  }

  const nativeEchoServer = async (callback: boolean) => {
    const socket = createSocket()
    const noop = callback ? () => {} : undefined
    socket.on("message", (payload, info) => socket.send(payload, info.port, info.address, noop))
    return { port: await bindSocket(socket), close: () => socket.close() }
  }

  const effectEchoServer = async (
    target: (clientPort: number) => NetAddress.InetAddress | undefined,
    clientPort: number
  ) => {
    const opened = await openNode()
    const explicit = target(clientPort)
    const writer = opened.writer
    const reply = (datagram: DatagramSocket.Datagram) =>
      writer.write({ payload: datagram.payload, address: explicit ?? datagram })
    const echo = (batch: NonEmptyReadonlyArray<DatagramSocket.Datagram>, index: number): Effect.Effect<
      void,
      DatagramSocket.DatagramSocketError
    > => Effect.flatMap(reply(batch[index]), () => index + 1 < batch.length ? echo(batch, index + 1) : loop)
    const loop: Effect.Effect<void, DatagramSocket.DatagramSocketError> = Effect.flatMap(
      opened.reader.pull,
      (batch) => echo(batch, 0)
    )
    const fiber = Effect.runFork(loop)
    return {
      port: opened.reader.address.port,
      close: async () => {
        await Effect.runPromise(Fiber.interrupt(fiber))
        await opened.close()
      }
    }
  }

  const nativeRoundTrip = (size: number, name: string, callback: boolean): BenchTask => {
    let client: NativeClient | undefined
    let server: { readonly port: number; readonly close: () => void } | undefined
    return {
      name,
      setup: async () => {
        client = await nativeClient(size, callback)
        server = await nativeEchoServer(callback)
      },
      teardown: async () => {
        client!.close()
        server!.close()
      },
      run: () => client!.roundTrips(server!.port, roundTripsPerRun)
    }
  }

  const effectServerRoundTrip = (size: number, name: string, explicit: boolean): BenchTask => {
    let client: NativeClient | undefined
    let server: { readonly port: number; readonly close: () => Promise<void> } | undefined
    return {
      name,
      setup: async () => {
        client = await nativeClient(size, true)
        server = await effectEchoServer(
          (port) => explicit ? NetAddress.inetAddressFromIpStringUnsafe(host, port) : undefined,
          client.port
        )
      },
      teardown: async () => {
        client!.close()
        await server!.close()
      },
      run: () => client!.roundTrips(server!.port, roundTripsPerRun)
    }
  }

  const effectClientRoundTrip = (size: number): BenchTask => {
    let opened: Opened | undefined
    let server: { readonly port: number; readonly close: () => void } | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return {
      name: "DatagramSocket client",
      setup: async () => {
        opened = await openNode()
        server = await nativeEchoServer(true)
        const outgoing = {
          payload: new Uint8Array(size).fill(3),
          address: NetAddress.inetAddressFromIpStringUnsafe(host, server.port)
        }
        const { reader, writer } = opened
        run = repeatEach(() => Effect.flatMap(writer.write(outgoing), () => reader.pull))
      },
      teardown: async () => {
        server!.close()
        await opened!.close()
      },
      run: (signal) => run(roundTripsPerRun, signal)
    }
  }

  // -----------------------------------------------------------------------------
  // tier (a): write and writeAll
  // -----------------------------------------------------------------------------

  const writesPerRun = 1024
  const batchDatagramsPerRun = 4096

  const counted = (task: Omit<BenchTask, "processed">, units: number): BenchTask => {
    let processed = 0
    return {
      ...task,
      processed: () => processed,
      run: (signal) => task.run(signal).then(() => void (processed += units))
    }
  }

  const nativeWrite = (size: number, name: string, mode: "callback" | "default lookup" | "no callback") => {
    let socket: Dgram.Socket | undefined
    const payload = new Uint8Array(size).fill(5)
    return counted({
      name,
      setup: async () => {
        socket = createSocket(mode !== "default lookup")
        await bindSocket(socket)
      },
      teardown: async () => {
        socket!.close()
      },
      run: () =>
        new Promise<void>((resolve) => {
          const current = socket!
          if (mode === "no callback") {
            for (let i = 1; i < writesPerRun; i++) current.send(payload, sinkPort, host)
            // sends complete in order, so the last callback covers the rest
            return current.send(payload, sinkPort, host, () => resolve())
          }
          let remaining = writesPerRun
          const next = () => {
            if (--remaining === 0) resolve()
            else current.send(payload, sinkPort, host, next)
          }
          current.send(payload, sinkPort, host, next)
        })
    }, writesPerRun)
  }

  const effectWrite = (size: number) => {
    let opened: Opened | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return counted({
      name: "DatagramSocket",
      setup: async () => {
        opened = await openNode()
        const writer = opened.writer
        const outgoing = { payload: new Uint8Array(size).fill(5), address: sinkAddress }
        run = repeatEach(() => writer.write(outgoing))
      },
      teardown: () => opened!.close(),
      run: (signal) => run(writesPerRun, signal)
    }, writesPerRun)
  }

  const nativeWriteAll = (size: number, batchSize: number, name: string, callback: boolean) => {
    let socket: Dgram.Socket | undefined
    const payload = new Uint8Array(size).fill(5)
    const batches = batchDatagramsPerRun / batchSize
    return counted({
      name,
      setup: async () => {
        socket = createSocket()
        await bindSocket(socket)
      },
      teardown: async () => {
        socket!.close()
      },
      run: () =>
        new Promise<void>((resolve) => {
          const current = socket!
          let remainingBatches = batches
          const batchDone = () => {
            if (--remainingBatches === 0) resolve()
            else sendBatch()
          }
          const sendBatch = () => {
            if (!callback) {
              for (let i = 1; i < batchSize; i++) current.send(payload, sinkPort, host)
              return current.send(payload, sinkPort, host, batchDone)
            }
            // one callback per datagram and a counter, like the adapter
            let remaining = batchSize
            const report = () => {
              if (--remaining === 0) batchDone()
            }
            for (let i = 0; i < batchSize; i++) current.send(payload, sinkPort, host, report)
          }
          sendBatch()
        })
    }, batchDatagramsPerRun)
  }

  const effectWriteAll = (size: number, batchSize: number) => {
    let opened: Opened | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return counted({
      name: "DatagramSocket",
      setup: async () => {
        opened = await openNode()
        const writer = opened.writer
        const outgoing = { payload: new Uint8Array(size).fill(5), address: sinkAddress }
        const batch = Array.from({ length: batchSize }, () => outgoing) as unknown as NonEmptyReadonlyArray<
          DatagramSocket.OutgoingDatagram
        >
        run = repeatEach(() => writer.writeAll(batch))
      },
      teardown: () => opened!.close(),
      run: (signal) => run(batchDatagramsPerRun / batchSize, signal)
    }, batchDatagramsPerRun)
  }

  // -----------------------------------------------------------------------------
  // run tier (a)
  // -----------------------------------------------------------------------------

  const cpuOf = (results: SuiteResults, name: string) => results.get(name)?.cpu
  const pct = (value: number | undefined, base: number | undefined) =>
    value === undefined || base === undefined ? "n/a" : formatDelta(value, base)

  for (const size of payloadSizes) {
    const workload = `ingest, fast consumer, ${size} B`
    if (!selected(workload)) continue
    const results = await runSuite(
      "ingest, fast consumer",
      `${senderCount} senders, ${ingestPacketsPerRun} packets of ${size} B per run`,
      "pkt",
      ingestPacketsPerRun,
      ingestPacketsPerRun * size,
      [nativeIngest(size), effectIngest(size, false), effectIngest(size, true)],
      { baseline: "native", fastest: "native", metric: "cpu" }
    )
    const native = results.get("native")
    const plain = results.get("DatagramSocket")
    const withAddress = results.get("DatagramSocket, reading .address")
    check(
      workload,
      "CPU per packet vs native",
      pct(plain?.cpu, native?.cpu),
      "+15%",
      plain?.cpu === undefined || native?.cpu === undefined ? false : plain.cpu <= native.cpu * 1.15
    )
    check(
      workload,
      "receive rate vs native",
      plain === undefined || native === undefined ? "n/a" : `${(plain.rate / native.rate * 100).toFixed(1)}%`,
      "≥ 90%",
      plain === undefined || native === undefined ? false : plain.rate >= native.rate * 0.9
    )
    const addressCost = withAddress?.cpu === undefined || plain?.cpu === undefined
      ? undefined
      : withAddress.cpu - plain.cpu
    check(
      workload,
      "reading .address, CPU per packet",
      addressCost === undefined ? "n/a" : `${addressCost >= 0 ? "+" : ""}${addressCost.toFixed(0)} ns`,
      "+300 ns",
      addressCost === undefined ? false : addressCost <= 300
    )
  }

  for (const size of payloadSizes) {
    const workload = `ingest, slow consumer, ${size} B`
    if (!selected(workload)) continue
    const tasks = [slowIngest(size, "dropping"), slowIngest(size, "sliding")]
    await runSuite(
      "ingest, slow consumer",
      `${senderCount} senders, ${slowBatchesPerRun} batches of ${size} B packets per run, ${slowDelay} per batch, capacity ${slowCapacity}`,
      "batch",
      slowBatchesPerRun,
      0,
      tasks,
      { metric: "cpu", cpuUnit: "pkt" }
    )
    for (const task of tasks) {
      const extra = task.extra!()
      check(
        workload,
        `${task.name}: batch max reaches capacity`,
        `p50 ${extra["Batch p50"]}, max ${extra["Batch max"]}`,
        `max = ${slowCapacity}`,
        extra["Batch max"] === slowCapacity
      )
    }
  }

  for (const size of payloadSizes) {
    const workload = `request/reply, ${size} B`
    if (!selected(workload)) continue
    const results = await runSuite(
      "request/reply",
      `${roundTripsPerRun} sequential round trips of ${size} B per run, one process`,
      "round trip",
      roundTripsPerRun,
      roundTripsPerRun * size * 2,
      [
        nativeRoundTrip(size, "native", true),
        nativeRoundTrip(size, "native, no send callback", false),
        effectClientRoundTrip(size),
        effectServerRoundTrip(size, "DatagramSocket server, reply path", false),
        effectServerRoundTrip(size, "DatagramSocket server, explicit InetAddress", true)
      ],
      { baseline: "native", fastest: "native, no send callback", metric: "time" }
    )
    const native = results.get("native")?.time
    for (
      const name of [
        "DatagramSocket client",
        "DatagramSocket server, reply path",
        "DatagramSocket server, explicit InetAddress"
      ]
    ) {
      const time = results.get(name)?.time
      const limit = native === undefined ? undefined : Math.max(native * 1.1, native + 2000)
      check(
        workload,
        `${name}, round trip vs native`,
        time === undefined || native === undefined
          ? "n/a"
          : `${formatNs(time)} vs ${formatNs(native)} (${formatDelta(time, native)})`,
        limit === undefined ? "n/a" : `≤ ${formatNs(limit)} (+10% or +2 µs)`,
        time === undefined || limit === undefined ? false : time <= limit
      )
    }
    const reply = results.get("DatagramSocket server, reply path")
    const explicit = results.get("DatagramSocket server, explicit InetAddress")
    check(
      workload,
      "reply path vs explicit InetAddress",
      reply === undefined || explicit === undefined
        ? "n/a"
        : `${formatNs(reply.time)} vs ${formatNs(explicit.time)} (RME ${reply.rme.toFixed(1)}% / ${
          explicit.rme.toFixed(1)
        }%)`,
      "no slower, within RME",
      reply === undefined || explicit === undefined
        ? false
        : reply.time <= explicit.time * (1 + Math.max(reply.rme, explicit.rme) / 100)
    )
  }

  for (const size of payloadSizes) {
    const workload = `write, ${size} B`
    if (!selected(workload)) continue
    const results = await runSuite(
      "write",
      `${writesPerRun} sequential writes of ${size} B per run`,
      "send",
      writesPerRun,
      writesPerRun * size,
      [
        nativeWrite(size, "native", "callback"),
        nativeWrite(size, "native, default lookup", "default lookup"),
        nativeWrite(size, "native, no send callback", "no callback"),
        effectWrite(size)
      ],
      { baseline: "native", fastest: "native, no send callback", metric: "cpu" }
    )
    const native = cpuOf(results, "native")
    const effect = cpuOf(results, "DatagramSocket")
    check(
      workload,
      "CPU per send vs native",
      pct(effect, native),
      "+15%",
      effect === undefined || native === undefined ? false : effect <= native * 1.15
    )
    const defaultLookup = cpuOf(results, "native, default lookup")
    check(
      workload,
      "immediate lookup vs default lookup, CPU per send",
      pct(native, defaultLookup),
      "info",
      undefined
    )
  }

  for (const size of payloadSizes) {
    for (const batchSize of [1, 16, 256]) {
      const workload = `writeAll ×${batchSize}, ${size} B`
      if (!selected(workload)) continue
      const results = await runSuite(
        `writeAll ×${batchSize}`,
        `${batchDatagramsPerRun / batchSize} sequential batches of ${batchSize} × ${size} B per run`,
        "datagram",
        batchDatagramsPerRun,
        batchDatagramsPerRun * size,
        [
          nativeWriteAll(size, batchSize, "native, counting callback", true),
          nativeWriteAll(size, batchSize, "native, no send callback", false),
          effectWriteAll(size, batchSize)
        ],
        { baseline: "native, counting callback", fastest: "native, no send callback", metric: "cpu" }
      )
      const native = results.get("native, counting callback")
      const effect = results.get("DatagramSocket")
      check(
        workload,
        "batch rate vs native",
        native === undefined || effect === undefined ? "n/a" : `${(effect.rate / native.rate * 100).toFixed(1)}%`,
        batchSize === 256 ? "≥ 90%" : "info",
        batchSize !== 256
          ? undefined
          : native === undefined || effect === undefined
          ? false
          : effect.rate >= native.rate * 0.9
      )
    }
  }

  for (const child of [...senders, sinkPeer]) child.disconnect()
  void blackhole

  // -----------------------------------------------------------------------------
  // tier (b)
  // -----------------------------------------------------------------------------

  await runLayer()

  console.log("\nSummary\n")
  console.log("| Workload | Check | Value | Limit | Result |")
  console.log("| --- | --- | --- | --- | --- |")
  for (const entry of checks) {
    const result = entry.pass === undefined ? "info" : entry.pass ? "pass" : "**FAIL**"
    console.log(`| ${entry.workload} | ${entry.check} | ${entry.value} | ${entry.limit} | ${result} |`)
  }
}

// -----------------------------------------------------------------------------
// tier (b): in-memory layer cost with a fake native handle
// -----------------------------------------------------------------------------

const layerOpsPerRun = 16_384
const allocationOps = 1 << 18
const ipv4Host = "127.0.0.1"
const ipv6Host = "2001:db8:85a3::8a2e:370:7334"

interface FakeSocket {
  readonly opened: Opened
  readonly push: (payload: Uint8Array, host: string) => void
}

const openFake = async (receiveBuffer?: DatagramSocket.ReceiveBufferOptions): Promise<FakeSocket> => {
  let events: DatagramSocket.BackingEvents | undefined
  const handle: DatagramSocket.BackingSocket = {
    address: { host: ipv4Host, port: 9000 },
    // reads the destination during the call, as the contract asks
    send: (_payload, destination, done) => {
      blackhole = destination?.host
      blackhole = destination?.port
      done()
    },
    sendMany: (_payloads, destinations, done) => {
      for (let i = 0; i < destinations.length; i++) {
        blackhole = destinations[i]?.host
        blackhole = destinations[i]?.port
      }
      done()
    },
    joinMulticast: () => Effect.succeed(() => Effect.void),
    close: () => {}
  }
  const socket = await Effect.runPromise(DatagramSocket.makeFromBackingSocket((installed) => {
    events = installed
    return Effect.succeed(handle)
  }, { receiveBuffer }))
  const opened = await openSocket(socket)
  return { opened, push: (payload, host) => events!.onPacket(payload, host, 41234) }
}

/**
 * An in-memory task. `run(ops)` performs `ops` operations, so the same code
 * serves the timed runs and the allocation pass.
 */
interface LayerTask {
  readonly name: string
  readonly setup: () => Promise<void>
  readonly teardown: () => Promise<void>
  readonly run: (ops: number, signal?: AbortSignal) => Promise<void>
  readonly extra?: (() => Record<string, string | number>) | undefined
}

const layerTask = (
  name: string,
  open: () => Promise<FakeSocket>,
  make: (fake: FakeSocket) => LayerTask["run"],
  extra?: () => Record<string, string | number>
): LayerTask => {
  let fake: FakeSocket | undefined
  let run: LayerTask["run"] = () => Promise.resolve()
  return {
    name,
    setup: async () => {
      fake = await open()
      run = make(fake)
    },
    teardown: () => fake!.opened.close(),
    run: (ops, signal) => run(ops, signal),
    extra
  }
}

const queuedPull = (payload: Uint8Array, batchSize: number) =>
  layerTask(`queued pull, batch of ${batchSize}`, () => openFake(), (fake) => {
    const { reader } = fake.opened
    let remaining = 0
    const loop: Effect.Effect<void, DatagramSocket.DatagramSocketError> = Effect.flatMap(reader.pull, (batch) => {
      remaining -= batch.length
      if (remaining <= 0) return Effect.void
      for (let i = 0; i < batchSize; i++) fake.push(payload, ipv4Host)
      return loop
    })
    return (ops, signal) => {
      remaining = ops
      for (let i = 0; i < batchSize; i++) fake.push(payload, ipv4Host)
      return Effect.runPromise(loop, { signal })
    }
  })

const parkedPull = (payload: Uint8Array, name: string, host: string, readAddress: boolean) => {
  let packets = 0
  let pulls = 0
  return layerTask(name, () => openFake(), (fake) => {
    const { reader } = fake.opened
    let remaining = 0
    const loop: Effect.Effect<void, DatagramSocket.DatagramSocketError> = Effect.flatMap(reader.pull, (batch) => {
      pulls++
      packets += batch.length
      if (readAddress) { for (let i = 0; i < batch.length; i++) blackhole = batch[i].address }
      remaining -= batch.length
      return remaining > 0 ? loop : Effect.void
    })
    return (ops, signal) => {
      remaining = ops
      // parks on its first pull; each push below resumes it inline
      const fiber = Effect.runFork(loop, { signal })
      for (let i = 0; i < ops; i++) fake.push(payload, host)
      return Effect.runPromise(Fiber.join(fiber))
    }
  }, () => ({ "Batch (mean)": (packets / Math.max(1, pulls)).toFixed(2) }))
}

const dropPath = (payload: Uint8Array, name: string, receiveBuffer: DatagramSocket.ReceiveBufferOptions) =>
  layerTask(name, async () => {
    const fake = await openFake(receiveBuffer)
    for (let i = 0; i < receiveBuffer.capacity!; i++) fake.push(payload, ipv4Host)
    return fake
  }, (fake) => (ops) => {
    for (let i = 0; i < ops; i++) fake.push(payload, ipv4Host)
    return Promise.resolve()
  })

// fills the queue to `capacity`, then takes it all, so as many packets stay
// alive as in the matching drop row
const accepted = (payload: Uint8Array, capacity: number) =>
  layerTask(`accepted, ${capacity} per pull`, () => openFake({ capacity }), (fake) => {
    const pull = fake.opened.reader.pull
    let queued = 0
    return (ops) => {
      for (let i = 0; i < ops; i++) {
        fake.push(payload, ipv4Host)
        if (++queued === capacity) {
          queued = 0
          Effect.runSync(pull)
        }
      }
      return Promise.resolve()
    }
  })

const layerWrite = (
  payload: Uint8Array,
  name: string,
  destination: (fake: FakeSocket) => NetAddress.InetAddress | DatagramSocket.Datagram
) =>
  layerTask(name, () => openFake(), (fake) => {
    const outgoing = { payload, address: destination(fake) }
    const writer = fake.opened.writer
    return repeatEach(() => writer.write(outgoing))
  })

const layerWriteAll = (payload: Uint8Array, batchSize: number) =>
  layerTask(`writeAll ×${batchSize}`, () => openFake(), (fake) => {
    const outgoing = { payload, address: NetAddress.inetAddressFromIpStringUnsafe(ipv4Host, 9001) }
    const batch = Array.from({ length: batchSize }, () => outgoing) as unknown as NonEmptyReadonlyArray<
      DatagramSocket.OutgoingDatagram
    >
    const writer = fake.opened.writer
    const run = repeatEach(() => writer.writeAll(batch))
    return (ops, signal) => run(Math.max(1, ops / batchSize), signal)
  })

const loopOverhead = () => layerTask("loop overhead", () => openFake(), () => repeatEach(() => Effect.void))

const receivedDatagram = (fake: FakeSocket): DatagramSocket.Datagram => {
  fake.push(new Uint8Array(1), ipv4Host)
  return Effect.runSync(fake.opened.reader.pull)[0]
}

const allocatedBytes = () => V8.getHeapStatistics().total_allocated_bytes

const measureAllocation = async (task: LayerTask): Promise<number> => {
  await task.setup()
  // one warm pass so lazily created state isn't counted
  await task.run(layerOpsPerRun)
  const before = allocatedBytes()
  await task.run(allocationOps)
  const bytes = allocatedBytes() - before
  await task.teardown()
  return bytes / allocationOps
}

const runLayer = async () => {
  for (const size of payloadSizes) {
    const payload = new Uint8Array(size).fill(9)
    const groups: ReadonlyArray<readonly [name: string, tasks: ReadonlyArray<LayerTask>]> = [
      ["layer: receive", [
        queuedPull(payload, 1),
        queuedPull(payload, 64),
        parkedPull(payload, "parked pull, resumed inline", ipv4Host, false),
        parkedPull(payload, "parked pull, reading .address (IPv4)", ipv4Host, true),
        parkedPull(payload, "parked pull, reading .address (IPv6)", ipv6Host, true)
      ]],
      ["layer: drop path", [
        accepted(payload, 1024),
        accepted(payload, 65536),
        dropPath(payload, "dropping, full at 1024", { capacity: 1024, strategy: "dropping" }),
        dropPath(payload, "sliding, full at 1024", { capacity: 1024, strategy: "sliding" }),
        dropPath(payload, "sliding, full at 65536", { capacity: 65536, strategy: "sliding" })
      ]],
      ["layer: write", [
        loopOverhead(),
        layerWrite(payload, "write, reply path", receivedDatagram),
        layerWrite(
          payload,
          "write, explicit InetAddress",
          () => NetAddress.inetAddressFromIpStringUnsafe(ipv4Host, 9001)
        ),
        layerWriteAll(payload, 16),
        layerWriteAll(payload, 256)
      ]]
    ]
    for (const [group, tasks] of groups) {
      if (!selected(`${group}, ${size} B`)) continue
      const bytes = new Map<string, number>()
      for (const task of tasks) bytes.set(task.name, await measureAllocation(task))
      const results = await runSuite(
        group,
        `fake native handle, ${size} B payloads, ${layerOpsPerRun} operations per run`,
        "op",
        layerOpsPerRun,
        layerOpsPerRun * size,
        tasks.map((task) => ({
          name: task.name,
          setup: task.setup,
          teardown: task.teardown,
          run: (signal) => task.run(layerOpsPerRun, signal),
          extra: () => ({ ...task.extra?.(), "B/op": bytes.get(task.name)!.toFixed(1) })
        })),
        { metric: "time" }
      )
      reportLayer(group, size, results, bytes)
    }
  }
}

const reportLayer = (group: string, size: number, results: SuiteResults, bytes: Map<string, number>) => {
  const workload = `${group}, ${size} B`
  const time = (name: string) => results.get(name)?.time
  const info = (name: string) => {
    const value = time(name)
    check(
      workload,
      `${name} (ns/op, B/op)`,
      value === undefined ? "n/a" : `${value.toFixed(1)} ns, ${bytes.get(name)!.toFixed(1)} B`,
      "info",
      undefined
    )
  }
  const noMoreThan = (name: string, reference: string) => {
    const value = time(name)
    const base = time(reference)
    const rme = Math.max(results.get(name)?.rme ?? 0, results.get(reference)?.rme ?? 0)
    check(
      workload,
      `${name} vs ${reference}`,
      value === undefined || base === undefined ? "n/a" : `${value.toFixed(1)} vs ${base.toFixed(1)} ns`,
      "no more, within RME",
      value === undefined || base === undefined ? false : value <= base * (1 + rme / 100)
    )
  }
  switch (group) {
    case "layer: receive": {
      for (const name of results.keys()) info(name)
      return
    }
    case "layer: drop path": {
      for (const name of results.keys()) info(name)
      noMoreThan("dropping, full at 1024", "accepted, 1024 per pull")
      noMoreThan("sliding, full at 1024", "accepted, 1024 per pull")
      noMoreThan("sliding, full at 65536", "accepted, 65536 per pull")
      // Keeping 64 times more packets alive costs more per packet whatever the
      // strategy, so the rows above compare like with like
      const small = time("sliding, full at 1024")
      const large = time("sliding, full at 65536")
      const rme = Math.max(
        results.get("sliding, full at 1024")?.rme ?? 0,
        results.get("sliding, full at 65536")?.rme ?? 0
      )
      check(
        workload,
        "sliding per drop, 65536 vs 1024",
        small === undefined || large === undefined ? "n/a" : formatDelta(large, small),
        "same, within RME",
        small === undefined || large === undefined ? false : large <= small * (1 + rme / 100)
      )
      return
    }
    case "layer: write": {
      for (const name of results.keys()) info(name)
      return
    }
  }
}

if (process.argv[2] === "peer") runPeer()
else await main()
