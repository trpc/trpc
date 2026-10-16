/**
 * Regenerates the goldens in `goldens.ts` against a live PostgreSQL server.
 *
 * This is a maintenance tool, not a test: the unit tests only read
 * `goldens.ts`. Run it when the fixtures need refreshing, then paste the
 * printed JSON into `goldens.ts`.
 *
 * ```sh
 * docker run -d --name pg-goldens -p 55432:5432 \
 *   -e POSTGRES_USER=effect -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=effect \
 *   -e POSTGRES_HOST_AUTH_METHOD=scram-sha-256 postgres:16-alpine
 * node packages/sql/pg/test/fixtures/regenerate.ts
 * ```
 *
 * The SCRAM fixtures depend on the salt and server nonce, so each run
 * produces a different - but equally valid - captured exchange. Capturing
 * `authenticationMD5Password` and `authenticationCleartextPassword` needs a
 * server started with `POSTGRES_HOST_AUTH_METHOD=md5` or `=password`.
 */
import { PgAuth, PgProtocol, PgTypes } from "@effect/sql-pg"
import * as Result from "effect/Result"
import * as net from "node:net"

const success = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) throw result.failure
  return result.success
}

const HOST = process.env.PGHOST ?? "127.0.0.1"
const PORT = Number(process.env.PGPORT ?? 55432)
const USER = process.env.PGUSER ?? "effect"
const PASSWORD = process.env.PGPASSWORD ?? "secret"
const DATABASE = process.env.PGDATABASE ?? "effect"
const CLIENT_NONCE = "effectnonce0123456789"

const toHex = (value: Uint8Array): string => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")

/** A connection that records the raw bytes of every backend message. */
class Session {
  readonly socket: net.Socket
  readonly parser = PgProtocol.makeParser()
  readonly frames: Array<{ readonly tag: string; readonly hex: string }> = []
  private buffer = Buffer.alloc(0)
  private readonly pending: Array<PgProtocol.BackendMessage> = []
  private readonly waiters: Array<() => void> = []

  constructor(socket: net.Socket) {
    this.socket = socket
    socket.on("data", (chunk) => this.onData(chunk as Buffer))
  }

  /** Connects, negotiates TLS away, and starts recording frames. */
  static async connect(): Promise<{ readonly session: Session; readonly sslResponse: "S" | "N" }> {
    const socket = net.connect({ host: HOST, port: PORT })
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve)
      socket.once("error", reject)
    })
    socket.write(PgProtocol.encodeSslRequest())
    const byte = await new Promise<number>((resolve) => socket.once("data", (data) => resolve((data as Buffer)[0])))
    return { session: new Session(socket), sslResponse: success(PgProtocol.decodeSslResponse(byte)) }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 5) {
      const length = this.buffer.readInt32BE(1)
      if (this.buffer.length < length + 1) break
      const frame = new Uint8Array(this.buffer.subarray(0, length + 1))
      this.buffer = this.buffer.subarray(length + 1)
      for (const message of this.parser.push(frame)) {
        this.frames.push({ tag: message._tag, hex: toHex(frame) })
        this.pending.push(message)
      }
    }
    while (this.waiters.length > 0) this.waiters.pop()!()
  }

  async next(): Promise<PgProtocol.BackendMessage> {
    while (this.pending.length === 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    return this.pending.shift()!
  }

  write(bytes: Uint8Array): void {
    this.socket.write(bytes)
  }

  /** The first frame with this tag recorded at or after `from`. */
  frameFrom(tag: string, from: number): string | undefined {
    return this.frames.slice(from).find((frame) => frame.tag === tag)?.hex
  }

  /** Runs an extended-query cycle and returns every message it produced. */
  async query(
    sql: string,
    parameterTypes: ReadonlyArray<number> = [],
    parameters: ReadonlyArray<Uint8Array | null> = []
  ): Promise<Array<PgProtocol.BackendMessage>> {
    this.write(success(PgProtocol.encodeParse({ name: "", query: sql, parameterTypes })))
    this.write(success(PgProtocol.encodeBind({ portal: "", statement: "", parameters })))
    this.write(PgProtocol.encodeDescribe({ target: "portal", name: "" }))
    this.write(PgProtocol.encodeExecute({ portal: "", maxRows: 0 }))
    this.write(PgProtocol.encodeSync())
    const messages: Array<PgProtocol.BackendMessage> = []
    for (;;) {
      const message = await this.next()
      messages.push(message)
      if (message._tag === "ReadyForQuery") return messages
    }
  }
}

const authenticate = async (session: Session): Promise<void> => {
  session.write(PgProtocol.encodeStartupMessage({
    user: USER,
    database: DATABASE,
    application_name: "effect-pg-codec"
  }))
  let started: { readonly state: PgAuth.ScramFirst; readonly response: Uint8Array } | undefined
  let continued: { readonly state: PgAuth.ScramFinal; readonly response: Uint8Array } | undefined
  for (;;) {
    const message = await session.next()
    switch (message._tag) {
      case "AuthenticationCleartextPassword": {
        session.write(PgProtocol.encodePasswordMessage({ password: PASSWORD }))
        break
      }
      case "AuthenticationMD5Password": {
        const password = success(PgAuth.md5Password({ user: USER, password: PASSWORD, salt: message.salt }))
        console.log(`md5.salt        ${toHex(message.salt)}`)
        console.log(`md5.expected    ${password}`)
        session.write(PgProtocol.encodePasswordMessage({ password }))
        break
      }
      case "AuthenticationSASL": {
        started = success(PgAuth.scramInit({ password: PASSWORD, nonce: CLIENT_NONCE }))
        session.write(PgProtocol.encodeSASLInitialResponse({
          mechanism: PgAuth.SCRAM_SHA_256,
          initialResponse: started.response
        }))
        break
      }
      case "AuthenticationSASLContinue": {
        continued = success(PgAuth.scramContinue(started!.state, message.data))
        console.log(`scram.serverFirstMessage  ${new TextDecoder().decode(message.data)}`)
        console.log(`scram.clientFinalMessage  ${new TextDecoder().decode(continued.response)}`)
        session.write(PgProtocol.encodeSASLResponse({ data: continued.response }))
        break
      }
      case "AuthenticationSASLFinal": {
        success(PgAuth.scramFinish(continued!.state, message.data))
        console.log(`scram.serverFinalMessage  ${new TextDecoder().decode(message.data)}`)
        break
      }
      case "ErrorResponse":
        throw new Error(`Authentication failed: ${JSON.stringify(message.fields)}`)
      case "ReadyForQuery":
        return
    }
  }
}

const rowCases: ReadonlyArray<
  { readonly name: string; readonly type: string; readonly oid: number; readonly value: unknown }
> = [
  { name: "bool", type: "bool", oid: PgTypes.OID.bool, value: true },
  { name: "int2", type: "int2", oid: PgTypes.OID.int2, value: -12345 },
  { name: "int4", type: "int4", oid: PgTypes.OID.int4, value: 2147483647 },
  { name: "int8Max", type: "int8", oid: PgTypes.OID.int8, value: BigInt("9223372036854775807") },
  { name: "int8Min", type: "int8", oid: PgTypes.OID.int8, value: BigInt("-9223372036854775808") },
  { name: "oid", type: "oid", oid: PgTypes.OID.oid, value: 4294967295 },
  { name: "regclass", type: "regclass", oid: PgTypes.OID.regclass, value: 4294967295 },
  { name: "float4", type: "float4", oid: PgTypes.OID.float4, value: 1.5 },
  { name: "float8", type: "float8", oid: PgTypes.OID.float8, value: -3.0625 },
  { name: "numeric", type: "numeric", oid: PgTypes.OID.numeric, value: "12345.6789" },
  { name: "numericSmall", type: "numeric", oid: PgTypes.OID.numeric, value: "0.0001" },
  { name: "numericNegative", type: "numeric", oid: PgTypes.OID.numeric, value: "-98765432109876543210" },
  { name: "numericNaN", type: "numeric", oid: PgTypes.OID.numeric, value: "NaN" },
  { name: "text", type: "text", oid: PgTypes.OID.text, value: "héllo ☃" },
  { name: "varchar", type: "varchar", oid: PgTypes.OID.varchar, value: "abc" },
  { name: "bpchar", type: "bpchar", oid: PgTypes.OID.bpchar, value: "xy" },
  { name: "name", type: "name", oid: PgTypes.OID.name, value: "some_name" },
  { name: "bytea", type: "bytea", oid: PgTypes.OID.bytea, value: new Uint8Array([0, 1, 254, 255]) },
  { name: "json", type: "json", oid: PgTypes.OID.json, value: { a: [1, 2], b: null } },
  { name: "jsonb", type: "jsonb", oid: PgTypes.OID.jsonb, value: { a: [1, 2], b: null } },
  { name: "uuid", type: "uuid", oid: PgTypes.OID.uuid, value: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
  { name: "inet4", type: "inet", oid: PgTypes.OID.inet, value: "192.168.0.1" },
  { name: "inet4Masked", type: "inet", oid: PgTypes.OID.inet, value: "192.168.0.1/24" },
  { name: "inet6", type: "inet", oid: PgTypes.OID.inet, value: "2001:db8::1" },
  { name: "cidr", type: "cidr", oid: PgTypes.OID.cidr, value: "10.0.0.0/8" },
  { name: "date", type: "date", oid: PgTypes.OID.date, value: "2024-02-29" },
  { name: "dateInfinity", type: "date", oid: PgTypes.OID.date, value: "infinity" },
  { name: "dateNegInfinity", type: "date", oid: PgTypes.OID.date, value: "-infinity" },
  { name: "time", type: "time", oid: PgTypes.OID.time, value: BigInt(45296000000) },
  { name: "timetz", type: "timetz", oid: PgTypes.OID.timetz, value: "12:34:56+02:00" },
  { name: "timestamp", type: "timestamp", oid: PgTypes.OID.timestamp, value: new Date(1717171717123) },
  { name: "timestampInfinity", type: "timestamp", oid: PgTypes.OID.timestamp, value: Number.POSITIVE_INFINITY },
  { name: "timestamptz", type: "timestamptz", oid: PgTypes.OID.timestamptz, value: new Date(1717171717123) },
  {
    name: "timestamptzNegInfinity",
    type: "timestamptz",
    oid: PgTypes.OID.timestamptz,
    value: Number.NEGATIVE_INFINITY
  },
  { name: "int4ArrayWithNulls", type: "int4[]", oid: PgTypes.OID.int4Array, value: [1, null, -3] },
  { name: "textArrayEmpty", type: "text[]", oid: PgTypes.OID.textArray, value: [] },
  {
    name: "timestamptzArray",
    type: "timestamptz[]",
    oid: PgTypes.OID.timestamptzArray,
    value: [new Date(0), null, new Date(1717171717000)]
  }
]

const main = async () => {
  const frontend: Record<string, string> = {
    sslRequest: toHex(PgProtocol.encodeSslRequest()),
    cancelRequest: toHex(PgProtocol.encodeCancelRequest({ pid: 63, secret: 166060928 })),
    startupMessage: toHex(
      PgProtocol.encodeStartupMessage({ user: USER, database: DATABASE, application_name: "effect-pg-codec" })
    ),
    parse: toHex(success(PgProtocol.encodeParse({ name: "s1", query: "SELECT $1", parameterTypes: [23] }))),
    bind: toHex(
      success(PgProtocol.encodeBind({
        portal: "p1",
        statement: "s1",
        parameters: [new Uint8Array([0, 0, 0, 1]), null]
      }))
    ),
    execute: toHex(PgProtocol.encodeExecute({ portal: "p1", maxRows: 5 })),
    describeStatement: toHex(PgProtocol.encodeDescribe({ target: "statement", name: "s1" })),
    closePortal: toHex(PgProtocol.encodeClose({ target: "portal", name: "p1" })),
    sync: toHex(PgProtocol.encodeSync()),
    flush: toHex(PgProtocol.encodeFlush()),
    terminate: toHex(PgProtocol.encodeTerminate()),
    passwordMessage: toHex(PgProtocol.encodePasswordMessage({ password: "md5abc" })),
    saslInitialResponse: toHex(
      PgProtocol.encodeSASLInitialResponse({
        mechanism: PgAuth.SCRAM_SHA_256,
        initialResponse: new Uint8Array([110, 44, 44])
      })
    ),
    saslInitialResponseEmpty: toHex(
      PgProtocol.encodeSASLInitialResponse({ mechanism: PgAuth.SCRAM_SHA_256, initialResponse: null })
    ),
    saslResponse: toHex(PgProtocol.encodeSASLResponse({ data: new Uint8Array([1, 2, 3]) }))
  }

  const { session, sslResponse } = await Session.connect()
  console.log(`sslResponse     ${sslResponse}`)
  await authenticate(session)

  const backend: Record<string, string> = {}
  const rows: Record<string, string> = {}
  for (const frame of session.frames) {
    if (frame.tag.startsWith("Authentication")) {
      backend[`authentication${frame.tag.slice("Authentication".length)}`] ??= frame.hex
    }
    if (frame.tag === "ParameterStatus") backend.parameterStatus ??= frame.hex
    if (frame.tag === "BackendKeyData") backend.backendKeyData = frame.hex
    if (frame.tag === "ReadyForQuery") backend.readyForQuery = frame.hex
  }

  for (const { name, oid, type, value } of rowCases) {
    const from = session.frames.length
    const messages = await session.query(`SELECT $1::${type}`, [oid], [success(PgTypes.encode(value, oid))])
    const error = messages.find((message) => message._tag === "ErrorResponse")
    if (error !== undefined) {
      throw new Error(`${name}: ${JSON.stringify((error as PgProtocol.ErrorResponse).fields)}`)
    }
    rows[name] = session.frameFrom("DataRow", from)!
  }

  {
    const from = session.frames.length
    await session.query("SELECT 1::int4 AS a, 'x'::text AS b")
    backend.rowDescription = session.frameFrom("RowDescription", from)!
    backend.commandComplete = session.frameFrom("CommandComplete", from)!
    backend.dataRowTwoColumns = session.frameFrom("DataRow", from)!
    backend.parseComplete = session.frameFrom("ParseComplete", from)!
    backend.bindComplete = session.frameFrom("BindComplete", from)!
  }
  {
    const from = session.frames.length
    session.write(success(PgProtocol.encodeParse({
      name: "",
      query: "SELECT $1::int8, NULL::text",
      parameterTypes: [PgTypes.OID.int8]
    })))
    session.write(PgProtocol.encodeDescribe({ target: "statement", name: "" }))
    session.write(success(PgProtocol.encodeBind({
      portal: "",
      statement: "",
      parameters: [success(PgTypes.encode(BigInt(7), PgTypes.OID.int8))]
    })))
    session.write(PgProtocol.encodeExecute({ portal: "", maxRows: 0 }))
    session.write(PgProtocol.encodeSync())
    while ((await session.next())._tag !== "ReadyForQuery") { /* drain */ }
    backend.parameterDescription = session.frameFrom("ParameterDescription", from)!
    backend.dataRowWithNull = session.frameFrom("DataRow", from)!
  }
  {
    const from = session.frames.length
    await session.query("SELECT 1/0")
    backend.errorResponse = session.frameFrom("ErrorResponse", from)!
  }
  {
    const from = session.frames.length
    await session.query("")
    backend.emptyQueryResponse = session.frameFrom("EmptyQueryResponse", from)!
    backend.noData = session.frameFrom("NoData", from)!
  }
  {
    const from = session.frames.length
    session.write(
      success(PgProtocol.encodeParse({
        name: "",
        query: "SELECT g FROM generate_series(1,3) g",
        parameterTypes: []
      }))
    )
    session.write(success(PgProtocol.encodeBind({ portal: "", statement: "", parameters: [] })))
    session.write(PgProtocol.encodeExecute({ portal: "", maxRows: 1 }))
    session.write(PgProtocol.encodeSync())
    while ((await session.next())._tag !== "ReadyForQuery") { /* drain */ }
    backend.portalSuspended = session.frameFrom("PortalSuspended", from)!
  }
  {
    const from = session.frames.length
    session.write(success(PgProtocol.encodeParse({ name: "s1", query: "SELECT 1", parameterTypes: [] })))
    session.write(PgProtocol.encodeClose({ target: "statement", name: "s1" }))
    session.write(PgProtocol.encodeSync())
    while ((await session.next())._tag !== "ReadyForQuery") { /* drain */ }
    backend.closeComplete = session.frameFrom("CloseComplete", from)!
  }
  {
    await session.query("LISTEN effect_channel")
    const from = session.frames.length
    await session.query("NOTIFY effect_channel, 'payload text'")
    backend.notificationResponse = session.frameFrom("NotificationResponse", from) ?? backend.notificationResponse
  }
  {
    const from = session.frames.length
    await session.query("DROP TABLE IF EXISTS effect_missing_table")
    backend.noticeResponse = session.frameFrom("NoticeResponse", from) ?? backend.noticeResponse
  }

  session.write(PgProtocol.encodeTerminate())
  session.socket.end()
  console.log(JSON.stringify({ frontend, backend, rows }, null, 2))
}

await main()
