'use client'

import * as React from 'react'
import { useSelector } from '@tanstack/react-store'
import { isNotFound, rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext } from './matchContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { ClientOnly } from './ClientOnly'
import {
  nonRouteComponentContext,
  wrapInNonRouteComponentContext,
} from './nonRouteComponentContext'
import type {
  AnyRoute,
  AnyRouteMatch,
  RootRouteOptions,
} from '@tanstack/router-core'

export function renderPending(
  router: ReturnType<typeof useRouter>,
  route?: AnyRoute,
) {
  const PendingComponent =
    route?.options.pendingComponent ?? router.options.defaultPendingComponent
  if (!PendingComponent) {
    return null
  }

  const pendingElement = <PendingComponent />
  return process.env.NODE_ENV !== 'production'
    ? wrapInNonRouteComponentContext(pendingElement, 'pendingComponent')
    : pendingElement
}

type OutletMatchSelection = [
  parentGlobalNotFound: boolean,
  parentNotFoundError: unknown,
]

const outletMatchSelectionEqual = (
  a: OutletMatchSelection,
  b: OutletMatchSelection,
) => a[0] === b[0] && a[1] === b[1]

const canWrapInSuspense = (
  router: ReturnType<typeof useRouter>,
  route: AnyRoute,
  ssr: AnyRouteMatch['ssr'],
) =>
  !route.isRoot ||
  (route.options as RootRouteOptions).shellComponent ||
  route.options.wrapInSuspense ||
  ssr === false ||
  ssr === 'data-only' ||
  !((isServer ?? router.isServer) || router.ssr)

export const Match = React.memo(function MatchImpl({
  routeId,
}: {
  routeId: string
}) {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match = router.stores.byRoute.get(routeId)!.get()!
    return matchView(router, match)
  }

  const matchStore = router.stores.getMatchStore(routeId)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const match = useSelector(matchStore)!
  return matchView(router, match)
})

function matchView(router: ReturnType<typeof useRouter>, match: AnyRouteMatch) {
  const route: AnyRoute = router.routesById[match.routeId]

  const pendingElement = renderPending(router, route)

  const routeErrorComponent =
    route.options.errorComponent ?? router.options.defaultErrorComponent

  const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch

  const routeNotFoundComponent = route.isRoot
    ? // If it's the root route, use the _notFound option, with fallback to the notFoundRoute's component
      (route.options.notFoundComponent ??
      router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent

  const resolvedNoSsr = match.ssr === false || match.ssr === 'data-only'
  // A root component may render the document itself. Only place its Suspense
  // boundary in pure CSR, inside an explicit shell, or when explicitly opted in.
  const wrapInSuspense =
    canWrapInSuspense(router, route, match.ssr) &&
    (route.options.wrapInSuspense ??
      pendingElement ??
      ((route.options.errorComponent as any)?.preload || resolvedNoSsr))

  let content = <MatchInner match={match} />
  if (resolvedNoSsr) {
    content = <ClientOnly fallback={pendingElement}>{content}</ClientOnly>
  }
  if (routeNotFoundComponent) {
    content = (
      <CatchNotFound
        fallback={(error) => {
          error.routeId ??= match.routeId
          if (error.routeId !== match.routeId) {
            throw error
          }
          const notFoundElement = React.createElement(
            routeNotFoundComponent,
            error as any,
          )
          return process.env.NODE_ENV !== 'production'
            ? wrapInNonRouteComponentContext(
                notFoundElement,
                'notFoundComponent',
              )
            : notFoundElement
        }}
      >
        {content}
      </CatchNotFound>
    )
  }
  if (routeErrorComponent) {
    content = (
      <CatchBoundary
        getResetKey={() => match}
        errorComponent={routeErrorComponent as any}
        onCatch={(error, errorInfo) => {
          // Not-found errors belong to the enclosing not-found boundary.
          if (isNotFound(error)) {
            error.routeId ??= match.routeId
            throw error
          }
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Warning: Error in route match: ${match.id}`)
          }
          routeOnCatch?.(error, errorInfo)
        }}
      >
        {content}
      </CatchBoundary>
    )
  }
  if (wrapInSuspense) {
    content = (
      <React.Suspense fallback={pendingElement}>{content}</React.Suspense>
    )
  }

  const scrollRestoration =
    (isServer ?? router.isServer) &&
    route.parentRoute?.id === rootRouteId &&
    router.options.scrollRestoration ? (
      <ScrollRestoration />
    ) : null

  const ShellComponent =
    route.isRoot && (route.options as RootRouteOptions).shellComponent

  return ShellComponent ? (
    // The shell and route boundaries must share this match's context.
    <matchContext.Provider value={match.routeId}>
      <ShellComponent>
        {content}
        {scrollRestoration}
      </ShellComponent>
    </matchContext.Provider>
  ) : (
    <matchContext.Provider value={match.routeId}>
      {content}
      {scrollRestoration}
    </matchContext.Provider>
  )
}

export const MatchInner = React.memo(function MatchInnerImpl({
  match,
}: {
  match: AnyRouteMatch
}): any {
  const router = useRouter()
  const routeId = match.routeId
  const route = router.routesById[routeId] as AnyRoute
  const key = React.useMemo(() => {
    const remountFn =
      route.options.remountDeps ?? router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    return remountDeps ? JSON.stringify(remountDeps) : undefined
  }, [
    routeId,
    match.loaderDeps,
    match._strictParams,
    match._strictSearch,
    route.options.remountDeps,
    router.options.defaultRemountDeps,
  ])
  const out = React.useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    return Comp ? <Comp key={key} /> : <Outlet />
  }, [key, route.options.component, router.options.defaultComponent])

  if (match.status === 'pending') {
    if (router.ssr && !canWrapInSuspense(router, route, match.ssr)) {
      // Replacing an SSR document root with pending UI would remove <html>.
      // Hydrated matches retain their prior data, so keep rendering it.
      return out
    }
    if (router._tx) {
      throw router._tx[5]
    }
    return renderPending(router, route)
  }

  if (match.status === 'notFound') {
    return renderRouteNotFound(router, route, match.error)
  }

  if (match.status === 'error') {
    if (isServer ?? router.isServer) {
      const RouteErrorComponent =
        (route.options.errorComponent ??
          router.options.defaultErrorComponent) ||
        ErrorComponent
      const errorElement = (
        <RouteErrorComponent
          error={match.error}
          reset={undefined as any}
          info={{
            componentStack: '',
          }}
        />
      )
      return process.env.NODE_ENV !== 'production'
        ? wrapInNonRouteComponentContext(errorElement, 'errorComponent')
        : errorElement
    }
    throw match.error
  }

  return out
})

/**
 * Render the next child match in the route tree. Typically used inside
 * a route component to render nested routes.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/outletComponent
 */
export const Outlet = React.memo(function OutletImpl() {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const nonRouteComponent = React.useContext(nonRouteComponentContext!)
    if (nonRouteComponent) {
      console.warn(
        `Warning: An <Outlet /> was rendered inside a ${nonRouteComponent}. <Outlet /> should only be rendered inside a route component.`,
      )
    }
  }

  const router = useRouter()
  const routeId = React.useContext(matchContext)!

  let parentGlobalNotFound: boolean
  let parentNotFoundError: unknown
  let childRouteId: string | undefined

  if (isServer ?? router.isServer) {
    const matches = router.stores.matches.get()
    const parentIndex = matches.findIndex((match) => match.routeId === routeId)
    const parentMatch = matches[parentIndex]!
    parentGlobalNotFound = !!parentMatch._notFound
    parentNotFoundError = parentMatch.error
    childRouteId = matches[parentIndex + 1]?.routeId
  } else {
    const parentMatchStore = router.stores.getMatchStore(routeId)

    // eslint-disable-next-line react-hooks/rules-of-hooks
    ;[parentGlobalNotFound, parentNotFoundError] = useSelector(
      parentMatchStore,
      (match): OutletMatchSelection => [!!match!._notFound, match!.error],
      { compare: outletMatchSelectionEqual },
    )

    // eslint-disable-next-line react-hooks/rules-of-hooks
    childRouteId = useSelector(router.stores.ids, (ids) => {
      return ids[ids.indexOf(routeId) + 1]
    })
  }

  if (parentGlobalNotFound) {
    return renderRouteNotFound(
      router,
      router.routesById[routeId],
      parentNotFoundError,
    )
  }

  if (!childRouteId) {
    return null
  }

  const nextMatch = <Match routeId={childRouteId} />

  if (routeId === rootRouteId) {
    return (
      <React.Suspense fallback={renderPending(router)}>
        {nextMatch}
      </React.Suspense>
    )
  }

  return nextMatch
})
