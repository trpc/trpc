import { initTRPC } from '../initTRPC';
import {
  AnyRouter,
  AnyRouterDef,
  Router,
  RouterDef,
  createRouterFactory,
} from '../router';
import { AnyRootConfig } from './config';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';

/**
 * @internal
 */
export type MergeRouters<
  TRouters extends AnyRouter[],
  TRouterDef extends AnyRouterDef = RouterDef<
    TRouters[0]['_def']['_config'],
    // eslint-disable-next-line @typescript-eslint/ban-types
    {}
  >,
> = TRouters extends [
  infer Head extends AnyRouter,
  ...infer Tail extends AnyRouter[],
]
  ? MergeRouters<
      Tail,
      {
        _config: TRouterDef['_config'];
        router: true;
        procedures: TRouterDef['procedures'] & Head['_def']['procedures'];
        record: TRouterDef['record'] & Head['_def']['record'];
      }
    >
  : Router<TRouterDef> & TRouterDef['record'];

export function mergeRouters<TRouters extends AnyRouter[]>(
  ...routerList: [...TRouters]
): MergeRouters<TRouters> {
  const record = mergeWithoutOverrides(
    {},
    ...routerList.map((r) => r._def.record),
  );
  // assume all routers have the same config
  const _config: AnyRootConfig =
    routerList[0]?._def._config ?? initTRPC.create().router({})._def._config;

  const router = createRouterFactory(_config)(record);
  return router as any;
}
