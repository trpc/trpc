import { PgProtocol } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import * as Result from "effect/Result"
import { backend, bytes, frontend } from "./fixtures/goldens.ts"

const hex = (value: Uint8Array): string => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")

const success = <A, E>(result: Result.Result<A, E>): A => {
  assert.isTrue(Result.isSuccess(result))
  return (result as Result.Success<A, E>).success
}

const parseOne = (golden: string): PgProtocol.BackendMessage => {
  const messages = PgProtocol.makeParser().push(bytes(golden))
  assert.strictEqual(messages.length, 1)
  return messages[0]
}

const assertThrowsTagged = (tag: string, run: () => unknown, message?: string): void => {
  try {
    run()
  } catch (error) {
    assert.strictEqual((error as { readonly _tag?: string })._tag, tag)
    if (message !== undefined) assert.strictEqual((error as Error).message, message)
    return
  }
  assert.fail(`Expected ${tag}`)
}

const assertParseFailure = (golden: string): void =>
  assertThrowsTagged("PgProtocolParseError", () => PgProtocol.makeParser().push(bytes(golden)))

describe("PgProtocol", () => {
  describe("special messages", () => {
    it("encodes an SSLRequest", () => {
      assert.strictEqual(hex(PgProtocol.encodeSslRequest()), frontend.sslRequest)
    })

    it("decodes the SSLRequest response byte", () => {
      assert.strictEqual(success(PgProtocol.decodeSslResponse(0x53)), "S")
      assert.strictEqual(success(PgProtocol.decodeSslResponse(0x4e)), "N")
      const invalid = PgProtocol.decodeSslResponse(0x41)
      assert.isTrue(Result.isFailure(invalid))
      if (Result.isFailure(invalid)) assert.strictEqual(invalid.failure._tag, "PgProtocolParseError")
    })

    it("encodes a StartupMessage", () => {
      const encoded = PgProtocol.encodeStartupMessage({
        user: "effect",
        database: "effect",
        application_name: "effect-pg-codec"
      })
      assert.strictEqual(hex(encoded), frontend.startupMessage)
    })

    it("keeps an explicit client_encoding", () => {
      const encoded = PgProtocol.encodeStartupMessage({ user: "effect", client_encoding: "UTF8" })
      assert.strictEqual(
        hex(encoded),
        "0000002a00030000757365720065666665637400636c69656e745f656e636f64696e6700555446380000"
      )
    })

    it("encodes a CancelRequest", () => {
      const encoded = PgProtocol.encodeCancelRequest({ pid: 63, secret: 166060928 })
      assert.strictEqual(hex(encoded), frontend.cancelRequest)
    })
  })

  describe("frontend messages", () => {
    it("encodes Parse", () => {
      assert.strictEqual(
        hex(success(PgProtocol.encodeParse({ name: "s1", query: "SELECT $1", parameterTypes: [23] }))),
        frontend.parse
      )
    })

    it("encodes Bind with binary parameter and result formats", () => {
      const encoded = success(PgProtocol.encodeBind({
        portal: "p1",
        statement: "s1",
        parameters: [bytes("00000001"), null]
      }))
      assert.strictEqual(hex(encoded), frontend.bind)
    })

    it("encodes strings past the ASCII fast path", () => {
      const encoder = new TextEncoder()
      for (
        const query of [
          "SELECT $1",
          `SELECT ${"c".repeat(200)} FROM t WHERE id = $1`,
          "SELECT 'héllo ☃' , '👋🏽' FROM t WHERE id = $1",
          "é",
          ""
        ]
      ) {
        const encoded = success(PgProtocol.encodeParse({ name: "s1", query, parameterTypes: [23] }))
        const body = encoder.encode(query)
        assert.deepStrictEqual(encoded.subarray(8, 8 + body.length), body)
        assert.strictEqual(encoded[8 + body.length], 0)
        assert.strictEqual(encoded.length, 8 + body.length + 1 + 2 + 4)
      }
    })

    it("encodes Bind through a value sink", () => {
      const encodeBind = PgProtocol.makeBindEncoder<Uint8Array | null>((sink, value) => {
        if (value === null) sink.sqlNull()
        else sink.raw(value)
        return Result.void
      })
      assert.strictEqual(
        hex(success(encodeBind({ portal: "p1", statement: "s1", parameters: [bytes("00000001"), null] }))),
        frontend.bind
      )
    })

    it("frames each sink-written parameter with the bytes it wrote", () => {
      const encodeBind = PgProtocol.makeBindEncoder<number>((sink, value) => {
        sink.int16(value)
        sink.utf8("é")
        sink.float64(value)
        return Result.void
      })
      const encoded = success(encodeBind({ portal: "", statement: "", parameters: [1, 2] }))
      // 1 type byte, 4 length, 2 empty cStrings, 3 int16 of format codes and
      // count, then each parameter as its int32 length and 12 bytes of body
      const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength)
      assert.strictEqual(view.getInt32(13), 12)
      assert.strictEqual(view.getInt16(17), 1)
      assert.strictEqual(view.getFloat64(21), 1)
      assert.strictEqual(view.getInt32(29), 12)
      assert.strictEqual(view.getFloat64(37), 2)
    })

    it("keeps sink-written parameters intact when the pool grows mid-message", () => {
      const encodeBind = PgProtocol.makeBindEncoder<string>((sink, value) => {
        sink.utf8(value)
        return Result.void
      })
      const long = "x".repeat(16 * 1024)
      const encoded = success(encodeBind({ portal: "", statement: "", parameters: ["ab", long, "cd"] }))
      assert.deepStrictEqual(
        encoded,
        success(PgProtocol.encodeBind({
          portal: "",
          statement: "",
          parameters: ["ab", long, "cd"].map((value) => new TextEncoder().encode(value))
        }))
      )
    })

    it("encodes Execute", () => {
      assert.strictEqual(hex(PgProtocol.encodeExecute({ portal: "p1", maxRows: 5 })), frontend.execute)
    })

    it("encodes Describe and Close", () => {
      assert.strictEqual(
        hex(PgProtocol.encodeDescribe({ target: "statement", name: "s1" })),
        frontend.describeStatement
      )
      assert.strictEqual(hex(PgProtocol.encodeClose({ target: "portal", name: "p1" })), frontend.closePortal)
    })

    it("encodes the empty control messages", () => {
      assert.strictEqual(hex(PgProtocol.encodeSync()), frontend.sync)
      assert.strictEqual(hex(PgProtocol.encodeFlush()), frontend.flush)
      assert.strictEqual(hex(PgProtocol.encodeTerminate()), frontend.terminate)
    })

    it("encodes the password messages", () => {
      assert.strictEqual(
        hex(PgProtocol.encodePasswordMessage({ password: "md5abc" })),
        frontend.passwordMessage
      )
      assert.strictEqual(
        hex(PgProtocol.encodeSASLInitialResponse({
          mechanism: "SCRAM-SHA-256",
          initialResponse: bytes("6e2c2c")
        })),
        frontend.saslInitialResponse
      )
      assert.strictEqual(
        hex(PgProtocol.encodeSASLInitialResponse({ mechanism: "SCRAM-SHA-256", initialResponse: null })),
        frontend.saslInitialResponseEmpty
      )
      assert.strictEqual(hex(PgProtocol.encodeSASLResponse({ data: bytes("010203") })), frontend.saslResponse)
    })

    it("dispatches encode over the tagged union", () => {
      const cases: ReadonlyArray<readonly [PgProtocol.FrontendMessage, Uint8Array]> = [
        [
          { _tag: "Parse", name: "s1", query: "SELECT $1", parameterTypes: [23] },
          success(PgProtocol.encodeParse({ name: "s1", query: "SELECT $1", parameterTypes: [23] }))
        ],
        [
          { _tag: "Bind", portal: "p1", statement: "s1", parameters: [bytes("00000001"), null] },
          success(PgProtocol.encodeBind({ portal: "p1", statement: "s1", parameters: [bytes("00000001"), null] }))
        ],
        [{ _tag: "Execute", portal: "p1", maxRows: 5 }, PgProtocol.encodeExecute({ portal: "p1", maxRows: 5 })],
        [
          { _tag: "Describe", target: "statement", name: "s1" },
          PgProtocol.encodeDescribe({ target: "statement", name: "s1" })
        ],
        [
          { _tag: "Close", target: "portal", name: "p1" },
          PgProtocol.encodeClose({ target: "portal", name: "p1" })
        ],
        [{ _tag: "Sync" }, PgProtocol.encodeSync()],
        [{ _tag: "Flush" }, PgProtocol.encodeFlush()],
        [{ _tag: "Terminate" }, PgProtocol.encodeTerminate()],
        [
          { _tag: "PasswordMessage", password: "md5abc" },
          PgProtocol.encodePasswordMessage({ password: "md5abc" })
        ],
        [
          { _tag: "SASLInitialResponse", mechanism: "SCRAM-SHA-256", initialResponse: bytes("6e2c2c") },
          PgProtocol.encodeSASLInitialResponse({ mechanism: "SCRAM-SHA-256", initialResponse: bytes("6e2c2c") })
        ],
        [{ _tag: "SASLResponse", data: bytes("010203") }, PgProtocol.encodeSASLResponse({ data: bytes("010203") })]
      ]
      for (const [message, expected] of cases) {
        assert.deepStrictEqual(success(PgProtocol.encode(message)), expected)
      }
    })

    it("writes the actual typed frame length into every message", () => {
      const messages = [
        success(PgProtocol.encodeParse({ name: "s1", query: "SELECT $1", parameterTypes: [23] })),
        success(PgProtocol.encodeBind({ portal: "p1", statement: "s1", parameters: [bytes("00000001"), null] })),
        PgProtocol.encodeExecute({ portal: "p1", maxRows: 5 }),
        PgProtocol.encodeDescribe({ target: "statement", name: "s1" }),
        PgProtocol.encodeClose({ target: "portal", name: "p1" }),
        PgProtocol.encodeSync(),
        PgProtocol.encodeFlush(),
        PgProtocol.encodeTerminate(),
        PgProtocol.encodePasswordMessage({ password: "md5abc" }),
        PgProtocol.encodeSASLInitialResponse({ mechanism: "SCRAM-SHA-256", initialResponse: bytes("6e2c2c") }),
        PgProtocol.encodeSASLResponse({ data: bytes("010203") })
      ]
      for (const message of messages) {
        assert.strictEqual(
          new DataView(message.buffer, message.byteOffset, message.byteLength).getInt32(1),
          message.length - 1
        )
      }
    })

    it("accepts the maximum signed parameter count and rejects the next value", () => {
      const maxOids = new Array<number>(0x7fff).fill(23)
      const maxParameters = new Array<Uint8Array | null>(0x7fff).fill(null)
      const parse = success(PgProtocol.encodeParse({ name: "", query: "", parameterTypes: maxOids }))
      const bind = success(PgProtocol.encodeBind({ portal: "", statement: "", parameters: maxParameters }))
      assert.strictEqual(new DataView(parse.buffer, parse.byteOffset, parse.byteLength).getInt16(7), 0x7fff)
      assert.strictEqual(new DataView(bind.buffer, bind.byteOffset, bind.byteLength).getInt16(11), 0x7fff)

      const tooManyOids = new Array<number>(0x8000).fill(23)
      const tooManyParameters = new Array<Uint8Array | null>(0x8000).fill(null)
      const parseFailure = PgProtocol.encodeParse({ name: "", query: "", parameterTypes: tooManyOids })
      const bindFailure = PgProtocol.encodeBind({ portal: "", statement: "", parameters: tooManyParameters })
      assert.isTrue(Result.isFailure(parseFailure))
      assert.isTrue(Result.isFailure(bindFailure))
      const encodeBind = PgProtocol.makeBindEncoder<Uint8Array | null>((sink, value) => {
        if (value === null) sink.sqlNull()
        else sink.raw(value)
        return Result.void
      })
      const fusedFailure = encodeBind({ portal: "", statement: "", parameters: tooManyParameters })
      assert.isTrue(Result.isFailure(fusedFailure))
    })
  })

  describe("authentication messages", () => {
    it("decodes AuthenticationOk", () => {
      assert.deepStrictEqual(parseOne(backend.authenticationOk), { _tag: "AuthenticationOk" })
    })

    it("decodes AuthenticationCleartextPassword", () => {
      assert.deepStrictEqual(parseOne(backend.authenticationCleartextPassword), {
        _tag: "AuthenticationCleartextPassword"
      })
    })

    it("decodes AuthenticationMD5Password", () => {
      assert.deepStrictEqual(parseOne(backend.authenticationMD5Password), {
        _tag: "AuthenticationMD5Password",
        salt: bytes("70e7d45e")
      })
    })

    it("decodes AuthenticationSASL", () => {
      assert.deepStrictEqual(parseOne(backend.authenticationSASL), {
        _tag: "AuthenticationSASL",
        mechanisms: ["SCRAM-SHA-256"]
      })
    })

    it("decodes the SASL continuation payloads as opaque bytes", () => {
      const cont = parseOne(backend.authenticationSASLContinue)
      assert.strictEqual(cont._tag, "AuthenticationSASLContinue")
      assert.strictEqual(
        new TextDecoder().decode((cont as PgProtocol.AuthenticationSASLContinue).data).slice(0, 2),
        "r="
      )
      const final = parseOne(backend.authenticationSASLFinal)
      assert.strictEqual(final._tag, "AuthenticationSASLFinal")
    })

    it("reports unsupported authentication methods", () => {
      // AuthenticationGSS, method 7
      assert.deepStrictEqual(parseOne("520000000800000007"), {
        _tag: "AuthenticationUnsupported",
        method: 7,
        payload: new Uint8Array(0)
      })
    })

    it("rejects truncated authentication fields", () => {
      for (
        const frame of [
          "5200000007000000", // truncated authentication method
          "520000000b00000005010203", // three-byte MD5 salt
          "520000000e0000000a534352414d00" // SASL mechanism list without its empty terminator
        ]
      ) {
        assertParseFailure(frame)
      }
    })
  })

  describe("backend messages", () => {
    it("decodes ParameterStatus", () => {
      assert.deepStrictEqual(parseOne(backend.parameterStatus), {
        _tag: "ParameterStatus",
        name: "in_hot_standby",
        value: "off"
      })
    })

    it("decodes BackendKeyData", () => {
      assert.deepStrictEqual(parseOne(backend.backendKeyData), {
        _tag: "BackendKeyData",
        pid: 63,
        secret: 166060928
      })
    })

    it("decodes ReadyForQuery", () => {
      assert.deepStrictEqual(parseOne(backend.readyForQuery), { _tag: "ReadyForQuery", status: "I" })
    })

    // ParameterStatus is two C-strings and nothing else, so it is the cheapest
    // way to drive the string decoder across the length its fast path covers.
    const parameterStatus = (name: string, value: string): Uint8Array => {
      const encoder = new TextEncoder()
      const encode = (text: string) => encoder.encode(text)
      return frame(encode(name), encode(value))
    }

    const frame = (name: Uint8Array, value: Uint8Array): Uint8Array => {
      const length = 4 + name.length + 1 + value.length + 1
      const message = new Uint8Array(1 + length)
      message[0] = 0x53
      new DataView(message.buffer).setInt32(1, length)
      message.set(name, 5)
      message.set(value, 6 + name.length)
      return message
    }

    it("decodes parameter names of every length across the string fast path", () => {
      for (let length = 0; length <= 16; length++) {
        const name = "abcdefgh".repeat(2).slice(0, length)
        assert.deepStrictEqual(PgProtocol.makeParser().push(parameterStatus(name, "v")), [
          { _tag: "ParameterStatus", name, value: "v" }
        ])
      }
    })

    it("decodes a multi-byte character at every position of the string fast path", () => {
      for (let prefix = 0; prefix <= 16; prefix++) {
        const name = "a".repeat(prefix) + "é☃"
        assert.deepStrictEqual(PgProtocol.makeParser().push(parameterStatus(name, "v")), [
          { _tag: "ParameterStatus", name, value: "v" }
        ])
      }
    })

    it("decodes a parameter that really contains the replacement character", () => {
      const name = "status\ufffdmessage and some padding"
      assert.deepStrictEqual(
        PgProtocol.makeParser().push(parameterStatus(name, "v")),
        [{ _tag: "ParameterStatus", name, value: "v" }]
      )
    })

    it("rejects a stray high byte at every position of the string fast path", () => {
      for (let length = 1; length <= 16; length++) {
        for (let at = 0; at < length; at++) {
          const name = new Uint8Array(length).fill(0x61)
          name[at] = 0xc3
          assertThrowsTagged(
            "PgProtocolParseError",
            () => PgProtocol.makeParser().push(frame(name, new Uint8Array([0x76])))
          )
        }
      }
    })

    it("decodes RowDescription", () => {
      assert.deepStrictEqual(parseOne(backend.rowDescription), {
        _tag: "RowDescription",
        fields: [
          {
            name: "a",
            tableOid: 0,
            columnAttributeNumber: 0,
            dataTypeOid: 23,
            dataTypeSize: 4,
            typeModifier: -1,
            format: 1
          },
          {
            name: "b",
            tableOid: 0,
            columnAttributeNumber: 0,
            dataTypeOid: 25,
            dataTypeSize: -1,
            typeModifier: -1,
            format: 1
          }
        ]
      })
    })

    it("decodes DataRow as raw bytes, with null for SQL NULL", () => {
      assert.deepStrictEqual(parseOne(backend.dataRowTwoColumns), {
        _tag: "DataRow",
        values: [bytes("00000001"), bytes("78")]
      })
      assert.deepStrictEqual(parseOne(backend.dataRowWithNull), {
        _tag: "DataRow",
        values: [bytes("0000000000000007"), null]
      })
    })

    it("decodes ParameterDescription", () => {
      assert.deepStrictEqual(parseOne(backend.parameterDescription), {
        _tag: "ParameterDescription",
        parameterTypes: [20]
      })
    })

    it("decodes CommandComplete", () => {
      assert.deepStrictEqual(parseOne(backend.commandComplete), {
        _tag: "CommandComplete",
        commandTag: "SELECT 1"
      })
    })

    it("decodes the empty acknowledgements", () => {
      assert.deepStrictEqual(parseOne(backend.parseComplete), { _tag: "ParseComplete" })
      assert.deepStrictEqual(parseOne(backend.bindComplete), { _tag: "BindComplete" })
      assert.deepStrictEqual(parseOne(backend.closeComplete), { _tag: "CloseComplete" })
      assert.deepStrictEqual(parseOne(backend.portalSuspended), { _tag: "PortalSuspended" })
      assert.deepStrictEqual(parseOne(backend.emptyQueryResponse), { _tag: "EmptyQueryResponse" })
      assert.deepStrictEqual(parseOne(backend.noData), { _tag: "NoData" })
    })

    it("decodes ErrorResponse fields by name", () => {
      assert.deepStrictEqual(parseOne(backend.errorResponse), {
        _tag: "ErrorResponse",
        fields: {
          severity: "ERROR",
          severityUnlocalized: "ERROR",
          code: "22012",
          message: "division by zero",
          file: "int.c",
          line: "870",
          routine: "int4div"
        }
      })
    })

    it("decodes NoticeResponse", () => {
      const notice = parseOne(backend.noticeResponse)
      assert.strictEqual(notice._tag, "NoticeResponse")
      assert.strictEqual((notice as PgProtocol.NoticeResponse).fields.code, "00000")
      assert.strictEqual((notice as PgProtocol.NoticeResponse).fields.severity, "NOTICE")
    })

    it("decodes NotificationResponse", () => {
      assert.deepStrictEqual(parseOne(backend.notificationResponse), {
        _tag: "NotificationResponse",
        pid: 63,
        channel: "effect_channel",
        payload: "payload text"
      })
    })

    it("decodes NegotiateProtocolVersion", () => {
      // minor version 0, one unrecognised option "_pq_.foo"
      assert.deepStrictEqual(parseOne("760000001500000000000000015f70715f2e666f6f00"), {
        _tag: "NegotiateProtocolVersion",
        minorVersion: 0,
        unrecognizedOptions: ["_pq_.foo"]
      })
    })

    it("decodes the COPY messages", () => {
      assert.deepStrictEqual(parseOne("470000000b00000200000001"), {
        _tag: "CopyInResponse",
        format: 0,
        columnFormats: [0, 1]
      })
      assert.deepStrictEqual(parseOne("48000000090100010000"), {
        _tag: "CopyOutResponse",
        format: 1,
        columnFormats: [0]
      })
      assert.deepStrictEqual(parseOne("57000000090100010000"), {
        _tag: "CopyBothResponse",
        format: 1,
        columnFormats: [0]
      })
      assert.deepStrictEqual(parseOne("6400000008010203ff"), {
        _tag: "CopyData",
        data: bytes("010203ff")
      })
      assert.deepStrictEqual(parseOne("6300000004"), { _tag: "CopyDone" })
      assert.deepStrictEqual(parseOne("6400000004"), { _tag: "CopyData", data: new Uint8Array(0) })
    })

    it("reports an unknown type byte instead of failing", () => {
      assert.deepStrictEqual(parseOne("5f00000008deadbeef"), {
        _tag: "Unknown",
        type: 0x5f,
        payload: bytes("deadbeef")
      })
      assert.deepStrictEqual(parseOne("5f00000004"), {
        _tag: "Unknown",
        type: 0x5f,
        payload: new Uint8Array(0)
      })
    })
  })

  describe("incremental parsing", () => {
    it("buffers a message split across two chunks", () => {
      const parser = PgProtocol.makeParser()
      const frame = bytes(backend.dataRowTwoColumns)
      assert.deepStrictEqual(parser.push(frame.subarray(0, 7)), [])
      const messages = parser.push(frame.subarray(7))
      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0]._tag, "DataRow")
    })

    it("pushEach hands over a message before it reads the next", () => {
      const parser = PgProtocol.makeParser<unknown>()
      const seen: Array<PgProtocol.BackendMessage<unknown>> = []
      parser.pushEach(bytes(backend.rowDescription + backend.dataRowTwoColumns), (message) => {
        // A row's columns are only known from the description in front of it,
        // so installing the reader here has to reach the rows behind it.
        if (message._tag === "RowDescription") {
          parser.readField = (bytes, offset, size) => (size < 0 ? null : hex(bytes.subarray(offset, offset + size)))
        }
        seen.push(message)
      })
      assert.strictEqual(seen.length, 2)
      assert.strictEqual(seen[0]._tag, "RowDescription")
      assert.deepStrictEqual(seen[1], { _tag: "DataRow", values: ["00000001", "78"] })
    })

    it("pushEach keeps the messages it handed over before a failure", () => {
      const parser = PgProtocol.makeParser()
      const seen: Array<PgProtocol.BackendMessage> = []
      assertThrowsTagged(
        "PgProtocolParseError",
        () => parser.pushEach(bytes(backend.parseComplete + "4480000000"), (message) => seen.push(message))
      )
      assert.deepStrictEqual(seen, [{ _tag: "ParseComplete" }])
    })

    it("returns both messages when one chunk holds two", () => {
      const parser = PgProtocol.makeParser()
      const chunk = bytes(backend.parseComplete + backend.bindComplete)
      assert.deepStrictEqual(parser.push(chunk), [{ _tag: "ParseComplete" }, { _tag: "BindComplete" }])
    })

    it("returns every message when one chunk holds many", () => {
      const parser = PgProtocol.makeParser()
      const messages = parser.push(bytes(backend.parseComplete.repeat(2_000)))
      assert.strictEqual(messages.length, 2_000)
      assert.strictEqual(messages.every((message) => message._tag === "ParseComplete"), true)
    })

    it("keeps the trailing partial message across pushes", () => {
      const parser = PgProtocol.makeParser()
      const chunk = bytes(backend.parseComplete + backend.readyForQuery)
      assert.deepStrictEqual(parser.push(chunk.subarray(0, 8)), [{ _tag: "ParseComplete" }])
      assert.deepStrictEqual(parser.push(chunk.subarray(8)), [{ _tag: "ReadyForQuery", status: "I" }])
    })

    it("handles a byte-at-a-time stream", () => {
      const parser = PgProtocol.makeParser()
      const frame = bytes(backend.rowDescription)
      const messages: Array<PgProtocol.BackendMessage> = []
      for (let i = 0; i < frame.length; i++) {
        messages.push(...parser.push(frame.subarray(i, i + 1)))
      }
      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0]._tag, "RowDescription")
    })

    it("grows its buffer for a large fragmented DataRow", () => {
      const field = new Uint8Array(40 * 1024)
      for (let index = 0; index < field.length; index++) field[index] = index % 251
      const frame = new Uint8Array(11 + field.length)
      const view = new DataView(frame.buffer)
      frame[0] = 0x44
      view.setInt32(1, frame.length - 1)
      view.setInt16(5, 1)
      view.setInt32(7, field.length)
      frame.set(field, 11)

      const parser = PgProtocol.makeParser()
      const messages: Array<PgProtocol.BackendMessage> = []
      for (let offset = 0; offset < frame.length; offset += 1024) {
        messages.push(...parser.push(frame.subarray(offset, offset + 1024)))
      }
      assert.strictEqual(messages.length, 1)
      assert.strictEqual(messages[0]._tag, "DataRow")
      assert.deepStrictEqual((messages[0] as PgProtocol.DataRow).values, [field])
    })

    it("rejects a length prefix above maxMessageSize", () => {
      const parser = PgProtocol.makeParser()
      assertThrowsTagged("PgProtocolParseError", () => parser.push(bytes("447fffffff0000")))
    })

    it("honours a custom maxMessageSize", () => {
      const parser = PgProtocol.makeParser({ maxMessageSize: 8 })
      assertThrowsTagged("PgProtocolParseError", () => parser.push(bytes(backend.rowDescription)))
    })

    it("rejects a length prefix below the minimum", () => {
      const parser = PgProtocol.makeParser()
      assertThrowsTagged("PgProtocolParseError", () => parser.push(bytes("4400000003ff")))
      assertThrowsTagged("PgProtocolParseError", () => PgProtocol.makeParser().push(bytes("4480000000")))
    })

    it("accepts a frame exactly at maxMessageSize", () => {
      assert.deepStrictEqual(PgProtocol.makeParser({ maxMessageSize: 8 }).push(bytes("5f00000008deadbeef")), [
        { _tag: "Unknown", type: 0x5f, payload: bytes("deadbeef") }
      ])
    })

    it("rejects a truncated payload", () => {
      // CommandComplete whose command tag is never NUL-terminated
      assertParseFailure("430000000953454c454354")
    })

    it("rejects payload bytes beyond a message's declared fields", () => {
      for (
        const frame of [
          "3100000005ff", // ParseComplete with a byte of payload
          "44000000070000ff" // DataRow declares zero fields but carries a byte
        ]
      ) {
        assertParseFailure(frame)
      }
    })

    it("rejects a DataRow field length below the NULL sentinel", () => {
      assertParseFailure("440000000a0001fffffffe")
    })

    it("rejects a negative DataRow field count", () => {
      assertParseFailure("4400000006ffff")
    })

    it("rejects negative collection counts", () => {
      for (
        const frame of [
          "5400000006ffff", // RowDescription
          "7400000006ffff", // ParameterDescription
          "470000000700ffff", // CopyInResponse
          "480000000700ffff", // CopyOutResponse
          "570000000700ffff", // CopyBothResponse
          "760000000c00000000ffffffff" // NegotiateProtocolVersion
        ]
      ) {
        assertParseFailure(frame)
      }
    })

    it("rejects a truncated DataRow field length", () => {
      assertParseFailure("440000000800010000")
      assertParseFailure("4400000004")
    })

    it("rejects invalid statuses and UTF-8", () => {
      assertParseFailure("5a0000000558")
      assertParseFailure("5300000008ff007800")
    })

    it("does not read a DataRow field past the end of its own message", () => {
      // One field that claims ten bytes in a message carrying two, followed by
      // a complete message the field must not be allowed to reach into
      assertThrowsTagged(
        "PgProtocolParseError",
        () => PgProtocol.makeParser().push(bytes(`440000000c00010000000a0102${backend.parseComplete}`))
      )
    })

    it("cannot be reused after a malformed frame", () => {
      const parser = PgProtocol.makeParser()
      assertThrowsTagged(
        "PgProtocolParseError",
        () => parser.push(bytes(`${backend.parseComplete}430000000953454c454354`))
      )
      assertThrowsTagged(
        "PgProtocolParseError",
        () => parser.push(bytes(backend.bindComplete)),
        "Parser cannot be reused after a failure"
      )
    })

    it("does not read a string past the end of its own message", () => {
      // CommandComplete whose tag is not NUL-terminated, followed by a message
      // whose length prefix contains NUL bytes
      assertThrowsTagged(
        "PgProtocolParseError",
        () => PgProtocol.makeParser().push(bytes(`430000000a53454c454354${backend.parseComplete}`))
      )
    })
  })

  describe("buffer reuse", () => {
    it("keeps DataRow field views valid across later pushes", () => {
      const parser = PgProtocol.makeParser()
      const frame = bytes(backend.dataRowTwoColumns)
      const first = parser.push(frame)[0] as PgProtocol.DataRow
      const snapshot = first.values.map((value) => value === null ? null : value.slice())
      // enough to run past the parser's buffer and force a replacement
      for (let index = 0; index < 2000; index++) parser.push(frame)
      assert.deepStrictEqual(first.values, snapshot)
    })

    it("keeps DataRow field views valid as the buffer pool grows", () => {
      const parser = PgProtocol.makeParser()
      const frame = bytes(backend.dataRowTwoColumns)
      const retained: Array<{ readonly row: PgProtocol.DataRow; readonly snapshot: Array<Uint8Array | null> }> = []
      // enough pushes to run the pool from its initial size up to its ceiling
      for (let index = 0; index < 5000; index++) {
        const row = parser.push(frame)[0] as PgProtocol.DataRow
        if (index % 500 === 0) {
          retained.push({ row, snapshot: row.values.map((value) => value === null ? null : value.slice()) })
        }
      }
      for (const { row, snapshot } of retained) {
        assert.deepStrictEqual(row.values, snapshot)
      }
    })

    it("keeps an encoded frame valid after encoding more", () => {
      const first = success(PgProtocol.encodeBind({
        portal: "portal",
        statement: "statement",
        parameters: [bytes("0102030405")]
      }))
      const snapshot = first.slice()
      for (let index = 0; index < 100; index++) {
        success(PgProtocol.encodeBind({ portal: "other", statement: "s", parameters: [new Uint8Array(64)] }))
      }
      assert.deepStrictEqual(first, snapshot)
    })

    it("keeps an encoded frame valid after an oversized one", () => {
      const first = PgProtocol.encodeSync()
      const snapshot = first.slice()
      const huge = success(PgProtocol.encodeBind({
        portal: "",
        statement: "",
        parameters: [new Uint8Array(32 * 1024)]
      }))
      assert.strictEqual(huge.length, 32 * 1024 + 21)
      assert.deepStrictEqual(first, snapshot)
      assert.deepStrictEqual(PgProtocol.encodeSync(), snapshot)
    })
  })
})
