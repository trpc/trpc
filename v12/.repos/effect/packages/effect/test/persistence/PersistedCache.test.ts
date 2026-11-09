import { Persistence } from "effect/persistence"
import * as PersistedCacheTest from "./PersistedCacheTest.ts"

PersistedCacheTest.suite("memory", Persistence.layerMemory)
