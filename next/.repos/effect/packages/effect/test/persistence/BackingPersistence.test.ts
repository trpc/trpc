import { Layer } from "effect"
import { KeyValueStore, Persistence } from "effect/persistence"
import * as BackingPersistenceTest from "./BackingPersistenceTest.ts"

BackingPersistenceTest.suite("memory", Persistence.layerBackingMemory)
BackingPersistenceTest.suite("kvs", Persistence.layerBackingKvs.pipe(Layer.provide(KeyValueStore.layerMemory)))
