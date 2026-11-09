import * as DenoKeyValueStore from "@effect/platform-deno/DenoKeyValueStore"
import { beforeAll, describe } from "@effect/vitest"
import { testLayer } from "../../../effect/test/persistence/KeyValueStore.test.ts"

beforeAll(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe("KeyValueStore / layerLocalStorage", () => testLayer(DenoKeyValueStore.layerLocalStorage))

describe("KeyValueStore / layerSessionStorage", () => testLayer(DenoKeyValueStore.layerSessionStorage))
