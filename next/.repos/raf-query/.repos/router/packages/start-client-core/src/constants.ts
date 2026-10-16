export const TSS_FORMDATA_CONTEXT = '__TSS_CONTEXT'
export const TSS_SERVER_FUNCTION = Symbol.for('TSS_SERVER_FUNCTION')
export const TSS_SERVER_FUNCTION_FACTORY = Symbol.for(
  'TSS_SERVER_FUNCTION_FACTORY',
)

export const X_TSS_SERIALIZED = 'x-tss-serialized'
export const X_TSS_RAW_RESPONSE = 'x-tss-raw'
export const X_TSS_CONTEXT = 'x-tss-context'

/** Content-Type for multiplexed framed responses (RawStream support) */
export const TSS_CONTENT_TYPE_FRAMED = 'application/x-tss-framed'

/**
 * Frame types for binary multiplexing protocol.
 */
export const FRAME_TYPE_JSON = 0
export const FRAME_TYPE_CHUNK = 1
export const FRAME_TYPE_END = 2
export const FRAME_TYPE_ERROR = 3

/** Header size in bytes: type(1) + streamId(4) + length(4) */
export const FRAME_HEADER_SIZE = 9

/** Largest payload accepted by one framed-protocol record. */
export const MAX_FRAME_PAYLOAD_SIZE = 16 * 1024 * 1024

/** Largest number of raw streams accepted in one framed response. */
export const MAX_FRAMED_STREAMS = 1024

/**
 * Largest number of bytes one raw stream may hold unread. Raw streams share
 * one ordered response, so an unread stream would otherwise buffer without
 * bound while later frames arrive.
 */
export const MAX_UNREAD_RAW_STREAM_BYTES = 128 * 1024 * 1024

/** Current protocol version for framed responses */
export const TSS_FRAMED_PROTOCOL_VERSION = 1

/** Full Content-Type header value with version parameter */
export const TSS_CONTENT_TYPE_FRAMED_VERSIONED = `${TSS_CONTENT_TYPE_FRAMED}; v=${TSS_FRAMED_PROTOCOL_VERSION}`

/**
 * Minimal metadata about a server function, available to client middleware.
 * Only contains the function ID since name/filename may expose server internals.
 */
export interface ClientFnMeta {
  /** The unique identifier for this server function */
  id: string
}

/**
 * Full metadata about a server function, available to server middleware and server functions.
 * This information is embedded at compile time by the TanStack Start compiler.
 */
export interface ServerFnMeta extends ClientFnMeta {
  /** The original variable name of the server function (e.g., "myServerFn") */
  name: string
  /** The source file path relative to the project root (e.g., "src/routes/api.ts") */
  filename: string
}

export {}
