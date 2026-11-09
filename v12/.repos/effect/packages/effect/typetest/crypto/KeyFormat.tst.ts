/// <reference types="node" />

import type * as KeyFormat from "effect/crypto/KeyFormat"
import { webcrypto } from "node:crypto"
import { describe, expect, it } from "tstyche"

declare const jwk: KeyFormat.JsonWebKey
declare const domKey: CryptoKey
declare const nodeKey: webcrypto.CryptoKey

describe("KeyFormat", () => {
  it("exchanges JWKs with DOM Web Crypto", () => {
    expect(crypto.subtle.importKey("jwk", jwk, "Ed25519", true, ["verify"])).type.toBe<Promise<CryptoKey>>()
    expect(crypto.subtle.exportKey("jwk", domKey)).type.toBeAssignableTo<Promise<KeyFormat.JsonWebKey>>()
  })

  it("exchanges JWKs with Node Web Crypto", () => {
    expect(webcrypto.subtle.importKey("jwk", jwk, "Ed25519", true, ["verify"])).type.toBe<
      Promise<webcrypto.CryptoKey>
    >()
    expect(webcrypto.subtle.exportKey("jwk", nodeKey)).type.toBeAssignableTo<Promise<KeyFormat.JsonWebKey>>()
  })
})
