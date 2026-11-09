import { PgAuth } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import * as Result from "effect/Result"
import { bytes, md5, scram } from "./fixtures/goldens.ts"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const success = <A, E>(result: Result.Result<A, E>): A => {
  assert.isTrue(Result.isSuccess(result))
  return (result as Result.Success<A, E>).success
}

const assertFailureTagged = (tag: string, run: () => Result.Result<unknown, { readonly _tag: string }>) => {
  const result = run()
  assert.isTrue(Result.isFailure(result))
  if (Result.isFailure(result)) assert.strictEqual(result.failure._tag, tag)
}

describe("PgAuth", () => {
  describe("md5Password", () => {
    it("matches the response PostgreSQL accepted", () => {
      assert.strictEqual(
        success(PgAuth.md5Password({ user: md5.user, password: md5.password, salt: bytes(md5.salt) })),
        md5.expected
      )
    })

    it("depends on the salt", () => {
      const other = success(PgAuth.md5Password({
        user: md5.user,
        password: md5.password,
        salt: bytes("00000000")
      }))
      assert.notStrictEqual(other, md5.expected)
    })

    it("rejects a salt that is not exactly four bytes", () => {
      for (const salt of [new Uint8Array(0), new Uint8Array(3), new Uint8Array(5)]) {
        const result = PgAuth.md5Password({ user: "u", password: "p", salt })
        assert.isTrue(Result.isFailure(result))
        if (Result.isFailure(result)) assert.strictEqual(result.failure._tag, "PgAuthError")
      }
    })
  })

  describe("SCRAM-SHA-256", () => {
    it("replays a captured PostgreSQL exchange", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assert.strictEqual(decoder.decode(started.response), scram.clientFirstMessage)

      const continued = success(PgAuth.scramContinue(started.state, encoder.encode(scram.serverFirstMessage)))
      assert.strictEqual(decoder.decode(continued.response), scram.clientFinalMessage)

      success(PgAuth.scramFinish(continued.state, encoder.encode(scram.serverFinalMessage)))
    })

    it("rejects a server nonce that does not extend the client nonce", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assertFailureTagged(
        "PgAuthError",
        () => PgAuth.scramContinue(started.state, encoder.encode("r=other,s=DBRmN4Xi9iMOo1tZfsi+Hg==,i=4096"))
      )
    })

    it("rejects a server nonce that only echoes the client nonce", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assertFailureTagged(
        "PgAuthError",
        () =>
          PgAuth.scramContinue(
            started.state,
            encoder.encode(`r=${scram.clientNonce},s=DBRmN4Xi9iMOo1tZfsi+Hg==,i=4096`)
          )
      )
    })

    it("rejects a missing attribute", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assertFailureTagged(
        "PgAuthError",
        () => PgAuth.scramContinue(started.state, encoder.encode(`r=${scram.clientNonce}x,i=4096`))
      )
    })

    it("rejects duplicate server attributes", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assertFailureTagged(
        "PgAuthError",
        () =>
          PgAuth.scramContinue(
            started.state,
            encoder.encode(`${scram.serverFirstMessage},r=${scram.clientNonce}replacement`)
          )
      )
    })

    it("rejects malformed salts and iteration counts", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      const nonce = `${scram.clientNonce}server`
      for (
        const challenge of [
          `r=${nonce},s=,i=4096`,
          `r=${nonce},s=*,i=4096`,
          `r=${nonce},s=AA==,i=0`,
          `r=${nonce},s=AA==,i=-1`,
          `r=${nonce},s=AA==,i=1.5`,
          `r=${nonce},s=AA==,i=1e3`,
          `r=${nonce},s=AA==,i=1000001`,
          `r=${nonce},s=AA==,i=2147483648`
        ]
      ) {
        assertFailureTagged("PgAuthError", () => PgAuth.scramContinue(started.state, encoder.encode(challenge)))
      }
    })

    it("rejects malformed SCRAM text", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      assertFailureTagged("PgAuthError", () => PgAuth.scramContinue(started.state, new Uint8Array([0xff])))
      assertFailureTagged("PgAuthError", () => PgAuth.scramContinue(started.state, encoder.encode("not-an-attribute")))
    })

    it("rejects a tampered server signature", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      const continued = success(PgAuth.scramContinue(started.state, encoder.encode(scram.serverFirstMessage)))
      assertFailureTagged(
        "PgAuthError",
        () => PgAuth.scramFinish(continued.state, encoder.encode("v=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
      )
    })

    it("surfaces a server error attribute", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      const continued = success(PgAuth.scramContinue(started.state, encoder.encode(scram.serverFirstMessage)))
      assertFailureTagged(
        "PgAuthError",
        () => PgAuth.scramFinish(continued.state, encoder.encode("e=invalid-proof"))
      )
    })

    it("rejects malformed server-final messages", () => {
      const started = success(PgAuth.scramInit({ password: scram.password, nonce: scram.clientNonce }))
      const continued = success(PgAuth.scramContinue(started.state, encoder.encode(scram.serverFirstMessage)))
      for (
        const challenge of [
          new Uint8Array([0xff]),
          encoder.encode("x=missing-signature"),
          encoder.encode("v=*"),
          encoder.encode(`${scram.serverFinalMessage},${scram.serverFinalMessage}`)
        ]
      ) {
        assertFailureTagged("PgAuthError", () => PgAuth.scramFinish(continued.state, challenge))
      }
    })

    it("rejects a nonce outside SCRAM's printable ASCII range", () => {
      for (const nonce of ["", "a,b", "with space", "line\nbreak", "nönce"]) {
        assertFailureTagged("PgAuthError", () => PgAuth.scramInit({ password: "x", nonce }))
      }
    })

    it("derives a different proof for a different password", () => {
      const started = success(PgAuth.scramInit({ password: "wrong", nonce: scram.clientNonce }))
      const continued = success(PgAuth.scramContinue(started.state, encoder.encode(scram.serverFirstMessage)))
      assert.notStrictEqual(decoder.decode(continued.response), scram.clientFinalMessage)
      assertFailureTagged(
        "PgAuthError",
        () => PgAuth.scramFinish(continued.state, encoder.encode(scram.serverFinalMessage))
      )
    })
  })
})
