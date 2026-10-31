import { Stream } from "effect"
import * as Tar from "effect/encoding/Tar"
import { describe, expect, it } from "tstyche"

describe("Tar", () => {
  it("encode infers body errors and services from a union of entries", () => {
    const entries = Stream.make(
      Tar.fileStream("a", 1, Stream.fail("A") as Stream.Stream<Uint8Array, "A", "ServiceA">),
      Tar.fileStream("b", 1, Stream.fail("B") as Stream.Stream<Uint8Array, "B", "ServiceB">),
      Tar.file("c", "c")
    )

    expect(entries.pipe(Stream.pipeThroughChannel(Tar.encode()))).type.toBe<
      Stream.Stream<Uint8Array, Tar.TarError | "A" | "B", "ServiceA" | "ServiceB">
    >()
  })

  it("decode adds upstream errors to entry bodies", () => {
    const bytes = Stream.fail("Io") as Stream.Stream<Uint8Array, "Io">

    expect(bytes.pipe(Stream.pipeThroughChannel(Tar.decode()))).type.toBe<
      Stream.Stream<Tar.Entry<Tar.TarError | "Io">, Tar.TarError | "Io">
    >()
  })
})
