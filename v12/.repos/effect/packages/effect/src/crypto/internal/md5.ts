/**
 * MD5 (RFC 1321), vendored from `@noble/hashes`.
 *
 * Upstream: https://github.com/paulmillr/noble-hashes
 * Version: 2.4.0, commit 663c2aeeffc308ac0cded59bd32f7c212adacfc2
 * Files: `src/legacy.ts` (`_MD5`), `src/_md.ts` (`HashMD`, `Chi`), and the
 * helpers it uses from `src/utils.ts` and `src/_u64.ts`.
 *
 * Changes from upstream: merged into one file, removed the `Hash` interface,
 * cloning, input assertions, and `destroy` bookkeeping, and exposed only a
 * one-shot `md5(data)` function. The compression function and padding are
 * unchanged.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2022 Paul Miller (https://paulmillr.com)
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

// utils.ts
const createView = (arr: Uint8Array): DataView => new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
const rotl = (word: number, shift: number): number => (word << shift) | ((word >>> (32 - shift)) >>> 0)

// _u64.ts
const setU64FromNum = (view: DataView, byteOffset: number, n: number, isLE: boolean): void => {
  const h = (n / 2 ** 32) | 0
  const l = n >>> 0
  view.setUint32(byteOffset, isLE ? l : h, isLE)
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE)
}

// _md.ts
const Chi = (a: number, b: number, c: number): number => (a & b) ^ (~a & c)

// legacy.ts
const p32 = Math.pow(2, 32)
const K = Array.from({ length: 64 }, (_, i) => Math.floor(p32 * Math.abs(Math.sin(i + 1))))
const MD5_IV = Uint32Array.from([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476])
const MD5_W = new Uint32Array(16)
const MD5_SHIFTS = (() => {
  const S = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21]
  ]
  return Uint8Array.from({ length: 64 }, (_, i) => S[Math.floor(i / 16)][i % 4])
})()

const blockLen = 64
const outputLen = 16
const padOffset = 8
const isLE = true

class MD5 {
  private A = MD5_IV[0] | 0
  private B = MD5_IV[1] | 0
  private C = MD5_IV[2] | 0
  private D = MD5_IV[3] | 0

  private buffer = new Uint8Array(blockLen)
  private view = createView(this.buffer)
  private length = 0
  private pos = 0

  private get(): [number, number, number, number] {
    const { A, B, C, D } = this
    return [A, B, C, D]
  }
  private set(A: number, B: number, C: number, D: number): void {
    this.A = A | 0
    this.B = B | 0
    this.C = C | 0
    this.D = D | 0
  }
  private process(view: DataView, offset: number): void {
    for (let i = 0; i < 16; i++, offset += 4) MD5_W[i] = view.getUint32(offset, true)
    let { A, B, C, D } = this
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) {
        F = Chi(B, C, D)
        g = i
      } else if (i < 32) {
        // RFC 1321 round 2 uses G(B,C,D) = (B & D) | (C & ~D), which is `Chi(D, B, C)`.
        F = Chi(D, B, C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = F + A + K[i] + MD5_W[g]
      A = D
      D = C
      C = B
      B = B + rotl(F, MD5_SHIFTS[i])
    }
    A = (A + this.A) | 0
    B = (B + this.B) | 0
    C = (C + this.C) | 0
    D = (D + this.D) | 0
    this.set(A, B, C, D)
  }
  update(data: Uint8Array): this {
    const { view, buffer } = this
    const len = data.length
    for (let pos = 0; pos < len;) {
      const take = Math.min(blockLen - this.pos, len - pos)
      if (take === blockLen) {
        const dataView = createView(data)
        for (; blockLen <= len - pos; pos += blockLen) this.process(dataView, pos)
        continue
      }
      buffer.set(data.subarray(pos, pos + take), this.pos)
      this.pos += take
      pos += take
      if (this.pos === blockLen) {
        this.process(view, 0)
        this.pos = 0
      }
    }
    this.length += data.length
    return this
  }
  digest(): Uint8Array {
    const { buffer, view } = this
    let { pos } = this
    buffer[pos++] = 0b10000000
    buffer.fill(0, pos)
    if (padOffset > blockLen - pos) {
      this.process(view, 0)
      buffer.fill(0)
    }
    setU64FromNum(view, blockLen - 8, this.length * 8, isLE)
    this.process(view, 0)
    MD5_W.fill(0)
    const out = new Uint8Array(outputLen)
    const oview = createView(out)
    const state = this.get()
    for (let i = 0; i < outputLen / 4; i++) oview.setUint32(4 * i, state[i], isLE)
    this.set(0, 0, 0, 0)
    buffer.fill(0)
    return out
  }
}

/** @internal */
export const md5 = (data: Uint8Array): Uint8Array => new MD5().update(data).digest()
