import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

type AnyRouteWithPrivateProps = AnyRoute & {
  options: Record<string, unknown>
  parentRoute: AnyRoute
  _lazy?: Promise<void> | true
  update: (options: Record<string, unknown>) => unknown
  _path: string
  _id: string
  _fullPath: string
  _to: string
}

type AnyRouterWithPrivateState = AnyRouter & {
  routesById: Record<string, AnyRoute>
  buildRouteTree: () => Parameters<AnyRouter['setRoutes']>[0]
  setRoutes: AnyRouter['setRoutes']
  _refreshRoute?: () => Promise<void>
  _replaceRouteChunk: (route: AnyRoute, lazyFn: AnyRoute['lazyFn']) => void
}

function handleRouteUpdate(
  routeId: string,
  newRoute: AnyRouteWithPrivateProps,
) {
  const router = window.__TSR_ROUTER__ as AnyRouterWithPrivateState
  const oldRoute = router.routesById[routeId] as
    | AnyRouteWithPrivateProps
    | undefined

  if (!oldRoute) {
    return
  }

  // Generated route-tree options are not present on the freshly imported route
  // module, but they must stay on the live route before rebuilding indexes.
  const generatedRouteOptionKeys = new Set(['id', 'path', 'getParentRoute'])
  const generatedRouteOptions: Record<string, unknown> = {}
  generatedRouteOptionKeys.forEach((key) => {
    if (key in oldRoute.options) {
      generatedRouteOptions[key] = oldRoute.options[key]
    }
  })

  const oldHasShellComponent = 'shellComponent' in oldRoute.options
  const newHasShellComponent = 'shellComponent' in newRoute.options
  const preserveComponentIdentity =
    oldHasShellComponent === newHasShellComponent

  // Keys whose identity must remain stable to prevent React from
  // unmounting/remounting the component tree.  React Fast Refresh already
  // handles hot-updating the function bodies of these components — our job
  // is only to update non-component route options (loader, head, etc.).
  // For code-split (splittable) routes, the lazyRouteComponent wrapper is
  // already cached in the bundler hot data so its identity is stable.
  // For unsplittable routes (e.g. root routes), the component is a plain
  // function reference that gets recreated on every module re-execution,
  // so we must explicitly preserve the old reference.
  // Preserve component identity so React doesn't remount.
  // React Fast Refresh patches the function bodies in-place.
  const componentKeys = '__TSR_COMPONENT_TYPES__' as unknown as Array<string>
  if (preserveComponentIdentity) {
    componentKeys.forEach((key) => {
      if (key in oldRoute.options && key in newRoute.options) {
        newRoute.options[key] = oldRoute.options[key]
      }
    })
  }

  const nextOptions = {
    ...newRoute.options,
    ...generatedRouteOptions,
  }

  oldRoute.options = nextOptions
  oldRoute.update(nextOptions)
  router._replaceRouteChunk(oldRoute, newRoute.lazyFn)

  router.setRoutes(router.buildRouteTree())
  syncHotRouteExport(oldRoute)
  router.resolvePathCache.clear()
  void router._refreshRoute?.()

  function syncHotRouteExport(liveRoute: AnyRouteWithPrivateProps) {
    // routeTree.gen.ts mutates the original module export with generated
    // routing state. Mirror that state onto the fresh HMR export too, so
    // aliased route imports keep working after the module is hot-reloaded.
    newRoute.options = liveRoute.options
    newRoute.parentRoute = liveRoute.parentRoute
    newRoute._path = liveRoute._path
    newRoute._id = liveRoute._id
    newRoute._fullPath = liveRoute._fullPath
    newRoute._to = liveRoute._to
  }
}

const handleRouteUpdateStr = handleRouteUpdate.toString()

export function getHandleRouteUpdateCode(stableRouteOptionKeys: Array<string>) {
  return handleRouteUpdateStr.replace(
    /['"]__TSR_COMPONENT_TYPES__['"]/,
    JSON.stringify(stableRouteOptionKeys),
  )
}
