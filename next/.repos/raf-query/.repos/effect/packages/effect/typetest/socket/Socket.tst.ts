import type { Effect, Scope } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import { Socket } from "effect/socket"
import { describe, expect, it } from "tstyche"

describe("Socket", () => {
  describe("WebSocketConstructorOptions", () => {
    it("accepts protocols and string-valued headers", () => {
      expect("protocol").type.toBeAssignableTo<Socket.WebSocketConstructorOptions>()
      expect(["protocol"]).type.toBeAssignableTo<Socket.WebSocketConstructorOptions>()
      expect({ headers: { Authorization: "Bearer test" } }).type.toBeAssignableTo<
        Socket.WebSocketConstructorOptions
      >()
      expect({ headers: undefined }).type.toBeAssignableTo<Socket.WebSocketConstructorOptions>()
    })

    it("rejects non-string header values", () => {
      expect({ headers: { Authorization: 1 } }).type.not.toBeAssignableTo<Socket.WebSocketConstructorOptions>()
    })
  })

  it("accepts the global WebSocket implementation", () => {
    expect(new globalThis.WebSocket("ws://localhost")).type.toBeAssignableTo<Socket.WebSocketLike>()
  })

  it("reader acquisition requires a scope and exposes typed pulls", () => {
    const socket = null as unknown as Socket.Socket
    const reader = null as unknown as Socket.Reader
    expect(socket.reader).type.toBe<
      Effect.Effect<Socket.Reader, Socket.SocketError, Scope.Scope>
    >()
    expect(Socket.readerBytes(socket)).type.toBe<
      Effect.Effect<
        Effect.Effect<NonEmptyReadonlyArray<Uint8Array>, Socket.SocketError>,
        Socket.SocketError,
        Scope.Scope
      >
    >()
    expect(Socket.readerString(socket)).type.toBe<
      Effect.Effect<
        Effect.Effect<NonEmptyReadonlyArray<string>, Socket.SocketError>,
        Socket.SocketError,
        Scope.Scope
      >
    >()
    expect(reader.upgrade()).type.toBe<Effect.Effect<void, Socket.SocketError>>()
  })

  it("exposes the unsupported upgrade implementation on SocketUpgradeError", () => {
    expect(Socket.SocketUpgradeError.unsupported).type.toBe<Socket.Reader["upgrade"]>()
  })

  it("writer exposes write and writeAll", () => {
    const socket = null as unknown as Socket.Socket
    expect(socket.writer).type.toBe<
      Effect.Effect<Socket.Writer, never, Scope.Scope>
    >()
  })
})
