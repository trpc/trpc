/**
 * Thanks to @phryneas!
 * 
 * @link https://twitter.com/phry/status/1538516854058242048
 */

/* eslint-disable prettier/prettier */
import { AnyRouterParams, AnyRouter, Router } from "../router";
import { mergeRouters } from "./mergeRouters";


type TailIntersectProperty<Elements extends AnyRouterParams[], Property extends keyof AnyRouterParams, Acc = unknown> =
Elements extends [infer Head extends AnyRouterParams, ...infer Tail extends AnyRouterParams[]] ? TailIntersectProperty<Tail, Property, Head[Property] & Acc> : Acc;


type RouterToParam<R extends Router<any>> = R extends Router<infer P> ? P : never

type RoutersToParams<T, Acc extends unknown[] = []> =
T extends [infer Head extends Router<any>, ...infer Tail] ? RoutersToParams<Tail, [...Acc, RouterToParam<Head>]> : Acc;

export function mergeRoutersGeneric<
Routers extends [...AnyRouter[]],
>(
    ...routers: Routers
): Router<{
    _ctx: RouterToParam<Routers[0]>['_ctx'];
    _errorShape: RouterToParam<Routers[0]>['_errorShape'];
    _meta: RouterToParam<Routers[0]>['_meta'];
    transformer: RouterToParam<Routers[0]>['transformer'];
    errorFormatter: RouterToParam<Routers[0]>['errorFormatter'];
    queries: TailIntersectProperty<RoutersToParams<Routers>, 'queries'>;
    mutations: TailIntersectProperty<RoutersToParams<Routers>, 'mutations'>;
    subscriptions: TailIntersectProperty<RoutersToParams<Routers>, 'subscriptions'>;
}> {
  return mergeRouters(...routers) as any;
 }
