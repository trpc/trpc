import type { PluginInfo, SerovalNode } from 'seroval'

export type RawStreamHint = 'binary' | 'text'

export interface RawStreamOptions {
  /**
   * Encoding hint for JSON and SSR serialization.
   * - 'binary' (default): Always use base64 encoding
   * - 'text': Try UTF-8 first, fallback to base64 for invalid UTF-8 chunks
   */
  hint?: RawStreamHint
}

/**
 * Marker class for ReadableStream<Uint8Array> that should be serialized
 * with base64/text encoding (JSON and SSR) or binary framing
 * (server-function responses).
 *
 * Wrap your binary streams with this to get efficient serialization:
 * ```ts
 * // For binary data (files, images, etc.)
 * return { data: new RawStream(file.stream()) }
 *
 * // For text-heavy data (RSC payloads, etc.)
 * return { data: new RawStream(rscStream, { hint: 'text' }) }
 * ```
 *
 * RawStreams returned from one server function share one ordered response.
 * Arbitrary or sequential consumption can require potentially unbounded client
 * buffering for unread data. Cancelling one RawStream discards it locally;
 * abort the whole server-function call to cancel the response and server work.
 * Consume streams concurrently, cancel unused streams promptly, or use separate
 * calls when independent backpressure is required.
 */
export class RawStream {
  public readonly hint: RawStreamHint

  constructor(
    public readonly stream: ReadableStream<Uint8Array>,
    options?: RawStreamOptions,
  ) {
    this.hint = options?.hint ?? 'binary'
  }
}

export type OnRawStreamCallback = (
  streamId: number,
  stream: ReadableStream<Uint8Array>,
) => void

export interface RawStreamJSONNode extends PluginInfo {
  text: SerovalNode
  stream: SerovalNode
}

export interface RawStreamRPCNode extends PluginInfo {
  streamId: SerovalNode
}
