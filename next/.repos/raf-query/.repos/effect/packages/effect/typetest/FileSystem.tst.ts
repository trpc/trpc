import type { ByteSize, Effect, FileSystem, PlatformError } from "effect"
import { describe, expect, it } from "tstyche"

describe("FileSystem", () => {
  it("uses numbers for buffer sizes and ByteSize for logical file sizes", () => {
    expect<FileSystem.File.Info["size"]>().type.toBe<ByteSize.ByteSize>()
    expect<Parameters<FileSystem.File["readAlloc"]>[0]>().type.toBe<number>()
    expect<NonNullable<Parameters<FileSystem.FileSystem["stream"]>[1]>["chunkSize"]>().type.toBe<
      number | undefined
    >()
    expect<Parameters<FileSystem.File["truncate"]>[0]>().type.toBe<number | undefined>()
    expect<Parameters<FileSystem.File["seek"]>[0]>().type.toBe<bigint>()
    expect<ReturnType<FileSystem.File["seek"]>>().type.toBe<Effect.Effect<bigint, PlatformError.PlatformError>>()
    expect<Effect.Success<ReturnType<FileSystem.File["read"]>>>().type.toBe<number>()
    expect<Effect.Success<ReturnType<FileSystem.File["write"]>>>().type.toBe<number>()
  })
})
