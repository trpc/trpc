import type { SystemError, SystemErrorTag } from "effect/PlatformError"
import * as PlatformError from "effect/PlatformError"

interface DenoError {
  readonly code?: unknown
  readonly name?: unknown
}

export const handleError = (
  module: SystemError["module"],
  method: string,
  pathOrDescriptor?: string | number
) =>
(error: unknown): PlatformError.PlatformError => {
  const denoError = error as DenoError
  let tag: SystemErrorTag = "Unknown"

  switch (denoError?.name) {
    case "AlreadyExists":
      tag = "AlreadyExists"
      break
    case "NotCapable":
      tag = "PermissionDenied"
      break
    case "BadResource":
    case "InvalidData":
    case "TimedOut":
    case "UnexpectedEof":
    case "WouldBlock":
    case "WriteZero":
      tag = denoError.name
      break
    default:
      switch (denoError?.code) {
        case "ENOENT":
          tag = "NotFound"
          break

        case "EACCES":
          tag = "PermissionDenied"
          break

        case "EEXIST":
          tag = "AlreadyExists"
          break

        case "EISDIR":
        case "ENOTDIR":
        case "ELOOP":
          tag = "BadResource"
          break

        case "EBUSY":
          tag = "Busy"
          break
      }
  }

  return PlatformError.systemError({
    _tag: tag,
    module,
    method,
    pathOrDescriptor,
    cause: error
  })
}
