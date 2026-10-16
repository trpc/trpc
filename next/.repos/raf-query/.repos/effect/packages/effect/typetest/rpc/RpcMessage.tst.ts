import type { RpcMessage } from "effect/rpc"
import { describe, expect, it } from "tstyche"

type Interrupt = Extract<
  Extract<RpcMessage.ExitEncoded<unknown, unknown>, { _tag: "Failure" }>["cause"][number],
  { _tag: "Interrupt" }
>

describe("RpcMessage.ExitEncoded", () => {
  it("accepts the null fiberId emitted by JSON encoding", () => {
    expect<null>().type.toBeAssignableTo<Interrupt["fiberId"]>()
  })

  it("retains the non-JSON undefined fiberId", () => {
    expect<undefined>().type.toBeAssignableTo<Interrupt["fiberId"]>()
  })
})
