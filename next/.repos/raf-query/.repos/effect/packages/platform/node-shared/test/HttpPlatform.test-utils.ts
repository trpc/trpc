import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"

const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
const oversized = maxSafe + 2n

export const fileSystemLayer = FileSystem.layerNoop({
  stat: () =>
    Effect.succeed({
      type: "File",
      size: ByteSize.bytes(oversized),
      mtime: Option.none(),
      atime: Option.none(),
      birthtime: Option.none(),
      dev: 0,
      mode: 0,
      ino: Option.none(),
      nlink: Option.none(),
      uid: Option.none(),
      gid: Option.none(),
      rdev: Option.none(),
      blksize: Option.none(),
      blocks: Option.none()
    })
})
