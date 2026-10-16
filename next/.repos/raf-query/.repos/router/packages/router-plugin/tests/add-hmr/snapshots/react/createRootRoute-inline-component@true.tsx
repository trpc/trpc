import * as React from 'react';
import { createRootRoute } from '@tanstack/react-router';
const TSRComponent = () => <div>root hmr</div>;
export const Route = createRootRoute({
  component: TSRComponent
});
const hot = import.meta.hot;
if (hot && typeof window !== 'undefined') {
  hot.data ??= {};
  const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map();
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports;
    window.__getReactRefreshIgnoredExports = ctx => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? [];
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? [];
      return [...ignoredExports, ...moduleIgnored];
    };
    return {
      ignoredExportsById
    };
  })();
  tsrReactRefresh.ignoredExportsById.set("createRootRoute-inline-component.tsx", ['Route']);
}
export function TSRFastRefreshAnchor() {
  return null;
}
if (import.meta.hot) {
  const hot = import.meta.hot;
  const hotData = hot.data ??= {};
  const handleRouteUpdate = function handleRouteUpdate(routeId, newRoute) {
    const router = window.__TSR_ROUTER__;
    const oldRoute = router.routesById[routeId];
    if (!oldRoute) {
      return;
    }
    ;
    const generatedRouteOptionKeys = new Set(["id", "path", "getParentRoute"]);
    const generatedRouteOptions = {};
    generatedRouteOptionKeys.forEach(key => {
      if (key in oldRoute.options) {
        generatedRouteOptions[key] = oldRoute.options[key];
      }
    });
    const oldHasShellComponent = "shellComponent" in oldRoute.options;
    const newHasShellComponent = "shellComponent" in newRoute.options;
    const preserveComponentIdentity = oldHasShellComponent === newHasShellComponent;
    const componentKeys = ["component", "shellComponent", "pendingComponent", "errorComponent", "notFoundComponent"];
    if (preserveComponentIdentity) {
      componentKeys.forEach(key => {
        if (key in oldRoute.options && key in newRoute.options) {
          newRoute.options[key] = oldRoute.options[key];
        }
      });
    }
    ;
    const nextOptions = {
      ...newRoute.options,
      ...generatedRouteOptions
    };
    oldRoute.options = nextOptions;
    oldRoute.update(nextOptions);
    router._replaceRouteChunk(oldRoute, newRoute.lazyFn);
    router.setRoutes(router.buildRouteTree());
    syncHotRouteExport(oldRoute);
    router.resolvePathCache.clear();
    void router._refreshRoute?.();
    function syncHotRouteExport(liveRoute) {
      newRoute.options = liveRoute.options;
      newRoute.parentRoute = liveRoute.parentRoute;
      newRoute._path = liveRoute._path;
      newRoute._id = liveRoute._id;
      newRoute._fullPath = liveRoute._fullPath;
      newRoute._to = liveRoute._to;
    }
  };
  const initialRouteId = Route.id ?? hotData['tsr-route-id'];
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId;
  }
  const existingRoute = typeof window !== 'undefined' && initialRouteId ? window.__TSR_ROUTER__?.routesById?.[initialRouteId] : undefined;
  if (initialRouteId && existingRoute && existingRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route);
    hotData['tsr-route-update-handled'] = Route;
  }
  hot.accept(newModule => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id;
      if (routeId) {
        hotData['tsr-route-id'] = routeId;
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled'];
        return;
      }
      handleRouteUpdate(routeId, newModule.Route);
    }
  });
}