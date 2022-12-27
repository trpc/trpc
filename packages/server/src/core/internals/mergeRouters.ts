import { defaultFormatter } from '../../error/formatter';
import { CombinedDataTransformer, defaultTransformer } from '../../transformer';
import { AnyRouter, createRouterFactory } from '../router';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';

export function mergeRouters<TRouters extends [...AnyRouter[]]>(
  ...routerList: TRouters
): RoutersToParams<TRouters> extends infer AllParams extends AnyRouterParams[]
  ? Router<{
      _ctx: RouterToParam<TRouters[0]>['_ctx'];
      _errorShape: RouterToParam<TRouters[0]>['_errorShape'];
      _meta: RouterToParam<TRouters[0]>['_meta'];
      transformer: RouterToParam<TRouters[0]>['transformer'];
      errorFormatter: RouterToParam<TRouters[0]>['errorFormatter'];
      queries: TailIntersectProperty<AllParams, 'queries'>;
      mutations: TailIntersectProperty<AllParams, 'mutations'>;
      subscriptions: TailIntersectProperty<AllParams, 'subscriptions'>;
    }>
  : never {
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
    $types: routerList[0]?._def._config.$types,
  })(record);
  return router;
}
