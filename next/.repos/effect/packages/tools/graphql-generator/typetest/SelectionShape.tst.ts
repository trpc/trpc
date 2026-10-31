import { describe, expect, it } from "tstyche"
import type { Room, RoomRoom } from "../test/generated/subscriptions/rooms.graphql.ts"

describe("generated selection interfaces", () => {
  it("matches the decoded schema type, including nested selections", () => {
    expect<RoomRoom>().type.toBe<{ readonly id: string; readonly name: string }>()
    expect<RoomRoom>().type.toBe<typeof RoomRoom.Type>()
    expect<Room.Result>().type.toBe<{ readonly room: RoomRoom | null }>()
  })
})
