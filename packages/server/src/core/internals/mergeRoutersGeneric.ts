/**
 * Thanks to @phryneas!
 * 
 * @link https://twitter.com/phry/status/1538516854058242048
 */

import { AnyRouterParams, AnyRouter, Router } from "../router";
import { mergeRouters } from "./mergeRouters";


type TailIntersectProperty<Elements extends AnyRouterParams[], Property extends keyof AnyRouterParams, Acc = unknown> =
    // eslint-disable-next-line prettier/prettier
    Elements extends [infer Head extends AnyRouterParams, ...infer Tail extends AnyRouterParams[]] ? TailIntersectProperty<Tail, Property, Head[Property] & Acc> : Acc;


type RouterToParam<R extends Router<any>> = R extends Router<infer P> ? P : never

type RoutersToParams<T, Acc extends unknown[] = []> =
    T extends [infer Head extends Router<any>, ...infer Tail] ? RoutersToParams<Tail, [...Acc, RouterToParam<Head>]> : Acc;

export function mergeRoutersGeneric<Routers extends [...AnyRouter[]]>(
    ...routers: Routers
  ): RoutersToParams<Routers> extends infer AllParams extends AnyRouterParams[] ?
     Router<{
        _ctx: RouterToParam<Routers[0]>['_ctx'];
        _errorShape: RouterToParam<Routers[0]>['_errorShape'];
        _meta: RouterToParam<Routers[0]>['_meta'];
        transformer: RouterToParam<Routers[0]>['transformer'];
        errorFormatter: RouterToParam<Routers[0]>['errorFormatter'];
        queries: TailIntersectProperty<AllParams, 'queries'>;
        mutations: TailIntersectProperty<AllParams, 'mutations'>;
        subscriptions: TailIntersectProperty<AllParams, 'subscriptions'>;
    }> : never { 
      return mergeRouters(...routers) as any;
}
