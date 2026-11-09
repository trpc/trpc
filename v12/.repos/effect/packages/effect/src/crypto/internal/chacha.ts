/**
 * ChaCha20-Poly1305 (RFC 8439) and XChaCha20-Poly1305
 * (draft-irtf-cfrg-xchacha-03), vendored from `@noble/ciphers`.
 *
 * Upstream: https://github.com/paulmillr/noble-ciphers
 * Version: 2.4.0, commit d9e8a6a599e7ed729d9be03854c46a3c73bd9a79
 * Files: `src/chacha.ts` (`chachaCore`, `hchacha`, `chacha20`, `xchacha20`,
 * `_poly1305_aead`), `src/_arx.ts` (`createCipher`), `src/_poly1305.ts`
 * (`Poly1305`), and the helpers they use from `src/utils.ts`. `@noble/ciphers`
 * 1.0.0 was audited by Cure53 in 2024.
 *
 * Changes from upstream: merged into one file, removed the `TArg`/`TRet` type
 * helpers, `@example` blocks, the reduced-round and original ChaCha variants,
 * the PRGs, and the `wrapCipher` argument wrapper, whose checks the `Aead`
 * layers run before calling this code. `Poly1305` is constructed directly
 * instead of through `wrapMacConstructor`, and `decrypt` returns `undefined`
 * on a tag mismatch instead of throwing, so any exception is a bug. The
 * cipher core, Poly1305 arithmetic, and AEAD construction are unchanged.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2022 Paul Miller (https://paulmillr.com)
 * Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * @internal
 */

/**
 * A ChaCha AEAD bound to a key, nonce, and additional data. `encrypt` returns
 * `ciphertext‖tag`, and `decrypt` returns `undefined` when the tag does not
 * match.
 *
 * @internal
 */
export interface Aead {
  encrypt(plaintext: Uint8Array, output?: Uint8Array): Uint8Array
  decrypt(ciphertext: Uint8Array, output?: Uint8Array): Uint8Array | undefined
}

// utils.ts
type TypedArray =
  | Int8Array
  | Uint8ClampedArray
  | Uint8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array

function isBytes(a: unknown): a is Uint8Array {
  // Plain `instanceof Uint8Array` is too strict for some Buffer / proxy /
  // cross-realm cases. The fallback still requires a real ArrayBuffer view
  // so plain JSON-deserialized `{ constructor: ... }`
  // spoofing is rejected, and `BYTES_PER_ELEMENT === 1` keeps the fallback on byte-oriented views.
  return (
    a instanceof Uint8Array ||
    (ArrayBuffer.isView(a) &&
      a.constructor.name === "Uint8Array" &&
      "BYTES_PER_ELEMENT" in a &&
      a.BYTES_PER_ELEMENT === 1)
  )
}

const atitle = (title: string): string => (title ? `"${title}" ` : "")

function abool(value: boolean, title: string = ""): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(atitle(title) + "expected boolean, got type=" + typeof value)
  }
  return value
}

function anumber(n: number, title: string = ""): number {
  if (typeof n !== "number") {
    throw new TypeError(atitle(title) + "expected number, got " + typeof n)
  }
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n)
  }
  return n
}

function abytes(
  value: Uint8Array,
  length?: number,
  title: string = ""
): Uint8Array {
  // Success path first: this runs at the start of every update() / digestInto(), and the
  // common `abytes(data)` form must not pay for length handling it does not use.
  if (isBytes(value) && (length === undefined || value.length === length)) {
    return value
  }
  // Error path: recompute freely to build the exact message.
  if (length !== undefined) anumber(length, "length")
  const bytes = isBytes(value)
  const ofLen = length !== undefined ? ` of length ${length}` : ""
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got
  if (!bytes) throw new TypeError(message)
  throw new RangeError(message)
}

const aobject = (value: Record<string, any>, label: string) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      label === "object"
        ? "expected valid options object"
        : `"${label}" expected object, got type=${typeof value}`
    )
  }
}

type EmptyObj = {}
function checkOpts<T1 extends EmptyObj, T2 extends EmptyObj>(
  defaults: T1,
  opts: T2
): T1 & T2 {
  aobject(defaults as Record<string, any>, "defaults")
  aobject(opts as Record<string, any>, "opts")
  // Mutates defaults by design. __proto__ follows Object.assign semantics here and can only
  // affect this local option object; callers already control this low-level options surface.
  const merged = Object.assign(defaults, opts)
  return merged as T1 & T2
}

function aexists(instance: any, checkFinished = true): void {
  // Runs on every update()/digestInto(); the flags are library-owned booleans, so only their
  // truthiness is checked - re-validating their type per call was pure hot-path overhead.
  if (instance.destroyed) throw new Error("hash was destroyed")
  if (checkFinished && instance.finished) throw new Error("digest() was already called")
}

function aoutput(out: any, instance: any): void {
  abytes(out, undefined, "output")
  // `outputLen` is a library-owned readonly number; the negated comparison keeps failing fast
  // when it is missing/NaN (comparisons with undefined/NaN are false) without an anumber() call.
  const min = instance.outputLen
  if (!(out.length >= min)) {
    throw new RangeError("\"output\" expected length >= " + min)
  }
}

function u32(arr: TypedArray): Uint32Array {
  return new Uint32Array(
    arr.buffer,
    arr.byteOffset,
    Math.floor(arr.byteLength / 4)
  )
}

function clean(...arrays: Array<TypedArray>): void {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0)
  }
}

function createView(arr: TypedArray): DataView {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
}

const isLE: boolean = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)()

function byteSwap(word: number): number {
  return (
    ((word << 24) & 0xff000000) |
    ((word << 8) & 0xff0000) |
    ((word >>> 8) & 0xff00) |
    ((word >>> 24) & 0xff)
  )
}

function byteSwap32(arr: Uint32Array): Uint32Array {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i])
  }
  return arr
}

const swap32IfBE: (u: Uint32Array) => Uint32Array = isLE
  ? (u: Uint32Array) => u
  : byteSwap32

function overlapBytes(a: Uint8Array, b: Uint8Array): boolean {
  // Zero-length views cannot overwrite anything, even if their offset sits inside another range.
  if (!a.byteLength || !b.byteLength) return false
  return (
    a.buffer === b.buffer && // best we can do, may fail with an obscure Proxy
    a.byteOffset < b.byteOffset + b.byteLength && // a starts before b end
    b.byteOffset < a.byteOffset + a.byteLength // b starts before a end
  )
}

function complexOverlapBytes(input: Uint8Array, output: Uint8Array): void {
  // This is very cursed. It works somehow, but I'm completely unsure,
  // reasoning about overlapping aligned windows is very hard.
  if (overlapBytes(input, output) && input.byteOffset < output.byteOffset) {
    throw new Error("complex overlap of input and output is not supported")
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  a = abytes(a)
  b = abytes(b)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function getOutput(
  expectedLength: number,
  out?: Uint8Array,
  onlyAligned = true
): Uint8Array {
  if (out === undefined) return new Uint8Array(expectedLength)
  // Keep Buffer/cross-realm Uint8Array support here instead of trusting a shape-compatible object.
  abytes(out, expectedLength, "output")
  if (onlyAligned && !isAligned32(out)) throw new Error("invalid output, must be aligned")
  return out
}

function u64Lengths(dataLength: number, aadLength: number, isLE: boolean): Uint8Array {
  // Reject coercible non-number lengths like '10' and true before BigInt(...) accepts them.
  anumber(dataLength)
  anumber(aadLength)
  abool(isLE)
  const num = new Uint8Array(16)
  const view = createView(num)
  view.setBigUint64(0, BigInt(aadLength), isLE)
  view.setBigUint64(8, BigInt(dataLength), isLE)
  return num
}

function isAligned32(bytes: Uint8Array): boolean {
  return bytes.byteOffset % 4 === 0
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  // `Uint8Array.from(...)` would also accept arrays / other typed arrays. Keep this helper strict
  // because callers use it at byte-validation boundaries before mutating the detached copy.
  return Uint8Array.from(abytes(bytes))
}

type XorStream = (
  key: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
  output?: Uint8Array,
  counter?: number
) => Uint8Array

// _arx.ts
// Replaces `TextEncoder` for ASCII literals, which is enough for sigma constants.
// Non-ASCII input would not match UTF-8 `TextEncoder` output.
const encodeStr = (str: string) => Uint8Array.from(str.split(""), (c) => c.charCodeAt(0))
// Raw `createCipher(...)` exports consume these native-endian `u32(...)` views directly.
// RFC 8439 §2.3 / RFC 7539 §2.3 only define the 256-bit-key constants; this 16-byte sigma is
// kept for legacy allowShortKeys Salsa/ChaCha variants.
const sigma16_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 16-byte k"))))()
// RFC 8439 §2.3 / RFC 7539 §2.3 define words 0-3 as
// `0x61707865 0x3320646e 0x79622d32 0x6b206574`, i.e. `expand 32-byte k`.
const sigma32_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 32-byte k"))))()

function rotl(a: number, b: number): number {
  return (a << b) | (a >>> (32 - b))
}

type CipherCoreFn = (
  sigma: Uint32Array,
  key: Uint32Array,
  nonce: Uint32Array,
  output: Uint32Array,
  counter: number,
  rounds?: number
) => void

type ExtendNonceFn = (
  sigma: Uint32Array,
  key: Uint32Array,
  input: Uint32Array,
  output: Uint32Array
) => void

type CipherOpts = {
  /** Whether 16-byte keys are accepted for legacy Salsa and ChaCha variants. */
  allowShortKeys?: boolean
  /** Optional nonce-expansion hook used by extended-nonce variants. */
  extendNonceFn?: ExtendNonceFn
  /** Counter length in bytes inside the nonce/counter layout. */
  counterLength?: number
  /** Whether the layout is `nonce|counter` instead of `counter|nonce`. */
  counterRight?: boolean
  /** Number of core rounds to execute. */
  rounds?: number
}

// Salsa and Chacha block length is always 512-bit
const BLOCK_LEN = 64
// RFC 8439 §2.2 / RFC 7539 §2.2: the ChaCha state has 16 32-bit words.
const BLOCK_LEN32 = 16

// Counter policy for the shared public `counter` argument:
// - RFC/IETF ChaCha20 uses a 32-bit counter.
// - OpenSSL/Node `chacha20` instead treat the full 16-byte IV as a 128-bit
//   counter state and carry into the next word.
// - Raw `chacha20orig`, `salsa20`, `xsalsa20`, and `xchacha20` use 64-bit counters in libsodium
//   and libtomcrypt, while some libs (for example libtomcrypt's RFC/IETF path) reject the max
//   boundary instead of carrying.
// - AEAD wrappers diverge too: libsodium `xchacha20poly1305` uses the IETF payload counter from
//   block 1, while `secretstream_xchacha20poly1305` is a different protocol with rekey/reset.
// Noble intentionally throws instead of silently picking one wrap model for users. In the default
// path, even a 32-bit boundary would take 2^32 blocks * 64 bytes = 256 GiB, which is practically
// unreachable for normal JS callers; advanced users who pass `counter` explicitly can implement
// whatever wider carry / wrap policy they need on top.
const MAX_COUNTER = /* @__PURE__ */ (() => 2 ** 32 - 1)()
const U32_EMPTY = /* @__PURE__ */ Uint32Array.of()
function runCipher(
  core: CipherCoreFn,
  sigma: Uint32Array,
  key: Uint32Array,
  nonce: Uint32Array,
  data: Uint8Array,
  output: Uint8Array,
  counter: number,
  rounds: number
): void {
  const len = data.length
  const block = new Uint8Array(BLOCK_LEN)
  const b32 = u32(block)
  // Make sure that buffers aligned to 4 bytes
  const isAligned = isLE && isAligned32(data) && isAligned32(output)
  const d32 = isAligned ? u32(data) : U32_EMPTY
  const o32 = isAligned ? u32(output) : U32_EMPTY
  // RFC 8439 §2.4.1 / RFC 7539 §2.4.1 allow XORing one keystream block at a time and
  // truncating the final partial block instead of materializing the whole keystream.
  if (!isLE) {
    for (let pos = 0; pos < len; counter++) {
      core(
        sigma,
        key,
        nonce,
        b32,
        counter,
        rounds
      )
      // RFC 8439 §2.4 / RFC 7539 §2.4 serialize keystream words in little-endian order.
      swap32IfBE(b32)
      if (counter >= MAX_COUNTER) throw new Error("arx: counter overflow")
      const take = Math.min(BLOCK_LEN, len - pos)
      for (let j = 0, posj; j < take; j++) {
        posj = pos + j
        output[posj] = data[posj] ^ block[j]
      }
      pos += take
    }
    return
  }
  for (let pos = 0; pos < len; counter++) {
    core(
      sigma,
      key,
      nonce,
      b32,
      counter,
      rounds
    )
    // See MAX_COUNTER policy note above: never silently wrap the shared public counter.
    if (counter >= MAX_COUNTER) throw new Error("arx: counter overflow")
    const take = Math.min(BLOCK_LEN, len - pos)
    // aligned to 4 bytes
    if (isAligned && take === BLOCK_LEN) {
      const pos32 = pos / 4
      if (pos % 4 !== 0) throw new Error("arx: invalid block position")
      for (let j = 0, posj: number; j < BLOCK_LEN32; j++) {
        posj = pos32 + j
        o32[posj] = d32[posj] ^ b32[j]
      }
      pos += BLOCK_LEN
      continue
    }
    for (let j = 0, posj; j < take; j++) {
      posj = pos + j
      output[posj] = data[posj] ^ block[j]
    }
    pos += take
  }
}

function createCipher(core: CipherCoreFn, opts: CipherOpts): XorStream {
  const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts(
    { allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 },
    opts
  )
  if (typeof core !== "function") throw new Error("core must be a function")
  anumber(counterLength)
  anumber(rounds)
  abool(counterRight)
  abool(allowShortKeys)
  return (
    key: Uint8Array,
    nonce: Uint8Array,
    data: Uint8Array,
    output?: Uint8Array,
    counter = 0
  ): Uint8Array => {
    abytes(key, undefined, "key")
    abytes(nonce, undefined, "nonce")
    abytes(data, undefined, "data")
    const len = data.length
    // Raw XorStream APIs return ciphertext/plaintext bytes directly, so caller-provided outputs
    // must match the logical result length exactly instead of returning an oversized workspace.
    const hasOutput = output !== undefined
    output = getOutput(len, output, false)
    if (hasOutput) complexOverlapBytes(data, output)
    anumber(counter)
    // See MAX_COUNTER policy note above: reject advanced explicit-counter requests before any wrap.
    if (counter < 0 || counter >= MAX_COUNTER) throw new Error("arx: counter overflow")
    const toClean = []

    // Key & sigma
    // key=16 -> sigma16, k=key|key
    // key=32 -> sigma32, k=key
    let l = key.length
    let k: Uint8Array
    let sigma: Uint32Array
    if (l === 32) {
      // Copy caller keys too: big-endian normalization, extended-nonce subkey derivation, and
      // final clean(...) all mutate or wipe the temporary buffer in place.
      toClean.push(k = copyBytes(key))
      sigma = sigma32_32
    } else if (l === 16 && allowShortKeys) {
      k = new Uint8Array(32)
      k.set(key)
      k.set(key, 16)
      sigma = sigma16_32
      toClean.push(k)
    } else {
      abytes(key, 32, "arx key")
      throw new Error("invalid key size")
      // throw new Error(`"arx key" expected Uint8Array of length 32, got length=${l}`);
    }

    // Nonce
    // salsa20:      8   (8-byte counter)
    // chacha20orig: 8   (8-byte counter)
    // chacha20:     12  (4-byte counter)
    // xsalsa20:     24  (16 -> hsalsa,  8 -> old nonce)
    // xchacha20:    24  (16 -> hchacha, 8 -> old nonce)
    // Copy before taking u32(...) views on misaligned inputs, and on big-endian so later
    // swap32IfBE(...) never mutates caller nonce bytes in place.
    if (!isLE || !isAligned32(nonce)) toClean.push(nonce = copyBytes(nonce))

    let k32 = u32(k)
    // hsalsa & hchacha: handle extended nonce
    if (extendNonceFn) {
      if (nonce.length !== 24) throw new Error("arx: extended nonce must be 24 bytes")
      const n16 = nonce.subarray(0, 16)
      if (isLE) extendNonceFn(sigma, k32, u32(n16), k32)
      else {
        const sigmaRaw = swap32IfBE(Uint32Array.from(sigma))
        extendNonceFn(sigmaRaw, k32, u32(n16), k32)
        clean(sigmaRaw)
        swap32IfBE(k32)
      }
      nonce = nonce.subarray(16)
    } else if (!isLE) swap32IfBE(k32)

    // Handle nonce counter
    const nonceNcLen = 16 - counterLength
    if (nonceNcLen !== nonce.length) {
      throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`)
    }

    // Normalize 64-bit-nonce layouts to the 12-byte core input: ChaCha/XChaCha prefix 4 zero
    // counter bytes, while Salsa/XSalsa append them after the nonce words.
    if (nonceNcLen !== 12) {
      const nc = new Uint8Array(12)
      nc.set(nonce, counterRight ? 0 : 12 - nonce.length)
      nonce = nc
      toClean.push(nonce)
    }
    const n32 = swap32IfBE(u32(nonce))
    // Ensure temporary key/nonce copies are wiped even if the remaining
    // runtime guard in runCipher(...) throws on counter overflow.
    try {
      runCipher(core, sigma, k32, n32, data, output, counter, rounds)
      return output
    } finally {
      clean(...toClean)
    }
  }
}

// _poly1305.ts
// Little-endian 2-byte load used by the Poly1305 limb decomposition.
function u8to16(a: Uint8Array, i: number) {
  return (a[i++] & 0xff) | ((a[i++] & 0xff) << 8)
}

class Poly1305 {
  readonly blockLen = 16
  readonly outputLen = 16
  private buffer = new Uint8Array(16)
  private r = new Uint16Array(10) // Allocating 1 array with .subarray() here is slower than 3
  private h = new Uint16Array(10)
  private pad = new Uint16Array(8)
  private pos = 0
  protected finished = false
  protected destroyed = false

  // Can be speed-up using BigUint64Array, at the cost of complexity
  constructor(key: Uint8Array) {
    key = copyBytes(abytes(key, 32, "key"))
    const t0 = u8to16(key, 0)
    const t1 = u8to16(key, 2)
    const t2 = u8to16(key, 4)
    const t3 = u8to16(key, 6)
    const t4 = u8to16(key, 8)
    const t5 = u8to16(key, 10)
    const t6 = u8to16(key, 12)
    const t7 = u8to16(key, 14)

    // RFC 8439 §2.5.1 / RFC 7539 §2.5.1 clamp r before multiplication.
    // These masks unpack that clamped value into 13-bit limbs, while pad
    // keeps the raw s half for finalize().
    // {@link https://github.com/floodyberry/poly1305-donna/blob/e6ad6e091d30d7f4ec2d4f978be1fcfcbce72781/poly1305-donna-16.h#L47 | poly1305-donna reference}
    this.r[0] = t0 & 0x1fff
    this.r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff
    this.r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03
    this.r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff
    this.r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff
    this.r[5] = (t4 >>> 1) & 0x1ffe
    this.r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff
    this.r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81
    this.r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff
    this.r[9] = (t7 >>> 5) & 0x007f
    for (let i = 0; i < 8; i++) this.pad[i] = u8to16(key, 16 + 2 * i)
  }

  private process(data: Uint8Array, offset: number, isLast = false) {
    // RFC 8439 §2.5 / §2.5.1 and RFC 7539 §2.5 / §2.5.1 add an extra high
    // bit to every full 16-byte block. The final partial block gets its
    // explicit `1` byte during digestInto(), so `hibit` stays zero there.
    const hibit = isLast ? 0 : 1 << 11
    const { h, r } = this
    const r0 = r[0]
    const r1 = r[1]
    const r2 = r[2]
    const r3 = r[3]
    const r4 = r[4]
    const r5 = r[5]
    const r6 = r[6]
    const r7 = r[7]
    const r8 = r[8]
    const r9 = r[9]

    const t0 = u8to16(data, offset + 0)
    const t1 = u8to16(data, offset + 2)
    const t2 = u8to16(data, offset + 4)
    const t3 = u8to16(data, offset + 6)
    const t4 = u8to16(data, offset + 8)
    const t5 = u8to16(data, offset + 10)
    const t6 = u8to16(data, offset + 12)
    const t7 = u8to16(data, offset + 14)

    let h0 = h[0] + (t0 & 0x1fff)
    let h1 = h[1] + (((t0 >>> 13) | (t1 << 3)) & 0x1fff)
    let h2 = h[2] + (((t1 >>> 10) | (t2 << 6)) & 0x1fff)
    let h3 = h[3] + (((t2 >>> 7) | (t3 << 9)) & 0x1fff)
    let h4 = h[4] + (((t3 >>> 4) | (t4 << 12)) & 0x1fff)
    let h5 = h[5] + ((t4 >>> 1) & 0x1fff)
    let h6 = h[6] + (((t4 >>> 14) | (t5 << 2)) & 0x1fff)
    let h7 = h[7] + (((t5 >>> 11) | (t6 << 5)) & 0x1fff)
    let h8 = h[8] + (((t6 >>> 8) | (t7 << 8)) & 0x1fff)
    let h9 = h[9] + ((t7 >>> 5) | hibit)

    let c = 0

    let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6)
    c = d0 >>> 13
    d0 &= 0x1fff
    d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1)
    c += d0 >>> 13
    d0 &= 0x1fff

    let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7)
    c = d1 >>> 13
    d1 &= 0x1fff
    d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2)
    c += d1 >>> 13
    d1 &= 0x1fff

    let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8)
    c = d2 >>> 13
    d2 &= 0x1fff
    d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3)
    c += d2 >>> 13
    d2 &= 0x1fff

    let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9)
    c = d3 >>> 13
    d3 &= 0x1fff
    d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4)
    c += d3 >>> 13
    d3 &= 0x1fff

    let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0
    c = d4 >>> 13
    d4 &= 0x1fff
    d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5)
    c += d4 >>> 13
    d4 &= 0x1fff

    let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1
    c = d5 >>> 13
    d5 &= 0x1fff
    d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6)
    c += d5 >>> 13
    d5 &= 0x1fff

    let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2
    c = d6 >>> 13
    d6 &= 0x1fff
    d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7)
    c += d6 >>> 13
    d6 &= 0x1fff

    let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3
    c = d7 >>> 13
    d7 &= 0x1fff
    d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8)
    c += d7 >>> 13
    d7 &= 0x1fff

    let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4
    c = d8 >>> 13
    d8 &= 0x1fff
    d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9)
    c += d8 >>> 13
    d8 &= 0x1fff

    let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5
    c = d9 >>> 13
    d9 &= 0x1fff
    d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0
    c += d9 >>> 13
    d9 &= 0x1fff

    c = ((c << 2) + c) | 0
    c = (c + d0) | 0
    d0 = c & 0x1fff
    c = c >>> 13
    d1 += c

    h[0] = d0
    h[1] = d1
    h[2] = d2
    h[3] = d3
    h[4] = d4
    h[5] = d5
    h[6] = d6
    h[7] = d7
    h[8] = d8
    h[9] = d9
  }

  private finalize() {
    const { h, pad } = this
    const g = new Uint16Array(10)
    let c = h[1] >>> 13
    h[1] &= 0x1fff
    for (let i = 2; i < 10; i++) {
      h[i] += c
      c = h[i] >>> 13
      h[i] &= 0x1fff
    }
    h[0] += c * 5
    c = h[0] >>> 13
    h[0] &= 0x1fff
    h[1] += c
    c = h[1] >>> 13
    h[1] &= 0x1fff
    h[2] += c

    // RFC 8439 §2.5 / RFC 7539 §2.5 reduce modulo 2^130-5 before repacking
    // to 16-bit words and adding the raw s half.
    g[0] = h[0] + 5
    c = g[0] >>> 13
    g[0] &= 0x1fff
    for (let i = 1; i < 10; i++) {
      g[i] = h[i] + c
      c = g[i] >>> 13
      g[i] &= 0x1fff
    }
    g[9] -= 1 << 13

    let mask = (c ^ 1) - 1
    for (let i = 0; i < 10; i++) g[i] &= mask
    mask = ~mask
    for (let i = 0; i < 10; i++) h[i] = (h[i] & mask) | g[i]
    h[0] = (h[0] | (h[1] << 13)) & 0xffff
    h[1] = ((h[1] >>> 3) | (h[2] << 10)) & 0xffff
    h[2] = ((h[2] >>> 6) | (h[3] << 7)) & 0xffff
    h[3] = ((h[3] >>> 9) | (h[4] << 4)) & 0xffff
    h[4] = ((h[4] >>> 12) | (h[5] << 1) | (h[6] << 14)) & 0xffff
    h[5] = ((h[6] >>> 2) | (h[7] << 11)) & 0xffff
    h[6] = ((h[7] >>> 5) | (h[8] << 8)) & 0xffff
    h[7] = ((h[8] >>> 8) | (h[9] << 5)) & 0xffff

    let f = h[0] + pad[0]
    h[0] = f & 0xffff
    for (let i = 1; i < 8; i++) {
      f = (((h[i] + pad[i]) | 0) + (f >>> 16)) | 0
      h[i] = f & 0xffff
    }
    clean(g)
  }
  update(data: Uint8Array): this {
    aexists(this)
    abytes(data)
    data = copyBytes(data)
    const { buffer, blockLen } = this
    const len = data.length

    for (let pos = 0; pos < len;) {
      const take = Math.min(blockLen - this.pos, len - pos)
      // Fast path: we have at least one block in input
      if (take === blockLen) {
        for (; blockLen <= len - pos; pos += blockLen) this.process(data, pos)
        continue
      }
      buffer.set(data.subarray(pos, pos + take), this.pos)
      this.pos += take
      pos += take
      if (this.pos === blockLen) {
        this.process(buffer, 0, false)
        this.pos = 0
      }
    }
    return this
  }
  destroy(): void {
    // `aexists(this)` guards update/digest paths, so destroy must mark the instance unusable too.
    this.destroyed = true
    clean(this.h, this.r, this.buffer, this.pad)
  }
  digestInto(out: Uint8Array): void {
    aexists(this)
    aoutput(out, this)
    this.finished = true
    const { buffer, h } = this
    let { pos } = this
    if (pos) {
      // RFC 8439 §2.5 / RFC 7539 §2.5: the final short block appends a
      // single `0x01` byte and zero-fills the remaining bytes before the
      // last multiplication step.
      buffer[pos++] = 1
      for (; pos < 16; pos++) buffer[pos] = 0
      this.process(buffer, 0, true)
    }
    this.finalize()
    let opos = 0
    for (let i = 0; i < 8; i++) {
      out[opos++] = h[i] >>> 0
      out[opos++] = h[i] >>> 8
    }
  }
  digest(): Uint8Array {
    const { buffer, outputLen } = this
    this.digestInto(buffer)
    // Copy out before destroy() zeroes the internal buffer.
    const res = buffer.slice(0, outputLen)
    this.destroy()
    return res
  }
}

// chacha.ts
/** RFC 8439 §2.3 block core for `state = constants | key | counter | nonce`. */
// prettier-ignore
function chachaCore(
  s: Uint32Array,
  k: Uint32Array,
  n: Uint32Array,
  out: Uint32Array,
  cnt: number,
  rounds = 20
): void {
  let y00 = s[0],
    y01 = s[1],
    y02 = s[2],
    y03 = s[3], // "expa"   "nd 3"  "2-by"  "te k"
    y04 = k[0],
    y05 = k[1],
    y06 = k[2],
    y07 = k[3], // Key      Key     Key     Key
    y08 = k[4],
    y09 = k[5],
    y10 = k[6],
    y11 = k[7], // Key      Key     Key     Key
    y12 = cnt,
    y13 = n[0],
    y14 = n[1],
    y15 = n[2] // Counter  Nonce   Nonce   Nonce
  // Save state to temporary variables
  let x00 = y00,
    x01 = y01,
    x02 = y02,
    x03 = y03,
    x04 = y04,
    x05 = y05,
    x06 = y06,
    x07 = y07,
    x08 = y08,
    x09 = y09,
    x10 = y10,
    x11 = y11,
    x12 = y12,
    x13 = y13,
    x14 = y14,
    x15 = y15
  for (let r = 0; r < rounds; r += 2) {
    x00 = (x00 + x04) | 0
    x12 = rotl(x12 ^ x00, 16)
    x08 = (x08 + x12) | 0
    x04 = rotl(x04 ^ x08, 12)
    x00 = (x00 + x04) | 0
    x12 = rotl(x12 ^ x00, 8)
    x08 = (x08 + x12) | 0
    x04 = rotl(x04 ^ x08, 7)

    x01 = (x01 + x05) | 0
    x13 = rotl(x13 ^ x01, 16)
    x09 = (x09 + x13) | 0
    x05 = rotl(x05 ^ x09, 12)
    x01 = (x01 + x05) | 0
    x13 = rotl(x13 ^ x01, 8)
    x09 = (x09 + x13) | 0
    x05 = rotl(x05 ^ x09, 7)

    x02 = (x02 + x06) | 0
    x14 = rotl(x14 ^ x02, 16)
    x10 = (x10 + x14) | 0
    x06 = rotl(x06 ^ x10, 12)
    x02 = (x02 + x06) | 0
    x14 = rotl(x14 ^ x02, 8)
    x10 = (x10 + x14) | 0
    x06 = rotl(x06 ^ x10, 7)

    x03 = (x03 + x07) | 0
    x15 = rotl(x15 ^ x03, 16)
    x11 = (x11 + x15) | 0
    x07 = rotl(x07 ^ x11, 12)
    x03 = (x03 + x07) | 0
    x15 = rotl(x15 ^ x03, 8)
    x11 = (x11 + x15) | 0
    x07 = rotl(x07 ^ x11, 7)

    x00 = (x00 + x05) | 0
    x15 = rotl(x15 ^ x00, 16)
    x10 = (x10 + x15) | 0
    x05 = rotl(x05 ^ x10, 12)
    x00 = (x00 + x05) | 0
    x15 = rotl(x15 ^ x00, 8)
    x10 = (x10 + x15) | 0
    x05 = rotl(x05 ^ x10, 7)

    x01 = (x01 + x06) | 0
    x12 = rotl(x12 ^ x01, 16)
    x11 = (x11 + x12) | 0
    x06 = rotl(x06 ^ x11, 12)
    x01 = (x01 + x06) | 0
    x12 = rotl(x12 ^ x01, 8)
    x11 = (x11 + x12) | 0
    x06 = rotl(x06 ^ x11, 7)

    x02 = (x02 + x07) | 0
    x13 = rotl(x13 ^ x02, 16)
    x08 = (x08 + x13) | 0
    x07 = rotl(x07 ^ x08, 12)
    x02 = (x02 + x07) | 0
    x13 = rotl(x13 ^ x02, 8)
    x08 = (x08 + x13) | 0
    x07 = rotl(x07 ^ x08, 7)

    x03 = (x03 + x04) | 0
    x14 = rotl(x14 ^ x03, 16)
    x09 = (x09 + x14) | 0
    x04 = rotl(x04 ^ x09, 12)
    x03 = (x03 + x04) | 0
    x14 = rotl(x14 ^ x03, 8)
    x09 = (x09 + x14) | 0
    x04 = rotl(x04 ^ x09, 7)
  }
  // RFC 8439 §2.3 / §2.3.1: add the original state words back in state order.
  let oi = 0
  out[oi++] = (y00 + x00) | 0
  out[oi++] = (y01 + x01) | 0
  out[oi++] = (y02 + x02) | 0
  out[oi++] = (y03 + x03) | 0
  out[oi++] = (y04 + x04) | 0
  out[oi++] = (y05 + x05) | 0
  out[oi++] = (y06 + x06) | 0
  out[oi++] = (y07 + x07) | 0
  out[oi++] = (y08 + x08) | 0
  out[oi++] = (y09 + x09) | 0
  out[oi++] = (y10 + x10) | 0
  out[oi++] = (y11 + x11) | 0
  out[oi++] = (y12 + x12) | 0
  out[oi++] = (y13 + x13) | 0
  out[oi++] = (y14 + x14) | 0
  out[oi++] = (y15 + x15) | 0
}

// prettier-ignore
function hchacha(
  s: Uint32Array,
  k: Uint32Array,
  i: Uint32Array,
  out: Uint32Array
): void {
  // Runs the shared chachaCore permutation, then subtracts the RFC 8439 feed-forward
  // it applies, recovering the raw permutation words hchacha needs.
  // LE hosts read the caller arrays in place (no copies); BE hosts get
  // byte-swapped scratch copies, wiped before returning.
  const s2 = isLE ? s : swap32IfBE(s.slice(0, 4))
  const k2 = isLE ? k : swap32IfBE(k.slice(0, 8))
  const i2 = isLE ? i : swap32IfBE(i.slice(0, 4))
  const t = new Uint32Array(16)
  chachaCore(s2, k2, i2.subarray(1), t, i2[0])
  let oi = 0
  out[oi++] = (t[0] - s2[0]) | 0
  out[oi++] = (t[1] - s2[1]) | 0
  out[oi++] = (t[2] - s2[2]) | 0
  out[oi++] = (t[3] - s2[3]) | 0
  out[oi++] = (t[12] - i2[0]) | 0
  out[oi++] = (t[13] - i2[1]) | 0
  out[oi++] = (t[14] - i2[2]) | 0
  out[oi++] = (t[15] - i2[3]) | 0
  swap32IfBE(out)
  if (!isLE) clean(s2, k2, i2)
  clean(t)
}

const chacha20: XorStream = /* @__PURE__ */ createCipher(chachaCore, {
  counterRight: false,
  counterLength: 4,
  allowShortKeys: false
})

const xchacha20: XorStream = /* @__PURE__ */ createCipher(chachaCore, {
  counterRight: false,
  counterLength: 8,
  extendNonceFn: hchacha,
  allowShortKeys: false
})

// RFC 8439 §2.8.1 pad16(x): shared zero block for AAD/ciphertext padding.
const ZEROS16 = /* @__PURE__ */ new Uint8Array(16)
// RFC 8439 §2.8 / §2.8.1: aligned inputs add nothing, otherwise append 16-(len%16) zero bytes.
const updatePadded = (h: Poly1305, msg: Uint8Array) => {
  h.update(msg)
  const leftover = msg.length % 16
  if (leftover) h.update(ZEROS16.subarray(leftover))
}

// RFC 8439 §2.6.1 poly1305_key_gen returns `block[0..31]`, so AEAD key
// generation only needs 32 zero bytes.
const ZEROS32 = /* @__PURE__ */ new Uint8Array(32)
function computeTag(
  fn: XorStream,
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  AAD?: Uint8Array
): Uint8Array {
  if (AAD !== undefined) abytes(AAD, undefined, "AAD")
  // RFC 8439 §2.6 / §2.8: derive the Poly1305 one-time key from counter 0,
  // then MAC AAD || pad16(AAD) || ciphertext || pad16(ciphertext) || len(AAD) || len(ciphertext).
  const authKey = fn(
    key,
    nonce,
    ZEROS32
  )
  const lengths = u64Lengths(ciphertext.length, AAD ? AAD.length : 0, true)

  // Methods below can be replaced with
  // `return poly1305_computeTag_small(authKey, lengths, ciphertext, AAD)`
  // from `test/misc/micro-ciphers.ts`.
  const h = new Poly1305(authKey)
  if (AAD) updatePadded(h, AAD)
  updatePadded(h, ciphertext)
  h.update(lengths)
  const res = h.digest()
  clean(authKey, lengths)
  return res
}

/**
 * AEAD algorithm from RFC 8439.
 * Salsa20 and chacha (RFC 8439) use poly1305 differently.
 * We could have composed them, but it's hard because of authKey:
 * In salsa20, authKey changes position in salsa stream.
 * In chacha, authKey can't be computed inside computeTag, it modifies the counter.
 */
const _poly1305_aead = (xorStream: XorStream) => (key: Uint8Array, nonce: Uint8Array, AAD?: Uint8Array): Aead => {
  // This borrows caller key/nonce/AAD buffers by reference; mutating them after construction
  // changes future encrypt/decrypt results.
  const tagLength = 16
  return {
    encrypt(plaintext: Uint8Array, output?: Uint8Array): Uint8Array {
      const plength = plaintext.length
      output = getOutput(plength + tagLength, output, false)
      output.set(plaintext)
      const oPlain = output.subarray(0, -tagLength)
      // RFC 8439 §2.8: payload encryption starts at counter 1 because counter 0 produced the OTK.
      xorStream(
        key,
        nonce,
        oPlain,
        oPlain,
        1
      )
      const tag = computeTag(xorStream, key, nonce, oPlain, AAD)
      output.set(tag, plength) // append tag
      clean(tag)
      return output
    },
    decrypt(ciphertext: Uint8Array, output?: Uint8Array): Uint8Array | undefined {
      output = getOutput(ciphertext.length - tagLength, output, false)
      const data = ciphertext.subarray(0, -tagLength)
      const passedTag = ciphertext.subarray(-tagLength)
      const tag = computeTag(xorStream, key, nonce, data, AAD)
      // RFC 8439 §2.8 / §4: authenticate ciphertext before decrypting it, and compare tags with
      // the constant-time equalBytes() helper rather than decrypting speculative plaintext first.
      if (!equalBytes(passedTag, tag)) {
        clean(tag)
        return undefined
      }
      output.set(ciphertext.subarray(0, -tagLength))
      // Actual decryption
      xorStream(
        key,
        nonce,
        output,
        output,
        1
      ) // start stream with i=1
      clean(tag)
      return output
    }
  }
}

/**
 * ChaCha20-Poly1305 from RFC 8439, with a 32-byte key and a 12-byte nonce.
 *
 * @internal
 */
export const chacha20Poly1305: (key: Uint8Array, nonce: Uint8Array, aad?: Uint8Array) => Aead =
  /* @__PURE__ */ _poly1305_aead(chacha20)

/**
 * XChaCha20-Poly1305 from draft-irtf-cfrg-xchacha-03, with a 32-byte key and a
 * 24-byte nonce.
 *
 * @internal
 */
export const xchacha20Poly1305: (key: Uint8Array, nonce: Uint8Array, aad?: Uint8Array) => Aead =
  /* @__PURE__ */ _poly1305_aead(xchacha20)
