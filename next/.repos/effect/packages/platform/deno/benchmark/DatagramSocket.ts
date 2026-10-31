/**
 * DatagramSocket cost against raw `Deno.listenDatagram` and an in-memory
 * native handle.
 *
 * Tier (a): loopback against `Deno.listenDatagram`. CPU counts this process only.
 * Native baselines match send completion and payload retention guarantees;
 * ingest compares paths that do not read the sender address. The `vs fastest`
 * column is informational, not a pass/fail gate.
 *
 * Fast ingest uses sender processes (default 3). Slow ingest sleeps
 * between pulls to measure batching and overflow. Request/reply compares raw
 * datagram replies with explicit addresses; writes target a sink process.
 *
 * Native receives copy with `slice`; native writes await each send. The fastest
 * baseline may omit copies or start sends concurrently. `writeAll` compares
 * sequential and concurrent native sends.
 *
 * The `read loop` workload never pulls its capacity-1 reader, isolating receive,
 * copy and drop costs. A wrapped `receive` counts packets. Baselines run first;
 * timings can drift by 10% within a suite, so compare medians across runs.
 *
 * Tier (b): a fake backing socket pushes packets and completes sends
 * synchronously, isolating core overhead. Allocation is measured over 2^18
 * operations with `v8.getHeapStatistics().total_allocated_bytes`. The adapter's
 * payload copy is measured separately.
 * `loop overhead` measures an empty write-shaped Effect loop; pull loops
 * reuse one `flatMap` and cost less.
 *
 * Tier (b) baseline (deno 2.9.4, V8 15.0.245.2, Linux 6.18.48, Intel Xeon
 * Platinum 8573C, 64 B payloads, median of 5 full runs; B/op is ±3 B). A later
 * change fails if it is more than 10% slower on the same machine. B/op counts
 * the V8 heap only, so the copy's 64 B backing store isn't in its row. Running
 * the receive group alone with `DATAGRAM_BENCH_ONLY` reads about 12 B/op
 * higher for queued pulls than a full run does. The two `.address` rows are
 * bimodal from one process to the next (IPv4 338 to 498 ns, IPv6 482 to
 * 654 ns over the 5 runs), so they can't carry the 10% gate; compare them
 * against that range:
 *
 * | Task                                 | ns/op | B/op |
 * | ------------------------------------ | ----- | ---- |
 * | queued pull, batch of 1              | 119.1 |  261 |
 * | queued pull, batch of 64             |  16.6 |   93 |
 * | parked pull, resumed inline          | 190.4 |  203 |
 * | parked pull, reading .address (IPv4) | 352.3 |  332 |
 * | parked pull, reading .address (IPv6) | 512.7 |  331 |
 * | payload copy (slice)                 | 800.6 |  201 |
 * | accepted, 1024 per pull              |  25.6 |  108 |
 * | accepted, 65536 per pull             |  28.6 |  106 |
 * | dropping, full at 1024               |   6.9 |    1 |
 * | sliding, full at 1024                |  11.0 |    4 |
 * | sliding, full at 65536               |  10.9 |    2 |
 * | loop overhead                        | 101.9 |  123 |
 * | write, reply path                    | 170.4 |  487 |
 * | write, explicit InetAddress          | 160.0 |  484 |
 * | writeAll ×16                         |  25.3 |   55 |
 * | writeAll ×256                        |  16.8 |   19 |
 *
 * Environment variables: `DATAGRAM_BENCH_SENDERS` (default 3),
 * `DATAGRAM_BENCH_TIMEOUT` in milliseconds per run (default 10000), and
 * `DATAGRAM_BENCH_ONLY` to run only the workloads whose name contains it.
 *
 * Run with `pnpm --dir packages/platform/deno benchmark:datagram`.
 */
import * as DenoDatagramSocket from "@effect/platform-deno/DenoDatagramSocket"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as NetAddress from "effect/net/NetAddress"
import * as Scope from "effect/Scope"
import * as DatagramSocket from "effect/socket/DatagramSocket"
import * as Os from "node:os"
import process from "node:process"
import { setImmediate } from "node:timers"
import * as V8 from "node:v8"
import { Bench } from "tinybench"

const senderCount = Number(Deno.env.get("DATAGRAM_BENCH_SENDERS") ?? 3)
const runTimeout = Number(Deno.env.get("DATAGRAM_BENCH_TIMEOUT") ?? 10_000)
const only = Deno.env.get("DATAGRAM_BENCH_ONLY")
const selected = (workload: string) => only === undefined || workload.includes(only)
const payloadSizes = [64, 1400] as const
const host = "127.0.0.1"
// the adapter's receive buffer
const receiveBufferSize = 65536

// keeps values the benchmark reads from being optimized away
let blackhole: unknown

const listen = (port = 0) => Deno.listenDatagram({ transport: "udp", hostname: host, port })
const addrOf = (port: number): Deno.NetAddr => ({ transport: "udp", hostname: host, port })
const portOf = (conn: Deno.DatagramConn) => (conn.addr as Deno.NetAddr).port

// A receive loop that runs until its connection closes. It waits for a promise
// `onPacket` returns before receiving again.
const receiveLoop = async (
  conn: Deno.DatagramConn,
  onPacket: (data: Uint8Array, addr: Deno.NetAddr) => Promise<unknown> | void
) => {
  const buffer = new Uint8Array(receiveBufferSize)
  try {
    while (true) {
      const [data, addr] = await conn.receive(buffer)
      const pending = onPacket(data, addr as Deno.NetAddr)
      if (pending !== undefined) await pending
    }
  } catch {
    // closed
  }
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

// Splits a byte stream into lines
const lines = async function*(stream: ReadableStream<Uint8Array>) {
  let pending = ""
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    pending += chunk
    let index: number
    while ((index = pending.indexOf("\n")) >= 0) {
      yield pending.slice(0, index)
      pending = pending.slice(index + 1)
    }
  }
}

const runPeer = async () => {
  let sender: { readonly conn: Deno.DatagramConn; stopped: boolean } | undefined
  let sending: Promise<void> = Promise.resolve()
  let sink: Deno.DatagramConn | undefined
  const encoder = new TextEncoder()
  const reply = (message: PeerReply) => {
    const bytes = encoder.encode(JSON.stringify(message) + "\n")
    let written = 0
    while (written < bytes.length) written += Deno.stdout.writeSync(bytes.subarray(written))
  }
  // messages sent before the command loop starts wait in the pipe
  reply({ type: "ready" })
  for await (const line of lines(Deno.stdin.readable)) {
    const command = JSON.parse(line) as PeerCommand
    switch (command.type) {
      case "send": {
        const current = { conn: listen(), stopped: false }
        const { conn } = current
        const payload = new Uint8Array(command.size).fill(7)
        const target = addrOf(command.port)
        sender = current
        // bursts of sends started together, yielding so the stop command gets
        // through
        sending = (async () => {
          const sends: Array<Promise<number>> = []
          while (!current.stopped) {
            for (let i = 0; i < 64; i++) sends.push(conn.send(payload, target))
            try {
              await Promise.all(sends)
            } catch {
              // closed, or a full buffer
            }
            sends.length = 0
            await new Promise((resolve) => setImmediate(resolve))
          }
        })()
        reply({ type: "sending" })
        break
      }
      case "stop": {
        const current = sender
        sender = undefined
        if (current !== undefined) current.stopped = true
        await sending
        current?.conn.close()
        reply({ type: "stopped" })
        break
      }
      case "sink": {
        sink = listen()
        void receiveLoop(sink, () => {})
        reply({ type: "sink", port: portOf(sink) })
        break
      }
    }
  }
  // the parent closed stdin
  sender?.conn.close()
  sink?.close()
  Deno.exit(0)
}

interface Peer {
  readonly request: (command: PeerCommand, expected: PeerReply["type"]) => Promise<PeerReply>
  readonly close: () => Promise<void>
}

const spawnPeer = async (): Promise<Peer> => {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--unstable-net", import.meta.filename!, "peer"],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit"
  }).spawn()
  const stdin = child.stdin.getWriter()
  const encoder = new TextEncoder()
  const listeners = new Set<(message: PeerReply) => void>()
  const { promise: isReady, resolve: ready } = Promise.withResolvers<void>()
  void (async () => {
    for await (const line of lines(child.stdout)) {
      const message = JSON.parse(line) as PeerReply
      if (message.type === "ready") ready()
      for (const listener of listeners) listener(message)
    }
  })()
  // a peer that dies on startup never reports ready
  await withTimeout("peer startup", () => isReady)()
  return {
    request: (command, expected) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(onMessage)
          reject(new Error(`peer did not answer ${command.type} within ${runTimeout} ms`))
        }, runTimeout)
        const onMessage = (message: PeerReply) => {
          if (message.type !== expected) return
          clearTimeout(timer)
          listeners.delete(onMessage)
          resolve(message)
        }
        listeners.add(onMessage)
        void stdin.write(encoder.encode(JSON.stringify(command) + "\n"))
      }),
    close: async () => {
      await stdin.close()
      await child.status
    }
  }
}

// -----------------------------------------------------------------------------
// harness, adapted from `node-shared/benchmark/Socket.ts`
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
  // equivalent-guarantee baseline, and the native baselines the fastest is
  // picked from once measured
  readonly baseline?: string
  readonly fastest?: ReadonlyArray<string>
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
  const cpu = new Map<string, { usage: ReturnType<typeof process.cpuUsage>; start: number; perUnit?: number }>()
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
  const fastestMetrics = (comparison.fastest ?? []).flatMap((name) => {
    const metric = metricOf(results.get(name))
    return metric === undefined ? [] : [metric]
  })
  const fastest = fastestMetrics.length === 0 ? undefined : Math.min(...fastestMetrics)
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

const openDeno = async (receiveBuffer?: DatagramSocket.ReceiveBufferOptions) =>
  openSocket(await Effect.runPromise(DenoDatagramSocket.make({ bind: { address: host }, receiveBuffer })))

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
  const senders = await Promise.all(Array.from({ length: senderCount }, spawnPeer))
  const sinkPeer = await spawnPeer()
  const startSenders = (port: number, size: number) =>
    Promise.all(senders.map((peer) => peer.request({ type: "send", port, size }, "sending")))
  const stopSenders = () => Promise.all(senders.map((peer) => peer.request({ type: "stop" }, "stopped")))
  const sinkPort = (await sinkPeer.request({ type: "sink" }, "sink")).port!
  const sinkAddr = addrOf(sinkPort)
  const sinkAddress = NetAddress.inetAddressFromIpStringUnsafe(host, sinkPort)

  console.log(
    `deno ${Deno.version.deno} (V8 ${Deno.version.v8}), ${Os.type()} ${Os.release()}, ${
      Os.cpus()[0]?.model
    } (${Os.availableParallelism()} CPUs), ` +
      `${senderCount} sender processes`
  )

  // A raw `receive(buf)` loop, copying each packet out unless `copy` is false
  const nativeIngest = (size: number, name: string, copy: boolean): BenchTask => {
    let conn: Deno.DatagramConn | undefined
    let loop: Promise<void> | undefined
    let received = 0
    let target = Infinity
    let wake: (() => void) | undefined
    return {
      name,
      setup: async () => {
        conn = listen()
        loop = receiveLoop(conn, (data) => {
          blackhole = copy ? data.slice() : data
          if (++received >= target) {
            target = Infinity
            wake!()
          }
        })
        await startSenders(portOf(conn), size)
      },
      teardown: async () => {
        await stopSenders()
        conn!.close()
        await loop
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
        opened = await openDeno()
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
        opened = await openDeno({ capacity: slowCapacity, strategy })
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
  // tier (a): the adapter's read loop
  // -----------------------------------------------------------------------------

  // The adapter's loop over an adopted connection that counts `receive` calls.
  // The adapter calls `receive` again once it has handled a packet, so every
  // call after the first is one packet through the loop.
  const adapterReadLoop = (size: number): BenchTask => {
    let opened: Opened | undefined
    let calls = 0
    let target = Infinity
    let wake: (() => void) | undefined
    return {
      name: "DatagramSocket read loop",
      setup: async () => {
        const conn = listen()
        // an own property, so the adapter's calls cost one extra closure call
        const receive = conn.receive.bind(conn)
        conn.receive = (buffer) => {
          if (++calls >= target) {
            target = Infinity
            wake!()
          }
          return receive(buffer)
        }
        const socket = await Effect.runPromise(
          DenoDatagramSocket.fromDatagramConn(Effect.succeed(conn), {
            receiveBuffer: { capacity: 1, strategy: "dropping" }
          })
        )
        opened = await openSocket(socket)
        await startSenders(portOf(conn), size)
      },
      teardown: async () => {
        await stopSenders()
        await opened!.close()
      },
      processed: () => Math.max(0, calls - 1),
      extra: () => ({ Dropped: opened?.reader.dropped() ?? 0 }),
      run: () =>
        new Promise<void>((resolve) => {
          wake = resolve
          target = calls + ingestPacketsPerRun
        })
    }
  }

  // -----------------------------------------------------------------------------
  // tier (a): request/reply
  // -----------------------------------------------------------------------------

  const roundTripsPerRun = 256

  interface NativeClient {
    readonly port: number
    readonly roundTrips: (serverPort: number, count: number, signal: AbortSignal) => Promise<void>
    readonly close: () => void
  }

  // `guarded` awaits every send and copies every reply, as the adapter does
  const nativeClient = (size: number, guarded: boolean): NativeClient => {
    const conn = listen()
    const payload = new Uint8Array(size).fill(3)
    const buffer = new Uint8Array(receiveBufferSize)
    return {
      port: portOf(conn),
      roundTrips: async (serverPort, count, signal) => {
        const target = addrOf(serverPort)
        for (let i = 0; i < count && !signal.aborted; i++) {
          if (guarded) await conn.send(payload, target)
          else void conn.send(payload, target)
          const [data] = await conn.receive(buffer)
          blackhole = guarded ? data.slice() : data
        }
      },
      close: () => conn.close()
    }
  }

  const nativeEchoServer = (guarded: boolean) => {
    const conn = listen()
    const loop = receiveLoop(conn, (data, addr) => {
      if (!guarded) return void conn.send(data, addr)
      return conn.send(data.slice(), addr)
    })
    return {
      port: portOf(conn),
      close: async () => {
        conn.close()
        await loop
      }
    }
  }

  const effectEchoServer = async (
    target: (clientPort: number) => NetAddress.InetAddress | undefined,
    clientPort: number
  ) => {
    const opened = await openDeno()
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

  const nativeRoundTrip = (size: number, name: string, guarded: boolean): BenchTask => {
    let client: NativeClient | undefined
    let server: { readonly port: number; readonly close: () => Promise<void> } | undefined
    return {
      name,
      setup: async () => {
        client = nativeClient(size, guarded)
        server = nativeEchoServer(guarded)
      },
      teardown: async () => {
        client!.close()
        await server!.close()
      },
      run: (signal) => client!.roundTrips(server!.port, roundTripsPerRun, signal)
    }
  }

  const effectServerRoundTrip = (size: number, name: string, explicit: boolean): BenchTask => {
    let client: NativeClient | undefined
    let server: { readonly port: number; readonly close: () => Promise<void> } | undefined
    return {
      name,
      setup: async () => {
        client = nativeClient(size, true)
        server = await effectEchoServer(
          (port) => explicit ? NetAddress.inetAddressFromIpStringUnsafe(host, port) : undefined,
          client.port
        )
      },
      teardown: async () => {
        client!.close()
        await server!.close()
      },
      run: (signal) => client!.roundTrips(server!.port, roundTripsPerRun, signal)
    }
  }

  const effectClientRoundTrip = (size: number): BenchTask => {
    let opened: Opened | undefined
    let server: { readonly port: number; readonly close: () => Promise<void> } | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return {
      name: "DatagramSocket client",
      setup: async () => {
        opened = await openDeno()
        server = nativeEchoServer(true)
        const outgoing = {
          payload: new Uint8Array(size).fill(3),
          address: NetAddress.inetAddressFromIpStringUnsafe(host, server.port)
        }
        const { reader, writer } = opened
        run = repeatEach(() => Effect.flatMap(writer.write(outgoing), () => reader.pull))
      },
      teardown: async () => {
        await server!.close()
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

  // Sends `count` datagrams in batches of `batchSize`. `awaited` waits for each
  // send before the next, and otherwise a whole batch starts at once.
  const nativeSends = (
    conn: Deno.DatagramConn,
    payload: Uint8Array,
    count: number,
    batchSize: number,
    awaited: boolean,
    signal: AbortSignal
  ) =>
    (async () => {
      const sends: Array<Promise<number>> = []
      for (let sent = 0; sent < count && !signal.aborted; sent += batchSize) {
        if (awaited) {
          for (let i = 0; i < batchSize; i++) await conn.send(payload, sinkAddr)
          continue
        }
        for (let i = 0; i < batchSize; i++) sends.push(conn.send(payload, sinkAddr))
        await Promise.all(sends)
        sends.length = 0
      }
    })()

  const nativeWrite = (size: number, name: string, awaited: boolean) => {
    let conn: Deno.DatagramConn | undefined
    const payload = new Uint8Array(size).fill(5)
    return counted({
      name,
      setup: async () => {
        conn = listen()
      },
      teardown: async () => {
        conn!.close()
      },
      // without awaiting, every write in a run starts at once
      run: (signal) => nativeSends(conn!, payload, writesPerRun, awaited ? 1 : writesPerRun, awaited, signal)
    }, writesPerRun)
  }

  const effectWrite = (size: number) => {
    let opened: Opened | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return counted({
      name: "DatagramSocket",
      setup: async () => {
        opened = await openDeno()
        const writer = opened.writer
        const outgoing = { payload: new Uint8Array(size).fill(5), address: sinkAddress }
        run = repeatEach(() => writer.write(outgoing))
      },
      teardown: () => opened!.close(),
      run: (signal) => run(writesPerRun, signal)
    }, writesPerRun)
  }

  const nativeWriteAll = (size: number, batchSize: number, name: string, awaited: boolean) => {
    let conn: Deno.DatagramConn | undefined
    const payload = new Uint8Array(size).fill(5)
    return counted({
      name,
      setup: async () => {
        conn = listen()
      },
      teardown: async () => {
        conn!.close()
      },
      run: (signal) => nativeSends(conn!, payload, batchDatagramsPerRun, batchSize, awaited, signal)
    }, batchDatagramsPerRun)
  }

  const effectWriteAll = (size: number, batchSize: number) => {
    let opened: Opened | undefined
    let run: (count: number, signal?: AbortSignal) => Promise<void> = () => Promise.resolve()
    return counted({
      name: "DatagramSocket",
      setup: async () => {
        opened = await openDeno()
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
  const rateOf = (value: TaskResult | undefined, base: TaskResult | undefined) =>
    value === undefined || base === undefined ? "n/a" : `${(value.rate / base.rate * 100).toFixed(1)}%`

  for (const size of payloadSizes) {
    const workload = `ingest, fast consumer, ${size} B`
    if (!selected(workload)) continue
    const results = await runSuite(
      "ingest, fast consumer",
      `${senderCount} senders, ${ingestPacketsPerRun} packets of ${size} B per run`,
      "pkt",
      ingestPacketsPerRun,
      ingestPacketsPerRun * size,
      [
        nativeIngest(size, "native", true),
        nativeIngest(size, "native, no copy", false),
        effectIngest(size, false),
        effectIngest(size, true)
      ],
      { baseline: "native", fastest: ["native", "native, no copy"], metric: "cpu" }
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
      rateOf(plain, native),
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
      "+800 ns",
      addressCost === undefined ? false : addressCost <= 800
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
    const workload = `read loop, ${size} B`
    if (!selected(workload)) continue
    const results = await runSuite(
      "read loop",
      `${senderCount} senders, ${ingestPacketsPerRun} packets of ${size} B per run, capacity 1, never pulled`,
      "pkt",
      ingestPacketsPerRun,
      ingestPacketsPerRun * size,
      [
        nativeIngest(size, "native", true),
        nativeIngest(size, "native, no copy", false),
        adapterReadLoop(size)
      ],
      { baseline: "native", fastest: ["native", "native, no copy"], metric: "cpu" }
    )
    const native = results.get("native")
    const loop = results.get("DatagramSocket read loop")
    check(workload, "CPU per packet vs raw receive(buf) + slice", pct(loop?.cpu, native?.cpu), "info", undefined)
    check(workload, "receive rate vs raw receive(buf) + slice", rateOf(loop, native), "info", undefined)
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
        nativeRoundTrip(size, "native, no copy, send not awaited", false),
        effectClientRoundTrip(size),
        effectServerRoundTrip(size, "DatagramSocket server, reply path", false),
        effectServerRoundTrip(size, "DatagramSocket server, explicit InetAddress", true)
      ],
      { baseline: "native", fastest: ["native", "native, no copy, send not awaited"], metric: "time" }
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
        nativeWrite(size, "native", true),
        nativeWrite(size, "native, sends not awaited", false),
        effectWrite(size)
      ],
      { baseline: "native", fastest: ["native", "native, sends not awaited"], metric: "cpu" }
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
          nativeWriteAll(size, batchSize, "native, sends awaited in turn", true),
          nativeWriteAll(size, batchSize, "native, batch started at once", false),
          effectWriteAll(size, batchSize)
        ],
        {
          baseline: "native, sends awaited in turn",
          fastest: ["native, sends awaited in turn", "native, batch started at once"],
          metric: "cpu"
        }
      )
      const native = results.get("native, sends awaited in turn")
      const effect = results.get("DatagramSocket")
      check(
        workload,
        "batch rate vs native",
        rateOf(effect, native),
        batchSize === 256 ? "≥ 90%" : "info",
        batchSize !== 256
          ? undefined
          : native === undefined || effect === undefined
          ? false
          : effect.rate >= native.rate * 0.9
      )
    }
  }

  await Promise.all([...senders, sinkPeer].map((peer) => peer.close()))
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

// The adapter's copy of each packet out of its reused receive buffer
const payloadCopy = (size: number): LayerTask => {
  const view = new Uint8Array(receiveBufferSize).fill(9).subarray(0, size)
  return {
    name: "payload copy (slice)",
    setup: () => Promise.resolve(),
    teardown: () => Promise.resolve(),
    run: (ops) => {
      for (let i = 0; i < ops; i++) blackhole = view.slice()
      return Promise.resolve()
    }
  }
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
  await withTimeout(`${task.name}: allocation warmup`, (signal) => task.run(layerOpsPerRun, signal))()
  const before = allocatedBytes()
  // the timer adds a few hundred bytes over 2^18 operations
  await withTimeout(`${task.name}: allocation pass`, (signal) => task.run(allocationOps, signal))()
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
        parkedPull(payload, "parked pull, reading .address (IPv6)", ipv6Host, true),
        payloadCopy(size)
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

if (Deno.args[0] === "peer") await runPeer()
else await main()
