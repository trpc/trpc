import * as Vue from 'vue'
import { invariant } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useSelector } from '@tanstack/vue-store'
import { routeIdContext } from './matchContext'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface UseMatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TThrow extends boolean = true,
>(
  opts?: UseMatchBaseOptions<TRouter, TFrom, true, TThrow, TSelected>,
) => Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, true, TSelected>, TThrow>
>

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseMatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseMatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<TRouter>
  : TSelected

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const router = useRouter<TRouter>()

  // During SSR we render exactly once and do not need reactivity.
  // Avoid store subscriptions and pending/transition bookkeeping on the server.
  if (isServer ?? router.isServer) {
    const nearestRouteId = opts.from ? undefined : Vue.inject(routeIdContext)
    const matchStore =
      (opts.from ?? nearestRouteId)
        ? router.stores.getMatchStore(opts.from ?? nearestRouteId!)
        : undefined
    const match = matchStore?.get()

    if ((opts.shouldThrow ?? true) && !match) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
        )
      }

      invariant()
    }

    if (match === undefined) {
      return Vue.ref(undefined) as Vue.Ref<
        ThrowOrOptional<
          UseMatchResult<TRouter, TFrom, TStrict, TSelected>,
          TThrow
        >
      >
    }

    return Vue.ref(opts.select ? opts.select(match) : match) as Vue.Ref<
      ThrowOrOptional<
        UseMatchResult<TRouter, TFrom, TStrict, TSelected>,
        TThrow
      >
    >
  }

  // Set up reactive match value based on lookup strategy.
  let match: Readonly<Vue.Ref<any>>
  const nearestRouteId = Vue.inject(routeIdContext)

  if (opts.from) {
    // routeId case: subscribe to the stable per-route presentation atom.
    const matchStore = router.stores.getMatchStore(opts.from)
    match = useSelector(matchStore)
  } else {
    // Nearest-match case: use the routeId from context for stable lookup.
    // The routeId is provided by the nearest Match component and doesn't
    // change for the component's lifetime, so the store is stable.
    if (nearestRouteId) {
      match = useSelector(router.stores.getMatchStore(nearestRouteId))
    } else {
      // No route context — will fall through to error handling below
      match = Vue.ref(undefined) as Readonly<Vue.Ref<undefined>>
    }
  }

  const ownsMatch =
    nearestRouteId !== undefined &&
    (opts.from ?? nearestRouteId) === nearestRouteId
  let lastOwnedMatch: any
  const result = Vue.computed<any>(() => {
    if (match.value !== undefined && ownsMatch) {
      lastOwnedMatch = match.value
    }
    const selectedMatch = match.value ?? lastOwnedMatch
    if (selectedMatch === undefined) {
      if (opts.shouldThrow ?? true) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
          )
        }

        invariant()
      }

      return undefined
    }

    return opts.select ? opts.select(selectedMatch) : selectedMatch
  })

  // Keep eager throw behavior for setups that call useMatch for side effects only.
  result.value

  return result
}
