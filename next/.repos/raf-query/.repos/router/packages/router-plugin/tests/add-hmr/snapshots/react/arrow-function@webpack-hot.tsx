const $$splitComponentImporter = () => import('arrow-function.tsx?tsr-split=component');
import { lazyRouteComponent } from '@tanstack/react-router';
import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { fetchPosts } from '../posts';
const TSRSplitComponent = (() => {
  const hot = import.meta.webpackHot;
  const hotData = hot ? hot.data ??= {} : undefined;
  return hotData?.["tsr-split-component:component"] ?? lazyRouteComponent($$splitComponentImporter, "component");
})();
if (import.meta.webpackHot) {
  (import.meta.webpackHot.data ??= {})["tsr-split-component:component"] = TSRSplitComponent;
}
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: TSRSplitComponent
});
if (import.meta.webpackHot) {
  const hot = import.meta.webpackHot;
  const hotData = hot.data ??= {};
  const routeId = hotData['tsr-route-id'] ?? Route.id ?? (Route.isRoot ? '__root__' : undefined);
  if (routeId) {
    hotData['tsr-route-id'] = routeId;
  }
  const existingRoute = typeof window !== 'undefined' && routeId ? window.__TSR_ROUTER__?.routesById?.[routeId] : undefined;
  if (routeId && existingRoute && existingRoute !== Route) {
    (function handleRouteUpdate(routeId, newRoute) {
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
    })(routeId, Route);
    try {
      const tsrReactRefreshUtils = typeof __react_refresh_utils__ !== 'undefined' ? __react_refresh_utils__ : undefined;
      const tsrEnqueueUpdate = tsrReactRefreshUtils && typeof tsrReactRefreshUtils.enqueueUpdate === 'function' ? tsrReactRefreshUtils.enqueueUpdate : undefined;
      if (tsrEnqueueUpdate) {
        tsrEnqueueUpdate(() => {});
      }
    } catch (_err) {}
  }
  hot.dispose(data => {
    if (routeId) {
      data['tsr-route-id'] = routeId;
    }
  });
  hot.accept();
}