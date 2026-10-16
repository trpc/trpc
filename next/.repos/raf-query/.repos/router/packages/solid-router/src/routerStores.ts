import * as Solid from 'solid-js'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type {
  GetStoreConfig,
  RouterReadableStore,
  RouterWritableStore,
} from '@tanstack/router-core'

function createSolidMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  const [signal, setSignal] = Solid.createSignal(initialValue)

  return { get: signal, set: setSignal }
}

function createSolidReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  return { get: Solid.createRoot(() => Solid.createMemo(read)) }
}

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createSolidMutableStore,
    createReadonlyStore: createSolidReadonlyStore,
    batch: Solid.batch,
  }
}
