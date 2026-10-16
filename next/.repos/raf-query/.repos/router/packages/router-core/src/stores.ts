import { arraysEqual, functionalUpdate } from './utils'

import type { AnyRoute } from './route'
import type { RouterState } from './router'
import type { FullSearchSchema } from './routeInfo'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'

export interface RouterReadableStore<TValue> {
  get: () => TValue
}

export interface RouterWritableStore<
  TValue,
> extends RouterReadableStore<TValue> {
  set: ((updater: (prev: TValue) => TValue) => void) & ((value: TValue) => void)
}

export type RouterBatchFn = (fn: () => void) => void

export type MutableStoreFactory = <TValue>(
  initialValue: TValue,
) => RouterWritableStore<TValue>

export type ReadonlyStoreFactory = <TValue>(
  read: () => TValue,
) => RouterReadableStore<TValue>

export type GetStoreConfig = (opts: { isServer?: boolean }) => StoreConfig

export type StoreConfig = {
  createMutableStore: MutableStoreFactory
  createReadonlyStore: ReadonlyStoreFactory
  batch: RouterBatchFn
}

type MatchStore = RouterWritableStore<AnyRouteMatch | undefined>
type ReadableStore<TValue> = RouterReadableStore<TValue>

/** SSR non-reactive createMutableStore */
export function createNonReactiveMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  let value = initialValue

  return {
    get() {
      return value
    },
    set(nextOrUpdater: TValue | ((prev: TValue) => TValue)) {
      value = functionalUpdate(nextOrUpdater, value)
    },
  }
}

/** SSR non-reactive createReadonlyStore */
export function createNonReactiveReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  return {
    get() {
      return read()
    },
  }
}

export interface RouterStores<in out TRouteTree extends AnyRoute> {
  status: RouterWritableStore<RouterState<TRouteTree>['status']>
  location: RouterWritableStore<ParsedLocation<FullSearchSchema<TRouteTree>>>
  resolvedLocation: RouterWritableStore<
    ParsedLocation<FullSearchSchema<TRouteTree>> | undefined
  >
  ids: RouterWritableStore<Array<string>>
  matches: ReadableStore<Array<AnyRouteMatch>>
  __store: RouterReadableStore<RouterState<TRouteTree>>

  byRoute: Map<string, MatchStore>

  /**
   * Get the stable atom for a route's presented match. The atom remains in the
   * pool when the route leaves and contains `undefined` until it re-enters.
   */
  getMatchStore: (
    routeId: string,
  ) => RouterReadableStore<AnyRouteMatch | undefined>

  setMatches: (nextMatches: Array<AnyRouteMatch>) => void
}

export function createRouterStores<TRouteTree extends AnyRoute>(
  initialLocation: RouterState<TRouteTree>['location'],
  config: StoreConfig,
): RouterStores<TRouteTree> {
  const { createMutableStore, createReadonlyStore, batch } = config

  // non reactive utilities
  const byRoute = new Map<string, MatchStore>()

  // atoms
  const status = createMutableStore<RouterState<TRouteTree>['status']>('idle')
  const location = createMutableStore(initialLocation)
  const resolvedLocation =
    createMutableStore<RouterState<TRouteTree>['resolvedLocation']>(undefined)
  const ids = createMutableStore<Array<string>>([])

  // 1st order derived stores
  const matches = createReadonlyStore(() =>
    ids.get().map((id) => byRoute.get(id)!.get()!),
  )

  // compatibility "big" state store
  const __store = createReadonlyStore(() => ({
    status: status.get(),
    isLoading: status.get() === 'pending',
    matches: matches.get(),
    location: location.get(),
    resolvedLocation: resolvedLocation.get(),
  }))

  function getMatchStore(routeId: string): MatchStore {
    let matchStore = byRoute.get(routeId)
    if (!matchStore) {
      matchStore = createMutableStore<AnyRouteMatch | undefined>(undefined)
      byRoute.set(routeId, matchStore)
    }
    return matchStore
  }

  const store = {
    // atoms
    status,
    location,
    resolvedLocation,
    ids,

    // derived
    matches,

    // non-reactive state
    byRoute,

    // compatibility "big" state
    __store,

    // stable per-route presentation atoms
    getMatchStore,

    // methods
    setMatches,
  }

  // setters to update non-reactive utilities in sync with the reactive stores
  function setMatches(nextMatches: Array<AnyRouteMatch>) {
    const previousIds = ids.get()
    const nextIds = nextMatches.map((match) => match.routeId)

    batch(() => {
      // Publish lane membership first so framework trees reconcile departures
      // before observers of a leaving route receive its tombstone.
      if (!arraysEqual(previousIds, nextIds)) {
        ids.set(nextIds)
      }

      for (const id of previousIds) {
        if (!nextIds.includes(id)) {
          byRoute.get(id)!.set(() => undefined)
        }
      }

      for (const nextMatch of nextMatches) {
        const matchStore = getMatchStore(nextMatch.routeId)
        if (matchStore.get() !== nextMatch) {
          matchStore.set(nextMatch)
        }
      }
    })
  }

  return store
}
