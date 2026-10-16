import { batch, createAtom } from '@tanstack/vue-store'
import type { GetStoreConfig } from '@tanstack/router-core'
import type { Readable } from '@tanstack/vue-store'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> {}
}

export const getStoreFactory: GetStoreConfig = (_opts) => {
  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}
