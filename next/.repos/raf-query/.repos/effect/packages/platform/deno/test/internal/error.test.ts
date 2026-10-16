import { assert, describe, it } from "@effect/vitest"
import { SystemError, type SystemErrorTag } from "effect/PlatformError"
import { handleError } from "../../src/internal/error.ts"

const withCode = (error: Error, code: string): Error & { readonly code: string } => Object.assign(error, { code })

describe("handleError", () => {
  const mapError = handleError("FileSystem", "test", "/tmp/test")
  const cases: ReadonlyArray<readonly [error: Error, tag: SystemErrorTag]> = [
    [withCode(new Deno.errors.NotFound(), "ENOENT"), "NotFound"],
    [withCode(new Deno.errors.NotADirectory(), "ENOTDIR"), "BadResource"],
    [new Deno.errors.AlreadyExists(), "AlreadyExists"],
    [withCode(new Deno.errors.AlreadyExists(), "EEXIST"), "AlreadyExists"],
    [withCode(new Deno.errors.IsADirectory(), "EISDIR"), "BadResource"],
    [withCode(new Deno.errors.PermissionDenied(), "EACCES"), "PermissionDenied"],
    [new Deno.errors.NotCapable(), "PermissionDenied"],
    [new Deno.errors.BadResource(), "BadResource"],
    [new Deno.errors.InvalidData(), "InvalidData"],
    [new Deno.errors.TimedOut(), "TimedOut"],
    [new Deno.errors.UnexpectedEof(), "UnexpectedEof"],
    [new Deno.errors.WouldBlock(), "WouldBlock"],
    [new Deno.errors.WriteZero(), "WriteZero"],
    [new Error("unrecognised"), "Unknown"]
  ]

  for (const [error, tag] of cases) {
    it(`maps ${error.name} to ${tag}`, () => {
      const platformError = mapError(error)
      const reason = platformError.reason

      assert(reason instanceof SystemError)
      assert.strictEqual(reason._tag, tag)
      assert.strictEqual(reason.module, "FileSystem")
      assert.strictEqual(reason.method, "test")
      assert.strictEqual(reason.pathOrDescriptor, "/tmp/test")
      assert.strictEqual(reason.cause, error)
    })
  }
})
