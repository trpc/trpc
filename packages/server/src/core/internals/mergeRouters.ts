import { defaultFormatter } from '../../error/formatter';
import type { CombinedDataTransformer } from '../../transformer';
import { defaultTransformer } from '../../transformer';
import type { AnyRouter, AnyRouterDef, Router, RouterDef } from '../router';
import { createRouterFactory } from '../router';
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
        procedures: Head['_def']['procedures'] & TRouterDef['procedures'];
        record: Head['_def']['record'] & TRouterDef['record'];
        queries: Head['_def']['queries'] & TRouterDef['queries'];
        mutations: Head['_def']['mutations'] & TRouterDef['mutations'];
        subscriptions: Head['_def']['subscriptions'] &
          TRouterDef['subscriptions'];
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
  const errorFormatter = routerList.reduce(
    (currentErrorFormatter, nextRouter) => {
      if (
        nextRouter._def._config.errorFormatter &&
        nextRouter._def._config.errorFormatter !== defaultFormatter
      ) {
        if (
          currentErrorFormatter !== defaultFormatter &&
          currentErrorFormatter !== nextRouter._def._config.errorFormatter
        ) {
          throw new Error('You seem to have several error formatters');
        }
        return nextRouter._def._config.errorFormatter;
      }
      return currentErrorFormatter;
    },
    defaultFormatter,
  );

  const transformer = routerList.reduce((prev, current) => {
    if (
      current._def._config.transformer &&
      current._def._config.transformer !== defaultTransformer
    ) {
      if (
        prev !== defaultTransformer &&
        prev !== current._def._config.transformer
      ) {
        throw new Error('You seem to have several transformers');
      }
      return current._def._config.transformer;
    }
    return prev;
  }, defaultTransformer as CombinedDataTransformer);

  const router = createRouterFactory({
    errorFormatter,
    transformer,
    isDev: routerList.some((r) => r._def._config.isDev),
    allowOutsideOfServer: routerList.some(
      (r) => r._def._config.allowOutsideOfServer,
    ),
    isServer: routerList.some((r) => r._def._config.isServer),
    $types: routerList[0]?._def._config.$types as any,
  })(record);
  return router as any;
}
