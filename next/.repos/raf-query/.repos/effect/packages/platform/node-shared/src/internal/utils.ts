import type { SystemError, SystemErrorTag } from "effect/PlatformError"
import * as PlatformError from "effect/PlatformError"
import type { PathLike } from "node:fs"

/** @internal */
export const handleErrnoException = (module: SystemError["module"], method: string) =>
(
  err: NodeJS.ErrnoException,
  [path]: [path: PathLike | number | string | ReadonlyArray<string>, ...args: Array<any>]
): PlatformError.PlatformError => {
  let reason: SystemErrorTag = "Unknown"

  switch (err.code) {
    case "ENOENT":
      reason = "NotFound"
      break

    case "EACCES":
      reason = "PermissionDenied"
      break

    case "EEXIST":
      reason = "AlreadyExists"
      break

    case "EISDIR":
      reason = "BadResource"
      break

    case "ENOTDIR":
      reason = "BadResource"
      break

    case "EBUSY":
      reason = "Busy"
      break

    case "ELOOP":
      reason = "BadResource"
      break
  }

  return PlatformError.systemError({
    _tag: reason,
    module,
    method,
    pathOrDescriptor: path as string | number,
    syscall: err.syscall,
    cause: err
  })
}
