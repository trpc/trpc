/**
 * Node.js streams adapter for the low-level multipart parser.
 *
 * @since 4.0.0
 */
// oxlint-disable typescript/no-unsafe-declaration-merging
/// <reference types="node" />
import type { BaseConfig, MultipartError, Parser, PartInfo } from "effect/http/MultipartParser"
import { make as makeParser } from "effect/http/MultipartParser"
import type { IncomingHttpHeaders } from "node:http"
import { Duplex, Readable } from "node:stream"

/**
 * A part emitted by the Node.js multipart parser.
 *
 * @category models
 * @since 4.0.0
 */
export type Part = Field | FileStream

/**
 * A parsed multipart field.
 *
 * @category models
 * @since 4.0.0
 */
export interface Field {
  readonly _tag: "Field"
  readonly info: PartInfo
  readonly value: Uint8Array
}

/**
 * A Node.js duplex stream that emits parsed multipart parts.
 *
 * @category models
 * @since 4.0.0
 */
export interface MultipartStream extends Duplex {
  [Symbol.asyncIterator](): NodeJS.AsyncIterator<Part>

  on(event: "field", listener: (field: Field) => void): this
  on(event: "file", listener: (file: FileStream) => void): this
  on(event: "close", listener: () => void): this
  on(event: "data", listener: (part: Part) => void): this
  on(event: "drain", listener: () => void): this
  on(event: "end", listener: () => void): this
  on(event: "error", listener: (err: MultipartError) => void): this
  on(event: "finish", listener: () => void): this
  on(event: "pause", listener: () => void): this
  on(event: "pipe", listener: (src: Readable) => void): this
  on(event: "readable", listener: () => void): this
  on(event: "resume", listener: () => void): this
  on(event: "unpipe", listener: (src: Readable) => void): this
  on(event: string | symbol, listener: (...args: Array<any>) => void): this

  read(size?: number): Part | null
}

/**
 * Configuration for the Node.js multipart parser.
 *
 * @category models
 * @since 4.0.0
 */
export type NodeConfig = Omit<BaseConfig, "headers"> & {
  readonly headers: IncomingHttpHeaders
}

/**
 * A Node.js duplex stream that parses multipart input.
 *
 * @category models
 * @since 4.0.0
 */
export class MultipartStream extends Duplex {
  private _parser: Parser
  _canWrite = true
  private _writeCallback: (() => void) | undefined

  constructor(config: NodeConfig) {
    super({ readableObjectMode: true })
    let currentError: MultipartError | undefined
    let currentFile: FileStream | undefined
    this._parser = makeParser({
      ...(config as any),
      onField: (info, value) => {
        if (currentError !== undefined) return
        const field: Field = { _tag: "Field", info, value }
        this.push(field)
        this.emit("field", field)
      },
      onFile: (info) => {
        if (currentError !== undefined) return (_) => {}
        const file = new FileStream(info, this)
        currentFile = file
        this.push(file)
        this.emit("file", file)
        return (chunk) => {
          if (currentError !== undefined) return
          this._canWrite = file.push(chunk)
          if (chunk === null && !this._canWrite) {
            currentFile = undefined
            this._resume()
          }
        }
      },
      onError: (error) => {
        this.emit("error", error)
        currentFile?.emit("error", error)
        currentError = error
      },
      onDone: () => {
        this.push(null)
      }
    })
  }

  _resume() {
    this._canWrite = true
    if (this._writeCallback !== undefined) {
      const callback = this._writeCallback
      this._writeCallback = undefined
      callback()
    }
  }

  override _read(_size: number) {}

  override _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    this._parser.write(
      chunk instanceof Uint8Array ? chunk : Buffer.from(chunk, encoding)
    )
    if (this._canWrite) {
      callback()
    } else {
      this._writeCallback = callback
    }
  }

  override _final(callback: (error?: Error | null | undefined) => void): void {
    this._parser.end()
    callback()
  }
}

/**
 * Creates a Node.js multipart parser stream.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (config: NodeConfig): MultipartStream => new MultipartStream(config)

/**
 * A readable stream containing a parsed multipart file.
 *
 * @category models
 * @since 4.0.0
 */
export class FileStream extends Readable {
  readonly _tag = "File"
  readonly filename: string | undefined
  readonly info: PartInfo
  private _parent: MultipartStream
  constructor(
    info: PartInfo,
    parent: MultipartStream
  ) {
    super()
    this.info = info
    this._parent = parent
    this.filename = info.filename
  }
  override _read(_size: number) {
    if (this._parent._canWrite === false) {
      this._parent._resume()
    }
  }
}
