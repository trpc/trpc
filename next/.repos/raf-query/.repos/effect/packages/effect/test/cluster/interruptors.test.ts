import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { EntityAddress, EntityId, EntityType, ShardId } from "effect/cluster"
import { acquireEntity, aroundEntityType, isActive, releaseEntity } from "effect/cluster/internal/interruptors"

const address = EntityAddress.make({
  shardId: ShardId.make("active-teardown-unit", 1),
  entityType: EntityType.make("ActiveTeardownUnit"),
  entityId: EntityId.make("1")
})

it("releases entity keys so membership returns to baseline", () => {
  acquireEntity(address)
  assert.isTrue(isActive(address))
  releaseEntity(address)
  assert.isFalse(isActive(address))
})

it("refcounts overlapping acquires", () => {
  acquireEntity(address)
  acquireEntity(address)
  releaseEntity(address)
  assert.isTrue(isActive(address))
  releaseEntity(address)
  assert.isFalse(isActive(address))
})

it.effect("aroundEntityType restores the key after the effect", () =>
  Effect.gen(function*() {
    yield* aroundEntityType(
      "ActiveTeardownUnit",
      Effect.sync(() => {
        assert.isTrue(isActive(address))
      })
    )
    assert.isFalse(isActive(address))
  }))
