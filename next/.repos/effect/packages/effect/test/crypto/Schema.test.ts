import { assert, describe, it } from "@effect/vitest"
import * as Arbitrary from "effect/Arbitrary"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Aead from "effect/crypto/Aead"
import * as CryptoError from "effect/crypto/CryptoError"
import * as Digest from "effect/crypto/Digest"
import * as KeyFormat from "effect/crypto/KeyFormat"
import * as Mac from "effect/crypto/Mac"
import * as Signature from "effect/crypto/Signature"
import * as Effect from "effect/Effect"
import * as Base64 from "effect/encoding/Base64"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaRepresentation from "effect/SchemaRepresentation"
import * as NodeCrypto from "node:crypto"

// An Ed25519 key pair encoded by node:crypto, independently of the module
// under test.
const ed25519 = NodeCrypto.generateKeyPairSync("ed25519")
const spkiPem = ed25519.publicKey.export({ format: "pem", type: "spki" })
const pkcs8Der = new Uint8Array(ed25519.privateKey.export({ format: "der", type: "pkcs8" }))

const leaves = (issue: SchemaIssue.Issue): Array<SchemaIssue.Leaf> => {
  const node = issue as SchemaIssue.Issue & {
    readonly issue?: SchemaIssue.Issue
    readonly issues?: ReadonlyArray<SchemaIssue.Issue>
  }
  if (node.issues !== undefined) return node.issues.flatMap(leaves)
  if (node.issue !== undefined) return leaves(node.issue)
  return [issue as SchemaIssue.Leaf]
}

const failure = <A>(exit: Exit.Exit<A, Schema.SchemaError>): SchemaIssue.Leaf => {
  const error = Result.getOrThrow(Exit.findError(exit))
  const found = leaves(error.issue)
  assert.strictEqual(found.length, 1)
  return found[0]
}

describe("Schema crypto keys", () => {
  it.effect("declared schemas reject a key with a different operation-defining hash", () =>
    Effect.gen(function*() {
      const pair = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
      const key = yield* KeyFormat.decodePublic(
        KeyFormat.spki,
        { ...Signature.ecdsaP256, hash: Digest.sha512 },
        new Uint8Array(pair.publicKey.export({ format: "der", type: "spki" }))
      )
      assert.isFalse(Schema.is(Schema.SignaturePublicKey(Signature.ecdsaP256))(key))
    }))

  it.effect("generated code for a custom-hash schema accepts the same keys", () =>
    Effect.gen(function*() {
      const algorithm = { ...Signature.ecdsaP256, hash: Digest.sha512 }
      const pair = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
      const key = yield* KeyFormat.decodePublic(
        KeyFormat.spki,
        algorithm,
        new Uint8Array(pair.publicKey.export({ format: "der", type: "spki" }))
      )
      const schema = Schema.SignaturePublicKey(algorithm)
      assert.isTrue(Schema.is(schema)(key))

      const output = SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast]))
      assert.includeDeepMembers([...output.artifacts], [
        { _tag: "Import", importDeclaration: `import * as Digest from "effect/crypto/Digest"` }
      ])
      const generated = new Function("Schema", "Signature", "Digest", `return ${output.codes[0].runtime}`)(
        Schema,
        Signature,
        Digest
      )
      assert.isTrue(Schema.is(generated)(key))
    }))

  it.effect("declared RSA schemas ignore generation-only modulus length", () =>
    Effect.gen(function*() {
      const pair = NodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
      const key = yield* KeyFormat.decodePublic(
        KeyFormat.spki,
        Signature.rsaPss({ hash: Digest.sha256, modulusLength: 2048 }),
        new Uint8Array(pair.publicKey.export({ format: "der", type: "spki" }))
      )
      assert.isTrue(Schema.is(Schema.SignaturePublicKey(Signature.rsaPssSha256))(key))
    }))

  it.effect("FromBytes decodes synchronously and maps a CryptoError to InvalidValue", () =>
    Effect.gen(function*() {
      const bytes = new Uint8Array(32).fill(7)
      const key = Schema.decodeSync(Schema.AeadKeyFromBytes(Aead.aes256Gcm))(bytes)
      assert.isTrue(Schema.is(Schema.AeadKey(Aead.aes256Gcm))(key))
      assert.deepStrictEqual(yield* Aead.toBytes(key), bytes)

      const issue = failure(Schema.decodeUnknownExit(Schema.AeadKeyFromBytes(Aead.aes256Gcm))(new Uint8Array(16)))
      assert.strictEqual(issue._tag, "InvalidValue")
      const cause = (issue as SchemaIssue.InvalidValue).annotations?.cause
      assert.isTrue(CryptoError.isCryptoError(cause))
      assert.strictEqual((issue as SchemaIssue.InvalidValue).annotations?.message, (cause as Error).message)

      // Public keys read and write; secret keys only read.
      const publicBytes = new Uint8Array(32).fill(9)
      const publicKey = Schema.decodeSync(Schema.SignaturePublicKeyFromBytes(Signature.ed25519))(publicBytes)
      assert.deepStrictEqual(
        yield* Schema.encodeEffect(Schema.SignaturePublicKeyFromBytes(Signature.ed25519))(publicKey),
        publicBytes
      )
      const exit = yield* Effect.exit(Schema.encodeEffect(Schema.AeadKeyFromBytes(Aead.aes256Gcm))(key))
      assert.strictEqual(failure(exit)._tag, "Forbidden")
    }))

  it.effect("FromBytes reads base64 under Config.schema", () =>
    Effect.gen(function*() {
      const bytes = new Uint8Array(32).fill(3)
      const key = yield* Effect.provide(
        Config.schema(Schema.MacKeyFromBytes(Mac.hmacSha256), "MAC_KEY"),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { MAC_KEY: Base64.encode(bytes) } }))
      )
      assert.strictEqual(key.algorithm, Mac.hmacSha256)
      assert.deepStrictEqual(yield* Mac.toBytes(key), bytes)
    }))

  it.effect("FromFormat decodes asynchronously and only encodes private keys when allowed", () =>
    Effect.gen(function*() {
      const publicSchema = Schema.SignaturePublicKeyFromFormat(KeyFormat.pem(KeyFormat.spki), Signature.ed25519)
      assert.throws(() => Schema.decodeSync(publicSchema)(spkiPem))
      const publicKey = yield* Schema.decodeEffect(publicSchema)(spkiPem)
      assert.strictEqual(publicKey.algorithm, Signature.ed25519)
      assert.strictEqual(yield* Schema.encodeEffect(publicSchema)(publicKey), spkiPem)

      const privateKey = yield* Schema.decodeEffect(
        Schema.SignaturePrivateKeyFromFormat(KeyFormat.pkcs8, Signature.ed25519)
      )(pkcs8Der)
      const forbidden = yield* Effect.exit(
        Schema.encodeEffect(Schema.SignaturePrivateKeyFromFormat(KeyFormat.pkcs8, Signature.ed25519))(privateKey)
      )
      assert.strictEqual(failure(forbidden)._tag, "Forbidden")
      assert.deepStrictEqual(
        yield* Schema.encodeEffect(
          Schema.SignaturePrivateKeyFromFormat(KeyFormat.pkcs8, Signature.ed25519, { allowEncode: true })
        )(privateKey),
        pkcs8Der
      )

      const k = Base64Url.encode(new Uint8Array(32).fill(5))
      const secretSchema = Schema.AeadKeyFromFormat(KeyFormat.jwk, Aead.aes256Gcm, { allowEncode: true })
      // Secret keys skip subtle, but format schemas stay async only.
      assert.throws(() => Schema.decodeSync(secretSchema)({ kty: "oct", k }))
      const secretKey = yield* Schema.decodeEffect(secretSchema)({ kty: "oct", k })
      assert.deepStrictEqual(yield* Schema.encodeEffect(secretSchema)(secretKey), { kty: "oct", k })

      const invalid = yield* Effect.exit(Schema.decodeEffect(publicSchema)("not a key"))
      const issue = failure(invalid)
      assert.strictEqual(issue._tag, "InvalidValue")
      assert.isTrue(CryptoError.isCryptoError((issue as SchemaIssue.InvalidValue).annotations?.cause))
    }))

  it.effect("declared schemas check the algorithm, redact, and compare by reference", () =>
    Effect.gen(function*() {
      const schema = Schema.AeadKey(Aead.aes256Gcm)
      const key = yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32).fill(1))
      const same = yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32).fill(1))
      const other = yield* Aead.key(Aead.aes256Gcm, new Uint8Array(32).fill(2))

      assert.strictEqual(Schema.decodeUnknownSync(schema)(key), key)
      assert.isFalse(Schema.is(schema)(yield* Aead.key(Aead.aes128Gcm, new Uint8Array(16))))
      assert.isFalse(Schema.is(schema)(yield* Mac.key(Mac.hmacSha256, new Uint8Array(32).fill(1))))
      assert.isFalse(Schema.is(schema)(new Uint8Array(32)))

      const format = Schema.toFormatter(schema)
      assert.strictEqual(format(key), format(other))
      assert.notInclude(format(key), "0101")

      const equivalence = Schema.toEquivalence(schema)
      assert.isTrue(equivalence(key, key))
      assert.isFalse(equivalence(key, same))

      assert.throws(() => Arbitrary.schema(schema))

      const publicKey = yield* Signature.publicKey(Signature.ed25519, new Uint8Array(32).fill(9))
      const json = Schema.encodeUnknownExit(Schema.toCodecJson(Schema.SignaturePublicKey(Signature.ed25519)))(publicKey)
      const issue = failure(json)
      assert.strictEqual(issue._tag, "Forbidden")
      assert.include((issue as SchemaIssue.Forbidden).annotations?.message, "SignaturePublicKeyFromFormat")
    }))
})
