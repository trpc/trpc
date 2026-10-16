/**
 * Low-level protobuf wire format encoding utilities.
 *
 * Protobuf wire types:
 * - 0: Varint (int32, int64, uint32, uint64, sint32, sint64, bool, enum)
 * - 1: 64-bit (fixed64, sfixed64, double)
 * - 2: Length-delimited (string, bytes, embedded messages, packed repeated fields)
 * - 5: 32-bit (fixed32, sfixed32, float)
 */

const WireType = {
  Varint: 0,
  Fixed64: 1,
  LengthDelimited: 2,
  Fixed32: 5
} as const
type WireType = typeof WireType[keyof typeof WireType]

/**
 * Encodes a field tag (field number + wire type)
 */
const encodeTag = (fieldNumber: number, wireType: WireType): number => (fieldNumber << 3) | wireType

/**
 * Encodes a varint (variable-length integer)
 *
 * @internal
 */
export const encodeVarint = (value: number | bigint): Uint8Array => {
  const bytes: Array<number> = []
  let n = typeof value === "bigint" ? value : BigInt(value)
  if (n < BigInt(0)) {
    n = BigInt.asUintN(64, n)
  }
  while (n > BigInt(127)) {
    bytes.push(Number(n & BigInt(127)) | 0x80)
    n >>= BigInt(7)
  }
  bytes.push(Number(n))
  return new Uint8Array(bytes)
}

/**
 * Encodes a 64-bit fixed value (little-endian)
 *
 * @internal
 */
export const encodeFixed64 = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setBigUint64(0, value, true)
  return bytes
}

/**
 * Encodes a 32-bit fixed value (little-endian)
 *
 * @internal
 */
export const encodeFixed32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, value, true)
  return bytes
}

/**
 * Encodes a double (64-bit float, little-endian)
 *
 * @internal
 */
export const encodeDouble = (value: number): Uint8Array => {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setFloat64(0, value, true)
  return bytes
}

/**
 * Encodes a string to UTF-8 bytes
 *
 * @internal
 */
export const encodeString = (value: string): Uint8Array => new TextEncoder().encode(value)

/**
 * Encodes bytes as a hex string to Uint8Array
 *
 * @internal
 */
export const encodeHexBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Concatenates multiple Uint8Arrays
 *
 * @internal
 */
export const concat = (...arrays: Array<Uint8Array>): Uint8Array => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// Field encoders

/**
 * Encodes a varint field
 *
 * @internal
 */
export const varintField = (fieldNumber: number, value: number | bigint): Uint8Array =>
  concat(
    encodeVarint(encodeTag(fieldNumber, WireType.Varint)),
    encodeVarint(value)
  )

/**
 * Encodes a bool field
 *
 * @internal
 */
export const boolField = (fieldNumber: number, value: boolean): Uint8Array => varintField(fieldNumber, value ? 1 : 0)

/**
 * Encodes a fixed64 field
 *
 * @internal
 */
export const fixed64Field = (fieldNumber: number, value: bigint): Uint8Array =>
  concat(
    encodeVarint(encodeTag(fieldNumber, WireType.Fixed64)),
    encodeFixed64(value)
  )

/**
 * Encodes a fixed32 field
 *
 * @internal
 */
export const fixed32Field = (fieldNumber: number, value: number): Uint8Array =>
  concat(
    encodeVarint(encodeTag(fieldNumber, WireType.Fixed32)),
    encodeFixed32(value)
  )

/**
 * Encodes a double field
 *
 * @internal
 */
export const doubleField = (fieldNumber: number, value: number): Uint8Array =>
  concat(
    encodeVarint(encodeTag(fieldNumber, WireType.Fixed64)),
    encodeDouble(value)
  )

/**
 * Encodes a length-delimited field (bytes, string, embedded message)
 *
 * @internal
 */
export const lengthDelimitedField = (fieldNumber: number, value: Uint8Array): Uint8Array =>
  concat(
    encodeVarint(encodeTag(fieldNumber, WireType.LengthDelimited)),
    encodeVarint(value.length),
    value
  )

/**
 * Encodes a string field
 *
 * @internal
 */
export const stringField = (fieldNumber: number, value: string): Uint8Array =>
  lengthDelimitedField(fieldNumber, encodeString(value))

/**
 * Encodes a bytes field from hex string
 *
 * @internal
 */
export const bytesFieldFromHex = (fieldNumber: number, hex: string): Uint8Array =>
  lengthDelimitedField(fieldNumber, encodeHexBytes(hex))

/**
 * Encodes an embedded message field
 *
 * @internal
 */
export const messageField = (fieldNumber: number, message: Uint8Array): Uint8Array =>
  lengthDelimitedField(fieldNumber, message)

/**
 * Encodes repeated fields
 *
 * @internal
 */
export const repeatedField = <T>(
  fieldNumber: number,
  values: ReadonlyArray<T>,
  encode: (value: T) => Uint8Array
): Uint8Array => concat(...values.map((v) => messageField(fieldNumber, encode(v))))

/**
 * Helper to conditionally encode a string field if non-empty
 *
 * @internal
 */
export const optionalStringField = (
  fieldNumber: number,
  value: string | undefined
): Uint8Array => value !== undefined && value !== "" ? stringField(fieldNumber, value) : new Uint8Array(0)
